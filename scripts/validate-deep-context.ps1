<#
.SYNOPSIS
    Validates SRE Agent deep-context configuration: manifest schema, connector health,
    knowledge freshness, and secret scanning.

.DESCRIPTION
    Idempotent validation for the SRE Agent deep-context bootstrap. Can be run
    repeatedly without side effects.

.PARAMETER CheckConnector
    Check Code Access connector health (requires SRE Agent MCP access or portal).

.PARAMETER CheckFreshness
    Report sources past their review_due date.

.PARAMETER CheckKnowledge
    Verify all upload_target=knowledge_base sources exist on disk.

.PARAMETER CheckSecrets
    Scan manifest-listed sources for secret patterns.

.PARAMETER All
    Run all checks (default if no switch specified).

.EXAMPLE
    .\scripts\validate-deep-context.ps1
    .\scripts\validate-deep-context.ps1 -CheckFreshness
#>

[CmdletBinding()]
param(
    [switch]$CheckConnector,
    [switch]$CheckFreshness,
    [switch]$CheckKnowledge,
    [switch]$CheckSecrets,
    [switch]$All
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $RepoRoot 'docs/deep-context/KNOWLEDGE-MANIFEST.yaml'

# If no specific check requested, run all
if (-not ($CheckConnector -or $CheckFreshness -or $CheckKnowledge -or $CheckSecrets)) {
    $All = $true
}

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
function Write-Check { param([string]$Status, [string]$Message)
    $icon = switch ($Status) {
        'pass' { '✅' }
        'fail' { '❌' }
        'warn' { '⚠️' }
        'info' { 'ℹ️' }
    }
    Write-Host "$icon $Message"
}

$exitCode = 0

# -----------------------------------------------------------------------------
# Load Manifest (basic YAML parse — PowerShell native)
# -----------------------------------------------------------------------------
Write-Host "`n=== SRE Agent Deep Context Validation ===" -ForegroundColor Cyan
Write-Host "Manifest: $ManifestPath`n"

if (-not (Test-Path $ManifestPath)) {
    Write-Check 'fail' "Manifest not found: $ManifestPath"
    exit 1
}

$manifestContent = Get-Content $ManifestPath -Raw

# Extract source paths from YAML (simple regex for path: "..." lines under sources:)
$sourcePaths = [regex]::Matches($manifestContent, '(?<=^\s+path:\s*"?)([^"\s]+)(?="?\s*$)', 'Multiline') |
    ForEach-Object { $_.Value }

$knowledgeSources = @()
$allSources = @()
$sourceBlocks = $manifestContent -split '(?m)(?=^  - id:)' | Where-Object { $_ -match '^\s*- id:' }
foreach ($block in $sourceBlocks) {
    $pathMatch = [regex]::Match($block, 'path:\s*"?([^"\r\n]+)"?')
    $uploadMatch = [regex]::Match($block, 'upload_target:\s*(\w+)')
    $reviewMatch = [regex]::Match($block, 'review_due:\s*"?([^"\r\n]+)"?')
    $idMatch = [regex]::Match($block, '- id:\s*(\S+)')

    if ($pathMatch.Success) {
        $entry = @{
            Id = if ($idMatch.Success) { $idMatch.Groups[1].Value } else { 'unknown' }
            Path = $pathMatch.Groups[1].Value
            UploadTarget = if ($uploadMatch.Success) { $uploadMatch.Groups[1].Value } else { 'unknown' }
            ReviewDue = if ($reviewMatch.Success) { $reviewMatch.Groups[1].Value } else { '' }
        }
        $allSources += $entry
        if ($entry.UploadTarget -eq 'knowledge_base') {
            $knowledgeSources += $entry
        }
    }
}

Write-Check 'info' "Found $($allSources.Count) sources in manifest"

# -----------------------------------------------------------------------------
# Check: Knowledge Base Sources Exist
# -----------------------------------------------------------------------------
if ($All -or $CheckKnowledge) {
    Write-Host "`n--- Knowledge Base Source Verification ---" -ForegroundColor Yellow
    $missing = 0
    foreach ($src in $allSources) {
        $fullPath = Join-Path $RepoRoot $src.Path
        if (Test-Path $fullPath) {
            Write-Check 'pass' "$($src.Id): $($src.Path)"
        } else {
            Write-Check 'fail' "$($src.Id): $($src.Path) — FILE NOT FOUND"
            $missing++
            $exitCode = 1
        }
    }
    if ($missing -eq 0) {
        Write-Check 'pass' "All $($allSources.Count) sources exist on disk"
    } else {
        Write-Check 'fail' "$missing source(s) missing"
    }
}

# -----------------------------------------------------------------------------
# Check: Freshness
# -----------------------------------------------------------------------------
if ($All -or $CheckFreshness) {
    Write-Host "`n--- Freshness Check ---" -ForegroundColor Yellow
    $today = Get-Date -Format 'yyyy-MM-dd'
    $overdue = 0
    foreach ($src in $allSources) {
        if ($src.ReviewDue -and ($src.ReviewDue -lt $today)) {
            Write-Check 'warn' "$($src.Id): review overdue (due: $($src.ReviewDue))"
            $overdue++
        }
    }
    if ($overdue -eq 0) {
        Write-Check 'pass' "No sources past review_due date"
    } else {
        Write-Check 'warn' "$overdue source(s) overdue for review"
    }
}

# -----------------------------------------------------------------------------
# Check: Secret Scanning
# -----------------------------------------------------------------------------
if ($All -or $CheckSecrets) {
    Write-Host "`n--- Secret Scan ---" -ForegroundColor Yellow
    $secretPatterns = @(
        '(?i)(password|passwd|pwd)\s*[:=]\s*\S+',
        '(?i)(api[_-]?key|apikey)\s*[:=]\s*\S+',
        '(?i)(secret|token)\s*[:=]\s*[''"][^''"]{8,}',
        '(?i)ghp_[A-Za-z0-9]{36}',
        '(?i)github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}',
        'DefaultEndpointsProtocol=https;Account',
        '(?i)-----BEGIN (RSA |EC )?PRIVATE KEY-----'
    )
    # Known demo-only values (not real secrets)
    $demoAllowlist = @('energy-grid-mq-demo')
    $secretsFound = 0
    foreach ($src in $allSources) {
        $fullPath = Join-Path $RepoRoot $src.Path
        if (-not (Test-Path $fullPath)) { continue }
        $content = Get-Content $fullPath -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        $lines = $content -split "`n"
        foreach ($pattern in $secretPatterns) {
            foreach ($line in $lines) {
                if ($line -match $pattern) {
                    # Each matching line must independently be allowlisted
                    $lineAllowed = $false
                    foreach ($demo in $demoAllowlist) {
                        if ($line -match [regex]::Escape($demo)) {
                            $lineAllowed = $true
                            break
                        }
                    }
                    if (-not $lineAllowed) {
                        $trimmed = $line.Trim()
                        if ($trimmed.Length -gt 80) { $trimmed = $trimmed.Substring(0, 80) + '...' }
                        Write-Check 'fail' "$($src.Id): potential secret on line — pattern: $pattern — $trimmed"
                        $secretsFound++
                        $exitCode = 1
                    }
                }
            }
        }
    }
    if ($secretsFound -eq 0) {
        Write-Check 'pass' "No secrets detected in manifest sources"
    } else {
        Write-Check 'fail' "$secretsFound source(s) contain potential secrets"
    }
}

# -----------------------------------------------------------------------------
# Check: Connector (informational — cannot programmatically verify without MCP)
# -----------------------------------------------------------------------------
if ($All -or $CheckConnector) {
    Write-Host "`n--- Connector Check ---" -ForegroundColor Yellow
    Write-Check 'info' "Code Access connector health requires portal or SRE Agent MCP verification"
    Write-Check 'info' "Manual check: SRE Agent portal > Builder > Code Access > verify 'Connected' status"
    Write-Check 'info' "Expected: johnstel/azure-sre-agent-energy-grid (read-only, branch: main)"
    Write-Check 'info' "If connector is missing or failed, follow docs/deep-context/BOOTSTRAP.md Step 1"
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host "`n=== Validation Complete ===" -ForegroundColor Cyan
if ($exitCode -eq 0) {
    Write-Check 'pass' "All checks passed"
} else {
    Write-Check 'fail' "Some checks failed (exit code: $exitCode)"
}

exit $exitCode
