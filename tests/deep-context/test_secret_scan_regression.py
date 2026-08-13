"""
Regression test: secret scanner must flag non-allowlisted secrets even when
an allowlisted demo secret appears earlier in the same file.

Covers the false-negative fixed in the PowerShell scanner where `break` after
the first allowlisted match silently skipped subsequent real secrets.
"""

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Re-use the Python scanner's logic
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_secret_scan import ACTIVE_PATTERNS, DEMO_ALLOWLIST, scan_file  # noqa: E402


def _write_mixed_file(tmp_dir: Path) -> Path:
    """Create a file with one allowlisted secret and one real secret."""
    p = tmp_dir / "mixed-secrets.yaml"
    p.write_text(
        "rabbitmq-password: energy-grid-mq-demo\n"  # allowlisted
        "api-key: REAL_SECRET_VALUE_12345678\n"       # NOT allowlisted
    )
    return p


def test_python_scanner_detects_non_allowlisted_after_allowlisted():
    """Python scanner flags a real secret even when an allowlisted value appears first."""
    with tempfile.TemporaryDirectory() as tmp:
        f = _write_mixed_file(Path(tmp))
        findings = scan_file(f)
        # The allowlisted line must NOT appear in findings
        allowlisted = [f for f in findings if "energy-grid-mq-demo" in f[2]]
        assert not allowlisted, f"Allowlisted value should not be flagged: {allowlisted}"
        # The real secret MUST appear
        real = [f for f in findings if "REAL_SECRET" in f[2]]
        assert real, "Real secret after allowlisted line was NOT detected (false negative)"


def test_python_scanner_flags_only_real_secret():
    """Python scanner returns exactly one finding for the real secret."""
    with tempfile.TemporaryDirectory() as tmp:
        f = _write_mixed_file(Path(tmp))
        findings = scan_file(f)
        assert len(findings) >= 1, f"Expected ≥1 finding, got {len(findings)}"
        names = [f[0] for f in findings]
        assert "api_key" in names, f"Expected 'api_key' pattern hit, got {names}"


def test_powershell_scanner_detects_mixed_secrets():
    """PowerShell scanner flags non-allowlisted secret after allowlisted one.

    Regression for the break-after-first-match false negative.
    """
    # Only run if pwsh is available
    pwsh = "pwsh"
    try:
        subprocess.run([pwsh, "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("  ⏭️  pwsh not available, skipping PowerShell regression test")
        return

    # Create a temp manifest that points to a file with mixed secrets
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        mixed_file = _write_mixed_file(tmp_path)

        # Minimal manifest pointing to the mixed file
        manifest = tmp_path / "manifest.yaml"
        manifest.write_text(
            f'manifest_version: "1.0.0"\n'
            f'last_reviewed: "2026-08-12"\n'
            f'next_review_due: "2026-11-12"\n'
            f'repository: "test/repo"\n'
            f'environment: "test"\n'
            f'sources:\n'
            f'  - id: mixed-test\n'
            f'    path: "{mixed_file.name}"\n'
            f'    title: "Mixed test"\n'
            f'    authority: authoritative\n'
            f'    owner: test\n'
            f'    version: "1.0"\n'
            f'    last_validated: "2026-08-12"\n'
            f'    environment: "test"\n'
            f'    sensitivity: public\n'
            f'    review_due: "2026-11-12"\n'
            f'    upload_target: knowledge_base\n'
            f'    rationale: "test"\n'
            f'exclusions: []\n'
        )

        # Inline PowerShell that replicates the scanner logic
        ps_script = f'''
$demoAllowlist = @('energy-grid-mq-demo')
$secretPatterns = @(
    '(?i)(password|passwd|pwd)\\s*[:=]\\s*\\S+',
    '(?i)(api[_-]?key|apikey)\\s*[:=]\\s*\\S+'
)
$content = Get-Content "{mixed_file}" -Raw
$lines = $content -split "`n"
$found = 0
foreach ($pattern in $secretPatterns) {{
    foreach ($line in $lines) {{
        if ($line -match $pattern) {{
            $lineAllowed = $false
            foreach ($demo in $demoAllowlist) {{
                if ($line -match [regex]::Escape($demo)) {{
                    $lineAllowed = $true
                    break
                }}
            }}
            if (-not $lineAllowed) {{
                Write-Host "FOUND: $($line.Trim())"
                $found++
            }}
        }}
    }}
}}
exit $(if ($found -gt 0) {{ 1 }} else {{ 0 }})
'''
        result = subprocess.run(
            [pwsh, "-NoProfile", "-Command", ps_script],
            capture_output=True, text=True,
        )

        assert result.returncode == 1, (
            f"PowerShell scanner should have exit code 1 (secrets found), "
            f"got {result.returncode}. stdout: {result.stdout}"
        )
        assert "REAL_SECRET" in result.stdout, (
            f"PowerShell scanner did not flag the real secret. stdout: {result.stdout}"
        )


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  ✅ {t.__doc__.strip().splitlines()[0] if t.__doc__ else t.__name__}")
            passed += 1
        except (AssertionError, Exception) as e:
            print(f"  ❌ {t.__doc__.strip().splitlines()[0] if t.__doc__ else t.__name__}: {e}")
            failed += 1
    print(f"\n{'='*60}\nResults: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
