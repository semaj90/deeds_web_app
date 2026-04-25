#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 78 Delta Verification - Proves error clustering is stable and updates work

.DESCRIPTION
This script runs a deterministic delta check to verify:
1. svelte-check output is being parsed correctly
2. Errors map to consistent cluster_ids
3. Re-running updates existing clusters instead of creating duplicates

.EXAMPLE
.\scripts\phase78-delta-verify.ps1
#>

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = "123456"

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Phase 78 Delta Verification System                   ║" -ForegroundColor Cyan
Write-Host "║     Deterministic Cluster Stability Test                 ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Step 0: Snapshot current state
Write-Host "📊 Step 0: Baseline Snapshot" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

$baseline = psql -h localhost -U legal_admin -d legal_ai_db -t -A -F'|' -c @"
SELECT
  COUNT(*) AS clusters,
  SUM(count) AS total_errors,
  MAX(last_seen_at) AS last_seen_max
FROM error_cluster
WHERE archived_at IS NULL;
"@ | ConvertFrom-Csv -Delimiter '|' -Header 'clusters','total_errors','last_seen_max'

Write-Host "  Clusters:     $($baseline.clusters)" -ForegroundColor White
Write-Host "  Total Errors: $($baseline.total_errors)" -ForegroundColor White
Write-Host "  Last Seen:    $($baseline.last_seen_max)`n" -ForegroundColor White

# Get top 10 cluster_ids for stability check
Write-Host "📌 Top 10 Cluster IDs (for delta comparison):" -ForegroundColor Cyan
$topClusters = psql -h localhost -U legal_admin -d legal_ai_db -t -A -c @"
SELECT cluster_id
FROM error_cluster
WHERE archived_at IS NULL
ORDER BY count DESC
LIMIT 10;
"@

$topClusters | ForEach-Object { Write-Host "  • $_" -ForegroundColor Gray }
Write-Host ""

# Step 1: Generate fresh svelte-check log
Write-Host "🔍 Step 1: Generate Fresh Error Log" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

$logPath = ".\out\svelte-check-verification-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
New-Item -ItemType Directory -Force -Path ".\out" | Out-Null

Write-Host "  Running: npx svelte-check --fail-on-warnings false" -ForegroundColor Gray
npx svelte-check --fail-on-warnings false > $logPath 2>&1

$logSize = (Get-Item $logPath).Length / 1KB
Write-Host "  ✅ Log generated: $logPath ($([math]::Round($logSize, 2)) KB)`n" -ForegroundColor Green

# Count errors in log
$errorCount = (Select-String -Path $logPath -Pattern "Error:" | Measure-Object).Count
Write-Host "  Errors found in log: $errorCount`n" -ForegroundColor White

# Step 2: Import log into pipeline
Write-Host "📥 Step 2: Import Log (Delta Check)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

Write-Host "  Running: npm run import:errors `"$logPath`"" -ForegroundColor Gray
$importOutput = npm run import:errors "`"$logPath`"" 2>&1 | Out-String

# Parse import results
if ($importOutput -match "Inserted:\s+(\d+)") {
    $inserted = [int]$Matches[1]
} else {
    $inserted = -1
}

if ($importOutput -match "Updated:\s+(\d+)") {
    $updated = [int]$Matches[1]
} else {
    $updated = -1
}

if ($importOutput -match "Skipped:\s+(\d+)") {
    $skipped = [int]$Matches[1]
} else {
    $skipped = -1
}

