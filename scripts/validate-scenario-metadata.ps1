<#
.SYNOPSIS
    Validates consistency between scenario metadata files and K8s manifests.

.DESCRIPTION
    Drift guard for Wave 0 scenario metadata. Validates that:
    - All 10 scenario IDs exist in both manifest and contracts
    - Scenario severity → alert severity mapping follows taxonomy
    - root_cause_category values align between contracts and manifest
    - All k8s_manifest paths point to existing files
    - Required metadata fields are present in every scenario

.PARAMETER Strict
    Fail on warnings in addition to errors (default: false)

.EXAMPLE
    .\scripts\validate-scenario-metadata.ps1

.EXAMPLE
    .\scripts\validate-scenario-metadata.ps1 -Strict

.NOTES
    Created: 2026-04-26
    Purpose: Prevent drift between CAPABILITY-CONTRACTS.md and scenario-manifest.yaml
    Blocker: SRE Industry Review B3
#>

[CmdletBinding()]
param(
    [switch]$Strict
)

$ErrorActionPreference = "Stop"

# ============================================================================
# Configuration
# ============================================================================

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "docs/evidence/scenarios/scenario-manifest.yaml"
$contractsPath = Join-Path $repoRoot "docs/CAPABILITY-CONTRACTS.md"
$k8sScenariosDir = Join-Path $repoRoot "k8s/scenarios"

$expectedScenarioCount = 10
$expectedScenarioIds = @(
    "oom-killed", "crash-loop", "image-pull-backoff", "high-cpu",
    "pending-pods", "probe-failure", "network-block", "missing-config",
    "mongodb-down", "service-mismatch"
)

# Explicitly excluded from Wave 0 scenario registry validation.
# Rationale: complete-failure-bundle is a composite scenario (built from existing
# Wave 0 scenarios) and is intentionally tracked outside the locked 1-10 schema.
$excludedK8sScenarioManifests = @(
    "k8s/scenarios/complete-failure-bundle/scenario.yaml"
)

# Severity taxonomy from CAPABILITY-CONTRACTS.md §4
$severityMapping = @{
    "critical" = @("Sev 0 (Critical)", "Sev 1 (Error)")
    "warning"  = @("Sev 2 (Warning)")
    "info"     = @("Sev 3 (Informational)")
}

# Required fields per scenario (Wave 0 schema)
$requiredFields = @(
    "number", "title", "severity",
    "affected_services", "expected_signals", "root_cause_category",
    "runbook_id", "slo_impact", "k8s_manifest", "fix_command",
    "expected_pass_criteria", "expected_fail_criteria",
    "evidence_folder"
)

# ============================================================================
# Validation State
# ============================================================================

$errors = @()
$warnings = @()
$checks = 0

function Add-Error {
    param([string]$Message)
    $script:errors += "❌ ERROR: $Message"
}

function Add-Warning {
    param([string]$Message)
    $script:warnings += "⚠️  WARNING: $Message"
}

function Test-Check {
    param([string]$Name)
    $script:checks++
    Write-Host "[$script:checks] Checking: $Name" -ForegroundColor Cyan
}

# ============================================================================
# File Existence
# ============================================================================

Test-Check "Required files exist"

if (-not (Test-Path $manifestPath)) {
    Add-Error "scenario-manifest.yaml not found at: $manifestPath"
    exit 1
}

if (-not (Test-Path $contractsPath)) {
    Add-Error "CAPABILITY-CONTRACTS.md not found at: $contractsPath"
    exit 1
}

if (-not (Test-Path $k8sScenariosDir)) {
    Add-Error "K8s scenarios directory not found at: $k8sScenariosDir"
    exit 1
}

# ============================================================================
# Parse scenario-manifest.yaml
# ============================================================================

Test-Check "Parsing scenario-manifest.yaml"

$manifestLines = Get-Content $manifestPath
$manifestScenarios = @{}
$currentScenario = $null

