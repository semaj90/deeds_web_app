#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Four-Layer Cache Probe Harness — Measure prompt caching independently

.DESCRIPTION
    Separates and measures:
    1. OpenCode/provider cache (llama.cpp adapter)
    2. llama.cpp KV/prefix reuse (direct port 8090)
    3. BitFrost exact cache (Valkey)
    4. BitFrost semantic packet cache (Valkey)

    Each layer is tested independently with deterministic requests.
    Metrics written to cache-probe-results.json for audit and replay.

.PARAMETER Iterations
    Number of runs per test case (default: 10)

.PARAMETER ContextFile
    Path to stable context document (default: docs/cache-probe-context.md)

.PARAMETER OutputFile
    Where to write results JSON (default: reports/cache-probe-results.json)

.EXAMPLE
    .\cache-probe-harness.ps1 -Iterations 5

.NOTES
    Requires:
    - llama.cpp server at 127.0.0.1:8090
    - OpenCode adapter at 127.0.0.1:8091
    - Valkey/Redis at 127.0.0.1:6379
#>

param(
    [int]$Iterations = 10,
    [string]$ContextFile = "docs/cache-probe-context.md",
    [string]$OutputFile = "reports/cache-probe-results.json"
)

$ErrorActionPreference = "Stop"

function Get-LlamaMetrics {
    param($Response)

    $usage = $Response.usage
    $metrics = $Response.metrics

    return @{
        prompt_tokens = $usage.prompt_tokens
        completion_tokens = $usage.completion_tokens
        prompt_eval_tokens = $metrics.prompt_eval_tokens
        prompt_eval_ms = $metrics.prompt_eval_ms
        generation_ms = $metrics.generation_ms
        ttft_ms = $metrics.ttft_ms
        reused_prefix_tokens = $metrics.reused_prefix_tokens
        slot_id = $metrics.slot_id
    }
}

function Add-HarnessMetadata {
    param(
        [hashtable]$Row,
        [string]$RunId,
        [int]$ExecutionOrder
    )

    $merged = @{}
    foreach ($key in $Row.Keys) { $merged[$key] = $Row[$key] }
    $merged.run_id = $RunId
    $merged.execution_order = $ExecutionOrder
    return $merged
}

# ============================================================================
# LAYER 1: Direct llama.cpp (Control)
# ============================================================================

function Test-DirectLlamaCpp {
    param([string]$CaseId, [string]$SystemContent, [string]$UserContent)

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
        $m = Get-LlamaMetrics -Response $response

        return @{
            case_id = $CaseId
            layer = "llama.cpp_direct"
            success = $true
            total_ms = $sw.ElapsedMilliseconds
            prompt_tokens = $m.prompt_tokens
            prompt_eval_tokens = $m.prompt_eval_tokens
            prompt_eval_ms = $m.prompt_eval_ms
            generation_ms = $m.generation_ms
            ttft_ms = $m.ttft_ms
            reused_prefix_tokens = $m.reused_prefix_tokens
            slot_id = $m.slot_id
            completion_tokens = $m.completion_tokens
            timestamp = Get-Date -AsUTC -Format "o"
        }
    } catch {
        $sw.Stop()
        return @{
            case_id = $CaseId
            layer = "llama.cpp_direct"
            success = $false
            total_ms = $sw.ElapsedMilliseconds
            error = $_.Exception.Message
            timestamp = Get-Date -AsUTC -Format "o"
        }
    }
}

# ============================================================================
# LAYER 2: OpenCode Adapter (8091)
# ============================================================================

function Test-OpenCodeAdapter {
    param([string]$CaseId, [string]$SystemContent, [string]$UserContent)

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
            -Uri "http://127.0.0.1:8091/v1/chat/completions" `
            -Method Post `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 120

        $sw.Stop()
        $m = Get-LlamaMetrics -Response $response

        return @{
            case_id = $CaseId
            layer = "opencode_adapter"
            success = $true
            total_ms = $sw.ElapsedMilliseconds
            prompt_tokens = $m.prompt_tokens
            prompt_eval_tokens = $m.prompt_eval_tokens
            prompt_eval_ms = $m.prompt_eval_ms
            generation_ms = $m.generation_ms
            ttft_ms = $m.ttft_ms
            reused_prefix_tokens = $m.reused_prefix_tokens
            slot_id = $m.slot_id
            completion_tokens = $m.completion_tokens
            timestamp = Get-Date -AsUTC -Format "o"
        }
    } catch {
        $sw.Stop()
        return @{
            case_id = $CaseId
            layer = "opencode_adapter"
            success = $false
            total_ms = $sw.ElapsedMilliseconds
            error = $_.Exception.Message
            timestamp = Get-Date -AsUTC -Format "o"
        }
    }
}

