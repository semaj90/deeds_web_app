# Read-only, non-installing proof runner. Execute from repository root in PowerShell.
[CmdletBinding()]
param(
 [string]$RepoRoot = (Get-Location).Path,
 [string]$PythonExe = "",
 [switch]$DockerReadback,
 [string]$PostgresContainer = "",
 [string]$Database = "",
 [string]$DbUser = "",
 [switch]$IncludeGnn,
 [switch]$IncludeOak,
 [string]$OutputPath = ".tmp/atlas/dag-journal-gnn-preflight-v1.json"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$report = [ordered]@{
 schema='atlas.dag-journal-gnn-preflight.v1'
 timestamp=(Get-Date).ToUniversalTime().ToString('o')
 readOnly=$true
 databaseWritesPerformed=$false
 migrationApplied=$false
 packageInstallsPerformed=$false
 results=@()
}
function Record([string]$name,[string]$status,[string]$details) {
 $report.results += [ordered]@{name=$name;status=$status;details=$details}
}
function Probe([string]$name,[scriptblock]$work) {
 try { $global:LASTEXITCODE = 0; & $work; if ($LASTEXITCODE -ne 0) { throw "Exit code $LASTEXITCODE" }; Record $name 'PASS' 'Command completed' }
 catch { Record $name 'UNPROVEN' $_.Exception.Message }
}
Push-Location $RepoRoot
try {
 if ([string]::IsNullOrWhiteSpace($PythonExe)) {
   $PythonExe = (Get-Command python -ErrorAction Stop).Source
 }
 $env:PYTHONPATH=Join-Path $RepoRoot 'python'
 Probe 'python_contract_tests' {
   & $PythonExe -m unittest discover -s python/tests -p 'test_dag_snapshot_state_v1.py' -v
 }
 Probe 'python_async_worker_tests' {
   & $PythonExe -m unittest discover -s python/tests -p 'test_async_dag_worker_v1.py' -v
 }
 if ($IncludeGnn) {
   Probe 'networkx_gnn_fixture' {
     & $PythonExe scripts/atlas/prove-networkx-gnn-cpu-v1.py
   }
 }
 if ($IncludeOak) {
   Probe 'oak_python_parity' {
     & $PythonExe -m unittest discover -s python/oak_agent -p 'test_grounded_nlp_fact_parity_v1.py' -v
   }
 }
 if ($DockerReadback) {
   if (-not $PostgresContainer -or -not $Database -or -not $DbUser) {
     Record 'postgres_schema' 'UNPROVEN' 'Supply PostgresContainer, Database, DbUser; no automatic discovery of credentials.'
   } else {
     Probe 'postgres_schema' {
       # Explicit transaction read-only and short statement timeout.
       # Avoid psql variable expansion or SQL assembled from user input.
       $sql = "BEGIN READ ONLY; SET LOCAL statement_timeout='3000ms'; SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('execution_runs','execution_journal_steps','execution_dependencies','execution_side_effects') ORDER BY table_name,ordinal_position; ROLLBACK;"
       $sql | docker exec -i $PostgresContainer psql -X -v ON_ERROR_STOP=1 -U $DbUser -d $Database
     }
   }
 } else { Record 'postgres_schema' 'NOT_RUN' 'Docker readback requires explicit -DockerReadback.' }
} finally {
 Pop-Location
 $target = Join-Path $RepoRoot $OutputPath
 $parent=Split-Path $target -Parent
 if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
 $report | ConvertTo-Json -Depth 8 | Set-Content -Path $target -Encoding utf8
 Write-Host "Receipt: $target"
}
if (@($report.results | Where-Object { $_.status -eq 'UNPROVEN' }).Count -gt 0) { exit 2 }
