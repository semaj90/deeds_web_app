#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: Corruption Recovery Script
.DESCRIPTION
    Identifies corrupted state machine files and attempts automated recovery
    using git history and backup folders.
.EXAMPLE
    .\scripts\phase89-corruption-recovery.ps1 -DryRun
    .\scripts\phase89-corruption-recovery.ps1 -Verbose
#>

param(
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "🚑 Phase 89: XState Corruption Recovery" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No files will be modified" -ForegroundColor Yellow
    Write-Host ""
}

# Corrupted files identified from corruption report
$corruptedFiles = @(
    @{
        Path = "src/lib/machines/prefetchMachine.ts"
        Severity = "CATASTROPHIC"
        Patterns = 3
    },
    @{
        Path = "src/lib/machines/search-machine.ts"
        Severity = "CATASTROPHIC"
        Patterns = 2
    },
    @{
        Path = "src/lib/machines/userTypingStateMachine.ts"
        Severity = "SEVERE"
        Patterns = 1
    },
    @{
        Path = "src/lib/machines/auth-machine.ts"
        Severity = "CATASTROPHIC"
        Patterns = 4
    },
    @{
        Path = "src/lib/services/rag-ingestion-pipeline.ts"
        Severity = "SEVERE"
        Patterns = 0
    },
    @{
        Path = "src/lib/services/unified-health-orchestrator.ts"
        Severity = "MODERATE"
        Patterns = 0
    }
)

$recovered = 0
$failed = 0

foreach ($file in $corruptedFiles) {
    Write-Host "📝 $($file.Path)" -ForegroundColor White
    Write-Host "   Severity: $($file.Severity)" -ForegroundColor Red

    $fullPath = Join-Path (Get-Location) $file.Path

    # Step 1: Check if file exists
    if (!(Test-Path $fullPath)) {
        Write-Host "   ⚠️  File not found - may have been moved" -ForegroundColor Yellow
        continue
    }

    # Step 2: Check git history for last working version
    try {
        Write-Host "   🔍 Searching git history..." -ForegroundColor Yellow

        $gitLog = git log --follow --all --format="%H|%ai|%s" --stat -- $file.Path 2>&1

        if ($LASTEXITCODE -eq 0 -and $gitLog) {
            $commits = $gitLog | Where-Object { $_ -match "^\w{40}\|" }

            if ($commits) {
                $latestCommit = ($commits | Select-Object -First 1) -split '\|'
                $commitHash = $latestCommit[0]
                $commitDate = $latestCommit[1]
                $commitMsg = $latestCommit[2]

                Write-Host "   ✅ Found working version:" -ForegroundColor Green
                Write-Host "      Commit: $commitHash" -ForegroundColor Gray
                Write-Host "      Date: $commitDate" -ForegroundColor Gray
                Write-Host "      Message: $commitMsg" -ForegroundColor Gray

                if (!$DryRun) {
                    # Create backup of corrupted file
                    $backupPath = "$fullPath.corrupted.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
                    Copy-Item $fullPath $backupPath
                    Write-Host "   💾 Backed up corrupted file to: $backupPath" -ForegroundColor Cyan

                    # Restore from git
                    git checkout $commitHash -- $file.Path 2>&1 | Out-Null

                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "   ✅ Restored from git commit $commitHash" -ForegroundColor Green
                        $recovered++
                    } else {
                        Write-Host "   ❌ Failed to restore from git" -ForegroundColor Red
                        $failed++
                    }
                } else {
                    Write-Host "   🔍 [DRY RUN] Would restore from commit $commitHash" -ForegroundColor Yellow
                }

                continue
            }
        }
    } catch {
        Write-Host "   ⚠️  Git history check failed: $_" -ForegroundColor Yellow
    }

    # Step 3: Check backup folders
    $backupLocations = @(
        "src.backup/lib/machines",
        "src_fixed",
        "backups/phase34-backups"
    )

    $fileName = Split-Path $file.Path -Leaf
    $found = $false

    foreach ($backupDir in $backupLocations) {
        $backupFile = Get-ChildItem -Path $backupDir -Filter $fileName -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1

        if ($backupFile) {
            Write-Host "   ✅ Found backup in: $($backupFile.DirectoryName)" -ForegroundColor Green

            if (!$DryRun) {
                # Create backup of corrupted file
                $backupPath = "$fullPath.corrupted.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
                Copy-Item $fullPath $backupPath
                Write-Host "   💾 Backed up corrupted file to: $backupPath" -ForegroundColor Cyan

                # Restore from backup
                Copy-Item $backupFile.FullName $fullPath -Force
                Write-Host "   ✅ Restored from backup: $($backupFile.FullName)" -ForegroundColor Green
                $recovered++
            } else {
                Write-Host "   🔍 [DRY RUN] Would restore from: $($backupFile.FullName)" -ForegroundColor Yellow
            }

            $found = $true
            break
        }
    }

    if (!$found) {
        Write-Host "   ❌ No recovery source found - requires manual rewrite" -ForegroundColor Red
        $failed++
    }

    Write-Host ""
}

# Summary
Write-Host "═" * 60
Write-Host "📊 Recovery Summary" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host "Total files: $($corruptedFiles.Count)"
Write-Host "✅ Recovered: $recovered" -ForegroundColor Green
Write-Host "❌ Failed: $failed" -ForegroundColor Red
Write-Host ""

if ($DryRun) {
    Write-Host "🔄 To apply recovery, run without -DryRun flag" -ForegroundColor Yellow
} elseif ($recovered -gt 0) {
    Write-Host "✅ Next steps:" -ForegroundColor Green
    Write-Host "   1. Verify recovered files: git diff"
    Write-Host "   2. Check TypeScript: npx tsc --noEmit"
    Write-Host "   3. Test machines: npm test"
    Write-Host "   4. Review corruption report: reports/PHASE89_CORRUPTION_REPORT.md"
} else {
    Write-Host "⚠️  Manual intervention required for remaining files" -ForegroundColor Yellow
    Write-Host "   See: reports/PHASE89_CORRUPTION_REPORT.md for rebuild guidance"
}

Write-Host ""
