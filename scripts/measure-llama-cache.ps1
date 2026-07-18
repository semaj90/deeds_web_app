<#
.SYNOPSIS
  Measure llama-server KV prefix cache effectiveness over N turns.

.DESCRIPTION
  Sends 5 consecutive requests with a stable system prompt prefix and a
  short appended instruction. Reads timings.cache_n / prompt_n from each
  response and prints a summary table.

  Interpretation:
    cache_n high + prompt_n low  → good prefix reuse
    cache_n zero every turn      → prefix is changing (check template/headers)
    n_tokens_max near ctx limit  → conversation too large

  Requires llama-server launched with --metrics and --perf.

.PARAMETER Port
  llama-server port. Default: 8090.

.PARAMETER Turns
  Number of consecutive requests. Default: 5.

.PARAMETER Model
  Model ID to pass in the request. Default: gemma4-legal-iq4xs-direct.gguf.
#>
param(
  [int]    $Port  = 8090,
  [int]    $Turns = 5,
  [string] $Model = 'gemma4-legal-iq4xs-direct.gguf'
)

$base = "http://127.0.0.1:$Port"

# Verify server is up
try {
  $health = Invoke-RestMethod "$base/health" -TimeoutSec 3
  Write-Host "Server health: $($health.status)" -ForegroundColor Green
} catch {
  Write-Error "llama-server not responding on :$Port. Launch with: npm run turbo:start:detached"
  exit 1
}

# Stable prefix (system + tool stub). Must NOT change between turns.
$stableSystem = "You are a legal AI assistant. Answer concisely in plain text. Do not use markdown. Do not repeat the question."

# Conversation accumulates turn by turn (append-only, stable prefix)
$messages = @(
  @{ role = 'system'; content = $stableSystem }
)

$questions = @(
  "What is hearsay evidence?",
  "What is the best-evidence rule?",
  "Define chain of custody.",
  "What does mens rea mean?",
  "Briefly define voir dire."
)

Write-Host ""
Write-Host "Cache telemetry over $Turns turns (stable prefix = system prompt)" -ForegroundColor Cyan
Write-Host ("{0,-6} {1,10} {2,10} {3,10} {4,12} {5,10}" -f "Turn", "cache_n", "prompt_n", "reuse_%", "pred/s", "wall_ms")
Write-Host ("-" * 66)

$results = @()

for ($i = 0; $i -lt $Turns; $i++) {
  $q = $questions[$i % $questions.Length]
  $messages = $messages + @(@{ role = 'user'; content = $q })

  $body = @{
    model       = $Model
    messages    = $messages
    max_tokens  = 80
    temperature = 0.0
    stream      = $false
  } | ConvertTo-Json -Depth 5 -Compress

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-RestMethod "$base/v1/chat/completions" `
              -Method Post `
              -ContentType 'application/json' `
              -Body $body `
              -TimeoutSec 120
  } catch {
    Write-Warning "Turn $($i+1) failed: $_"
    continue
  }
  $sw.Stop()
  $wallMs = $sw.ElapsedMilliseconds

  $t = $resp.usage.timings
  if (-not $t) { $t = $resp.timings }

  $cacheN  = if ($t.cache_n)              { [int]$t.cache_n }              else { 0 }
  $promptN = if ($t.prompt_n)             { [int]$t.prompt_n }             else { if ($resp.usage.prompt_tokens) { [int]$resp.usage.prompt_tokens } else { 0 } }
  $predPs  = if ($t.predicted_per_second) { [math]::Round($t.predicted_per_second, 1) } else { 0 }

  $totalPrompt = $cacheN + $promptN
  $reuseP = if ($totalPrompt -gt 0) { [math]::Round($cacheN * 100.0 / $totalPrompt, 1) } else { 0 }

  $row = [PSCustomObject]@{
    Turn    = $i + 1
    CacheN  = $cacheN
    PromptN = $promptN
    ReuseP  = $reuseP
    PredPs  = $predPs
    WallMs  = $wallMs
  }
  $results += $row

  $color = if ($reuseP -gt 50) { 'Green' } elseif ($reuseP -gt 0) { 'Yellow' } else { 'Red' }
  Write-Host ("{0,-6} {1,10} {2,10} {3,9}% {4,12} {5,10}" -f ($i+1), $cacheN, $promptN, $reuseP, $predPs, $wallMs) -ForegroundColor $color

  # Append model answer to conversation (maintain stable prefix)
  $assistantContent = $resp.choices[0].message.content
  $messages = $messages + @(@{ role = 'assistant'; content = $assistantContent })
}

Write-Host ""

# Summary
if ($results.Count -gt 1) {
  $avgReuse = [math]::Round(($results | Measure-Object -Property ReuseP -Average).Average, 1)
  $maxCache = ($results | Measure-Object -Property CacheN -Maximum).Maximum
  $minPrompt = ($results | Measure-Object -Property PromptN -Minimum).Minimum

  Write-Host "Summary:" -ForegroundColor Cyan
  Write-Host "  Average reuse %:  $avgReuse%"
  Write-Host "  Max cache_n:      $maxCache tokens"
  Write-Host "  Min prompt_n:     $minPrompt tokens (Turn 2+ should be near delta size)"

  if ($avgReuse -lt 10) {
    Write-Warning "cache_n is near zero on most turns. Likely cause: prefix is changing between requests (timestamps, dynamic system prompt, tool ordering). Check template and ACE packet injection position."
  } elseif ($avgReuse -lt 50) {
    Write-Host "  Partial reuse detected. Consider stabilizing system prompt and moving dynamic content to end of messages." -ForegroundColor Yellow
  } else {
    Write-Host "  Good prefix reuse. KV cache is working correctly." -ForegroundColor Green
  }
}

# Prometheus metrics snapshot
Write-Host ""
Write-Host "Prometheus metrics snapshot:" -ForegroundColor Cyan
try {
  $metrics = Invoke-RestMethod "$base/metrics" -TimeoutSec 5
  $lines = $metrics -split "`n" | Where-Object { $_ -match '^llamacpp:' -and $_ -notmatch '^#' }
  $lines | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
} catch {
  Write-Host "  /metrics not available (launch with --metrics flag)" -ForegroundColor Yellow
}
