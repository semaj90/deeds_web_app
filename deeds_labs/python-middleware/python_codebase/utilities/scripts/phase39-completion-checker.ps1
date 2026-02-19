#!/usr/bin/env pwsh
# ============================================================
# PHASE 39 COMPLETION CHECKER - AUTO-RETRY LOGIC
# ============================================================
# This script waits for the pipeline to complete and then
# automatically runs validation and commit workflow

$root = "C:\Users\james\Videos\deeds-web-app"
$maxWaitMinutes = 40
$checkIntervalSeconds = 30
$stallThresholdMinutes = 5  # If log hasn't updated in 5 min, flag as potential stall
$logFile = "$root\scripts\logs\phase39-checker-status.log"

# Ensure log directory exists
$logDir = "$root\scripts\logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "⏳ PHASE 39 COMPLETION AUTO-CHECKER" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

Write-Host "⏱️  Will wait up to $maxWaitMinutes minutes for pipeline completion`n" -ForegroundColor Yellow
Write-Host "📋 Status log: $logFile`n" -ForegroundColor Gray

function Log-Status {
    param([string]$message, [string]$level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$level] $message"
    Add-Content -Path $logFile -Value $logEntry
    Write-Host $logEntry
}

Log-Status "Pipeline checker started" "INFO"

$startTime = [DateTime]::Now
$iterations = 0
$lastLogUpdate = $startTime
$lastLogSize = 0

while ($true) {
    $iterations++
    $elapsedMinutes = (([DateTime]::Now) - $startTime).TotalMinutes

    $masterLog = Get-ChildItem -Path "$root\scripts\logs\" -Filter "phase39-master-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($null -ne $masterLog) {
        $logContent = Get-Content $masterLog.FullName
        $currentLogSize = (Get-Item $masterLog.FullName).Length
        $logLastWriteTime = (Get-Item $masterLog.FullName).LastWriteTime

        # Detect stall: log file hasn't grown or updated
        $timeSinceLastUpdate = ([DateTime]::Now - $logLastWriteTime).TotalMinutes
        if ($currentLogSize -eq $lastLogSize -and $timeSinceLastUpdate -gt $stallThresholdMinutes) {
            Log-Status "⚠️  STALL DETECTED: Log file not updated for $([math]::Round($timeSinceLastUpdate, 1)) min" "WARNING"

            # Check if Node processes are still running
            $activeNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Handles -gt 0 }
            if ($null -eq $activeNodes) {
                Log-Status "❌ ERROR: All Node processes have terminated!" "ERROR"
                Write-Host "`n❌ Pipeline appears to have crashed - no active Node processes`n" -ForegroundColor Red
                break
            } else {
                Log-Status "✓ Node processes still active ($($activeNodes.Count) processes)" "INFO"
            }
        }

        $lastLogSize = $currentLogSize

        # Check for completion markers
        if ($logContent -match "PIPELINE COMPLETE|Phase 38.*completed|Transcript stopped" -or $elapsedMinutes -gt $maxWaitMinutes) {
            Write-Host "`n✅ Pipeline appears to have completed!`n" -ForegroundColor Green
            Write-Host "Elapsed time: $([math]::Round($elapsedMinutes, 1)) minutes`n" -ForegroundColor Gray
            Log-Status "Pipeline completed after $([math]::Round($elapsedMinutes, 1)) minutes" "SUCCESS"

            # Show final status
            Write-Host "📋 Final Log Lines:" -ForegroundColor Yellow
            Get-Content $masterLog.FullName -Tail 30 | Write-Host -ForegroundColor Gray

            Write-Host "`n✅ Now running validation...`n" -ForegroundColor Green

            # Run validation script
            & "$root\scripts\phase39-validate-and-commit.ps1"

            break
        }

        # Show progress
        if ($iterations % 2 -eq 0) {
            $statusMsg = "[$($iterations)] Waiting... ($([math]::Round($elapsedMinutes, 1)) min elapsed)"
            Write-Host "⏳ $statusMsg" -ForegroundColor Yellow

            # Show current phase if available (safer extraction)
            $phaseMatch = $logContent | Select-String -Pattern "Phase (\d+)" -ErrorAction SilentlyContinue
            if ($null -ne $phaseMatch -and $phaseMatch.Matches.Count -gt 0) {
                $phase = $phaseMatch.Matches[0].Groups[1].Value
                if ($null -ne $phase -and $phase -match '^\d+$') {
                    Write-Host "   Currently on Phase $phase" -ForegroundColor Gray
                }
            }
        }

    if ($elapsedMinutes -gt $maxWaitMinutes) {
        Write-Host "`n⚠️  Maximum wait time exceeded! Pipeline may have stalled.`n" -ForegroundColor Red
        Log-Status "Maximum wait time ($maxWaitMinutes min) exceeded - pipeline may be stalled" "ERROR"

        # Collect diagnostic information
        Write-Host "🔍 Diagnostic Information:" -ForegroundColor Yellow

        # Check Node processes
        $nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
        $nodeCount = @($nodeProcs).Count
        Write-Host "  📊 Active Node processes: $nodeCount" -ForegroundColor Gray
        if ($nodeCount -gt 0) {
            $nodeProcs | ForEach-Object {
                Log-Status "Node process: PID=$($_.Id), CPU=$($_.CPU)%, Memory=$([math]::Round($_.WorkingSet/1MB,2))MB" "INFO"
            }
        }

        # Check log file status
        if ($null -ne $masterLog) {
            $logSize = (Get-Item $masterLog.FullName).Length
            $logLastWrite = (Get-Item $masterLog.FullName).LastWriteTime
            Write-Host "  📋 Log file: $($masterLog.Name)" -ForegroundColor Gray
            Write-Host "     Size: $([math]::Round($logSize/1KB, 2)) KB" -ForegroundColor Gray
            Write-Host "     Last updated: $(Get-Date $logLastWrite -Format 'HH:mm:ss')" -ForegroundColor Gray
            Log-Status "Log file size: $([math]::Round($logSize/1KB, 2)) KB, Last update: $(Get-Date $logLastWrite -Format 'HH:mm:ss')" "INFO"
        }

        Write-Host "`n📋 Recommended next steps:" -ForegroundColor Yellow
        Write-Host "  1. Check log file: $($masterLog.FullName)" -ForegroundColor Gray
        Write-Host "  2. Check Node processes: Get-Process -Name node | Sort-Object CPU -Descending" -ForegroundColor Gray
        Write-Host "  3. Check disk space: Get-Volume" -ForegroundColor Gray
        Write-Host "  4. Manually kill pipeline: Get-Process -Name node | Stop-Process -Force" -ForegroundColor Gray
        Write-Host "`nTo manually validate when ready, run:" -ForegroundColor Yellow
        Write-Host "  .\scripts\phase39-validate-and-commit.ps1`n" -ForegroundColor Cyan

        Log-Status "Auto-checker timeout reached" "ERROR"
        break
    }

    Start-Sleep -Seconds $checkIntervalSeconds
}

Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "🎯 PHASE 39 AUTO-CHECKER COMPLETE" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

# Final summary
$totalElapsed = [DateTime]::Now - $startTime
Log-Status "Checker finished after $([math]::Round($totalElapsed.TotalMinutes, 1)) minutes" "INFO"
Write-Host "📊 Final Status:" -ForegroundColor Yellow
Write-Host "   Total elapsed time: $([math]::Round($totalElapsed.TotalMinutes, 1)) minutes" -ForegroundColor Gray
Write-Host "   Status log: $logFile" -ForegroundColor Gray
Write-Host ""