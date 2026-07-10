#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Instrumented Cache Probe — Separate KV reuse from warmup via llama.cpp metrics

.DESCRIPTION
    Instead of wall-clock latency, read llama.cpp's native metrics:
    - prompt_eval_ms (key for cache detection)
    - generation_ms (should be stable)
    - slots (KV cache slot usage)

    A cache HIT shows:
      prompt_eval_ms SAME or LOWER than first request (tokens already computed)
      generation_ms SAME (unaffected by cache)

    WARMUP (no cache) shows:
      both latencies drop (allocator, CUDA, HTTP warming)

    Test Pattern A→A→A' (mutate one token):
      If KV cache: A' prompt_eval jumps back up
      If just warmup: A' prompt_eval stays low (warmth persists)
#>

param(
    [int]$Iterations = 5,
    [string]$ContextFile = "docs/cache-probe-context.md",
    [string]$OutputFile = "reports/cache-probe-instrumented.json"
)

$ErrorActionPreference = "Stop"

# Helper: Call llama.cpp with instrumentation
function Invoke-LlamaCppInstrumented {
    param(
        [string]$SystemContent,
        [string]$UserContent,
        [string]$TestCaseId
    )

    $body = @{
        model = "gemma4-legal-iq4xs-direct.gguf"
        temperature = 0
        max_tokens = 96
        stream = $false
        cache_prompt = $true
        messages = @(
            @{ role = "system"; content = $SystemContent },
            @{ role = "user"; content = $UserContent }
        )
    } | ConvertTo-Json -Depth 8

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-RestMethod `
            -Uri "http://127.0.0.1:8090/v1/chat/completions" `
            -Method Post `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 120

        $sw.Stop()

        # Extract llama.cpp timing from response (timings object, not usage)
        $promptEvalMs = $response.timings.prompt_ms ?? 0
        $genMs = $response.timings.predicted_ms ?? 0
        $cachedTokens = $response.usage.prompt_tokens_details.cached_tokens ?? 0
        $totalMs = $sw.ElapsedMilliseconds

        # Infer cache hit: high cached_tokens count or prompt_eval_ms much lower than baseline
        # First run typically ~200-300ms for prompt eval; cache hit shows same or lower
        $inferredCacheHit = $cachedTokens -gt 0 -or $promptEvalMs -lt 100  # Cache shows cached_tokens or very fast eval

        return @{
            test_case_id = $TestCaseId
            success = $true
            wall_clock_ms = $totalMs
            prompt_eval_ms = $promptEvalMs
            generation_ms = $genMs
            cached_tokens = $cachedTokens
            prompt_tokens = $response.usage.prompt_tokens
            completion_tokens = $response.usage.completion_tokens
            inferred_cache_hit = $inferredCacheHit
            reason = if ($cachedTokens -gt 0) { "cached_tokens_found→CACHE_HIT" } elseif ($promptEvalMs -lt 100) { "prompt_eval_low→cache_likely" } else { "prompt_eval_high→cold_or_warmup" }
            timestamp = Get-Date -AsUTC -Format "o"
        }
    } catch {
        $sw.Stop()
        return @{
            test_case_id = $TestCaseId
            success = $false
            wall_clock_ms = $sw.ElapsedMilliseconds
            error = $_.Exception.Message
            timestamp = Get-Date -AsUTC -Format "o"
        }
    }
}

# Load context
if (-not (Test-Path $ContextFile)) {
    Write-Error "Context file not found: $ContextFile"
    exit 1
}

$contextContent = Get-Content $ContextFile -Raw
$contextHash = ([System.Security.Cryptography.SHA256]::Create()).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($contextContent)) | ForEach-Object { "{0:x2}" -f $_ } | Join-String

Write-Host "🔬 Instrumented Cache Probe"
Write-Host "=" * 70
Write-Host "Context: $($contextContent.Length) chars, SHA256: $contextHash"
Write-Host "Metric: prompt_eval_ms (primary) + generation_ms (sanity check)"
Write-Host "Cache HIT indicator: prompt_eval_ms < 500ms (tokens already computed)"
Write-Host "Warmup only: both metrics drop but prompt_eval stays high"
Write-Host ""

$allResults = @()

# Pattern: A → A → A' (mutate one token early in system prompt)
Write-Host "Test Pattern A→A→A' (detect KV cache via prompt_eval_ms)"
Write-Host "-" * 70
Write-Host ""

# A1: Baseline
$contextA = $contextContent
Write-Host "A1: Baseline (first time)"
for ($i = 1; $i -le $Iterations; $i++) {
    $result = Invoke-LlamaCppInstrumented `
        -SystemContent $contextA `
        -UserContent "Explain the retrieval router." `
        -TestCaseId "A1-$i"

    $allResults += $result

    $cacheInd = if ($result.success) {
        if ($result.inferred_cache_hit) { "CACHE" } else { "COLD" }
    } else {
        "ERROR"
    }

    Write-Host "  Run $i``: wall=$($result.wall_clock_ms)ms | prompt_eval=$($result.prompt_eval_ms)ms | gen=$($result.generation_ms)ms | $cacheInd"
}

Write-Host ""

