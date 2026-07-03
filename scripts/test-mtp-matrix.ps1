#!/usr/bin/env powershell
<#
.SYNOPSIS
Test matrix for MTP + RotorQuant optimization on Phase 7
Measure chunks/min throughput (not just tokens/sec)

.DESCRIPTION
Test configurations:
  A: no MTP, q8_0 KV (baseline)
  B: MTP draft-max 2, q8_0 KV
  C: MTP draft-max 3, q8_0 KV
  D: MTP draft-max 2, turbo3 KV
  E: MTP draft-max 3, turbo3 KV

Winner: highest chunks/min with stable summaries
#>

param(
  [string]$BinaryPath = "C:\Users\james\Videos\deeds-web-app\.tmp\atomic-mtp\bin\build\bin\llama-server.exe",
  [string]$ModelPath = "C:\Users\james\Videos\deeds-web-app\models\gemma4-legal-iq4xs-direct.gguf",
  [string]$DraftModelPath = "C:\Users\james\Videos\deeds-web-app\.tmp\atomic-mtp\gemma-4-E4B-it-assistant.Q4_K_M.gguf",
  [string]$Port = "8091",
  [int]$TestDurationSec = 120
)

$ErrorActionPreference = "Stop"

# Test configurations
$testMatrix = @(
  @{ Name = "A"; Desc = "Baseline (no MTP, q8_0 KV, c=16k)"; MTP = $false; DraftMax = 0; CTKV = "q8_0"; Context = 16384; Batch = 0; UBatch = 0 },
  @{ Name = "A2"; Desc = "Baseline variant (c=8k, -b 512 -ub 128)"; MTP = $false; DraftMax = 0; CTKV = "q8_0"; Context = 8192; Batch = 512; UBatch = 128 },
  @{ Name = "B"; Desc = "MTP draft-mtp n=2, q8_0 KV"; MTP = $true; DraftMax = 2; CTKV = "q8_0"; Context = 8192; Batch = 512; UBatch = 128 },
  @{ Name = "C"; Desc = "MTP draft-mtp n=3, q8_0 KV"; MTP = $true; DraftMax = 3; CTKV = "q8_0"; Context = 8192; Batch = 512; UBatch = 128 },
  @{ Name = "D"; Desc = "MTP draft-mtp n=2, turbo3 KV"; MTP = $true; DraftMax = 2; CTKV = "turbo3"; Context = 8192; Batch = 512; UBatch = 128 },
  @{ Name = "E"; Desc = "MTP draft-mtp n=3, turbo3 KV"; MTP = $true; DraftMax = 3; CTKV = "turbo3"; Context = 8192; Batch = 512; UBatch = 128 }
)

function Start-LlamaServer {
  param(
    [string]$Binary,
    [string]$Model,
    [string]$DraftModel,
    [string]$Port,
    [bool]$UseMTP,
    [int]$DraftMax,
    [string]$CacheType,
    [int]$Context = 8192,
    [int]$Batch = 512,
    [int]$UBatch = 128
  )

  Write-Host "Starting llama-server..."

  $serverArgs = @(
    "-m", $Model,
    "-ngl", "99",
    "-c", $Context,
    "-fa", "on",
    "--host", "127.0.0.1",
    "--port", $Port,
    "--parallel", "1",
    "-ctk", $CacheType,
    "-ctv", $CacheType,
    "--cache-prompt",
    "--cache-reuse", "256",
    "--reasoning-format", "none",
    "--reasoning-budget", "0"
  )

  # Add batch sizes if specified
  if ($Batch -gt 0) {
    $serverArgs += @("-b", $Batch)
  }
  if ($UBatch -gt 0) {
    $serverArgs += @("-ub", $UBatch)
  }

  if ($UseMTP) {
    $serverArgs += @(
      "--model-draft", $DraftModel,
      "--spec-type", "draft-mtp",
      "--spec-draft-n-max", $DraftMax,
      "--spec-draft-n-min", "0",
      "-ngld", "99",
      "-ctkd", "turbo3",
      "-ctvd", "turbo3"
    )
  }

  # Start process
  $proc = Start-Process -FilePath $Binary -ArgumentList $serverArgs -PassThru -NoNewWindow

  # Wait for server to come up
  $maxWait = 30
  $waited = 0
  while ($waited -lt $maxWait) {
    try {
      $health = curl.exe -s http://127.0.0.1:$Port/health 2>$null
      if ($health -match "ok|busy") {
        Write-Host "✅ Server ready (PID: $($proc.Id))" -ForegroundColor Green
        return $proc
      }
    } catch { }
    Start-Sleep -Seconds 1
    $waited++
  }

  Write-Host "❌ Server failed to start" -ForegroundColor Red
  $proc.Kill()
  return $null
}

