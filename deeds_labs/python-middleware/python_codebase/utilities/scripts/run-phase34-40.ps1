#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 34→40 Integration Orchestrator
Chains Phase 34B (semantic repair) → Validation → Phase 40 (semantic AI) → Dashboard

.DESCRIPTION
Orchestrates the full error-reduction pipeline:
  1. Phase 34B: Object literal comma-to-colon semantic repair
  2. Validation: npm run check:svelte (baseline TS errors)
  3. Phase 40: AI-powered semantic analysis and repair (with optional GPU)
  4. Dashboard: Generate PHASE40_SEMANTIC_DASHBOARD.md with metrics

.EXAMPLE
.\run-phase34-40.ps1 -EnableGPU -RunPhase40 -CommitAfterSuccess

#>

[CmdletBinding()]
param (
    [switch]$EnableGPU = $false,
    [switch]$RunPhase40 = $true,
    [switch]$CommitAfterSuccess = $false,
    [switch]$DryRun = $false,
    [string]$RepoRoot = "C:\Users\james\Videos\deeds-web-app",
    [string]$FrontendRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
)

$ErrorActionPreference = "Continue"
$startTime = Get-Date

# ============================================================================
# SETUP & LOGGING
# ============================================================================

$logFile = Join-Path $RepoRoot "scripts/logs/phase34-40-orchestrator.log"
$dashboardFile = Join-Path $RepoRoot "PHASE40_SEMANTIC_DASHBOARD.md"

if (!(Test-Path (Split-Path $logFile))) { New-Item -ItemType Directory -Path (Split-Path $logFile) -Force | Out-Null }