# A2: Identical (should show cache reuse in prompt_eval_ms)
$contextA = $contextContent
Write-Host "A2: Identical system prompt (EXPECT lower prompt_eval_ms)"
for ($i = 1; $i -le $Iterations; $i++) {
    $result = Invoke-LlamaCppInstrumented `
        -SystemContent $contextA `
        -UserContent "Explain the retrieval router." `
        -TestCaseId "A2-$i"

    $allResults += $result

    $cacheInd = if ($result.success) {
        if ($result.inferred_cache_hit) { "CACHE" } else { "COLD" }
    } else {
        "ERROR"
    }

    Write-Host "  Run $i``: wall=$($result.wall_clock_ms)ms | prompt_eval=$($result.prompt_eval_ms)ms | gen=$($result.generation_ms)ms | $cacheInd"
}

Write-Host ""

# A': Mutate one token early in system prompt (should spike prompt_eval_ms back up)
$contextA_mutated = $contextContent -replace "You are Atlas\.", "You are the Atlas assistant."
Write-Host "A': Mutate early token (EXPECT higher prompt_eval_ms, proving cache invalidation)"
for ($i = 1; $i -le $Iterations; $i++) {
    $result = Invoke-LlamaCppInstrumented `
        -SystemContent $contextA_mutated `
        -UserContent "Explain the retrieval router." `
        -TestCaseId "A'-$i"

    $allResults += $result

    $cacheInd = if ($result.success) {
        if ($result.inferred_cache_hit) { "CACHE" } else { "COLD" }
    } else {
        "ERROR"
    }

    Write-Host "  Run $i``: wall=$($result.wall_clock_ms)ms | prompt_eval=$($result.prompt_eval_ms)ms | gen=$($result.generation_ms)ms | $cacheInd"
}

Write-Host ""
Write-Host "📊 Analysis"
Write-Host "=" * 70

# Group by test case
$byCase = $allResults | Where-Object success | Group-Object test_case_id

$a1Stats = $byCase | Where-Object Name -Match "^A1-" | ForEach-Object {
    $_.Group | Measure-Object -Property prompt_eval_ms -Average -Minimum -Maximum
} | Select-Object -First 1

$a2Stats = $byCase | Where-Object Name -Match "^A2-" | ForEach-Object {
    $_.Group | Measure-Object -Property prompt_eval_ms -Average -Minimum -Maximum
} | Select-Object -First 1

$a3Stats = $byCase | Where-Object Name -Match "^A'-" | ForEach-Object {
    $_.Group | Measure-Object -Property prompt_eval_ms -Average -Minimum -Maximum
} | Select-Object -First 1

if ($a1Stats -and $a2Stats -and $a3Stats) {
    Write-Host ""
    Write-Host "Prompt Evaluation Time (primary cache indicator):"
    Write-Host "  A1 (baseline):     avg=$([Math]::Round($a1Stats.Average))ms | min=$($a1Stats.Minimum)ms | max=$($a1Stats.Maximum)ms"
    Write-Host "  A2 (identical):    avg=$([Math]::Round($a2Stats.Average))ms | min=$($a2Stats.Minimum)ms | max=$($a2Stats.Maximum)ms"
    Write-Host "  A' (mutated):      avg=$([Math]::Round($a3Stats.Average))ms | min=$($a3Stats.Minimum)ms | max=$($a3Stats.Maximum)ms"
    Write-Host ""

    $a1Avg = $a1Stats.Average
    $a2Avg = $a2Stats.Average
    $a3Avg = $a3Stats.Average

    if ($a2Avg -lt $a1Avg * 0.5) {
        Write-Host "✅ CACHE HIT DETECTED: A2 prompt_eval is <50% of A1"
        Write-Host "   Interpretation: KV cache is reusing prefixes"
    } elseif ($a2Avg -lt $a1Avg * 0.9) {
        Write-Host "⚠️  POSSIBLE CACHE: A2 slightly faster, could be cache or warmup"
        Write-Host "   Check cached_tokens count: if >0, it is cache; if 0, warmup only"
    } else {
        Write-Host "❌ UNCLEAR or NO CACHE: A2 ≈ A1, warmup effect may dominate"
    }

    Write-Host ""

    if ($a3Avg -gt $a2Avg * 1.5) {
        Write-Host "✅ CACHE INVALIDATION WORKS: A' prompt_eval jumped back up"
        Write-Host "   Interpretation: Mutating early token invalidated cached prefix"
    } else {
        Write-Host "⚠️  NO SPIKE DETECTED: Check if cached_tokens dropped to 0 in A' (proof of invalidation)"
    }
}

Write-Host ""
Write-Host "Conclusion:"
Write-Host "-" * 70
Write-Host "Look at prompt_eval_ms, NOT wall-clock latency."
Write-Host "  • Prompt_eval dropping A1→A2 = cache working"
Write-Host "  • Prompt_eval spiking A2→A' = cache validation working"
Write-Host "  • Both metrics stable = just warmup, no cache"
Write-Host ""

# Write results
$outputDir = Split-Path $OutputFile
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

@{
    run_id = [guid]::NewGuid().ToString()
    context_hash = $contextHash
    context_chars = $contextContent.Length
    iterations = $Iterations
    source_file = $ContextFile
    results = $allResults
} | ConvertTo-Json -Depth 8 | Set-Content $OutputFile
Write-Host "📄 Results saved to: $OutputFile"
Write-Host ""
Write-Host "Next: Parse results, validate patterns, commit findings to cache-probe-analysis.md"
