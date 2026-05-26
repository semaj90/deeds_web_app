$ErrorActionPreference = "Stop"

Write-Host "duckdb:smoke — export-only validation"

if (-not (Get-Command duckdb -ErrorAction SilentlyContinue)) {
  throw "duckdb command not found on PATH"
}

duckdb --version
duckdb -c "SELECT 42 AS duckdb_ok;"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$manifest = Join-Path $root "memory/exports/graph-refresh-manifest.json"
$clusterCards = Join-Path $root "memory/exports/cluster-cards.jsonl"
$pathwayCards = Join-Path $root "memory/exports/pathway-cards.jsonl"

if (Test-Path $manifest) {
  $duckManifest = $manifest.Replace('\', '/')
  duckdb -c "SELECT count(*) AS rows FROM read_json_auto('$duckManifest');"
}

if (Test-Path $clusterCards) {
  $duckClusterCards = $clusterCards.Replace('\', '/')
  duckdb -c "SELECT count(*) AS rows FROM read_json_auto('$duckClusterCards', format='newline_delimited');"
}

if (Test-Path $pathwayCards) {
  $duckPathwayCards = $pathwayCards.Replace('\', '/')
  duckdb -c "SELECT count(*) AS rows FROM read_json_auto('$duckPathwayCards', format='newline_delimited');"
}

Write-Host "duckdb:smoke complete"
