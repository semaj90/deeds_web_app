param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\DuckDB"
)

$ErrorActionPreference = 'Stop'

$duckdbExe = Join-Path $InstallDir 'duckdb.exe'
if (Test-Path $duckdbExe) {
    Write-Host "DuckDB already installed: $duckdbExe"
    exit 0
}

Write-Host 'DuckDB not found; attempting winget install (DuckDB.cli)...'
$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
    throw 'winget is not available. Install App Installer or install DuckDB manually.'
}

winget install --exact --id DuckDB.cli --scope user --accept-source-agreements --accept-package-agreements

if (-not (Test-Path $duckdbExe)) {
    throw "DuckDB install did not place executable at expected path: $duckdbExe"
}

Write-Host "Installed DuckDB: $duckdbExe"
