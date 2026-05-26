$ErrorActionPreference = 'Stop'

Write-Host 'duckdb:smoke - export-only validation'

$localDuckDb = 'C:\Users\james\AppData\Local\Programs\DuckDB\duckdb.exe'
$duckdbCommand = $null

if ($env:DUCKDB_BIN -and (Test-Path $env:DUCKDB_BIN)) {
  $duckdbCommand = $env:DUCKDB_BIN
}
elseif (Test-Path $localDuckDb) {
  $duckdbCommand = $localDuckDb
}
else {
  $duckdbCommand = (Get-Command duckdb -ErrorAction SilentlyContinue)?.Path
}

if (-not $duckdbCommand) {
  throw 'duckdb command not found on PATH or local install path'
}

& $duckdbCommand --version
& $duckdbCommand -c 'SELECT 42 AS duckdb_ok;'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$manifest = Join-Path $root 'memory/exports/graph-refresh-manifest.json'
$clusterCards = Join-Path $root 'memory/exports/cluster-cards.jsonl'
$pathwayCards = Join-Path $root 'memory/exports/pathway-cards.jsonl'
$featureCardsDb = Join-Path $root 'docs/reports/feature-card.duckdb'

function Invoke-DuckDbCount {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Delimited
  )

  $duckPath = $Path -replace '\\', '/'
  if ($Delimited) {
    $sql = "SELECT count(*) AS rows FROM read_json_auto('$duckPath', format='newline_delimited');"
  }
  else {
    $sql = "SELECT count(*) AS rows FROM read_json_auto('$duckPath');"
  }

  & $duckdbCommand -c $sql
}

if (Test-Path $manifest) {
  Invoke-DuckDbCount -Path $manifest
}

if (Test-Path $clusterCards) {
  Invoke-DuckDbCount -Path $clusterCards -Delimited
}

if (Test-Path $pathwayCards) {
  Invoke-DuckDbCount -Path $pathwayCards -Delimited
}

if (Test-Path $featureCardsDb) {
  & $duckdbCommand $featureCardsDb -c 'SHOW TABLES; SELECT count(*) AS rows FROM feature_cards;'
}

Write-Host 'duckdb:smoke complete'
