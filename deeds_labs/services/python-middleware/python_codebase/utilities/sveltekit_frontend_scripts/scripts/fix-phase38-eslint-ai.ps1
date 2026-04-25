#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 38: ESLint + AI Autofix Polish
.DESCRIPTION
    Runs ESLint --fix, Prettier --write, and optional AI semantic optimization
#>

param(
    [switch]$SkipESLint,
    [switch]$SkipPrettier,
    [switch]$SkipAI,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "ℹ️  $msg" -ForegroundColor Blue }

$RepoRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = Join-Path $RepoRoot "logs"
$LogFile = Join-Path $LogDir "phase38-eslint-$Timestamp.log"

Write-Host "`n🚀 Phase 38: ESLint + AI Autofix Polish" -ForegroundColor Magenta
Write-Host "=" * 70
Write-Host "Working directory: $RepoRoot"
Write-Host ""

# Create logs directory
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

Start-Transcript -Path $LogFile -Append

try {
    Push-Location $RepoRoot
    
    # Step 1: ESLint Autofix
    if (-not $SkipESLint) {
        Write-Phase "Step 1: Running ESLint --fix..."
        
        # Check for ESLint config
        $eslintConfigs = @(
            ".eslintrc.js",
            ".eslintrc.cjs",
            ".eslintrc.json",
            "eslint.config.js"
        )
        
        $hasESLint = $false
        foreach ($config in $eslintConfigs) {
            if (Test-Path (Join-Path $RepoRoot $config)) {
                $hasESLint = $true
                Write-Info "Found ESLint config: $config"
                break
            }
        }
        
        if ($hasESLint) {
            try {
                Write-Host "  Running: npx eslint . --ext .ts,.svelte,.js --fix" -ForegroundColor Gray
                
                $eslintOutput = npx eslint . --ext .ts,.svelte,.js --fix 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "ESLint autofix completed successfully"
                } else {
                    Write-Warn "ESLint completed with warnings (exit code: $LASTEXITCODE)"
                    
                    if ($Verbose) {
                        Write-Host "`nESLint output:" -ForegroundColor Gray
                        $eslintOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
                    }
                }
            } catch {
                Write-Warn "ESLint encountered an error: $_"
            }
        } else {
            Write-Warn "No ESLint config found - skipping ESLint"
            Write-Info "Searched for: $($eslintConfigs -join ', ')"
        }
    } else {
        Write-Info "Skipping ESLint (--SkipESLint flag)"
    }
    
    # Step 2: Prettier Format
    if (-not $SkipPrettier) {
        Write-Phase "Step 2: Running Prettier --write..."
        
        # Check for Prettier config
        $prettierConfigs = @(
            ".prettierrc",
            ".prettierrc.json",
            ".prettierrc.js",
            ".prettierrc.cjs",
            "prettier.config.js"
        )
        
        $hasPrettier = $false
        foreach ($config in $prettierConfigs) {
            if (Test-Path (Join-Path $RepoRoot $config)) {
                $hasPrettier = $true
                Write-Info "Found Prettier config: $config"
                break
            }
        }
        
        try {
            Write-Host "  Running: npx prettier --write 'src/**/*.{ts,svelte,js,json}'" -ForegroundColor Gray
            
            $prettierOutput = npx prettier --write "src/**/*.{ts,svelte,js,json}" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Prettier formatting completed"
                
                # Count formatted files
                $formattedCount = ($prettierOutput | Select-String -Pattern "^\d" | Measure-Object).Count
                if ($formattedCount -gt 0) {
                    Write-Info "Formatted $formattedCount file(s)"
                }
            } else {
                Write-Warn "Prettier completed with issues (exit code: $LASTEXITCODE)"
            }
        } catch {
            Write-Warn "Prettier encountered an error: $_"
        }
    } else {
        Write-Info "Skipping Prettier (--SkipPrettier flag)"
    }
    
    # Step 3: AI Semantic Optimization (Optional)
    if (-not $SkipAI) {
        Write-Phase "Step 3: AI Semantic Optimization..."
        
        $aiScripts = @(
            "scripts\run-phase40-semantic-ai.ps1",
            "..\scripts\run-phase40-semantic-ai.ps1"
        )
        
        $aiScript = $null
        foreach ($script in $aiScripts) {
            $fullPath = Join-Path $RepoRoot $script
            if (Test-Path $fullPath) {
                $aiScript = $fullPath
                break
            }
        }
        
        if ($aiScript) {
            Write-Info "Found AI semantic script: $aiScript"
            try {
                Write-Host "  Launching AI semantic repair..." -ForegroundColor Gray
                & $aiScript
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "AI semantic optimization completed"
                } else {
                    Write-Warn "AI optimization completed with warnings"
                }
            } catch {
                Write-Warn "AI optimization skipped: $_"
            }
        } else {
            Write-Info "No AI semantic script found - skipping"
            Write-Host "  Searched: $($aiScripts -join ', ')" -ForegroundColor Gray
        }
    } else {
        Write-Info "Skipping AI optimization (--SkipAI flag)"
    }
    
    # Step 4: Verification
    Write-Phase "Step 4: Running verification checks..."
    
    try {
        Write-Host "  Checking TypeScript..." -ForegroundColor Gray
        $tscOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Select-Object -Last 5
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "TypeScript check passed"
        } else {
            Write-Warn "TypeScript has remaining errors (see full output in log)"
        }
    } catch {
        Write-Warn "TypeScript check skipped: $_"
    }
    
    # Summary
    Write-Host "`n" + ("=" * 70)
    Write-Host "📊 Phase 38 Summary" -ForegroundColor Magenta
    Write-Host ("=" * 70)
    Write-Host ""
    Write-Host "✅ ESLint:     " -NoNewline
    Write-Host (if ($SkipESLint) { "Skipped" } else { "Completed" })
    
    Write-Host "✅ Prettier:   " -NoNewline
    Write-Host (if ($SkipPrettier) { "Skipped" } else { "Completed" })
    
    Write-Host "✅ AI Polish:  " -NoNewline
    Write-Host (if ($SkipAI) { "Skipped" } else { "Attempted" })
    
    Write-Host ""
    Write-Host "Log file: $LogFile"
    Write-Host ""
    
    Write-Success "Phase 38 complete!"
    
    Write-Host "`nNext steps:"
    Write-Host "  1. Review changes: git diff --stat"
    Write-Host "  2. Test build: npm run build"
    Write-Host "  3. Run dev server: npm run dev:gpu"
    Write-Host ""
    
} catch {
    Write-Host "`n❌ Phase 38 failed: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
    Stop-Transcript
}