foreach ($line in $manifestLines) {
    # New scenario block
    if ($line -match '^  - id:\s+([\w-]+)') {
        if ($currentScenario) {
            $manifestScenarios[$currentScenario.id] = $currentScenario
        }
        $currentScenario = @{
            id = $matches[1]
            fields = @()
        }
    }
    # Field within scenario
    elseif ($currentScenario -and $line -match '^    (\w+):') {
        $fieldName = $matches[1]
        $currentScenario.fields += $fieldName

        # Extract specific field values
        switch ($fieldName) {
            'number' {
                if ($line -match '^    number:\s+(\d+)') {
                    $currentScenario.number = [int]$matches[1]
                }
            }
            'severity' {
                if ($line -match '^    severity:\s+(\w+)') {
                    $currentScenario.severity = $matches[1]
                }
            }
            'root_cause_category' {
                if ($line -match '^    root_cause_category:\s+([\w-]+)') {
                    $currentScenario.root_cause_category = $matches[1]
                }
            }
            'alert_severity' {
                if ($line -match '^    alert_severity:\s+(.+)') {
                    $currentScenario.alert_severity = $matches[1].Trim()
                }
            }
            'k8s_manifest' {
                if ($line -match '^    k8s_manifest:\s+(.+)') {
                    $currentScenario.k8s_manifest = $matches[1].Trim()
                }
            }
        }
    }
}

# Add last scenario
if ($currentScenario) {
    $manifestScenarios[$currentScenario.id] = $currentScenario
}

Write-Host "  Found $($manifestScenarios.Count) scenarios in manifest" -ForegroundColor Gray

# ============================================================================
# Validate required fields
# ============================================================================

foreach ($id in $manifestScenarios.Keys) {
    $scenario = $manifestScenarios[$id]
    foreach ($field in $requiredFields) {
        if ($field -notin $scenario.fields) {
            Add-Error "Scenario '$id' missing required field: $field"
        }
    }
}

# ============================================================================
# Validate scenario count
# ============================================================================

Test-Check "Scenario count = $expectedScenarioCount"

if ($manifestScenarios.Count -ne $expectedScenarioCount) {
    Add-Error "Expected $expectedScenarioCount scenarios, found $($manifestScenarios.Count)"
}

# ============================================================================
# Validate scenario IDs match expected list
# ============================================================================

Test-Check "All expected scenario IDs present"

$missingIds = $expectedScenarioIds | Where-Object { -not $manifestScenarios.ContainsKey($_) }
if ($missingIds) {
    Add-Error "Missing scenario IDs: $($missingIds -join ', ')"
}

$extraIds = $manifestScenarios.Keys | Where-Object { $_ -notin $expectedScenarioIds }
if ($extraIds) {
    Add-Warning "Unexpected scenario IDs: $($extraIds -join ', ')"
}

# ============================================================================
# Validate scenario numbers are 1-10 sequential
# ============================================================================

Test-Check "Scenario numbers are 1-10 sequential"

$numbers = $manifestScenarios.Values | ForEach-Object { $_.number } | Sort-Object
$expectedNumbers = 1..10

$missingNumbers = $expectedNumbers | Where-Object { $_ -notin $numbers }
if ($missingNumbers) {
    Add-Error "Missing scenario numbers: $($missingNumbers -join ', ')"
}

# ============================================================================
# Validate K8s manifest files exist
# ============================================================================

Test-Check "All k8s_manifest paths point to existing files"

