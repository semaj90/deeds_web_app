<#
.SYNOPSIS
  Audits backup directories for duplicates and unnecessary copies
.DESCRIPTION
  Scans all phase backup directories, identifies duplicates via hash,
  and provides recommendations for cleanup
#>

param(
  [switch]$DeleteDuplicates,
  [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

Write-Host "🔍 Auditing backup directories..." -ForegroundColor Cyan

# Find all backup directories
$backupDirs = Get-ChildItem -Directory | Where-Object { $_.Name -match "phase\d+-backups" }

if ($backupDirs.Count -eq 0) {
    Write-Host "✓ No backup directories found" -ForegroundColor Green
    Pop-Location
    exit 0
}

Write-Host "`nFound $($backupDirs.Count) backup directories:" -ForegroundColor Yellow
$backupDirs | ForEach-Object { Write-Host "  - $($_.Name)" }

# Calculate sizes and file counts
$totalSize = 0
$totalFiles = 0
$backupStats = @()

foreach ($dir in $backupDirs) {
    $files = Get-ChildItem -Path $dir.FullName -Recurse -File
    $size = ($files | Measure-Object -Property Length -Sum).Sum
    $totalSize += $size
    $totalFiles += $files.Count
    
    $backupStats += [PSCustomObject]@{
        Name = $dir.Name
        Files = $files.Count
        SizeMB = [math]::Round($size / 1MB, 2)
        Path = $dir.FullName
    }
}

Write-Host "`n📊 Backup Statistics:" -ForegroundColor Cyan
$backupStats | Format-Table -AutoSize

Write-Host "Total backup space: $([math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor Yellow
Write-Host "Total backup files: $totalFiles" -ForegroundColor Yellow

# Check for duplicates by comparing file hashes
Write-Host "`n🔎 Checking for duplicate files..." -ForegroundColor Cyan
$allFiles = $backupDirs | ForEach-Object { Get-ChildItem -Path $_.FullName -Recurse -File }
$fileHashes = @{}
$duplicates = @()

foreach ($file in $allFiles) {
    if ($Verbose) {
        Write-Host "  Hashing: $($file.FullName)" -ForegroundColor Gray
    }
    $hash = (Get-FileHash -Path $file.FullName -Algorithm MD5).Hash
    
    if ($fileHashes.ContainsKey($hash)) {
        $duplicates += [PSCustomObject]@{
            Hash = $hash
            Original = $fileHashes[$hash]
            Duplicate = $file.FullName
            SizeMB = [math]::Round($file.Length / 1MB, 2)
        }
    } else {
        $fileHashes[$hash] = $file.FullName
    }
}

if ($duplicates.Count -gt 0) {
    Write-Host "`n⚠️  Found $($duplicates.Count) duplicate files:" -ForegroundColor Yellow
    $duplicates | Select-Object -First 10 | Format-Table -AutoSize
    
    if ($duplicates.Count -gt 10) {
        Write-Host "... and $($duplicates.Count - 10) more duplicates" -ForegroundColor Gray
    }
    
    $duplicateSize = ($duplicates | ForEach-Object { $_.SizeMB } | Measure-Object -Sum).Sum
    Write-Host "`nPotential space savings: $([math]::Round($duplicateSize, 2)) MB" -ForegroundColor Green
    
    if ($DeleteDuplicates) {
        Write-Host "`n🗑️  Deleting duplicate files..." -ForegroundColor Red
        foreach ($dup in $duplicates) {
            Remove-Item -Path $dup.Duplicate -Force
            if ($Verbose) {
                Write-Host "  Deleted: $($dup.Duplicate)" -ForegroundColor Gray
            }
        }
        Write-Host "✅ Deleted $($duplicates.Count) duplicate files, saved $([math]::Round($duplicateSize, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "`nℹ️  Run with -DeleteDuplicates to remove duplicate files" -ForegroundColor Cyan
    }
} else {
    Write-Host "✅ No duplicate files found" -ForegroundColor Green
}

# Recommendations
Write-Host "`n💡 Recommendations:" -ForegroundColor Cyan
if ($totalSize -gt 100MB) {
    Write-Host "  - Consider archiving old backups (total: $([math]::Round($totalSize / 1MB, 2)) MB)" -ForegroundColor Yellow
}
if ($backupDirs.Count -gt 5) {
    Write-Host "  - You have $($backupDirs.Count) backup directories - consider consolidating" -ForegroundColor Yellow
}
Write-Host "  - Keep only phase34-backups, phase40-backups (most recent phases)" -ForegroundColor Green
Write-Host "  - Archive others to zip files or delete if no longer needed" -ForegroundColor Green

# Export report
$report = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    totalBackupDirs = $backupDirs.Count
    totalFiles = $totalFiles
    totalSizeMB = [math]::Round($totalSize / 1MB, 2)
    duplicates = $duplicates.Count
    potentialSavingsMB = if ($duplicates.Count -gt 0) { [math]::Round(($duplicates | ForEach-Object { $_.SizeMB } | Measure-Object -Sum).Sum, 2) } else { 0 }
    backupStats = $backupStats
}

$report | ConvertTo-Json -Depth 5 | Out-File "backup-audit-report.json" -Encoding UTF8
Write-Host "`n📄 Report saved to: backup-audit-report.json" -ForegroundColor Green

Pop-Location