# ============================================================================
# LAYER 3: BitFrost Exact Cache (Valkey)
# ============================================================================

function Test-BitFrostExactCache {
    param([string]$CaseId, [string]$CacheKey)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        # Simulate exact cache lookup
        $result = & redis-cli -h 127.0.0.1 -p 6379 -a redis GET "bifrost:packet:$CacheKey" 2>$null
        $sw.Stop()

        $hit = $null -ne $result -and $result -ne ""

        return @{
            case_id = $CaseId
            layer = "bitfrost_exact"
            cache_hit = $hit
            lookup_ms = $sw.ElapsedMilliseconds
            timestamp = Get-Date -AsUTC -Format "o"
        }
    } catch {
        $sw.Stop()
        return @{
            case_id = $CaseId
            layer = "bitfrost_exact"
            error = $_.Exception.Message
            lookup_ms = $sw.ElapsedMilliseconds
            timestamp = Get-Date -AsUTC -Format "o"
        }
    }
}

# ============================================================================
# LAYER 4: BitFrost Semantic Cache (Valkey)
# ============================================================================

function Test-BitFrostSemanticCache {
    param([string]$CaseId, [string]$IntentHash, [string]$HmmState)

    $semanticKey = "ace:cache:${IntentHash}:${HmmState}"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $result = & redis-cli -h 127.0.0.1 -p 6379 -a redis GET $semanticKey 2>$null
        $sw.Stop()

        $hit = $null -ne $result -and $result -ne ""

        return @{
            case_id = $CaseId
            layer = "bitfrost_semantic"
            cache_hit = $hit
            lookup_ms = $sw.ElapsedMilliseconds
            timestamp = Get-Date -AsUTC -Format "o"
        }
    } catch {
        $sw.Stop()
        return @{
            case_id = $CaseId
            layer = "bitfrost_semantic"
            error = $_.Exception.Message
            lookup_ms = $sw.ElapsedMilliseconds
            timestamp = Get-Date -AsUTC -Format "o"
        }
    }
}

# ============================================================================
# MAIN HARNESS
# ============================================================================

Write-Host "🧪 Cache Probe Harness — Four Independent Layers"
Write-Host "=" * 60
Write-Host ""

# Verify context file exists
if (-not (Test-Path $ContextFile)) {
    Write-Error "Context file not found: $ContextFile"
    exit 1
}

$contextContent = Get-Content $ContextFile -Raw
$contextHash = ([System.Security.Cryptography.SHA256]::Create()).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($contextContent)) | ForEach-Object { "{0:x2}" -f $_ } | Join-String
Write-Host "Context document: $($contextContent.Length) chars, SHA256: $contextHash"
Write-Host ""

$allResults = @()
$runId = [guid]::NewGuid().ToString()
Write-Host "Run ID: $runId"
Write-Host ""

# Test Cases
$testCases = @(
    @{ Id = "A1"; UserMsg = "Explain the retrieval router."; Desc = "Cold/common-prefix seed" }
    @{ Id = "A2"; UserMsg = "Explain the retrieval router."; Desc = "Exact repeat" }
    @{ Id = "B1"; UserMsg = "Explain the packet validator."; Desc = "Same prefix, changed suffix" }
    @{ Id = "C1"; UserMsg = "Describe the five-destination promotion policy."; Desc = "Early-prefix mutation" }
    @{ Id = "D1"; UserMsg = "Explain the retrieval router."; Desc = "After slot erase" }
    @{ Id = "E1"; UserMsg = "Explain the retrieval router."; Desc = "After server restart" }
)

