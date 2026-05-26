param(
    [string]$RepoRoot = 'c:\Users\james\Videos\deeds-web-app'
)

$ErrorActionPreference = 'Stop'

$defaultExe = Join-Path $env:LOCALAPPDATA 'Programs\DuckDB\duckdb.exe'
$duckdbCmd = Get-Command duckdb -ErrorAction SilentlyContinue
if ($duckdbCmd) {
    $duckdbExe = $duckdbCmd.Source
} elseif (Test-Path $defaultExe) {
    $duckdbExe = $defaultExe
} else {
    throw 'DuckDB CLI not found. Run duckdb/install-duckdb-cli.ps1 first.'
}

Write-Host "Using DuckDB CLI: $duckdbExe"

& $duckdbExe ':memory:' -cmd "SELECT 42 AS duckdb_ok;" | Out-String | Write-Host

$manifest = Join-Path $RepoRoot 'memory/exports/graph-refresh-manifest.json'
$clusterCards = Join-Path $RepoRoot 'memory/exports/cluster-cards.jsonl'
$pathwayCards = Join-Path $RepoRoot 'memory/exports/pathway-cards.jsonl'

$targets = @($manifest, $clusterCards, $pathwayCards)
foreach ($target in $targets) {
    if (Test-Path $target) {
        $size = (Get-Item $target).Length
        Write-Host "FOUND $target ($size bytes)"
    } else {
        Write-Host "MISSING $target"
    }
}

Write-Host 'DuckDB smoke complete (export-read mode only).'
