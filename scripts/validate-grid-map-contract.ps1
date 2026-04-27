<#
.SYNOPSIS
    Validates static grid map data-contract files — no live cluster required.

.DESCRIPTION
    Smoke-test contract guard for the cloud demo Interactive Grid Map (issue #22).
    Validates that:
    - k8s/base/grid-map-topology.json exists and is well-formed JSON
    - All three live health endpoint paths are declared in the topology JSON
    - The required safe-language disclaimer string is present in topology JSON
    - The required safe-language disclaimer string is present in ops-console.html
    - All 10 k8s/scenarios/*.yaml files exist
    - Each scenario YAML filename is referenced in the smoke-test checklist
    - Companion docs (data contract, spec) exist

    This script validates static files only. It does not start a cluster, make HTTP
    requests, or perform any write operations. All checks are read-only.

.PARAMETER Strict
    Fail on warnings in addition to errors (default: false).

.EXAMPLE
    .\scripts\validate-grid-map-contract.ps1

.EXAMPLE
    .\scripts\validate-grid-map-contract.ps1 -Strict

.NOTES
    Created: 2026-04-27
    Issue:   #22 test(grid-map): cloud demo smoke tests for breakable scenarios
    Purpose: Static contract guard — runs in CI without a live cluster
    Safe:    Read-only. No network calls. No cluster access.
#>

[CmdletBinding()]
param(
    [switch]$Strict
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

$repoRoot       = Split-Path -Parent $PSScriptRoot
$topologyPath   = Join-Path $repoRoot "k8s/base/grid-map-topology.json"
$opsConsolePath = Join-Path $repoRoot "k8s/base/ops-console.html"
$scenariosDir   = Join-Path $repoRoot "k8s/scenarios"
$checklistPath  = Join-Path $repoRoot "docs/GRID-MAP-SMOKE-TESTS.md"
$dataContractPath = Join-Path $repoRoot "docs/CLOUD-GRID-MAP-DATA-CONTRACT.md"
$specPath       = Join-Path $repoRoot "docs/INTERACTIVE-GRID-MAP-SPEC.md"

# Required live health paths in topology JSON
$requiredLiveHealthPaths = @(
    "/api/meter/health",
    "/api/assets/health",
    "/api/dispatch/health"
)

# Required safe-language disclaimer (must match CLOUD-GRID-MAP-DATA-CONTRACT.md)
$requiredDisclaimerSubstring = "not connected to real grid telemetry"

# All 10 expected scenario YAML files
$expectedScenarioFiles = @(
    "crash-loop.yaml",
    "high-cpu.yaml",
    "image-pull-backoff.yaml",
    "missing-config.yaml",
    "mongodb-down.yaml",
    "network-block.yaml",
    "oom-killed.yaml",
    "pending-pods.yaml",
    "probe-failure.yaml",
    "service-mismatch.yaml"
)

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------

$errors   = 0
$warnings = 0
$passes   = 0

function Pass  { param([string]$msg) Write-Host "  [PASS] $msg" -ForegroundColor Green;  $script:passes++ }
function Warn  { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:warnings++ }
function Fail  { param([string]$msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:errors++ }

# ---------------------------------------------------------------------------
# Check 1 — Required companion docs exist
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 1: Required companion docs ---"

foreach ($docPath in @($dataContractPath, $specPath, $checklistPath)) {
    $name = Split-Path $docPath -Leaf
    if (Test-Path $docPath) {
        Pass "$name exists"
    } else {
        Fail "$name not found at: $docPath"
    }
}

# ---------------------------------------------------------------------------
# Check 2 — Topology JSON exists and is valid JSON
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 2: Topology JSON validity ---"

if (-not (Test-Path $topologyPath)) {
    Fail "k8s/base/grid-map-topology.json not found"
    $topology = $null
} else {
    Pass "k8s/base/grid-map-topology.json exists"
    try {
        $topologyContent = Get-Content $topologyPath -Raw -Encoding UTF8
        $topology = $topologyContent | ConvertFrom-Json
        Pass "grid-map-topology.json is valid JSON"
    } catch {
        Fail "grid-map-topology.json is not valid JSON: $_"
        $topology = $null
    }
}

# ---------------------------------------------------------------------------
# Check 3 — Live health paths in topology JSON
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 3: Live health endpoint paths in topology JSON ---"

if ($topology) {
    foreach ($path in $requiredLiveHealthPaths) {
        $found = $topologyContent -match [regex]::Escape($path)
        if ($found) {
            Pass "Live health path '$path' present in topology JSON"
        } else {
            Fail "Live health path '$path' NOT found in topology JSON"
        }
    }

    # Check schemaVersion field
    if ($topology.schemaVersion) {
        Pass "schemaVersion field present: $($topology.schemaVersion)"
    } else {
        Warn "schemaVersion field missing from topology JSON"
    }

    # Check node count
    if ($topology.nodes -and $topology.nodes.Count -eq 10) {
        Pass "Topology has exactly 10 nodes"
    } elseif ($topology.nodes) {
        Warn "Topology has $($topology.nodes.Count) nodes (expected 10)"
    } else {
        Fail "Topology 'nodes' array is missing"
    }
} else {
    Warn "Skipping topology content checks — JSON parse failed"
}

# ---------------------------------------------------------------------------
# Check 4 — Required disclaimer in topology JSON
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 4: Safe-language disclaimer in topology JSON ---"

if ($topology) {
    $disclaimerInJson = $topologyContent -match [regex]::Escape($requiredDisclaimerSubstring)
    if ($disclaimerInJson) {
        Pass "Required disclaimer substring found in grid-map-topology.json"
    } else {
        Fail "Required disclaimer '$requiredDisclaimerSubstring' NOT found in grid-map-topology.json"
    }
} else {
    Warn "Skipping disclaimer check — topology JSON parse failed"
}

# ---------------------------------------------------------------------------
# Check 5 — Required disclaimer in ops-console.html
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 5: Safe-language disclaimer in ops-console.html ---"

if (-not (Test-Path $opsConsolePath)) {
    Fail "k8s/base/ops-console.html not found at: $opsConsolePath"
} else {
    Pass "k8s/base/ops-console.html exists"
    $opsContent = Get-Content $opsConsolePath -Raw -Encoding UTF8
    if ($opsContent -match [regex]::Escape($requiredDisclaimerSubstring)) {
        Pass "Required disclaimer substring found in ops-console.html"
    } else {
        Fail "Required disclaimer '$requiredDisclaimerSubstring' NOT found in ops-console.html"
    }

    # Check role="note" on disclaimer element
    if ($opsContent -match 'role="note"') {
        Pass 'role="note" attribute present in ops-console.html (disclaimer accessibility)'
    } else {
        Warn 'role="note" not found in ops-console.html — disclaimer may lack accessibility role'
    }

    # Check aria-live polling region
    if ($opsContent -match 'aria-live="polite"') {
        Pass 'aria-live="polite" region present in ops-console.html'
    } else {
        Warn 'aria-live="polite" not found in ops-console.html — live update announcements may be missing'
    }

    # Check prefers-reduced-motion
    if ($opsContent -match 'prefers-reduced-motion') {
        Pass 'prefers-reduced-motion media query present in ops-console.html'
    } else {
        Fail 'prefers-reduced-motion media query NOT found in ops-console.html — reduced-motion accessibility requirement not met'
    }
}

# ---------------------------------------------------------------------------
# Check 6 — All 10 scenario YAML files exist
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 6: All 10 scenario YAML files exist ---"

if (-not (Test-Path $scenariosDir)) {
    Fail "k8s/scenarios/ directory not found at: $scenariosDir"
} else {
    foreach ($scenario in $expectedScenarioFiles) {
        $scenarioPath = Join-Path $scenariosDir $scenario
        if (Test-Path $scenarioPath) {
            Pass "k8s/scenarios/$scenario exists"
        } else {
            Fail "k8s/scenarios/$scenario NOT found"
        }
    }
}

# ---------------------------------------------------------------------------
# Check 7 — All scenario YAML filenames referenced in smoke-test checklist
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 7: All scenario YAMLs referenced in GRID-MAP-SMOKE-TESTS.md ---"

if (-not (Test-Path $checklistPath)) {
    Warn "GRID-MAP-SMOKE-TESTS.md not found — skipping reference checks"
} else {
    $checklistContent = Get-Content $checklistPath -Raw -Encoding UTF8
    foreach ($scenario in $expectedScenarioFiles) {
        if ($checklistContent -match [regex]::Escape($scenario)) {
            Pass "$scenario referenced in GRID-MAP-SMOKE-TESTS.md"
        } else {
            Fail "$scenario NOT referenced in GRID-MAP-SMOKE-TESTS.md"
        }
    }
}

# ---------------------------------------------------------------------------
# Check 8 — Required checklist sections present
# ---------------------------------------------------------------------------

Write-Host "`n--- Check 8: Required checklist sections in GRID-MAP-SMOKE-TESTS.md ---"

$requiredSections = @(
    "Multi-Scenario",
    "Missing-Data",
    "Stale-Data",
    "Safe-Language",
    "Accessibility",
    "Unsupported"
)

if (Test-Path $checklistPath) {
    foreach ($section in $requiredSections) {
        if ($checklistContent -match $section) {
            Pass "Checklist contains '$section' section"
        } else {
            Fail "Checklist is missing '$section' section"
        }
    }
} else {
    Warn "GRID-MAP-SMOKE-TESTS.md not found — skipping section checks"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Grid Map Contract Validation Summary  " -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  PASS:     $passes"  -ForegroundColor Green
Write-Host "  WARN:     $warnings" -ForegroundColor Yellow
Write-Host "  FAIL:     $errors"  -ForegroundColor Red
Write-Host ""
Write-Host "Note: This script validates static files only." -ForegroundColor DarkGray
Write-Host "Live cluster tests require the manual checklist in docs/GRID-MAP-SMOKE-TESTS.md." -ForegroundColor DarkGray
Write-Host ""

if ($errors -gt 0) {
    Write-Host "[RESULT] FAIL — $errors error(s) must be resolved." -ForegroundColor Red
    exit 1
}

if ($Strict -and $warnings -gt 0) {
    Write-Host "[RESULT] FAIL (Strict) — $warnings warning(s) treated as errors." -ForegroundColor Red
    exit 1
}

Write-Host "[RESULT] PASS — all static contract checks passed." -ForegroundColor Green
exit 0
