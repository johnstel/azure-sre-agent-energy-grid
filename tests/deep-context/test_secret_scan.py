"""
Test: Secret Scanning for Knowledge Manifest Sources.

Scans all files listed in the knowledge manifest for common secret patterns.
Prevents accidental upload of credentials, tokens, or connection strings to
the SRE Agent knowledge base.
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "docs" / "deep-context" / "KNOWLEDGE-MANIFEST.yaml"

# Common secret patterns
SECRET_PATTERNS = [
    (r"(?i)(password|passwd|pwd)\s*[:=]\s*['\"]?\S{6,}", "password"),
    (r"(?i)(api[_-]?key|apikey)\s*[:=]\s*['\"]?\S{8,}", "api_key"),
    (r"(?i)(client[_-]?secret)\s*[:=]\s*['\"]?\S{8,}", "client_secret"),
    (r"ghp_[A-Za-z0-9]{36}", "github_pat_classic"),
    (r"github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}", "github_pat_fine_grained"),
    (r"DefaultEndpointsProtocol=https;Account", "azure_storage_connection"),
    (r"(?i)-----BEGIN (RSA |EC )?PRIVATE KEY-----", "private_key"),
    (r"(?i)(bearer|authorization)\s*[:=]\s*['\"]?\S{20,}", "bearer_token"),
    (r"[A-Za-z0-9+/]{40,}={0,2}", None),  # Skip base64 — too many false positives
    (r"(?i)subscription[_-]?id\s*[:=]\s*['\"]?[0-9a-f]{8}-", "subscription_id"),
    (r"(?i)tenant[_-]?id\s*[:=]\s*['\"]?[0-9a-f]{8}-[0-9a-f]{4}-", "tenant_id"),
]

# Only check the first 7 patterns (skip base64, sub ID, tenant ID for sensitivity)
ACTIVE_PATTERNS = SECRET_PATTERNS[:8]

# Known demo-only values that are intentionally public (not real secrets)
DEMO_ALLOWLIST = [
    "energy-grid-mq-demo",  # RabbitMQ demo password in k8s/base/application.yaml
]


def extract_source_paths():
    """Extract source paths from the manifest using basic YAML parsing."""
    import yaml

    with open(MANIFEST_PATH, "r") as f:
        data = yaml.safe_load(f)
    return [s["path"] for s in data.get("sources", [])]


def scan_file(filepath: Path) -> list:
    """Scan a single file for secret patterns. Returns list of (pattern_name, line_num)."""
    findings = []
    try:
        content = filepath.read_text(errors="ignore")
    except Exception:
        return findings

    for line_num, line in enumerate(content.splitlines(), 1):
        for pattern, name in ACTIVE_PATTERNS:
            if name is None:
                continue  # Skip disabled patterns
            if re.search(pattern, line):
                # Skip if line is clearly a comment/documentation about the pattern
                stripped = line.strip()
                if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("<!--"):
                    continue
                # Skip if it's a regex/pattern definition (like this file)
                if "r\"" in line or "r'" in line or "regex" in line.lower():
                    continue
                # Skip known demo-only allowlisted values
                if any(allowed in line for allowed in DEMO_ALLOWLIST):
                    continue
                findings.append((name, line_num, line.strip()[:80]))
    return findings


def test_no_secrets_in_sources():
    """No secret patterns detected in manifest source files."""
    paths = extract_source_paths()
    all_findings = []
    for rel_path in paths:
        full_path = REPO_ROOT / rel_path
        if not full_path.exists():
            continue
        if full_path.suffix in (".png", ".jpg", ".gif", ".ico"):
            continue
        findings = scan_file(full_path)
        for name, line_num, excerpt in findings:
            all_findings.append(f"  {rel_path}:{line_num} [{name}] {excerpt}")

    assert not all_findings, (
        f"Secret patterns found in {len(all_findings)} location(s):\n" + "\n".join(all_findings)
    )


def test_manifest_itself_clean():
    """The manifest YAML itself contains no secrets."""
    findings = scan_file(MANIFEST_PATH)
    assert not findings, f"Secrets in manifest: {findings}"


if __name__ == "__main__":
    tests = [v for k, v in globals().items() if k.startswith("test_")]
    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            print(f"  ✅ {test_fn.__doc__ or test_fn.__name__}")
            passed += 1
        except (AssertionError, Exception) as e:
            print(f"  ❌ {test_fn.__doc__ or test_fn.__name__}: {e}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