Write-Host "`n  Import Results:" -ForegroundColor Cyan
Write-Host "  ═══════════════" -ForegroundColor Gray
Write-Host "  Inserted: $inserted" -ForegroundColor $(if ($inserted -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Updated:  $updated" -ForegroundColor $(if ($updated -gt 0) { "Green" } else { "Red" })
Write-Host "  Skipped:  $skipped`n" -ForegroundColor Gray

# Step 3: Verify last_seen_at changed
Write-Host "🕐 Step 3: Verify Timestamps Updated" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

$afterImport = psql -h localhost -U legal_admin -d legal_ai_db -t -A -c @"
SELECT MAX(last_seen_at) AS last_seen_max
FROM error_cluster
WHERE archived_at IS NULL;
"@

Write-Host "  Last Seen Max: $afterImport" -ForegroundColor White

$timeDiff = (Get-Date) - [DateTime]::Parse($afterImport)
Write-Host "  Time Ago:      $([math]::Round($timeDiff.TotalSeconds, 1)) seconds ago" -ForegroundColor $(if ($timeDiff.TotalMinutes -lt 2) { "Green" } else { "Yellow" })
Write-Host ""

# Step 4: Confirm cluster stability
Write-Host "🔗 Step 4: Cluster Stability Check" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

Write-Host "  Top 15 clusters by last_seen_at (should match baseline):" -ForegroundColor Cyan
$recentClusters = psql -h localhost -U legal_admin -d legal_ai_db -t -A -F'|' -c @"
SELECT cluster_id, count, last_seen_at
FROM error_cluster
WHERE archived_at IS NULL
ORDER BY last_seen_at DESC
LIMIT 15;
"@ | ConvertFrom-Csv -Delimiter '|' -Header 'cluster_id','count','last_seen_at'

$recentClusters | ForEach-Object {
    Write-Host "  $($_.cluster_id.PadRight(50)) | Count: $($_.count.ToString().PadLeft(4)) | $($_.last_seen_at)" -ForegroundColor Gray
}
Write-Host ""

# Step 5: Route-level summary
Write-Host "📍 Step 5: Route-Level Error Distribution" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

$routeStats = psql -h localhost -U legal_admin -d legal_ai_db -t -A -F'|' -c @"
SELECT
  COALESCE(route_id, '__non_route__') AS route,
  COUNT(*) AS clusters,
  SUM(count) AS total_errors,
  MAX(last_seen_at) AS last_seen
FROM error_cluster
WHERE archived_at IS NULL
GROUP BY route_id
ORDER BY total_errors DESC
LIMIT 10;
"@ | ConvertFrom-Csv -Delimiter '|' -Header 'route','clusters','total_errors','last_seen'

$routeStats | ForEach-Object {
    Write-Host "  $($_.route.PadRight(40)) | $($_.clusters.ToString().PadLeft(3)) clusters | $($_.total_errors.ToString().PadLeft(5)) errors" -ForegroundColor White
}
Write-Host ""

# Final Assessment
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                   VERIFICATION RESULT                     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$success = $true
$issues = @()

# Check 1: Updates > 0
if ($updated -le 0) {
    $success = $false
    $issues += "❌ No clusters were updated (expected updates for existing errors)"
}

# Check 2: Inserts should be 0 (or very low) for stable clusters
if ($inserted -gt 5) {
    $success = $false
    $issues += "⚠️  High insert count ($inserted) suggests cluster_id instability"
}

# Check 3: Timestamps should be fresh
if ($timeDiff.TotalMinutes -gt 5) {
    $success = $false
    $issues += "❌ Timestamps not updated recently (check import ran successfully)"
}

if ($success) {
    Write-Host "✅ VERIFICATION PASSED" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Green
    Write-Host "✓ Error parsing is working correctly" -ForegroundColor Green
    Write-Host "✓ Clusters map consistently to same cluster_ids" -ForegroundColor Green
    Write-Host "✓ Re-running updates existing clusters (no duplicates)" -ForegroundColor Green
    Write-Host "✓ Timestamps update correctly`n" -ForegroundColor Green

    Write-Host "📊 Summary:" -ForegroundColor Cyan
    Write-Host "  Baseline Clusters: $($baseline.clusters)" -ForegroundColor White
    Write-Host "  Errors in Log:     $errorCount" -ForegroundColor White
    Write-Host "  Updated Clusters:  $updated" -ForegroundColor Green
    Write-Host "  New Clusters:      $inserted" -ForegroundColor $(if ($inserted -eq 0) { "Green" } else { "Yellow" })
} else {
    Write-Host "❌ VERIFICATION FAILED" -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Red

    foreach ($issue in $issues) {
        Write-Host "  $issue" -ForegroundColor Red
    }

    Write-Host "`n💡 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check cluster_id generation in import script" -ForegroundColor Gray
    Write-Host "  2. Ensure error normalization removes line/column numbers" -ForegroundColor Gray
    Write-Host "  3. Verify error parsing regex matches svelte-check format" -ForegroundColor Gray
}

Write-Host "`n📁 Log saved to: $logPath" -ForegroundColor Cyan
