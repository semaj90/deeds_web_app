Write-Host "🚀 Running All Phase Fixers..." -ForegroundColor Cyan
$start = Get-Date

$phases = @(
  "node comprehensive-syntax-fix.cjs",
  "node phase2-type-fixer.cjs",
  "node phase3-top-file-fixer.cjs",
  "node phase4-comma-cleanup.cjs",
  "node phase6-advanced-ts1005-fixer.cjs",
  "node phase7-structural-fixer.cjs",
  "node phase8-string-fixer.cjs",
  "pwsh scripts/phase29-fix-imports-and-runes.ps1 -SkipVerification"
)

$totalFixes = 0
$results = @()

foreach ($cmd in $phases) {
  Write-Host "`n▶️  $cmd" -ForegroundColor Yellow
  $output = Invoke-Expression $cmd 2>&1
  Write-Host $output
  
  # Extract fix count from output
  if ($output -match 'Total.*fixes.*?(\d+)') {
    $fixes = [int]$Matches[1]
    $totalFixes += $fixes
    $results += [PSCustomObject]@{
      Phase = $cmd -replace 'node ', '' -replace '.cjs', ''
      Fixes = $fixes
    }
  }
}

$duration = (Get-Date) - $start

Write-Host "`n╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          ✅ ALL FIXERS COMPLETE ✅                ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host "`nTotal Runtime: $($duration.Minutes)m $($duration.Seconds)s" -ForegroundColor Cyan
Write-Host "Total Fixes: $totalFixes`n" -ForegroundColor Yellow

# Display summary table
$results | Format-Table -AutoSize

# Log to trend file
$snapshot = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$logEntry = "$snapshot, TotalFixes:$totalFixes, Runtime:$($duration.TotalMinutes -as [int])min"
Add-Content -Path ".\reports\ERROR_TREND_LOG.csv" -Value $logEntry

Write-Host "📊 Logged to reports\ERROR_TREND_LOG.csv`n" -ForegroundColor Gray
