#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Run Phase 1 500-chunk test in background detached process
  Captures: summary throughput, embedding throughput, cache hit rate, total time

.EXAMPLE
  .\run-phase1-500-chunk-test.ps1
  # Starts test, returns immediately
  # Monitor: tail -f logs/phase1-500-chunk-test.log
#>

param(
  [int]$ChunkLimit = 500,
  [int]$BatchSize = 500,
  [string]$LogDir = "logs/phase1-test"
)

# Ensure log directory
if (!(Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$LogFile = Join-Path $LogDir "phase1-500-chunk-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$MetricsFile = Join-Path $LogDir "phase1-500-chunk-metrics.json"

Write-Host "🚀 Starting Phase 1 500-chunk test in background..."
Write-Host "   Log: $LogFile"
Write-Host "   Metrics: $MetricsFile"
Write-Host ""

# PowerShell background job that:
# 1. Runs Phase 1 with limits
# 2. Captures output to log
# 3. Parses metrics and saves JSON
$ScriptBlock = {
  param($LogFile, $MetricsFile, $ChunkLimit, $BatchSize)

  $StartTime = Get-Date
  $env:CHUNK_LIMIT = $ChunkLimit
  $env:BATCH_SIZE = $BatchSize

  # Run test and capture output
  $Output = & npm run atlas:summary:phase1 --apply 2>&1 | Tee-Object -FilePath $LogFile -PassThru

  $EndTime = Get-Date
  $Duration = ($EndTime - $StartTime).TotalSeconds

  # Parse output for metrics
  $Summaries = 0
  $Embeddings = 0
  $CacheHits = 0

  foreach ($line in $Output) {
    if ($line -match '(\d+)/(\d+) summaries generated') {
      $Summaries = [int]$matches[1]
    }
    if ($line -match '(\d+)/(\d+) embeddings computed') {
      $Embeddings = [int]$matches[1]
    }
    if ($line -match 'cache hit' -or $line -match 'L1 cache hits') {
      $CacheHits++
    }
  }

  $ThroughputSummaries = if ($Duration -gt 0) { $Summaries / $Duration } else { 0 }
  $ThroughputEmbeddings = if ($Duration -gt 0) { $Embeddings / $Duration } else { 0 }

  # Save metrics JSON
  $Metrics = @{
    timestamp = $StartTime.ToIso8601String()
    duration_seconds = [Math]::Round($Duration, 2)
    chunk_limit = $ChunkLimit
    batch_size = $BatchSize
    summaries_generated = $Summaries
    embeddings_computed = $Embeddings
    cache_hits = $CacheHits
    throughput = @{
      summaries_per_sec = [Math]::Round($ThroughputSummaries, 3)
      embeddings_per_sec = [Math]::Round($ThroughputEmbeddings, 3)
    }
    projection = @{
      hours_for_40754_chunks_single_threaded = [Math]::Round((40754 / $ThroughputSummaries) / 3600, 1)
      hours_for_40754_chunks_4_workers = [Math]::Round(((40754 / $ThroughputSummaries) / 3600) / 4, 1)
      hours_for_40754_chunks_8_workers = [Math]::Round(((40754 / $ThroughputSummaries) / 3600) / 8, 1)
    }
  } | ConvertTo-Json

  $Metrics | Out-File -FilePath $MetricsFile -Encoding UTF8

  Write-Host ""
  Write-Host "✅ Phase 1 test complete!"
  Write-Host "   Duration: $([Math]::Round($Duration, 1))s"
  Write-Host "   Summaries: $Summaries"
  Write-Host "   Embeddings: $Embeddings"
  Write-Host "   Throughput: $([Math]::Round($ThroughputSummaries, 2)) summaries/sec, $([Math]::Round($ThroughputEmbeddings, 2)) embeddings/sec"
  Write-Host ""
  Write-Host "   Projection (40,754 chunks):"
  Write-Host "     Single-threaded: $([Math]::Round(((40754 / $ThroughputSummaries) / 3600), 1))h"
  Write-Host "     4-worker pool: $([Math]::Round(((40754 / $ThroughputSummaries) / 3600 / 4), 1))h"
  Write-Host "     8-worker pool: $([Math]::Round(((40754 / $ThroughputSummaries) / 3600 / 8), 1))h"
}

# Start background job
$Job = Start-Job -ScriptBlock $ScriptBlock -ArgumentList $LogFile, $MetricsFile, $ChunkLimit, $BatchSize

Write-Host "📊 Job ID: $($Job.Id)"
Write-Host "📌 Monitor with: tail -f $LogFile"
Write-Host ""
Write-Host "When complete, view metrics with:"
Write-Host "   cat $MetricsFile | ConvertFrom-Json | Format-List"
Write-Host ""
