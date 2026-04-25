# Phase 34E: Semicolon & Object Literal Cleanup
# Pre-semantic cleanup before Phase 40 AI repair
# Targets: OBJ001, OBJ002, CSS001, SYN002

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "phase34e-backups-$timestamp"

Write-Host "🔧 Phase 34E: Semicolon & Object Literal Repair" -ForegroundColor Green
Write-Host ("=" * 80) -ForegroundColor Gray

# Create backup directory
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Write-Host "📁 Backup directory: $backupDir" -ForegroundColor Cyan

# Pattern definitions (ordered by safety - safest first)
$patterns = @(
    @{
        Name = "CSS commas to semicolons"
        Pattern = '((?:top|bottom|left|right|margin|padding|width|height|font-size|color|background):\s*[^;]+),\s*((?:top|bottom|left|right|margin|padding|width|height|font-size|color|background):)'
        Replacement = '$1; $2'
        Description = "CSS properties: prop: val, prop2: → prop: val; prop2:"
        ErrorCode = "CSS001"
    },
    @{
        Name = "Semicolons in objects to commas"
        Pattern = '(\w+:\s*[^;}\n]+);\s*(\w+:)'
        Replacement = '$1, $2'
        Description = "Object props: { a: 1; b: 2 } → { a: 1, b: 2 }"
        ErrorCode = "OBJ002"
    },
    @{
        Name = "Object comma to colon (literals)"
        Pattern = '(\{\s*\w+),\s*(\d+|true|false|null|["''])'
        Replacement = '$1: $2'
        Description = "Object literals: { key, 123 } → { key: 123 }"
        ErrorCode = "OBJ001"
    },
    @{
        Name = "Object comma to colon (strings)"
        Pattern = '(\w+),\s*(["''][^"'']+["''])\s*([,}])'
        Replacement = '$1: $2$3'
        Description = "Object strings: key, 'val' → key: 'val'"
        ErrorCode = "OBJ001"
    },
    @{
        Name = "Orphaned semicolons"
        Pattern = ';\s*}'
        Replacement = ' }'
        Description = "Trailing semicolons: { a: 1; } → { a: 1 }"
        ErrorCode = "SYN002"
    }
)

# Statistics
$stats = @{
    FilesProcessed = 0
    FilesModified = 0
    TotalFixes = 0
    FixesByPattern = @{}
}

foreach ($pattern in $patterns) {
    $stats.FixesByPattern[$pattern.Name] = 0
}

# Get all TypeScript and Svelte files
$files = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.svelte","*.js" -File | 
    Where-Object { $_.FullName -notmatch '(node_modules|\.svelte-kit|build|dist)' }

Write-Host "`n📊 Processing $($files.Count) files..." -ForegroundColor Cyan

foreach ($file in $files) {
    $stats.FilesProcessed++
    
    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
        $original = $content
        $fileFixed = $false
        
        # Apply each pattern
        foreach ($pattern in $patterns) {
            $before = $content
            $content = [regex]::Replace($content, $pattern.Pattern, $pattern.Replacement)
            
            if ($content -ne $before) {
                $matches = [regex]::Matches($before, $pattern.Pattern).Count
                $stats.FixesByPattern[$pattern.Name] += $matches
                $stats.TotalFixes += $matches
                $fileFixed = $true
            }
        }
        
        # Save if modified
        if ($content -ne $original) {
            # Backup original
            $relativePath = $file.FullName.Replace((Get-Location).Path + "\", "")
            $backupPath = Join-Path $backupDir $relativePath
            $backupParent = Split-Path $backupPath -Parent
            
            if (-not (Test-Path $backupParent)) {
                New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
            }
            
            Copy-Item $file.FullName $backupPath -Force
            
            # Write fixed content
            Set-Content $file.FullName $content -NoNewline
            $stats.FilesModified++
            
            if ($stats.FilesModified % 50 -eq 0) {
                Write-Host "  ✓ Processed $($stats.FilesModified) files..." -ForegroundColor Gray
            }
        }
        
    } catch {
        Write-Host "  ⚠ Error processing $($file.Name): $_" -ForegroundColor Yellow
    }
}

# Summary
Write-Host "`n" -NoNewline
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host "📊 Phase 34E Summary" -ForegroundColor Green
Write-Host ("=" * 80) -ForegroundColor Gray

Write-Host "`n📁 Files:" -ForegroundColor Cyan
Write-Host "  Processed: $($stats.FilesProcessed)" -ForegroundColor White
Write-Host "  Modified:  $($stats.FilesModified)" -ForegroundColor Green
Write-Host "  Unchanged: $($stats.FilesProcessed - $stats.FilesModified)" -ForegroundColor Gray

Write-Host "`n🔧 Fixes Applied:" -ForegroundColor Cyan
Write-Host "  Total: $($stats.TotalFixes)" -ForegroundColor Green

foreach ($pattern in $patterns) {
    $count = $stats.FixesByPattern[$pattern.Name]
    if ($count -gt 0) {
        Write-Host "  ✓ $($pattern.Name): $count" -ForegroundColor White
        Write-Host "    ($($pattern.Description))" -ForegroundColor Gray
    }
}

Write-Host "`n💾 Backup:" -ForegroundColor Cyan
Write-Host "  Location: $backupDir" -ForegroundColor White
Write-Host "  Files:    $($stats.FilesModified)" -ForegroundColor White

# Save report
$report = @{
    timestamp = Get-Date -Format 'o'
    phase = "34E"
    description = "Semicolon & Object Literal Cleanup"
    statistics = $stats
    backupDirectory = $backupDir
    patterns = $patterns | ForEach-Object { 
        @{
            name = $_.Name
            description = $_.Description
            errorCode = $_.ErrorCode
            fixes = $stats.FixesByPattern[$_.Name]
        }
    }
} | ConvertTo-Json -Depth 10

$report | Out-File "phase34e-output-$timestamp.log"

Write-Host "`n📄 Report saved: phase34e-output-$timestamp.log" -ForegroundColor Cyan

if ($stats.FilesModified -eq 0) {
    Write-Host "`n⚠️  No files modified - patterns may need adjustment" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✅ Phase 34E Complete!" -ForegroundColor Green
Write-Host "   Next: Run Phase 40 for TypeScript type annotation fixes" -ForegroundColor White
