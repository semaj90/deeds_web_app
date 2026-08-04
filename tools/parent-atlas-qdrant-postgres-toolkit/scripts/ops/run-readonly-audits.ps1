[CmdletBinding()]
param(
  [string]$Collection = "codebase_chunks_768"
)

$ErrorActionPreference = "Stop"

$env:QDRANT_COLLECTION = $Collection

Write-Host "== Qdrant REST audit =="
node .\scripts\qdrant\qdrant-rest-audit.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== PostgreSQL 18 JSON/index audit =="
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\postgres\run-postgres18-json-audit.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Read-only audits completed."
