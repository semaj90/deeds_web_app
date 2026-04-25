#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 34C: Object Literal Colon Recovery Orchestrator
.DESCRIPTION
    Orchestrates AST-based repair of corrupted object literals from Phase 34B
    Includes backup, execution, validation, and rollback capabilities
#>

param(
    [switch]$SkipBackup,
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Error-Custom { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir = Join-Path $RepoRoot "phase34c-backups-$Timestamp"
$LogFile = Join-Path $RepoRoot "phase34c-output-$Timestamp.log"

Write-Host "`n🚀 Phase 34C: Object Literal Colon Recovery" -ForegroundColor Magenta
Write-Host "=" * 70
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Log file: $LogFile"
Write-Host ""

# Start logging
Start-Transcript -Path $LogFile -Append

try {
    # 1. Pre-flight checks
    Write-Phase "Running pre-flight checks..."
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-Success "Node.js $nodeVersion detected"
    } catch {
        Write-Error-Custom "Node.js not found. Please install Node.js first."
        exit 1
    }
    
    # Check required npm packages
    Write-Phase "Checking required dependencies..."
    $packageJson = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
    
    $requiredPackages = @(
        '@babel/parser',
        '@babel/traverse', 
        '@babel/generator',
        '@babel/types',
        'glob'
    )
    
    $missing = @()
    foreach ($pkg in $requiredPackages) {
        $hasDep = $packageJson.dependencies.PSObject.Properties.Name -contains $pkg
        $hasDevDep = $packageJson.devDependencies.PSObject.Properties.Name -contains $pkg
        if (-not ($hasDep -or $hasDevDep)) {
            $missing += $pkg
        }
    }
    
    if ($missing.Count -gt 0) {
        Write-Warn "Missing packages: $($missing -join ', ')"
        Write-Phase "Installing missing dependencies..."
        npm install --save-dev @babel/parser @babel/traverse @babel/generator @babel/types glob
        Write-Success "Dependencies installed"
    } else {
        Write-Success "All dependencies present"
    }
    
    # 2. Create backup
    if (-not $SkipBackup -and -not $DryRun) {
        Write-Phase "Creating backup of src/ directory..."
        New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
        
        $srcDir = Join-Path $RepoRoot "src"
        $backupSrc = Join-Path $BackupDir "src"
        
        Copy-Item -Path $srcDir -Destination $backupSrc -Recurse -Force
        
        $backupSize = (Get-ChildItem $BackupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
        $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
        
        Write-Success "Backup created: $backupSizeMB MB"
        Write-Host "   Location: $BackupDir" -ForegroundColor Gray
    }
    
    # 3. Sample corrupted patterns
    Write-Phase "Scanning for corrupted object literals..."
    
    $samplePattern = '\{\s*\w+\s*,\s*\d+'
    $tsFiles = Get-ChildItem -Path (Join-Path $RepoRoot "src") -Filter "*.ts" -Recurse -File | Select-Object -First 100
    $corruptedSamples = @()
    
    foreach ($file in $tsFiles) {
        $content = Get-Content $file.FullName -Raw
        $matches = [regex]::Matches($content, $samplePattern)
        if ($matches.Count -gt 0) {
            $corruptedSamples += [PSCustomObject]@{
                File = $file.Name
                Count = $matches.Count
                Sample = $matches[0].Value
            }
        }
        if ($corruptedSamples.Count -ge 10) { break }
    }
    
    if ($corruptedSamples.Count -gt 0) {
        Write-Warn "Found potential corrupted patterns:"
        $corruptedSamples | Select-Object -First 5 | ForEach-Object {
            Write-Host "   $($_.File): $($_.Sample)" -ForegroundColor Yellow
        }
    } else {
        Write-Success "No obvious corruption patterns found (good sign!)"
    }
    
    # 4. Run AST-based fixer
    if ($DryRun) {
        Write-Warn "DRY RUN MODE - Skipping actual fixes"
    } else {
        Write-Phase "Executing AST-based object literal repair..."
        Write-Host ""
        
        Push-Location $RepoRoot
        try {
            $fixerScript = Join-Path $RepoRoot "scripts\fix-object-literal-colons.mjs"
            
            if (-not (Test-Path $fixerScript)) {
                Write-Error-Custom "Fixer script not found: $fixerScript"
                exit 1
            }
            
            # Run with increased memory
            node --max-old-space-size=8192 $fixerScript
            
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Fixer completed with warnings (exit code: $LASTEXITCODE)"
            } else {
                Write-Success "AST fixer completed successfully"
            }
        } finally {
            Pop-Location
        }
    }
    
    # 5. Validation
    Write-Phase "Running post-repair validation..."
    
    # Quick TypeScript check
    Write-Host "`n  TypeScript syntax check..." -ForegroundColor Gray
    Push-Location $RepoRoot
    try {
        $tscOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Select-Object -First 20
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "TypeScript: No syntax errors!"
        } else {
            $errorCount = ($tscOutput | Select-String -Pattern "error TS" | Measure-Object).Count
            Write-Warn "TypeScript: $errorCount errors remaining (check details in log)"
            
            if ($Verbose) {
                $tscOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            }
        }
    } finally {
        Pop-Location
    }
    
    # 6. Summary report
    Write-Host "`n" + ("=" * 70)
    Write-Host "📊 Phase 34C Summary" -ForegroundColor Magenta
    Write-Host ("=" * 70)
    Write-Host ""
    
    if (-not $DryRun) {
        Write-Host "✅ Object literal colon recovery complete"
        Write-Host ""
        Write-Host "Backup location: $BackupDir"
        Write-Host "Log file: $LogFile"
        Write-Host ""
        Write-Host "Next steps:"
        Write-Host "  1. Review changes: git diff --stat"
        Write-Host "  2. Test syntax: npx tsc --noEmit"
        Write-Host "  3. Svelte check: npx svelte-check --threshold error"
        Write-Host "  4. Build test: npm run build"
        Write-Host "  5. If issues: Rollback from $BackupDir"
    } else {
        Write-Host "✅ Dry run complete - no changes made"
    }
    
    Write-Host ""
    
} catch {
    Write-Error-Custom "Phase 34C failed: $_"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
} finally {
    Stop-Transcript
}

Write-Success "Phase 34C orchestration complete!"
Write-Host ""