function Test-Throughput {
  param(
    [int]$DurationSec,
    [string]$Port
  )

  $prompt = "Summarize in one sentence: function validateUserSession() { return true; }"
  $startTime = Get-Date
  $count = 0
  $totalTokens = 0

  while ((Get-Date) -lt $startTime.AddSeconds($DurationSec)) {
    try {
      $response = curl.exe -s -X POST http://127.0.0.1:$Port/v1/chat/completions `
        -H "Content-Type: application/json" `
        -d @"
{
  "model":"gemma4-legal-iq4xs-direct.gguf",
  "messages":[{"role":"user","content":"$prompt"}],
  "max_tokens":150,
  "temperature":0.3
}
"@

      $json = $response | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($json.choices[0].message.content) {
        $count++
        $totalTokens += ($json.usage.completion_tokens ?? 50)
      }
    } catch {
      # Continue on error
    }
  }

  $elapsedSec = ((Get-Date) - $startTime).TotalSeconds
  return @{
    Chunks = $count
    TotalTokens = $totalTokens
    ElapsedSec = $elapsedSec
    ChunksPerMin = [math]::Round(($count / $elapsedSec) * 60, 2)
    TokensPerSec = [math]::Round($totalTokens / $elapsedSec, 2)
  }
}

# Main test loop
Write-Host ""
Write-Host "═" * 80 -ForegroundColor Cyan
Write-Host "  PHASE 7 MTP + RotorQuant Test Matrix" -ForegroundColor Cyan
Write-Host "═" * 80 -ForegroundColor Cyan
Write-Host ""

$results = @()

foreach ($test in $testMatrix) {
  Write-Host ""
  Write-Host "Test $($test.Name): $($test.Desc)" -ForegroundColor Yellow
  Write-Host "─" * 80

  # Start a separate benchmark lane on its own port; do not touch the live 8090 server
  Start-Sleep -Seconds 2

  # Start server with this config
  $server = Start-LlamaServer -Binary $BinaryPath -Model $ModelPath -Port $Port `
    -DraftModel $DraftModelPath -UseMTP $test.MTP -DraftMax $test.DraftMax -CacheType $test.CTKV `
    -Context $test.Context -Batch $test.Batch -UBatch $test.UBatch

  if (-not $server) {
    Write-Host "❌ Server failed to start, skipping test" -ForegroundColor Red
    continue
  }

  Start-Sleep -Seconds 3

  # Run throughput test
  Write-Host "Running ${TestDurationSec}s throughput test..."
  $perf = Test-Throughput -DurationSec $TestDurationSec -Port $Port

  # Store result
  $result = @{
    Test = $test.Name
    Description = $test.Desc
    ChunksPerMin = $perf.ChunksPerMin
    TokensPerSec = $perf.TokensPerSec
    TotalChunks = $perf.Chunks
    TotalTokens = $perf.TotalTokens
  }
  $results += $result

  Write-Host ""
  Write-Host "Results:" -ForegroundColor Green
  Write-Host "  Chunks: $($perf.Chunks) in $([math]::Round($perf.ElapsedSec, 1))s" -ForegroundColor Green
  Write-Host "  Chunks/min: $($perf.ChunksPerMin)" -ForegroundColor Cyan
  Write-Host "  Tokens/sec: $($perf.TokensPerSec)" -ForegroundColor Cyan

  # Kill only the benchmark server we started
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

# Summary table
Write-Host ""
Write-Host "═" * 80 -ForegroundColor Cyan
Write-Host "  Summary Results" -ForegroundColor Cyan
Write-Host "═" * 80 -ForegroundColor Cyan
Write-Host ""

$results | Sort-Object -Property ChunksPerMin -Descending | ForEach-Object {
  Write-Host "$($_.Test) | $($_.Description)" -ForegroundColor $(if ($_ -eq $results[0]) { "Green" } else { "Gray" })
  Write-Host "  $($_.ChunksPerMin) chunks/min | $($_.TokensPerSec) tok/s" -ForegroundColor Yellow
}

Write-Host ""
$winner = $results | Sort-Object -Property ChunksPerMin -Descending | Select-Object -First 1
Write-Host "🏆 WINNER: Test $($winner.Test) — $($winner.ChunksPerMin) chunks/min" -ForegroundColor Green
Write-Host ""
Write-Host "Recommendation: Use profile matching Test $($winner.Test)" -ForegroundColor Cyan
Write-Host "Then freeze flags and run Phase 7 to completion." -ForegroundColor Cyan