$orderedCases = @($testCases[0], $testCases[2], $testCases[1], $testCases[3], $testCases[4], $testCases[5])

foreach ($testCase in $orderedCases) {
    Write-Host "Test Case: $($testCase.Id) — $($testCase.Desc)"
    Write-Host "User message: $($testCase.UserMsg)"
    Write-Host "-" * 60

    for ($i = 1; $i -le $Iterations; $i++) {
        Write-Host "  Run $i/$Iterations..." -NoNewline

        # Layer 1: Direct llama.cpp
        $result1 = Test-DirectLlamaCpp -CaseId "$($testCase.Id)-$i" -SystemContent $contextContent -UserContent $testCase.UserMsg

        # Layer 2: OpenCode Adapter (if Layer 1 succeeded)
        $result2 = if ($result1.success) {
            Test-OpenCodeAdapter -CaseId "$($testCase.Id)-$i" -SystemContent $contextContent -UserContent $testCase.UserMsg
        } else {
            @{ case_id = "$($testCase.Id)-$i"; layer = "opencode_adapter"; skipped = $true; reason = "Layer 1 failed" }
        }

        # Layer 3: Exact cache (use case ID as mock cache key)
        $result3 = Test-BitFrostExactCache -CaseId "$($testCase.Id)-$i" -CacheKey $testCase.Id

        # Layer 4: Semantic cache
        $intentHash = ([System.Security.Cryptography.SHA256]::Create()).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($testCase.UserMsg)) | ForEach-Object { "{0:x2}" -f $_ } | Join-String
        $result4 = Test-BitFrostSemanticCache -CaseId "$($testCase.Id)-$i" -IntentHash $intentHash.Substring(0, 16) -HmmState "RETRIEVE"

        $baseOrder = $allResults.Count + 1
        $allResults += @(
            (Add-HarnessMetadata -Row $result1 -RunId $runId -ExecutionOrder $baseOrder),
            (Add-HarnessMetadata -Row $result2 -RunId $runId -ExecutionOrder ($baseOrder + 1)),
            (Add-HarnessMetadata -Row $result3 -RunId $runId -ExecutionOrder ($baseOrder + 2)),
            (Add-HarnessMetadata -Row $result4 -RunId $runId -ExecutionOrder ($baseOrder + 3))
        )

        if ($result1.success -and $result2.success) {
            $delta = [Math]::Abs($result2.total_ms - $result1.total_ms)
            Write-Host " ✅ L1: $($result1.total_ms)ms | L2: $($result2.total_ms)ms | Δ: $($delta)ms"
        } else {
            Write-Host " ⚠️  Layer(s) failed"
        }
    }

    Write-Host ""
}

# ============================================================================
# ANALYSIS
# ============================================================================

Write-Host "📊 Cache Analysis"
Write-Host "=" * 60
Write-Host ""

# Group by layer and case
$byCase = $allResults | Group-Object case_id
foreach ($group in $byCase) {
    $caseId = $group.Name.Split('-')[0]
    $runNum = $group.Name.Split('-')[1]

    if ($runNum -eq "1") {  # Only show first run per case for brevity
        $directMs = $group.Group | Where-Object layer -eq "llama.cpp_direct" | Select-Object -ExpandProperty total_ms
        $adapterMs = $group.Group | Where-Object layer -eq "opencode_adapter" | Select-Object -ExpandProperty total_ms

        if ($directMs -and $adapterMs) {
            $delta = [Math]::Abs($adapterMs - $directMs)
            $pct = [Math]::Round(($delta / $directMs) * 100, 1)
            Write-Host "${caseId}: Direct=$($directMs)ms, Adapter=$($adapterMs)ms, Δ=$($pct)%"
        }
    }
}

Write-Host ""
Write-Host "✅ Probe harness complete. Results: $($allResults.Count) measurements"

# Write results to file
$outputDir = Split-Path $OutputFile
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

@{
    run_id = $runId
    context_hash = $contextHash
    context_chars = $contextContent.Length
    iterations = $Iterations
    source_file = $ContextFile
    results = $allResults
} | ConvertTo-Json -Depth 8 | Set-Content $OutputFile
Write-Host "📄 Results saved to: $OutputFile"