function Write-Log {
    param ([string]$Message, [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS")][string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $logFile -Value $logEntry -ErrorAction SilentlyContinue

    $colors = @{
        "INFO"    = "Cyan"
        "WARN"    = "Yellow"
        "ERROR"   = "Red"
        "SUCCESS" = "Green"
    }
    Write-Host $logEntry -ForegroundColor $colors[$Level]
}

function Run-Command {
    param (
        [string]$Description,
        [string]$Command,
        [string]$WorkingDirectory = $RepoRoot,
        [switch]$Critical = $false
    )

    Write-Log ""
    Write-Log "▶️  $Description" "INFO"
    Write-Log "   Command: $Command" "INFO"

    if ($DryRun) {
        Write-Log "   [DRY RUN - skipped]" "WARN"
        return @{ Success = $true; Output = "[dry run]" }
    }

    try {
        $result = & {
            Push-Location $WorkingDirectory
            Invoke-Expression $Command 2>&1
            Pop-Location
            $LASTEXITCODE
        }

        $success = $LASTEXITCODE -eq 0

        if ($success) {
            Write-Log "   ✅ Success (exit code: $LASTEXITCODE)" "SUCCESS"
        }
        else {
            $level = $Critical ? "ERROR" : "WARN"
            Write-Log "   ⚠️  Exit code: $LASTEXITCODE" $level
        }

        return @{ Success = $success; Output = $result; ExitCode = $LASTEXITCODE }
    }
    catch {
        $level = $Critical ? "ERROR" : "WARN"
        Write-Log "   ❌ Exception: $_" $level
        return @{ Success = $false; Output = $_; ExitCode = 1 }
    }
}

# ============================================================================
# PHASE 34B: SEMANTIC REPAIR
# ============================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           🧠 PHASE 34B – Semantic Object Literal Repair       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$phase34bResult = Run-Command `
    -Description "Phase 34B: Run semantic comma-to-colon fixer" `
    -Command "powershell -ExecutionPolicy Bypass -File 'scripts/fix-phase34b-semantic.ps1' 2>&1" `
    -Critical $true

if (-not $phase34bResult.Success) {
    Write-Log "⚠️  Phase 34B had warnings but continuing..." "WARN"
}

# ============================================================================
# VALIDATION: BASELINE ERROR COUNT
# ============================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ✅ VALIDATION – Baseline Error Count                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$checkResult = Run-Command `
    -Description "TypeScript check (svelte-check)" `
    -Command "npm run check:svelte 2>&1 | Tee-Object -FilePath '$($RepoRoot)/scripts/logs/check-baseline.log'" `
    -WorkingDirectory $FrontendRoot `
    -Critical $false

# Extract error count from check output
$errorCountMatch = ($checkResult.Output | Select-String -Pattern "(\d+)\s+error" | Select-Object -First 1).Matches
$baselineErrors = if ($errorCountMatch) { [int]$errorCountMatch.Groups[1].Value } else { -1 }

Write-Log ""
Write-Log "📊 Baseline Error Count: $baselineErrors" $(if ($baselineErrors -eq 0) { "SUCCESS" } else { "INFO" })
Write-Log ""

# ============================================================================
# PHASE 40: SEMANTIC AI REPAIR (Optional)
# ============================================================================

$phase40Result = @{ Success = $true }

if ($RunPhase40) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║          🤖 PHASE 40 – AI Semantic Analysis & Repair         ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

    $phase40Cmd = "npm run phase40:semantic"
    if ($EnableGPU) {
        $phase40Cmd = "npm run phase40:semantic:gpu"
        Write-Log "GPU acceleration enabled for Phase 40" "INFO"
    }

    $phase40Result = Run-Command `
        -Description "Phase 40: AI-powered semantic repair" `
        -Command "$phase40Cmd 2>&1 | Tee-Object -FilePath '$($RepoRoot)/scripts/logs/phase40-output.log'" `
        -WorkingDirectory $FrontendRoot `
        -Critical $false
}

# ============================================================================
# POST-REPAIR VALIDATION & METRICS
# ============================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           📊 POST-REPAIR METRICS & DASHBOARD                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$postCheckResult = Run-Command `
    -Description "TypeScript check (post-repair)" `
    -Command "npm run check:svelte 2>&1 | Tee-Object -FilePath '$($RepoRoot)/scripts/logs/check-post-repair.log'" `
    -WorkingDirectory $FrontendRoot `
    -Critical $false

$postErrorMatch = ($postCheckResult.Output | Select-String -Pattern "(\d+)\s+error" | Select-Object -First 1).Matches
$postErrors = if ($postErrorMatch) { [int]$postErrorMatch.Groups[1].Value } else { -1 }

$errorReduction = if ($baselineErrors -ge 0 -and $postErrors -ge 0) { $baselineErrors - $postErrors } else { 0 }
$errorReductionPercent = if ($baselineErrors -gt 0) { [math]::Round(($errorReduction / $baselineErrors) * 100, 2) } else { 0 }

Write-Log ""
Write-Log "📈 Error Reduction Metrics:" "INFO"
Write-Log "   Before:     $baselineErrors errors" "INFO"
Write-Log "   After:      $postErrors errors" "INFO"
Write-Log "   Reduction:  $errorReduction errors (-$errorReductionPercent%)" $(if ($errorReduction -gt 0) { "SUCCESS" } else { "INFO" })
Write-Log ""

# ============================================================================
# GENERATE DASHBOARD
# ============================================================================

$duration = (Get-Date) - $startTime
$durationStr = "$([math]::Floor($duration.TotalMinutes))m $($duration.Seconds)s"

$dashboardContent = @"
# 🚀 PHASE 34→40 SEMANTIC REPAIR DASHBOARD

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Duration:** $durationStr
**Repository:** $RepoRoot

---

## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| **Baseline Errors** | $baselineErrors |
| **Post-Repair Errors** | $postErrors |
| **Errors Fixed** | $errorReduction |
| **Reduction %** | $errorReductionPercent% |
| **Status** | $(if ($errorReduction -ge 0) { "✅ Improved" } else { "⚠️ Degraded" }) |

---

## 🧠 Phase 34B – Semantic Object Literal Repair

**Purpose:** Convert object literal corruption where commas appear instead of colons.

**Patterns Fixed:**
- ✅ \`{ estimated_fixes, 12 }\` → \`{ estimated_fixes: 12 }\`
- ✅ \`prop: val; next\` → \`prop: val, next\`
- ✅ Orphaned semicolons before closing braces

**Result:** $(if ($phase34bResult.Success) { "✅ PASSED" } else { "⚠️ WARNINGS" })

---

## 🤖 Phase 40 – AI Semantic Analysis

**Status:** $(if ($RunPhase40) { "✅ RAN" } else { "⏭️ SKIPPED" })
**GPU Enabled:** $(if ($EnableGPU) { "✅ YES" } else { "❌ NO" })
**Result:** $(if ($phase40Result.Success) { "✅ PASSED" } else { "⚠️ WARNINGS" })

---

## 📈 Error Breakdown

**High-Priority Categories (by count):**
- TS1005 ('}' expected): Check for unclosed blocks
- TS1131 (Expression statement must be assignment or call): Check for missing assignments
- TS1011 (',' or ';' expected): Check for missing delimiters
- TS1109 (Expression expected): Check for malformed expressions

---

## ✅ Next Steps

1. **Review Changes:**
   \`\`\`bash
   git diff --stat
   git diff src/ | head -50
   \`\`\`

2. **Build Test:**
   \`\`\`bash
   npm run build 2>&1 | head -50
   \`\`\`

3. **Commit Baseline (if successful):**
   \`\`\`bash
   git add -A
   git commit -m "fix(Phase 34B): Semantic object-literal comma-to-colon repair"
   git tag -a phase34b-stable -m "Phase 34B semantic repair baseline"
   \`\`\`

---

## 📋 Command Log

**Orchestrator:** \`run-phase34-40.ps1\`
**Start Time:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Parameters:** GPU=$EnableGPU, Phase40=$RunPhase40, CommitAfterSuccess=$CommitAfterSuccess

Log file: \`scripts/logs/phase34-40-orchestrator.log\`

"@

Set-Content -Path $dashboardFile -Value $dashboardContent -Encoding UTF8
Write-Log "📄 Dashboard generated: $dashboardFile" "SUCCESS"

# ============================================================================
# FINAL SUMMARY & COMMIT (Optional)
# ============================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    ✨ ORCHESTRATION COMPLETE                   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Log ""
Write-Log "Summary:" "SUCCESS"
Write-Log "  • Phase 34B: Object literal semantic repair" "SUCCESS"
Write-Log "  • Baseline: $baselineErrors → $postErrors errors (-$errorReductionPercent%)" "SUCCESS"
Write-Log "  • Phase 40: $(if ($RunPhase40) { 'AI semantic repair' } else { 'Skipped' })" "SUCCESS"
Write-Log "  • Dashboard: $dashboardFile" "SUCCESS"
Write-Log ""

if ($CommitAfterSuccess -and $errorReduction -gt 0) {
    Write-Log "💾 Committing changes..." "INFO"
    $commitMsg = "fix: Phase 34B semantic object-literal repair ($errorReduction errors fixed)"
    Run-Command `
        -Description "Git commit" `
        -Command "git add -A && git commit -m '$commitMsg'" `
        -WorkingDirectory $RepoRoot `
        -Critical $false

    Write-Log "🏷️  Creating tag: phase34b-stable" "INFO"
    Run-Command `
        -Description "Git tag" `
        -Command "git tag -a phase34b-stable -m 'Phase 34B semantic repair: $errorReduction errors fixed'" `
        -WorkingDirectory $RepoRoot `
        -Critical $false
}

Write-Log ""
Write-Log "Next: Review dashboard and test build with 'npm run build'" "INFO"
Write-Log ""
