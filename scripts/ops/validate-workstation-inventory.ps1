[CmdletBinding()]
param(
    [string]$SnapshotPath,
    [ValidateRange(1, 8760)]
    [int]$MaxAgeHours = 168
)

$ErrorActionPreference = 'Stop'
$defaultDirectory = Join-Path $env:LOCALAPPDATA 'DeedsWebApp\inventory'
if (-not $SnapshotPath) {
    $latest = Get-ChildItem -LiteralPath $defaultDirectory -Filter 'inventory-*.json' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latest) {
        Write-Error "No inventory snapshot found in $defaultDirectory. Capture one first."
        exit 2
    }
    $SnapshotPath = $latest.FullName
}

try {
    $snapshot = Get-Content -LiteralPath $SnapshotPath -Raw | ConvertFrom-Json
} catch {
    Write-Error "Invalid inventory JSON: $($_.Exception.Message)"
    exit 1
}

$failures = New-Object 'System.Collections.Generic.List[string]'
$warnings = New-Object 'System.Collections.Generic.List[string]'
if ($snapshot.schema -ne 'workstation-storage-db-inventory-v1') { $failures.Add('Unexpected or missing inventory schema version.') }
if (-not $snapshot.capturedAtUtc) { $failures.Add('Snapshot timestamp is missing.') }
else {
    $capturedAt = [DateTime]::Parse($snapshot.capturedAtUtc).ToUniversalTime()
    if (([DateTime]::UtcNow - $capturedAt).TotalHours -gt $MaxAgeHours) { $warnings.Add("Snapshot is older than $MaxAgeHours hours.") }
}

if (-not $snapshot.volume -or $snapshot.volume.freeBytes -lt 3GB) { $warnings.Add('C: free space is below 3 GiB or unavailable.') }
if (-not $snapshot.postgres.available) { $warnings.Add("PostgreSQL catalog is unavailable: $($snapshot.postgres.error)") }
else {
    if ($snapshot.postgres.catalog.database -ne 'legal_ai_db') { $failures.Add('PostgreSQL database identity does not match legal_ai_db.') }
    if ($snapshot.postgres.catalog.serverVersion -notmatch '^18\.') { $failures.Add('Live PostgreSQL major version is not 18.') }
    if (-not $snapshot.postgres.catalog.vectorExtension) { $failures.Add('pgvector extension is missing.') }
    if ($snapshot.postgres.catalog.evidenceEmbeddingType -ne 'vector(768)') { $failures.Add('Canonical evidence embedding is not vector(768).') }
    if (-not $snapshot.postgres.catalog.evidenceOutboxPresent) { $failures.Add('Evidence projection outbox relation is missing.') }
    if ($snapshot.postgres.catalog.evidenceHnswValid -ne $true) { $failures.Add('Evidence cosine HNSW index is missing or invalid.') }

    $analysisColumns = @($snapshot.postgres.catalog.analysisJobsColumns | ForEach-Object { $_.name })
    $requiredColumns = @('id', 'evidence_id', 'case_id', 'job_type', 'status', 'progress', 'result', 'error', 'started_at', 'completed_at', 'created_at', 'updated_at')
    foreach ($column in $requiredColumns) {
        if ($column -notin $analysisColumns) { $failures.Add("analysis_jobs is missing expected column '$column'.") }
    }
    $resultColumn = $snapshot.postgres.catalog.analysisJobsColumns | Where-Object name -eq 'result' | Select-Object -First 1
    if ($resultColumn.type -ne 'jsonb') { $failures.Add('analysis_jobs.result is not jsonb.') }

    if ($snapshot.postgres.catalog.drizzleMigrationLedgerPresent -and $snapshot.postgres.migrationLedger.rowCount -eq 0 -and $snapshot.drizzle.journalEntryCount -gt 0) {
        $warnings.Add('Drizzle live migration ledger is empty while the repository journal has entries; reconcile migration history before running migrate.')
    }
}

if (-not $snapshot.nodeModules.enabled) { $warnings.Add('node_modules were not scanned; use the bounded full-scan task for a complete inventory.') }
elseif ($snapshot.nodeModules.status -ne 'complete') { $warnings.Add("node_modules scan is incomplete: $($snapshot.nodeModules.status).") }
if (-not $snapshot.gitIgnored.enabled) { $warnings.Add('Git-ignored files were not scanned; use the full inventory task for that separate count.') }
elseif ($snapshot.gitIgnored.status -ne 'complete') { $warnings.Add("Git-ignored file scan is incomplete: $($snapshot.gitIgnored.status).") }

if ($failures.Count -eq 0) { Write-Host 'PASS: inventory structure and required PG18 contracts are valid.' -ForegroundColor Green }
foreach ($warning in $warnings) { Write-Host "WARN: $warning" -ForegroundColor Yellow }
foreach ($failure in $failures) { Write-Host "FAIL: $failure" -ForegroundColor Red }
Write-Host "Snapshot: $SnapshotPath"

if ($failures.Count -gt 0) { exit 1 }
exit 0
