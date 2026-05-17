#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Benchmark an OpenAI-compatible /v1/chat/completions endpoint.

.DESCRIPTION
  Measures tok/s, total seconds, and output token count against any
  llama-server / Ollama / TurboQuant endpoint.  Run once per GGUF
  candidate, then compare the PSCustomObject rows.

.PARAMETER BaseUrl
  Base URL of the target server.
  Default: http://127.0.0.1:8090/v1  (TurboQuant lane)

.PARAMETER Model
  Model name as the server expects it.  llama-server ignores this field
  but it is required by the OpenAI schema.
  Default: gemma4-tq

.PARAMETER MaxTokens
  Maximum completion tokens to request.
  Default: 4096

.PARAMETER Label
  Human-readable tag written into the output row (e.g. "gemma4-stock",
  "rotorquant-turbo3", "hermes-ollama").  Defaults to Model value.

.PARAMETER Repetitions
  How many back-to-back runs to average.  Default 1.
  Use 3+ to see KV cache warm-up effect on second pass.

.EXAMPLE
  # Gemma4 GGUF @ 4k
  .\scripts\bench-openai-compatible.ps1 -MaxTokens 4096 -Label gemma4-4k

  # RotorQuant merged @ 8k
  .\scripts\bench-openai-compatible.ps1 -MaxTokens 8192 -Label rotorquant-8k

  # Hermes via Ollama
  .\scripts\bench-openai-compatible.ps1 `
      -BaseUrl http://127.0.0.1:11434/v1 `
      -Model hermes3:latest `
      -MaxTokens 4096 `
      -Label hermes-ollama

  # Warm-up + 3 measured passes
  .\scripts\bench-openai-compatible.ps1 -MaxTokens 8192 -Repetitions 3 -Label gemma4-warm
#>

param(
  [string] $BaseUrl     = 'http://127.0.0.1:8090/v1',
  [string] $Model       = 'gemma4-tq',
  [int]    $MaxTokens   = 4096,
  [string] $Label       = '',
  [int]    $Repetitions = 1
)

if (-not $Label) { $Label = $Model }

$prompt = @"
Write a detailed technical audit checklist for a SvelteKit 2, Svelte 5 runes, Drizzle ORM, Zod, PostgreSQL, TRACE MCP, and OpenCode codebase.
Cover: SSR boundary safety, Svelte 5 rune compliance (no export let / no on:event / no `$:`), Drizzle schema drift vs live DB, Zod coverage on API routes, auth guard gaps, pgvector HNSW index health, Redis cache key hygiene, MCP tool surface completeness, and OpenCode agent permission scoping.
Use headings and concrete verification commands for each check.
"@

$uri = "$($BaseUrl.TrimEnd('/'))/chat/completions"

$rows = @()

for ($i = 1; $i -le $Repetitions; $i++) {
  if ($Repetitions -gt 1) {
    Write-Host "  Run $i / $Repetitions ..." -ForegroundColor DarkGray
  }

  $body = @{
    model       = $Model
    temperature = 0.2
    max_tokens  = $MaxTokens
    messages    = @(
      @{ role = 'user'; content = $prompt }
    )
  } | ConvertTo-Json -Depth 10

  $sw = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $res = Invoke-RestMethod `
      -Uri          $uri `
      -Method       Post `
      -ContentType  'application/json' `
      -Headers      @{ Authorization = 'Bearer local' } `
      -Body         $body `
      -TimeoutSec   300
  } catch {
    Write-Warning "Request failed: $_"
    continue
  }

  $sw.Stop()

  $text      = $res.choices[0].message.content
  $outTok    = $res.usage.completion_tokens
  $inTok     = $res.usage.prompt_tokens
  $totalTok  = $res.usage.total_tokens

  # Fallback token estimate if server omits usage
  if (-not $outTok) { $outTok = [math]::Round($text.Length / 3.8) }

  $tps = if ($sw.Elapsed.TotalSeconds -gt 0) {
    [math]::Round($outTok / $sw.Elapsed.TotalSeconds, 1)
  } else { 0 }

  # Repetition heuristic — flag likely looping output
  $lines    = ($text -split "`n").Count
  $uniqLines = ($text -split "`n" | Sort-Object -Unique).Count
  $repScore  = if ($lines -gt 0) { [math]::Round((1 - $uniqLines / $lines) * 100, 0) } else { 0 }
  $repFlag   = if ($repScore -gt 40) { "⚠ $repScore% dup lines" } else { "ok ($repScore%)" }

  $row = [pscustomobject]@{
    Label          = $Label
    Run            = $i
    MaxTokens      = $MaxTokens
    Seconds        = [math]::Round($sw.Elapsed.TotalSeconds, 2)
    OutTokens      = $outTok
    InTokens       = $inTok
    TotalTokens    = $totalTok
    TokPerSec      = $tps
    Characters     = $text.Length
    Repetition     = $repFlag
    PreviewLine1   = ($text -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
  }

  $rows += $row
}

# ── print table ──────────────────────────────────────────────────────────────
Write-Host ""
$rows | Format-Table -AutoSize `
  Label, Run, MaxTokens, Seconds, OutTokens, TokPerSec, Repetition, PreviewLine1

# ── summary if multiple reps ──────────────────────────────────────────────────
if ($Repetitions -gt 1 -and $rows.Count -gt 1) {
  $avgTps = [math]::Round(($rows | Measure-Object -Property TokPerSec -Average).Average, 1)
  $maxTps = [math]::Round(($rows | Measure-Object -Property TokPerSec -Maximum).Maximum, 1)
  $minTps = [math]::Round(($rows | Measure-Object -Property TokPerSec -Minimum).Minimum, 1)
  Write-Host "  avg $avgTps tok/s  |  min $minTps  |  max $maxTps  ($Repetitions runs)" `
    -ForegroundColor Cyan
}

Write-Host ""
Write-Host "  tool_calls check: npm run models:probe" -ForegroundColor DarkGray
Write-Host "  trace loop check: npm run turbo:trace-smoke" -ForegroundColor DarkGray
Write-Host ""
