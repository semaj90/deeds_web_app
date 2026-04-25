#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 35: WASM/AssemblyScript Syntax Repair
.DESCRIPTION
    Repairs malformed AssemblyScript syntax in .ts files under /src/wasm/
    Fixes: float types, trailing commas, parameter list errors
#>

param(
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }

$RepoRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
$WasmSrc = Join-Path $RepoRoot "src\wasm"
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir = Join-Path $RepoRoot "phase35-wasm-backups-$Timestamp"

Write-Host "`n🚀 Phase 35: WASM/AssemblyScript Syntax Repair" -ForegroundColor Magenta
Write-Host "=" * 70
Write-Host "Target: $WasmSrc"
Write-Host ""

# Create backup directory
if (-not $DryRun) {
    Write-Phase "Creating backup directory..."
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    Write-Success "Backup: $BackupDir"
}

# Define repair patterns
$patterns = @{
    # Pattern 1: Type followed by double comma and closing paren: f32,, ) → f32)
    '(\b(f32|i32|f64|i64|u32|u64|bool))\s*,\s*,\s*\)' = '$1)'
    
    # Pattern 2: Type followed by comma and closing paren: f32, ) → f32)
    '(\b(f32|i32|f64|i64|u32|u64|bool))\s*,\s*\)' = '$1)'
    
    # Pattern 3: Single param with trailing comma: (param1, ) → (param1)
    '\(\s*([A-Za-z0-9_]+)\s*,\s*\)' = '($1)'
    
    # Pattern 4: Multiple params with trailing comma: (param1, param2, ) → (param1, param2)
    '\(\s*([A-Za-z0-9_,\s:]+),\s*\)' = '($1)'
    
    # Pattern 5: Array type with trailing comma: Float32Array, → Float32Array
    '(\b(Float32Array|Int32Array|Uint32Array|Float64Array))\s*,\s*(?![\w])' = '$1 '
    
    # Pattern 6: Function signature with trailing comma before closing paren
    ':\s*(f32|i32|f64|i64|u32|u64|bool)\s*,\s*\)' = ': $1)'
    
    # Pattern 7: Export function with trailing comma
    'export\s+function\s+(\w+)\s*\([^)]*,\s*\)' = {
        param($match)
        $match.Value -replace ',\s*\)', ')'
    }
}

$stats = @{
    FilesScanned = 0
    FilesFixed = 0
    PatternsFixed = 0
}

# Check if wasm directory exists
if (-not (Test-Path $WasmSrc)) {
    Write-Warn "WASM source directory not found: $WasmSrc"
    Write-Host "Creating directory..."
    New-Item -ItemType Directory -Force -Path $WasmSrc | Out-Null
}

# Process all TypeScript files in wasm directory
Get-ChildItem -Recurse -Include "*.ts" -Path $WasmSrc -ErrorAction SilentlyContinue | ForEach-Object {
    $stats.FilesScanned++
    
    $file = $_
    $originalContent = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    
    if (-not $originalContent) {
        if ($Verbose) { Write-Host "  Skipping empty file: $($file.Name)" -ForegroundColor Gray }
        return
    }
    
    $content = $originalContent
    $filePatternCount = 0
    
    # Apply each pattern
    foreach ($pattern in $patterns.Keys) {
        $replacement = $patterns[$pattern]
        
        if ($replacement -is [scriptblock]) {
            # For complex replacements
            $newContent = [regex]::Replace($content, $pattern, $replacement)
        } else {
            # For simple string replacements
            $newContent = [regex]::Replace($content, $pattern, $replacement)
        }
        
        if ($newContent -ne $content) {
            $matchCount = ([regex]::Matches($content, $pattern)).Count
            $filePatternCount += $matchCount
            $content = $newContent
        }
    }
    
    # If file was modified
    if ($content -ne $originalContent) {
        if (-not $DryRun) {
            # Create backup
            $relativePath = $file.FullName.Substring($WasmSrc.Length + 1)
            $backupPath = Join-Path $BackupDir $relativePath
            $backupParent = Split-Path -Parent $backupPath
            
            if ($backupParent) {
                New-Item -ItemType Directory -Force -Path $backupParent | Out-Null
            }
            
            Copy-Item -Path $file.FullName -Destination $backupPath -Force
            
            # Write fixed content
            Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
        }
        
        $stats.FilesFixed++
        $stats.PatternsFixed += $filePatternCount
        
        Write-Success "Fixed $filePatternCount pattern(s) → $($file.Name)"
    } elseif ($Verbose) {
        Write-Host "  No issues: $($file.Name)" -ForegroundColor Gray
    }
}

# Summary
Write-Host "`n" + ("=" * 70)
Write-Host "📊 Phase 35 Summary" -ForegroundColor Magenta
Write-Host ("=" * 70)
Write-Host ""
Write-Host "Files scanned:       $($stats.FilesScanned)"
Write-Host "Files fixed:         $($stats.FilesFixed)"
Write-Host "Patterns repaired:   $($stats.PatternsFixed)"

if (-not $DryRun -and $stats.FilesFixed -gt 0) {
    Write-Host "Backup location:     $BackupDir"
}

Write-Host ""

if ($DryRun) {
    Write-Warn "DRY RUN - No files were modified"
} else {
    Write-Success "Phase 35 complete!"
    
    if ($stats.FilesFixed -gt 0) {
        Write-Host "`nNext steps:"
        Write-Host "  1. Verify WASM syntax: npx asc src/wasm/*.ts --noEmit"
        Write-Host "  2. Compile modules: npm run build:wasm"
        Write-Host "  3. Test integration: npm run dev:gpu"
    } else {
        Write-Host "`n✅ No WASM syntax issues found!"
    }
}

Write-Host ""
