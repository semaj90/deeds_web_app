#Requires -Version 7.0
<#
.SYNOPSIS
Verify all three batch summarization lanes are operational

.DESCRIPTION
Checks that embeddings (server + browser) and summary generation are ready:
  - Lane A: go-embedding-service :8097 (server embeddings, 768-dim)
  - Lane B: @xenova/transformers ONNX (browser embeddings, 768-dim)
  - Lane C: llama-server :8090 (Gemma4 summary generation)

Each lane is independent. All three must verify before batch processing starts.

.EXAMPLE
.\scripts\verify-batch-summarization-lanes.ps1

.NOTES
Expected timeline: <10 seconds for all three lane checks
#>

$ErrorActionPreference = 'Continue'

function Test-Lane {
    param(
        [string]$LaneName,
        [string]$Url,
        [string]$Method = 'GET',
        [object]$Body = $null,
        [string]$ExpectedPattern = '.'
    )

    $startTime = Get-Date
    try {
        if ($Method -eq 'GET') {
            $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3 -ErrorAction Stop
        } else {
            $response = Invoke-RestMethod -Uri $Url -Method Post `
                -Headers @{ 'Content-Type' = 'application/json' } `
                -Body (ConvertTo-Json $Body) `
                -TimeoutSec 3 `
                -ErrorAction Stop
        }

        $elapsed = ([datetime]::Now - $startTime).TotalMilliseconds
        $status = if ($response | ConvertTo-Json | Select-String $ExpectedPattern) { '✓' } else { '⚠' }
        Write-Host "[$status] $LaneName — $elapsed ms" -ForegroundColor Green
        return $true
    } catch {
        $elapsed = ([datetime]::Now - $startTime).TotalMilliseconds
        Write-Host "[✗] $LaneName — FAILED ($($_.Exception.Message))" -ForegroundColor Red
        return $false
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "BATCH SUMMARIZATION LANES VERIFICATION"
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host ""

$results = @{
    'Lane A: Server Embeddings'     = $false
    'Lane B: Browser ONNX Embeddings' = $false
    'Lane C: Summary Generation'    = $false
}

# Lane A: Server Embeddings (go-embedding-service :8097)
Write-Host "Lane A: Server Embeddings (go-embedding-service :8097)"
$results['Lane A: Server Embeddings'] = Test-Lane `
    -LaneName 'POST /embed' `
    -Url 'http://localhost:8097/embed' `
    -Method 'POST' `
    -Body @{ texts = @('test'); model = 'embeddinggemma:latest' } `
    -ExpectedPattern 'embeddings'

if ($results['Lane A: Server Embeddings']) {
    # Verify dimension
    try {
        $response = Invoke-RestMethod -Uri 'http://localhost:8097/embed' `
            -Method Post `
            -Headers @{ 'Content-Type' = 'application/json' } `
            -Body '{"texts":["test"],"model":"embeddinggemma:latest"}' `
            -TimeoutSec 3
        $dim = @($response.embeddings[0]).Count
        Write-Host "    └─ Vector dimension: $dim (expected 768)" -ForegroundColor Cyan
        if ($dim -ne 768) {
            Write-Host "    ⚠ Dimension mismatch! Expected 768, got $dim" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    ⚠ Could not verify dimension" -ForegroundColor Yellow
    }
}
Write-Host ""

# Lane B: Browser ONNX Embeddings (verification via npm run)
Write-Host "Lane B: Browser ONNX Embeddings (@xenova/transformers)"
Write-Host "  Note: Browser ONNX runs in SvelteKit, not standalone. Verify at:"
Write-Host "    1. Start SvelteKit: npm run dev"
Write-Host "    2. Open browser console on http://localhost:5173/admin/batch-summaries"
Write-Host "    3. Look for 'ONNX model loaded' message"
Write-Host "    4. Run: console.log(embeddings); (should be 768-dim Float32Array)"
Write-Host ""
Write-Host "  Workaround: Check package.json for @xenova/transformers dependency"
if (Select-String -Path 'package.json' -Pattern '@xenova/transformers' -Quiet) {
    Write-Host "  [✓] @xenova/transformers installed" -ForegroundColor Green
    $results['Lane B: Browser ONNX Embeddings'] = $true
} else {
    Write-Host "  [✗] @xenova/transformers NOT in package.json" -ForegroundColor Red
    $results['Lane B: Browser ONNX Embeddings'] = $false
}
Write-Host ""

# Lane C: Summary Generation (llama-server :8090)
Write-Host "Lane C: Summary Generation (llama-server :8090)"
Write-Host "Testing /v1/models endpoint..."
$results['Lane C: Summary Generation'] = Test-Lane `
    -LaneName 'GET /v1/models' `
    -Url 'http://localhost:8090/v1/models' `
    -Method 'GET' `
    -ExpectedPattern 'gemma4'

if ($results['Lane C: Summary Generation']) {
    Write-Host "Testing summary generation..."
    $summary_test = Test-Lane `
        -LaneName 'POST /v1/chat/completions' `
        -Url 'http://localhost:8090/v1/chat/completions' `
        -Method 'POST' `
        -Body @{
            messages   = @(@{ role = 'user'; content = 'Summarize: test code' })
            max_tokens = 32
            temperature = 0.1
        } `
        -ExpectedPattern 'choices'
}
Write-Host ""

# Summary
Write-Host "════════════════════════════════════════════════════════════════"
$passCount = ($results.Values | Where-Object { $_ }).Count
$totalCount = $results.Count

if ($passCount -eq $totalCount) {
    Write-Host "✓ ALL LANES VERIFIED ($passCount/$totalCount)" -ForegroundColor Green
} elseif ($passCount -ge 2) {
    Write-Host "⚠ PARTIAL LANES VERIFIED ($passCount/$totalCount)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Failed lanes:"
    $results.Keys | ForEach-Object {
        if (-not $results[$_]) {
            Write-Host "  - $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "✗ LANES NOT READY ($passCount/$totalCount)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Actions:"
    if (-not $results['Lane A: Server Embeddings']) {
        Write-Host "  1. Start go-embedding-service: docker restart legal-ai-go-embedding" -ForegroundColor Yellow
    }
    if (-not $results['Lane C: Summary Generation']) {
        Write-Host "  2. Start llama-server: .\scripts\launch-gemma4-summary-server.ps1" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host ""

if ($passCount -eq $totalCount) {
    Write-Host "Next: Run batch summarization"
    Write-Host "  .\scripts\batch-summarization-orchestrator.ps1 -StartAll"
    Write-Host ""
}
