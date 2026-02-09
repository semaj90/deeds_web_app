# Automated Restoration Script for Corrupted Files
# Phase 1: Restore 99 files with clean backups
# Priority: P0 - CRITICAL

param(
    [switch]$DryRun = $false,
    [switch]$Execute = $false,
    [int]$Limit = 0  # 0 = all files, >0 = limit restoration count
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

if (-not $DryRun -and -not $Execute) {
    Write-Host @"
🔧 Restore Corrupted Files - Help
═══════════════════════════════════════════════════════════════════

Usage:
  .\restore-corrupted-files.ps1 -DryRun         # Preview changes
  .\restore-corrupted-files.ps1 -Execute        # Execute restoration
  .\restore-corrupted-files.ps1 -Execute -Limit 10  # Restore first 10 files

Purpose:
  Restore 99 corrupted current files from clean backups identified by
  analyze-backups.mjs. These files have broken imports, type errors, or
  syntax issues but have working backup versions.

Safety:
  - Creates 'corrupted-archive-TIMESTAMP/' with copies of corrupted files
  - Can be rolled back via git or by restoring from archive
  - Validates backup exists before restoration

Next Steps After Restoration:
  1. npx svelte-check --threshold error  # Check error reduction
  2. npm run test                        # Verify tests pass
  3. node scripts/smoke-test.mjs         # Test critical paths
"@ -ForegroundColor $ColorInfo
    exit 0
}

# Validate CSV exists
$csvPath = "reports\backup-analysis.csv"
if (-not (Test-Path $csvPath)) {
    Write-Host "❌ Error: $csvPath not found!" -ForegroundColor $ColorError
    Write-Host "   Run: node scripts/analyze-backups.mjs" -ForegroundColor $ColorWarning
    exit 1
}

Write-Host "`n🔧 Corrupted File Restoration Tool" -ForegroundColor $ColorInfo
Write-Host "═" * 60
Write-Host "Mode: $(if ($DryRun) { 'DRY RUN (preview only)' } else { 'EXECUTE (will modify files)' })" -ForegroundColor $(if ($DryRun) { $ColorWarning } else { $ColorInfo })
Write-Host "Limit: $(if ($Limit -gt 0) { "$Limit files" } else { 'All files' })"

# Safety: Create archive directory
if ($Execute) {
    $archiveDir = "corrupted-archive-$timestamp"
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
    Write-Host "`n📁 Safety archive created: $archiveDir" -ForegroundColor $ColorSuccess
}

# Load CSV and filter RESTORE_FROM_BACKUP
Write-Host "`n📊 Loading backup analysis..." -ForegroundColor $ColorInfo

try {
    $restorations = Import-Csv $csvPath |
        Where-Object { $_.Recommendation -eq "RESTORE_FROM_BACKUP" } |
        Sort-Object Priority

    if ($Limit -gt 0) {
        $restorations = $restorations | Select-Object -First $Limit
    }
} catch {
    Write-Host "❌ Error loading CSV: $_" -ForegroundColor $ColorError
    exit 1
}

$totalCount = $restorations.Count
Write-Host "🔍 Found $totalCount files to restore" -ForegroundColor $ColorWarning

if ($totalCount -eq 0) {
    Write-Host "`n✅ No files need restoration!" -ForegroundColor $ColorSuccess
    exit 0
}

Write-Host "═" * 60

# Statistics
$stats = @{
    restored = 0
    failed = 0
    skipped = 0
}

# Group by system for reporting
$systems = @{
    'AI Services' = @()
    'Cache & Storage' = @()
    'Database & Routing' = @()
    'UI Components' = @()
    'Other' = @()
}

function Get-SystemCategory {
    param([string]$path)

    if ($path -match '\\server\\ai\\') { return 'AI Services' }
    if ($path -match '\\cache\\|\\storage\\|minio') { return 'Cache & Storage' }
    if ($path -match '\\database\\|\\routing\\') { return 'Database & Routing' }
    if ($path -match '\\components\\.*\.svelte') { return 'UI Components' }
    return 'Other'
}

# Process each restoration
$current = 0
foreach ($item in $restorations) {
    $current++
    $backupPath = $item.'Backup Path'
    $currentPath = $item.'Current Path'
    $priority = $item.Priority
    $reason = $item.Reasons

    $category = Get-SystemCategory -path $currentPath
    $systems[$category] += $currentPath

    Write-Host "`n[$current/$totalCount] 📄 $currentPath" -ForegroundColor $ColorInfo
    Write-Host "   From: $backupPath" -ForegroundColor Gray
    Write-Host "   Reason: $reason" -ForegroundColor Gray
    Write-Host "   Priority: P$priority | System: $category" -ForegroundColor Gray

    if ($DryRun) {
        Write-Host "   [DRY RUN] Would restore from backup" -ForegroundColor $ColorWarning
        $stats.restored++
        continue
    }

    try {
        # Verify backup exists
        if (-not (Test-Path $backupPath)) {
            Write-Host "   ⏭️  Backup not found, skipping" -ForegroundColor $ColorWarning
            $stats.skipped++
            continue
        }

        # Archive corrupted current (if exists)
        if (Test-Path $currentPath) {
            $archivePath = Join-Path $archiveDir (Split-Path $currentPath -Leaf)
            $archivePathUnique = $archivePath
            $counter = 1
            while (Test-Path $archivePathUnique) {
                $archivePathUnique = $archivePath -replace '(\.[^.]+)$', "_$counter`$1"
                $counter++
            }

            Copy-Item $currentPath $archivePathUnique -Force
            Write-Host "   💾 Archived corrupted version" -ForegroundColor Gray
        } else {
            Write-Host "   ℹ️  Current file doesn't exist (new file)" -ForegroundColor Gray
        }

        # Ensure target directory exists
        $targetDir = Split-Path $currentPath -Parent
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        # Restore clean backup
        Copy-Item $backupPath $currentPath -Force
        Write-Host "   ✅ Restored from backup" -ForegroundColor $ColorSuccess
        $stats.restored++

    } catch {
        Write-Host "   ❌ Error: $_" -ForegroundColor $ColorError
        $stats.failed++
    }
}

# Summary Report
Write-Host "`n" + ("═" * 60)
Write-Host "📊 Restoration Summary" -ForegroundColor $ColorInfo
Write-Host "═" * 60

Write-Host "`nResults:"
Write-Host "   ✅ Restored: $($stats.restored)" -ForegroundColor $ColorSuccess
Write-Host "   ⏭️  Skipped: $($stats.skipped)" -ForegroundColor $ColorWarning
Write-Host "   ❌ Failed: $($stats.failed)" -ForegroundColor $(if ($stats.failed -gt 0) { $ColorError } else { "Gray" })

Write-Host "`nAffected Systems:"
foreach ($system in $systems.Keys | Sort-Object) {
    $count = $systems[$system].Count
    if ($count -gt 0) {
        Write-Host "   $system : $count files" -ForegroundColor $ColorInfo
    }
}

if ($Execute) {
    Write-Host "`n📁 Corrupted files archived to: $archiveDir" -ForegroundColor $ColorInfo
    Write-Host "   (Restore via: Copy-Item $archiveDir\* src\... if needed)" -ForegroundColor Gray
}

if (-not $DryRun -and $stats.restored -gt 0) {
    Write-Host "`n🔄 Next Steps:" -ForegroundColor $ColorWarning
    Write-Host "   1. Verify error reduction:"
    Write-Host "      npx svelte-check --threshold error"
    Write-Host ""
    Write-Host "   2. Run tests:"
    Write-Host "      npm run test"
    Write-Host ""
    Write-Host "   3. Test critical services:"
    Write-Host "      node scripts/test-ai-services.mjs      # AI/ML"
    Write-Host "      node scripts/test-cache-services.mjs   # Cache"
    Write-Host "      npm run db:push                        # Database"
    Write-Host ""
    Write-Host "   4. If issues found, rollback:"
    Write-Host "      Copy-Item $archiveDir\* src\... -Force"
    Write-Host ""
}

# Exit code
if ($stats.failed -gt 0) {
    exit 1
} else {
    exit 0
}
