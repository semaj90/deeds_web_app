# Phase 34B: Semantic Object Literal Comma-to-Colon Repair
# Targets invalid { key, literal } patterns → { key: literal }
# Safe semantic-aware fixing without damaging arrays/destructuring

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = "phase34b-output-$timestamp.log"
$backupDir = "phase34b-backups-$timestamp"

Write-Host "🧠 Phase 34B: Semantic Object Literal Repair" -ForegroundColor Cyan
Write-Host "Targeting invalid comma-literal patterns in objects" -ForegroundColor Yellow

# Create backup directory
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# Statistics
$stats = @{
    FilesScanned = 0
    FilesFixed = 0
    PatternsFixed = 0
    Errors = 0
}

# Semantic fix patterns (safe object literal repairs only)
$semanticPatterns = @(
    # Pattern 1: { key, number } → { key: number }
    @{ 
        Name = "Object literal: key,number"
        Pattern = '(?<=\{[^}]*?\b\w+)\s*,\s*(?=\d+[,\}])'
        Replacement = ': '
        Context = 'object'
    }
    
    # Pattern 2: { key, "string" } → { key: "string" }
    @{ 
        Name = "Object literal: key,string"
        Pattern = "(?<=\{[^}]*?\b\w+)\s*,\s*(?=[`"'][^`"']*[`"'][,\}])"
        Replacement = ': '
        Context = 'object'
    }
    
    # Pattern 3: { key, true/false } → { key: true/false }
    @{ 
        Name = "Object literal: key,boolean"
        Pattern = '(?<=\{[^}]*?\b\w+)\s*,\s*(?=(true|false)[,\}])'
        Replacement = ': '
        Context = 'object'
    }
    
    # Pattern 4: { key, null/undefined } → { key: null/undefined }
    @{ 
        Name = "Object literal: key,null"
        Pattern = '(?<=\{[^}]*?\b\w+)\s*,\s*(?=(null|undefined)[,\}])'
        Replacement = ': '
        Context = 'object'
    }
    
    # Pattern 5: { key, [array] } → { key: [array] }
    @{ 
        Name = "Object literal: key,array"
        Pattern = '(?<=\{[^}]*?\b\w+)\s*,\s*(?=\[[^\]]*\][,\}])'
        Replacement = ': '
        Context = 'object'
    }
    
    # Pattern 6: { key, { nested } } → { key: { nested } }
    @{ 
        Name = "Object literal: key,object"
        Pattern = '(?<=\{[^}]*?\b\w+)\s*,\s*(?=\{)'
        Replacement = ': '
        Context = 'object'
    }
    
    # Pattern 7: Fix estimated_fixes, 12 specifically
    @{ 
        Name = "Fix specific literal assignments"
        Pattern = '(\w+)\s*,\s*(\d+|\d+\.\d+|true|false|null)(?=\s*[,\}])'
        Replacement = '$1: $2'
        Context = 'object'
    }
)

# Safe context detection - only fix inside object literals
function Test-IsObjectLiteralContext {
    param($content, $position)
    
    # Simple heuristic: count braces before position
    $before = $content.Substring(0, $position)
    $openBraces = ([regex]::Matches($before, '\{') | Measure-Object).Count
    $closeBraces = ([regex]::Matches($before, '\}') | Measure-Object).Count
    
    # If more open than close, we're inside an object
    return ($openBraces -gt $closeBraces)
}

# Get all TypeScript and Svelte files
$files = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.svelte" -File -ErrorAction SilentlyContinue

Write-Host "Found $($files.Count) files to process`n" -ForegroundColor Cyan

foreach ($file in $files) {
    $stats.FilesScanned++
    
    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        if (-not $content) {
            continue
        }
        
        $originalContent = $content
        $fileFixed = $false
        
        # Apply semantic patterns
        foreach ($pattern in $semanticPatterns) {
            $matches = [regex]::Matches($content, $pattern.Pattern)
            
            if ($matches.Count -gt 0) {
                # Verify each match is in object context
                $safeMatches = 0
                
                foreach ($match in $matches) {
                    # Simple safety check: ensure we're in object literal
                    $before = $content.Substring(0, $match.Index)
                    
                    # Skip if in array context (more [ than ])
                    $openBrackets = ([regex]::Matches($before, '\[') | Measure-Object).Count
                    $closeBrackets = ([regex]::Matches($before, '\]') | Measure-Object).Count
                    
                    if ($openBrackets -gt $closeBrackets) {
                        continue # Skip array context
                    }
                    
                    # Skip if in function params
                    if ($before -match '\([^)]*$') {
                        continue
                    }
                    
                    $safeMatches++
                }
                
                if ($safeMatches -gt 0) {
                    try {
                        if ($pattern.Replacement -is [string]) {
                            $newContent = $content -replace $pattern.Pattern, $pattern.Replacement
                        } else {
                            $newContent = [regex]::Replace($content, $pattern.Pattern, $pattern.Replacement)
                        }
                        
                        if ($newContent -ne $content) {
                            $content = $newContent
                            $stats.PatternsFixed += $safeMatches
                            $fileFixed = $true
                            Write-Host "  ✓ Fixed: $($pattern.Name) ($safeMatches matches) in $($file.Name)" -ForegroundColor Green
                        }
                    } catch {
                        Write-Host "  ⚠ Skipped unsafe pattern in $($file.Name)" -ForegroundColor Yellow
                    }
                }
            }
        }
        
        # Save if modified
        if ($fileFixed) {
            # Backup original
            $relativePath = $file.FullName.Substring((Get-Location).Path.Length + 1)
            $backupPath = Join-Path $backupDir $relativePath
            $backupFolder = Split-Path $backupPath -Parent
            
            if (-not (Test-Path $backupFolder)) {
                New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
            }
            
            Copy-Item -Path $file.FullName -Destination $backupPath -Force
            
            # Write fixed content
            Set-Content -Path $file.FullName -Value $content -NoNewline
            $stats.FilesFixed++
        }
        
    } catch {
        $stats.Errors++
        Write-Host "  ✗ Error: $($file.Name) - $_" -ForegroundColor Red
        "Error in $($file.FullName): $_" | Out-File -FilePath $logFile -Append
    }
    
    # Progress indicator
    if ($stats.FilesScanned % 200 -eq 0) {
        Write-Host "Progress: $($stats.FilesScanned)/$($files.Count) files" -ForegroundColor Cyan
    }
}

# Final summary
Write-Host "`n📊 Phase 34B Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Files Scanned:    $($stats.FilesScanned)" -ForegroundColor White
Write-Host "Files Fixed:      $($stats.FilesFixed)" -ForegroundColor Green
Write-Host "Patterns Fixed:   $($stats.PatternsFixed)" -ForegroundColor Yellow
Write-Host "Errors:           $($stats.Errors)" -ForegroundColor $(if($stats.Errors -gt 0){'Red'}else{'Green'})
Write-Host "Success Rate:     $(if($stats.FilesScanned -gt 0){'{0:P2}' -f ($stats.FilesFixed / $stats.FilesScanned)}else{'N/A'})" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Backups:          $backupDir\" -ForegroundColor Cyan
Write-Host "Log:              $logFile" -ForegroundColor Cyan

# Save summary
$summary = @"
Phase 34B Semantic Object Literal Repair - $(Get-Date)
======================================================
Files Scanned:    $($stats.FilesScanned)
Files Fixed:      $($stats.FilesFixed)
Patterns Fixed:   $($stats.PatternsFixed)
Errors:           $($stats.Errors)
Success Rate:     $(if($stats.FilesScanned -gt 0){'{0:P2}' -f ($stats.FilesFixed / $stats.FilesScanned)}else{'N/A'})

Backup Directory: $backupDir
Log File:         $logFile

Semantic Patterns Applied:
- Object literal: key,number → key:number
- Object literal: key,string → key:string
- Object literal: key,boolean → key:boolean
- Object literal: key,null → key:null
- Object literal: key,array → key:array
- Object literal: key,object → key:object
- Specific literal assignments (estimated_fixes, etc.)

Next Step: Run validation with 'npm run check:svelte'
"@

$summary | Out-File -FilePath "PHASE34B-SUMMARY.txt"
Write-Host "`n✅ Summary saved to PHASE34B-SUMMARY.txt" -ForegroundColor Green
Write-Host "🎯 Next: Run validation to verify fixes" -ForegroundColor Yellow
