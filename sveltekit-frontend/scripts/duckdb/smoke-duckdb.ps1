$ErrorActionPreference = 'Stop'

Write-Host 'duckdb:smoke - export-only validation'

$duckdbCommand = Get-Command duckdb -ErrorAction SilentlyContinue
if (-not $duckdbCommand) {
  throw 'duckdb command not found on PATH'
}

& duckdb --version
& duckdb -c 'SELECT 42 AS duckdb_ok;'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$manifest = Join-Path $root 'memory/exports/graph-refresh-manifest.json'
$clusterCards = Join-Path $root 'memory/exports/cluster-cards.jsonl'
$pathwayCards = Join-Path $root 'memory/exports/pathway-cards.jsonl'

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

  & duckdb -c $sql
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

Write-Host 'duckdb:smoke complete'