$k8sFiles = Get-ChildItem "$k8sScenariosDir/*.yaml" | ForEach-Object { $_.Name -replace '\.yaml$', '' }
$allK8sScenarioManifestPaths = Get-ChildItem $k8sScenariosDir -Recurse -Filter "*.yaml" -File | ForEach-Object {
    $_.FullName.Replace($repoRoot, '').TrimStart('\', '/') -replace '\\', '/'
}
$manifestK8sPaths = @()

foreach ($id in $manifestScenarios.Keys) {
    $scenario = $manifestScenarios[$id]

    if ($scenario.k8s_manifest) {
        $k8sPath = Join-Path $repoRoot $scenario.k8s_manifest
        if (-not (Test-Path $k8sPath)) {
            Add-Error "Scenario '$id' references non-existent K8s manifest: $($scenario.k8s_manifest)"
        }
        $manifestK8sPaths += ($scenario.k8s_manifest -replace '\\', '/')
    }

    # Check that scenario ID matches a K8s file
    if ($id -notin $k8sFiles) {
        Add-Warning "Scenario '$id' has no corresponding k8s/scenarios/$id.yaml file"
    }
}

# Ensure excluded manifests exist
foreach ($excludedPath in $excludedK8sScenarioManifests) {
    $fullExcludedPath = Join-Path $repoRoot $excludedPath
    if (-not (Test-Path $fullExcludedPath)) {
        Add-Error "Explicitly excluded scenario manifest not found: $excludedPath"
    }
}

# Check for orphaned K8s files (including nested scenario folders), excluding
# explicitly documented paths.
$orphanedFiles = $allK8sScenarioManifestPaths | Where-Object {
    ($_ -notin $manifestK8sPaths) -and ($_ -notin $excludedK8sScenarioManifests)
}
if ($orphanedFiles) {
    Add-Warning "Orphaned K8s scenario files (not in manifest): $($orphanedFiles -join ', ')"
}

# ============================================================================
# Validate severity → alert_severity mapping
# ============================================================================

Test-Check "Severity → alert_severity mapping follows taxonomy"

foreach ($id in $manifestScenarios.Keys) {
    $scenario = $manifestScenarios[$id]

    if (-not $scenario.severity) {
        Add-Error "Scenario '$id' missing severity field"
        continue
    }

    if (-not $scenario.alert_severity) {
        Add-Warning "Scenario '$id' missing alert_severity field"
        continue
    }

    $expectedAlertSeverities = $severityMapping[$scenario.severity]

    if (-not $expectedAlertSeverities) {
        Add-Error "Scenario '$id' has invalid severity: $($scenario.severity)"
        continue
    }

    if ($scenario.alert_severity -notin $expectedAlertSeverities) {
        Add-Error "Scenario '$id' severity mapping violation: severity='$($scenario.severity)' but alert_severity='$($scenario.alert_severity)'. Expected one of: $($expectedAlertSeverities -join ', ')"
    }
}

# ============================================================================
# Validate root_cause_category alignment with contracts
# ============================================================================

Test-Check "root_cause_category values match CAPABILITY-CONTRACTS.md"

$contractsContent = Get-Content $contractsPath -Raw

# Extract scenario registry from contracts (§3)
$registryMatches = [regex]::Matches($contractsContent, '\| `([\w-]+)` \| \d+ \| [^|]+ \| \w+ \| ([\w-]+) \|')

$contractCategories = @{}
foreach ($match in $registryMatches) {
    $scenarioId = $match.Groups[1].Value
    $category = $match.Groups[2].Value
    $contractCategories[$scenarioId] = $category
}

foreach ($id in $manifestScenarios.Keys) {
    $scenario = $manifestScenarios[$id]

    if (-not $scenario.root_cause_category) {
        Add-Error "Scenario '$id' missing root_cause_category"
        continue
    }

    if ($contractCategories.ContainsKey($id)) {
        $contractCategory = $contractCategories[$id]
        if ($scenario.root_cause_category -ne $contractCategory) {
            Add-Error "Scenario '$id' root_cause_category mismatch: manifest='$($scenario.root_cause_category)' vs contracts='$contractCategory'"
        }
    } else {
        Add-Warning "Scenario '$id' not found in CAPABILITY-CONTRACTS.md registry"
    }
}

# ============================================================================
# Results
# ============================================================================

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  Scenario Metadata Validation Results" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""
Write-Host "Checks performed: $checks" -ForegroundColor Cyan
Write-Host "Errors:           $($errors.Count)" -ForegroundColor $(if ($errors.Count -eq 0) { "Green" } else { "Red" })
Write-Host "Warnings:         $($warnings.Count)" -ForegroundColor $(if ($warnings.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($errors.Count -gt 0) {
    Write-Host "ERRORS:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "WARNINGS:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host ""
}

if ($errors.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✅ PASS: All validation checks passed!" -ForegroundColor Green
    Write-Host ""
    exit 0
} elseif ($errors.Count -eq 0 -and -not $Strict) {
    Write-Host "✅ PASS: No errors found (warnings present but ignored)" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "❌ FAIL: Validation failed" -ForegroundColor Red
    Write-Host ""
    exit 1
}
