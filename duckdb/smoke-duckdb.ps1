$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$DuckDb = "$env:LOCALAPPDATA\Programs\DuckDB\duckdb.exe"

if (-not (Test-Path $DuckDb)) {
  Write-Host "DuckDB CLI not found at $DuckDb"
  exit 1
}

Write-Host "Using DuckDB CLI: $DuckDb"

& $DuckDb -c "SELECT 42 AS duckdb_ok;"

$Manifest = "memory\exports\graph-refresh-manifest.json"
$ClusterCards = "memory\exports\cluster-cards.jsonl"
$PathwayCards = "memory\exports\pathway-cards.jsonl"

$Required = @($Manifest, $ClusterCards, $PathwayCards)

foreach ($File in $Required) {
  if (-not (Test-Path $File)) {
    Write-Host "Missing required export: $File"
    exit 1
  }

  Write-Host "Found export: $File"
}

Write-Host "DuckDB smoke passed."