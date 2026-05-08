# apply-migration.ps1
#
# Applies a SQL migration file to the legal-ai-postgres container by piping
# through `docker exec -i psql`. Avoids the docker-cp path-translation issues
# that hit Git Bash on Windows when paths contain forward slashes.
#
# Usage:
#   pwsh -File scripts/apply-migration.ps1 drizzle/manual/agents_md_relations.sql
#   pwsh -File scripts/apply-migration.ps1 drizzle/manual/0015_context_timeline.sql
#
# Connects to: legal-ai-postgres container (which is also reachable via
# host port 5434 = deeds-postgres-prod-proxy).
#
# Safe to re-run idempotent migrations (CREATE TABLE IF NOT EXISTS, etc.).

param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$SqlFile,

  [string]$Container = 'legal-ai-postgres',
  [string]$DbUser    = 'legal_admin',
  [string]$DbName    = 'legal_ai_db',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $SqlFile)) {
  Write-Error "SQL file not found: $SqlFile"
  exit 2
}

# Confirm container is running
$running = docker ps --format '{{.Names}}' | Select-String -Pattern "^$Container$" -Quiet
if (-not $running) {
  Write-Error "Container '$Container' is not running. Start it first."
  exit 3
}

$resolved = Resolve-Path $SqlFile
$lineCount = (Get-Content $resolved | Measure-Object -Line).Lines
$bytes = (Get-Item $resolved).Length

Write-Host "── Migration ──"
Write-Host "  File:      $resolved"
Write-Host "  Size:      $bytes bytes, $lineCount lines"
Write-Host "  Container: $Container"
Write-Host "  Database:  $DbName as $DbUser"

if ($DryRun) {
  Write-Host ""
  Write-Host "── First 20 lines (DRY-RUN) ──"
  Get-Content $resolved -TotalCount 20 | ForEach-Object { Write-Host "  $_" }
  Write-Host ""
  Write-Host "DRY-RUN — nothing applied. Re-run without -DryRun to execute."
  exit 0
}

Write-Host ""
Write-Host "── Applying ──"

# Pipe SQL via stdin into docker exec — avoids docker-cp path issues
$content = Get-Content -Raw -Path $resolved
$content | docker exec -i $Container psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 2>&1 | ForEach-Object {
  if ($_ -match '^(ERROR|FATAL):') { Write-Host $_ -ForegroundColor Red }
  elseif ($_ -match '^(NOTICE|WARNING):') { Write-Host $_ -ForegroundColor Yellow }
  else { Write-Host "  $_" }
}

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Error "Migration failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "✅ Migration applied successfully."
