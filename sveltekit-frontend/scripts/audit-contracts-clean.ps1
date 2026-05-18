param(
  [string]$OutDir = ".tmp/audits",
  [int]$Top = 10,
  [switch]$IncludeLayerTimings,
  [switch]$Archive,
  [int]$ArchiveKeep = 20,
  [switch]$FailOnHighMedium,
  [ValidateSet('none', 'high-medium', 'any')]
  [string]$Gate = 'none'
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot = (Resolve-Path (Join-Path $workspaceRoot '..')).Path

$outPath = Join-Path $workspaceRoot $OutDir
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

Write-Host "Running contract audit..." -ForegroundColor Cyan
Push-Location $workspaceRoot
try {
  $auditOutput = npm run audit:contracts 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "audit:contracts failed with exit code $LASTEXITCODE`n$auditOutput"
  }
}
finally {
  Pop-Location
}

$reportPath = Join-Path $repoRoot 'docs/reports/contract-error-map-report.json'
if (-not (Test-Path $reportPath)) {
  throw "Expected report not found: $reportPath"
}

$report = Get-Content -Raw -Path $reportPath | ConvertFrom-Json

$summary = [ordered]@{
  generatedAt = Get-Date -Format o
  sourceReport = $reportPath
  options = [ordered]@{
    includeLayerTimings = [bool]$IncludeLayerTimings
    archive = [bool]$Archive
    archiveKeep = $ArchiveKeep
    top = $Top
    gate = $Gate
  }
  elapsedMs = $report.elapsedMs
  totalFindings = $report.totalFindings
  bySeverity = $report.bySeverity
  layerTimings = @()
  topFindings = @()
}

if ($IncludeLayerTimings) {
  # Strip ANSI escape sequences from npm output before parsing.
  $cleanAuditOutput = ($auditOutput -replace "`e\[[0-9;]*[A-Za-z]", '')
  $auditLines = $cleanAuditOutput -split "`r?`n"
  foreach ($line in $auditLines) {
    if ($line -match '^\s*Layer\s+([0-9]+)\s+(.+?)\s+(PASS|WARN|FAIL)\s+([0-9]+)\s+findings\s+([0-9]+)ms\s*$') {
      $layerName = $matches[2].Trim()
      # Normalize occasional mojibake symbols from terminal encoding.
      $layerName = $layerName -replace '[^\u0020-\u007E]', ' '
      $layerName = ($layerName -replace '\s{2,}', ' ').Trim()
      $summary.layerTimings += [ordered]@{
        layerNumber = [int]$matches[1]
        name = $layerName
        status = $matches[3]
        findings = [int]$matches[4]
        elapsedMs = [int]$matches[5]
      }
    }
  }
}

$topFindings = @($report.findings | Select-Object -First $Top)
foreach ($f in $topFindings) {
  $summary.topFindings += [ordered]@{
    findingId = $f.findingId
    severity = $f.severity
    layer = $f.layer
    hmmState = $f.hmmState
    problem = $f.problem
    localSourceRefs = $f.localSourceRefs
    suggestedFix = $f.suggestedFix
    validationCommands = $f.validationCommands
  }
}

$jsonOut = Join-Path $outPath 'latest-audit-summary.json'
$summary | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonOut -Encoding utf8

$mdLines = @(
  '# Contract Audit Summary',
  '',
  "Generated: $($summary.generatedAt)",
  "Source Report: $($summary.sourceReport)",
  "Gate Mode: $($summary.options.gate)",
  "Archive Enabled: $($summary.options.archive)",
  "Elapsed (ms): $($summary.elapsedMs)",
  '',
  '## Totals',
  '',
  "- Total findings: $($summary.totalFindings)",
  "- High: $($summary.bySeverity.high)",
  "- Medium: $($summary.bySeverity.medium)",
  "- Low: $($summary.bySeverity.low)",
  ''
)

if ($IncludeLayerTimings) {
  $mdLines += '## Layer Timings'
  $mdLines += ''
  if ($summary.layerTimings.Count -eq 0) {
    $mdLines += '- No layer timing data parsed from audit output.'
    $mdLines += ''
  }
  else {
    $mdLines += '| Layer | Status | Findings | Time (ms) |'
    $mdLines += '|---|---|---:|---:|'
    foreach ($lt in $summary.layerTimings) {
      $mdLines += "| L$($lt.layerNumber) - $($lt.name) | $($lt.status) | $($lt.findings) | $($lt.elapsedMs) |"
    }
    $mdLines += ''
  }
}

$mdLines += "## Top Findings (first $Top)"
$mdLines += ''

if ($summary.topFindings.Count -eq 0) {
  $mdLines += '- No findings.'
} else {
  foreach ($f in $summary.topFindings) {
    $refs = if ($f.localSourceRefs -and $f.localSourceRefs.Count -gt 0) { ($f.localSourceRefs -join ', ') } else { '(none)' }
    $mdLines += "- [$($f.severity)] $($f.findingId)"
    $mdLines += "  - Layer: $($f.layer)"
    $mdLines += "  - State: $($f.hmmState)"
    $mdLines += "  - Problem: $($f.problem)"
    $mdLines += "  - Source refs: $refs"
    $mdLines += "  - Suggested fix: $($f.suggestedFix)"
    $mdLines += ''
  }
}

$mdOut = Join-Path $outPath 'latest-audit-summary.md'
$mdLines | Set-Content -Path $mdOut -Encoding utf8

$archiveJsonOut = $null
$archiveMdOut = $null
if ($Archive) {
  $archiveDir = Join-Path $outPath 'archive'
  New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  $archiveJsonOut = Join-Path $archiveDir ("latest-audit-summary-{0}.json" -f $ts)
  $archiveMdOut = Join-Path $archiveDir ("latest-audit-summary-{0}.md" -f $ts)
  Copy-Item -Path $jsonOut -Destination $archiveJsonOut -Force
  Copy-Item -Path $mdOut -Destination $archiveMdOut -Force

  if ($ArchiveKeep -gt 0) {
    $archiveFiles = Get-ChildItem -Path $archiveDir -File | Sort-Object LastWriteTime -Descending
    if ($archiveFiles.Count -gt $ArchiveKeep) {
      $toDelete = $archiveFiles | Select-Object -Skip $ArchiveKeep
      foreach ($f in $toDelete) {
        Remove-Item -Path $f.FullName -Force
      }
    }
  }
}

Write-Host "Wrote clean summary files:" -ForegroundColor Green
Write-Host "- $jsonOut"
Write-Host "- $mdOut"
if ($Archive) {
  Write-Host "Wrote archive copies:" -ForegroundColor Green
  Write-Host "- $archiveJsonOut"
  Write-Host "- $archiveMdOut"
}

$highCount = [int]$summary.bySeverity.high
$mediumCount = [int]$summary.bySeverity.medium
$lowCount = [int]$summary.bySeverity.low

# Backward compatibility: existing switch maps to high-medium gating.
if ($FailOnHighMedium -and $Gate -eq 'none') {
  $Gate = 'high-medium'
}

if ($Gate -eq 'high-medium') {
  if ($highCount -gt 0 -or $mediumCount -gt 0) {
    throw "Severity gate failed (high-medium): high=$highCount medium=$mediumCount"
  }
}
elseif ($Gate -eq 'any') {
  if ($highCount -gt 0 -or $mediumCount -gt 0 -or $lowCount -gt 0) {
    throw "Severity gate failed (any): high=$highCount medium=$mediumCount low=$lowCount"
  }
}
