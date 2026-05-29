$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

# ── DuckDB CLI check ──────────────────────────────────────────────────────────
$DuckDb = "$env:LOCALAPPDATA\Programs\DuckDB\duckdb.exe"
if (-not (Test-Path $DuckDb)) {
  Write-Host "DuckDB CLI not found at $DuckDb — skipping SQL check"
} else {
  Write-Host "Using DuckDB CLI: $DuckDb"
  & $DuckDb -c "SELECT 42 AS duckdb_ok;"
  Write-Host "DuckDB CLI OK."
}

# ── Required export files ─────────────────────────────────────────────────────
$Manifest     = "memory\exports\graph-refresh-manifest.json"
$ClusterCards = "memory\exports\cluster-cards.jsonl"
$PathwayCards = "memory\exports\pathway-cards.jsonl"

$Failures = @()

# Manifest is mandatory and gets a specific actionable message
if (-not (Test-Path $Manifest)) {
  Write-Host "Graph manifest missing: $((Resolve-Path .).Path)\$Manifest"
  Write-Host "Next safe command: npm run graph:manifest"
  $Failures += $Manifest
} else {
  Write-Host "Found export: $Manifest"

  # Validate manifest is not a stub (status must be "ok" or "generated")
  try {
    $ManifestContent = Get-Content $Manifest -Raw | ConvertFrom-Json
    # Support both flat shape { status } and nested { "graph-refresh-manifest": { status } }
    $Status = if ($ManifestContent.status) { $ManifestContent.status } `
              elseif ($ManifestContent.'graph-refresh-manifest') { $ManifestContent.'graph-refresh-manifest'.status } `
              else { $null }
    if ($Status -eq "stub") {
      Write-Host "Graph manifest is a stub (status=stub). Run: npm run graph:manifest"
      $Failures += "$Manifest (stub)"
    } else {
      Write-Host "Graph manifest status: $Status"
    }
  } catch {
    Write-Host "Graph manifest is not valid JSON: $_"
    $Failures += "$Manifest (invalid JSON)"
  }
}

# Optional but reported
foreach ($File in @($ClusterCards, $PathwayCards)) {
  if (-not (Test-Path $File)) {
    Write-Host "Missing optional export: $File (run: npm run graph:exports to generate)"
  } else {
    Write-Host "Found export: $File"
  }
}

# ── Final result ──────────────────────────────────────────────────────────────
if ($Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "DuckDB smoke FAILED. Missing or invalid files:"
  foreach ($f in $Failures) { Write-Host "  - $f" }
  Write-Host "Next safe command: npm run graph:manifest"
  exit 1
}

Write-Host "DuckDB smoke passed."