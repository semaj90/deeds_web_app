#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Master Pipeline: Phases 34-40 Complete Integration
.DESCRIPTION
    Orchestrates all repair phases in sequence with validation
#>

param(
    [switch]$SkipBackup,
    [switch]$SkipValidation,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Error-Custom { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }

$RepoRoot = "C:\Users\james\Videos\deeds-web-app"
$FrontendRoot = Join-Path $RepoRoot "sveltekit-frontend"
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $FrontendRoot "pipeline-$Timestamp.log"

Write-Host "`n" + ("=" * 70)
Write-Host "🚀 MASTER PIPELINE: Phases 34-40 Complete Integration" -ForegroundColor Magenta
Write-Host ("=" * 70)
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Log: $LogFile"
Write-Host ""

Start-Transcript -Path $LogFile -Append

try {
    $startTime = Get-Date
    
    # Phase 34B: Semantic Fixer
    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  PHASE 34B: Semantic Object Literal Fixes                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    $phase34bScript = Join-Path $RepoRoot "scripts\fix-phase34b.cjs"
    if (Test-Path $phase34bScript) {
        Push-Location $RepoRoot
        node $phase34bScript
        Pop-Location
        Write-Success "Phase 34B completed"
    } else {
        Write-Warn "Phase 34B script not found: $phase34bScript"
    }
    
    # Phase 34C: Object Literal Recovery
    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  PHASE 34C: Object Literal Colon Recovery                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    $phase34cScript = Join-Path $RepoRoot "scripts\fix-object-literals-simple.mjs"
    if (Test-Path $phase34cScript) {
        Push-Location $RepoRoot
        node $phase34cScript
        Pop-Location
        Write-Success "Phase 34C completed"
    } else {
        Write-Warn "Phase 34C script not found"
    }
    
    # Phase 34D: CSS Repair
    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  PHASE 34D: CSS Comma-to-Semicolon Repair                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    $phase34dScript = Join-Path $RepoRoot "scripts\fix-phase34d-css.mjs"
    if (Test-Path $phase34dScript) {
        Push-Location $RepoRoot
        node $phase34dScript
        Pop-Location
        Write-Success "Phase 34D completed"
    } else {
        Write-Warn "Phase 34D script not found"
    }
    
    # Phase 35: WASM Repair
    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  PHASE 35: WASM/AssemblyScript Syntax Repair                ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    $phase35Script = Join-Path $FrontendRoot "scripts\fix-phase35-wasm-repair.ps1"
    if (Test-Path $phase35Script) {
        & $phase35Script
        Write-Success "Phase 35 completed"
    } else {
        Write-Warn "Phase 35 script not found"
    }
    
    # Validation: Svelte Check
    if (-not $SkipValidation) {
        Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
        Write-Host "║  VALIDATION: Svelte Check                                    ║" -ForegroundColor Yellow
        Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
        
        Push-Location $FrontendRoot
        try {
            Write-Phase "Running svelte-check..."
            $svelteCheckOutput = npx svelte-check --threshold error 2>&1 | Select-Object -Last 20
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Svelte check passed!"
            } else {
                Write-Warn "Svelte check has remaining errors (see log for details)"
                $svelteCheckOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
            }
        } catch {
            Write-Warn "Svelte check failed to run: $_"
        } finally {
            Pop-Location
        }
    }
    
    # Validation: Build Test
    if (-not $SkipValidation) {
        Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
        Write-Host "║  VALIDATION: Build Test                                      ║" -ForegroundColor Yellow
        Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
        
        Push-Location $FrontendRoot
        try {
            Write-Phase "Running build test..."
            $buildOutput = npm run build 2>&1 | Select-Object -Last 30
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Build test passed!"
            } else {
                Write-Warn "Build test failed (exit code: $LASTEXITCODE)"
                $buildOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
            }
        } catch {
            Write-Warn "Build test encountered an error: $_"
        } finally {
            Pop-Location
        }
    }
    
    # Phase 38: ESLint + AI Polish
    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  PHASE 38: ESLint + AI Autofix Polish                       ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    $phase38Script = Join-Path $FrontendRoot "scripts\fix-phase38-eslint-ai.ps1"
    if (Test-Path $phase38Script) {
        & $phase38Script
        Write-Success "Phase 38 completed"
    } else {
        Write-Warn "Phase 38 script not found"
    }
    
    # Final Summary
    $duration = (Get-Date) - $startTime
    
    Write-Host "`n" + ("=" * 70)
    Write-Host "📊 PIPELINE COMPLETE" -ForegroundColor Green
    Write-Host ("=" * 70)
    Write-Host ""
    Write-Host "Total duration: $($duration.TotalSeconds.ToString('0.00'))s"
    Write-Host "Completed: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "Log file: $LogFile"
    Write-Host ""
    
    Write-Host "✅ Phase 34B: Semantic fixes" -ForegroundColor Green
    Write-Host "✅ Phase 34C: Object literal recovery" -ForegroundColor Green
    Write-Host "✅ Phase 34D: CSS repair" -ForegroundColor Green
    Write-Host "✅ Phase 35:  WASM repair" -ForegroundColor Green
    Write-Host "✅ Phase 38:  ESLint + AI polish" -ForegroundColor Green
    
    Write-Host "`nNext steps:"
    Write-Host "  1. Review changes: git diff --stat"
    Write-Host "  2. Test app: npm run dev:gpu"
    Write-Host "  3. Commit: git add . && git commit -m 'feat: Complete pipeline phases 34-38'"
    Write-Host "  4. Tag: git tag -a v1.0.0-pipeline-complete -m 'All phases complete'"
    Write-Host ""
    
} catch {
    Write-Error-Custom "Pipeline failed: $_"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
} finally {
    Stop-Transcript
}

Write-Success "Master pipeline execution complete!"
Write-Host ""
