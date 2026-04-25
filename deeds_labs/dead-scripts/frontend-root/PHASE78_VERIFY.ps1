#!/usr/bin/env powershell
# Phase 78 Safe Mode - Verification Checklist
# Run this to verify all components are in place

param(
  [switch]$Verbose
)

$checks = @(
  @{
    Name = "Baseline Snapshot Exists"
    Path = "C:\Users\james\Videos\deeds-web-app\legal_ai_db_phase78_baseline.dump"
    Type = "File"
  },
  @{
    Name = "Schema: error_clusters.ts"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\db\schema\error_clusters.ts"
    Type = "File"
  },
  @{
    Name = "Schema: route_error_patches.ts"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\db\schema\route_error_patches.ts"
    Type = "File"
  },
  @{
    Name = "Schema: error_feedback.ts"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\db\schema\error_feedback.ts"
    Type = "File"
  },
  @{
    Name = "Schema: error_timeline.ts"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\db\schema\error_timeline.ts"
    Type = "File"
  },
  @{
    Name = "Safe Migration Script"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\drizzle\manual\20251207_phase78_safe_upgrade.sql"
    Type = "File"
  },
  @{
    Name = "Read Endpoint: error-events"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\api\phase78\error-events\+server.ts"
    Type = "File"
  },
  @{
    Name = "Write Endpoint: route-health"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\api\phase78\route-health\+server.ts"
    Type = "File"
  },
  @{
    Name = "Safe Migration Guide"
    Path = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\PHASE78_SAFE_MIGRATION_GUIDE.md"
    Type = "File"
  }
)

$passed = 0
$failed = 0

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          PHASE 78 SAFE MODE - VERIFICATION CHECKLIST        ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

foreach ($check in $checks) {
  $exists = Test-Path $check.Path

  if ($exists) {
    Write-Host "  ✅ $($check.Name)" -ForegroundColor Green
    $passed++

    if ($Verbose) {
      $item = Get-Item $check.Path
      if ($check.Type -eq "File") {
        $size = $item.Length
        if ($size -gt 1MB) {
          $sizeStr = "{0:F2} MB" -f ($size / 1MB)
        } else {
          $sizeStr = "{0} B" -f $size
        }
        Write-Host "     📄 Size: $sizeStr" -ForegroundColor Gray
      }
    }
  } else {
    Write-Host "  ❌ $($check.Name)" -ForegroundColor Red
    Write-Host "     📍 Expected at: $($check.Path)" -ForegroundColor Gray
    $failed++
  }
}

# Database checks
Write-Host "`n  Database Verification:" -ForegroundColor Cyan
Write-Host "  ─────────────────────────" -ForegroundColor Cyan

$env:PGPASSWORD = "123456"
try {
  $tableList = & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d legal_ai_db -t -c `
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'error_%' OR tablename LIKE 'route_%') ORDER BY tablename;" 2>$null

  $tables = $tableList -split "`n" | Where-Object { $_ -match '\S' }

  if ($tables.Count -ge 4) {
    Write-Host "  ✅ Phase 78 tables exist ($($tables.Count) tables found)" -ForegroundColor Green
    if ($Verbose) {
      foreach ($table in $tables) {
        Write-Host "     • $($table.Trim())" -ForegroundColor Gray
      }
    }
    $passed++
  } else {
    Write-Host "  ⚠️  Only $($tables.Count) Phase 78 tables found (expected ≥4)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  ⚠️  Could not connect to database (migration may not be applied yet)" -ForegroundColor Yellow
}

# Summary
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                          SUMMARY                             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$total = $passed + $failed
$percentage = if ($total -gt 0) { [math]::Round(($passed / $total) * 100) } else { 0 }

Write-Host "  Checks Passed:  $passed/$total ($percentage%)" -ForegroundColor Green
Write-Host "  Checks Failed:  $failed/$total" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })

if ($failed -eq 0) {
  Write-Host "`n  🎉 ALL CHECKS PASSED - Phase 78 is ready to go!`n" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n  ⚠️  Some checks failed - see details above`n" -ForegroundColor Yellow
  exit 1
}
