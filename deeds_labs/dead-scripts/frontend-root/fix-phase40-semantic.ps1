# Phase 40: Semantic Error Fixes
# Fixes remaining TS1005, TS1109, TS1128 errors from Phase 34
# Target: < 5 TypeScript errors

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = "phase40-output-$timestamp.log"
$backupDir = "phase40-backups-$timestamp"

Write-Host "🚀 Phase 40: Semantic Error Fixes" -ForegroundColor Cyan
Write-Host "Targeting TS1005, TS1109, TS1128 patterns" -ForegroundColor Yellow

# Create backup directory
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# Statistics
$stats = @{
    FilesScanned = 0
    FilesFixed = 0
    PatternsFixed = 0
    Errors = 0
}

# Fix patterns for semantic errors
$fixPatterns = @(
    # Pattern 1: Fix malformed object property separators (line, :)
    @{ Name = "Object comma-colon"; Pattern = ',\s*:'; Replacement = ':' }
    
    # Pattern 2: Fix semicolons in object properties
    @{ Name = "Object semicolons"; Pattern = ';\s*([\w$_]+)\s*:'; Replacement = ', $1:' }
    
    # Pattern 3: Fix missing commas between properties
    @{ Name = "Missing property commas"; Pattern = ':\s*([^,}\n]+)\s+([a-zA-Z_$][\w$]*)\s*:'; Replacement = ': $1, $2:' }
    
    # Pattern 4: Fix duplicate commas
    @{ Name = "Duplicate commas"; Pattern = ',\s*,+'; Replacement = ',' }
    
    # Pattern 5: Fix Svelte script tag syntax
    @{ Name = "Svelte script tags"; Pattern = '<script,\s+lang='; Replacement = '<script lang=' }
    
    # Pattern 6: Fix trailing commas in function params
    @{ Name = "Function param commas"; Pattern = ',\s*\)'; Replacement = ')' }
    
    # Pattern 7: Fix brace-comma combinations
    @{ Name = "Brace-comma cleanup"; Pattern = '\{\s*,'; Replacement = '{' }
    
    # Pattern 8: Fix comma-brace combinations
    @{ Name = "Comma-brace cleanup"; Pattern = ',\s*\}'; Replacement = '}' }
    
    # Pattern 9: Fix element access expressions []
    @{ Name = "Empty element access"; Pattern = '\[\s*\](?!\s*[=:])'; Replacement = '' }
    
    # Pattern 10: Fix unexpected keywords in interfaces
    @{ Name = "Interface keyword cleanup"; Pattern = 'interface\s+\w+\s+\w+\s*\{'; Replacement = { 
        param($match)
        $parts = $match.Value -split '\s+'
        return "interface $($parts[1]) {"
    }}
)

# Get all TypeScript/Svelte files
$files = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.svelte" -File -ErrorAction SilentlyContinue

foreach ($file in $files) {
    $stats.FilesScanned++
    
    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        $originalContent = $content
        $fileFixed = $false
        
        foreach ($pattern in $fixPatterns) {
            if ($pattern.Replacement -is [scriptblock]) {
                $newContent = [regex]::Replace($content, $pattern.Pattern, $pattern.Replacement)
            } else {
                $newContent = $content -replace $pattern.Pattern, $pattern.Replacement
            }
            
            if ($newContent -ne $content) {
                $content = $newContent
                $stats.PatternsFixed++
                $fileFixed = $true
                Write-Host "  ✓ Fixed: $($pattern.Name) in $($file.Name)" -ForegroundColor Green
            }
        }
        
        if ($fileFixed) {
            # Backup original
            $relativePath = $file.FullName.Substring((Get-Location).Path.Length + 1)
            $backupPath = Join-Path $backupDir $relativePath
            $backupFolder = Split-Path $backupPath -Parent
            New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
            Copy-Item -Path $file.FullName -Destination $backupPath -Force
            
            # Save fixed content
            Set-Content -Path $file.FullName -Value $content -NoNewline
            $stats.FilesFixed++
        }
        
    } catch {
        $stats.Errors++
        Write-Host "  ✗ Error processing $($file.Name): $_" -ForegroundColor Red
        "Error in $($file.FullName): $_" | Out-File -FilePath $logFile -Append
    }
    
    # Progress
    if ($stats.FilesScanned % 100 -eq 0) {
        Write-Host "Progress: $($stats.FilesScanned) files scanned, $($stats.FilesFixed) fixed" -ForegroundColor Cyan
    }
}

# Summary
Write-Host "`n📊 Phase 40 Complete!" -ForegroundColor Green
Write-Host "Files Scanned: $($stats.FilesScanned)" -ForegroundColor White
Write-Host "Files Fixed: $($stats.FilesFixed)" -ForegroundColor Green
Write-Host "Patterns Fixed: $($stats.PatternsFixed)" -ForegroundColor Yellow
Write-Host "Errors: $($stats.Errors)" -ForegroundColor $(if($stats.Errors -gt 0){'Red'}else{'Green'})
Write-Host "Backups: $backupDir" -ForegroundColor Cyan
Write-Host "Log: $logFile" -ForegroundColor Cyan

# Save summary
$summary = @"
Phase 40 Semantic Fixes - $(Get-Date)
=====================================
Files Scanned: $($stats.FilesScanned)
Files Fixed: $($stats.FilesFixed)
Patterns Fixed: $($stats.PatternsFixed)
Errors: $($stats.Errors)

Backup Directory: $backupDir
Log File: $logFile
"@

$summary | Out-File -FilePath "PHASE40-SUMMARY.txt"
Write-Host "`n✅ Summary saved to PHASE40-SUMMARY.txt" -ForegroundColor Green
