# Opt-in scratch-only PostgreSQL 18 proof. Does not apply migrations.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Container,
 [Parameter(Mandatory=$true)][string]$Database,
 [Parameter(Mandatory=$true)][string]$DbUser,
 [string]$RepoRoot=(Get-Location).Path,
 [string]$ReceiptPath='.tmp/atlas/dag-cas-outbox-docker-v1.json'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$report=[ordered]@{schema='atlas.dag-cas-outbox-docker-run.v1';verdict='UNPROVEN';
 utc=(Get-Date).ToUniversalTime().ToString('o');container=$Container;database=$Database;
 scratchOnly=$true;databaseSchemaMutated=$false;details=''}
$old=(Get-Location).Path
try {
 Set-Location $RepoRoot
 $sql=Join-Path $RepoRoot 'scripts/atlas/sql/prove-dag-cas-outbox-rollback-v1.sql'
 if (-not (Test-Path -LiteralPath $sql)) {throw 'SQL fixture missing'}
 $docker=Get-Command docker -ErrorAction Stop
 $version=@(& $docker.Source exec $Container psql -X -qAt -v ON_ERROR_STOP=1 -U $DbUser -d $Database -c 'SHOW server_version_num;')
 if ($LASTEXITCODE -ne 0 -or $version.Count -ne 1 -or -not ($version[0] -match '^\d+$')) {throw 'PostgreSQL version readback failed'}
 if ([int]$version[0] -lt 180000 -or [int]$version[0] -ge 190000) {throw 'PostgreSQL 18 required'}
 $result=@(Get-Content -LiteralPath $sql -Raw | & $docker.Source exec -i $Container psql -X -qAt -v ON_ERROR_STOP=1 -U $DbUser -d $Database)
 if ($LASTEXITCODE -ne 0) {throw "SQL fixture returned exit $LASTEXITCODE"}
 $jsonLines=@($result | Where-Object {$_ -match '"schema":"atlas.dag-cas-outbox-scratch.v1"'})
 if ($jsonLines.Count -ne 1) {throw 'Expected exactly one scratch proof JSON output'}
 $proof=$jsonLines[0] | ConvertFrom-Json
 if ($proof.verdict -ne 'FIXTURE_PASS' -or $proof.state -ne 'SUCCEEDED' -or
     $proof.generation -ne 1 -or $proof.outboxEvents -ne 1 -or -not $proof.fixtureOnly) {
   throw 'Scratch proof assertions not satisfied'
 }
 $report.verdict='SCRATCH_FIXTURE_PASS'
 $report.details='Rollback-only fixture passed; live schema and concurrent sessions remain unproven.'
} catch {
 $report.details=$_.Exception.Message
} finally {
 Set-Location $old
 $out=Join-Path $RepoRoot $ReceiptPath
 New-Item -ItemType Directory -Force -Path (Split-Path $out -Parent) | Out-Null
 $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $out -Encoding utf8
 Write-Host "Receipt: $out"
}
if ($report.verdict -ne 'SCRATCH_FIXTURE_PASS') {exit 2}
