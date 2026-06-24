#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Orchestrate Phase 1 full backfill using 4-8 RabbitMQ workers

.DESCRIPTION
  Starts producer, workers, and monitors progress until all 40,754 chunks complete

.PARAMETER Workers
  Number of parallel workers (4-8 recommended for RTX 3060 Ti)

.PARAMETER Chunks
  Number of chunks to backfill (default: all 40,754)

.EXAMPLE
  .\orchestrate-phase1-workers.ps1 -Workers 4 -Chunks 40754
  # Starts producer + 4 workers, monitors until complete
#>

param(
  [int]$Workers = 4,
  [int]$Chunks = 40754,
  [string]$LogDir = "logs/workers"
)

# Ensure log directory
if (!(Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$ProducerLogFile = Join-Path $LogDir "producer-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$WorkerLogFile = Join-Path $LogDir "workers-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$MonitorLogFile = Join-Path $LogDir "monitor-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

Write-Host ""
Write-Host "🚀 Phase 1 RabbitMQ Worker Pool Orchestration"
Write-Host "   Workers: $Workers"
Write-Host "   Chunks: $Chunks"
Write-Host "   Producer Log: $ProducerLogFile"
Write-Host "   Worker Log: $WorkerLogFile"
Write-Host ""

# Start Producer
Write-Host "📤 Starting producer..."
$ProducerJob = Start-Job -ScriptBlock {
  param($LogFile, $Chunks)
  $env:CHUNK_LIMIT = $Chunks
  npm run workers:summary:pool:producer 2>&1 | Tee-Object -FilePath $LogFile
} -ArgumentList $ProducerLogFile, $Chunks

Write-Host "   Producer Job ID: $($ProducerJob.Id)"
Write-Host ""

# Wait for producer to enqueue
Start-Sleep -Seconds 3

# Start Workers
Write-Host "👷 Starting $Workers workers..."
$WorkerJobs = @()
for ($i = 1; $i -le $Workers; $i++) {
  $Job = Start-Job -ScriptBlock {
    param($WorkerId, $LogFile, $Workers)
    $env:WORKERS = $Workers
    npm run workers:summary:pool:worker:$Workers 2>&1 | Tee-Object -FilePath $LogFile -Append
  } -ArgumentList $i, $WorkerLogFile, $Workers

  $WorkerJobs += $Job
  Write-Host "   Worker $i Job ID: $($Job.Id)"
}

Write-Host ""
Write-Host "📊 Monitoring Progress..."
Write-Host "   Command: tail -f $WorkerLogFile"
Write-Host ""

# Monitor until done
$Completed = $false
$CheckInterval = 30

while (!$Completed) {
  $AllDone = $true

  # Check producer status
  $ProdState = (Get-Job -Id $ProducerJob.Id).State
  if ($ProdState -ne "Completed") {
    $AllDone = $false
  }

  # Check worker statuses
  foreach ($Job in $WorkerJobs) {
    if ((Get-Job -Id $Job.Id).State -ne "Completed") {
      $AllDone = $false
    }
  }

  if ($AllDone) {
    $Completed = $true
  } else {
    # Parse progress from logs
    $Summary = @(Get-Content -Path $WorkerLogFile -ErrorAction SilentlyContinue | Select-String -Pattern "✅|❌|Worker \d" | Select-Object -Last 10)
    if ($Summary.Count -gt 0) {
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Last activity:"
      foreach ($line in $Summary) {
        Write-Host "  $line"
      }
    }

    Write-Host ""
    Start-Sleep -Seconds $CheckInterval
  }
}

Write-Host ""
Write-Host "✅ All jobs completed!"
Write-Host ""
Write-Host "Final results:"
Receive-Job -Job $ProducerJob | Select-Object -Last 5
Write-Host ""
Write-Host "Worker summary:"
Receive-Job -Job $WorkerJobs[0] | Select-Object -Last 5
Write-Host ""

# Cleanup
Remove-Job -Job $ProducerJob, $WorkerJobs
