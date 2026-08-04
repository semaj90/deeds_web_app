[CmdletBinding()]
param(
  [string]$SqlFile = "",
  [string]$OutputFile = ""
)

$ErrorActionPreference = "Stop"

if (-not $SqlFile) {
  $SqlFile = Join-Path $PSScriptRoot "..\..\sql\postgres18-json-index-audit.sql"
}
if (-not $OutputFile) {
  $OutputFile = "docs\reports\postgres18-json-index-audit.txt"
}

if (-not $env:PGHOST) { $env:PGHOST = "127.0.0.1" }
if (-not $env:PGPORT) { $env:PGPORT = "5434" }
if (-not $env:PGDATABASE) { $env:PGDATABASE = "legal_ai_db" }
if (-not $env:PGUSER) { $env:PGUSER = "legal_admin" }
if (-not $env:PGCONNECT_TIMEOUT) { $env:PGCONNECT_TIMEOUT = "5" }

New-Item -ItemType Directory -Force -Path (Split-Path $OutputFile) | Out-Null

& psql `
  -w `
  -X `
  -v ON_ERROR_STOP=1 `
  -f $SqlFile 2>&1 |
  Tee-Object -FilePath $OutputFile

exit $LASTEXITCODE
