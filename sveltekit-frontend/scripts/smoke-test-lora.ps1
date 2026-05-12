# scripts/smoke-test-lora.ps1
# Smoke test for the legal-LoRA inference stack.

$ErrorActionPreference = "Stop"

Write-Host "`n🚀 Starting Legal-LoRA Inference Smoke Test" -ForegroundColor Cyan

# 1. Check Environment
Write-Host "`n[1/4] Checking environment variables..."
$loraPath = $env:LEGAL_LORA_PATH
$modelPath = $env:ROTORQUANT_MODEL_PATH

if (-not $loraPath) {
    Write-Host "❌ Error: LEGAL_LORA_PATH is not set in the environment." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $loraPath)) {
    Write-Host "❌ Error: LoRA file not found at $loraPath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ LEGAL_LORA_PATH: $loraPath" -ForegroundColor Green

# 2. Probe Running Server
Write-Host "`n[2/4] Probing llama-server health..."
$port = $env:TURBO_PORT -or "8090"
$baseUrl = "http://127.0.0.1:$port"

try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 5
    Write-Host "✅ Server health: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: llama-server is not reachable at $baseUrl" -ForegroundColor Red
    Write-Host "   Start it first: npm run turbo:start:rotorquant:lora" -ForegroundColor Yellow
    exit 1
}

# 3. Verify Model Info (LoRA check)
Write-Host "`n[3/4] Probing model info..."
try {
    $models = Invoke-RestMethod -Uri "$baseUrl/v1/models" -Method Get
    $activeModel = $models.data[0].id
    Write-Host "✅ Active Model ID: $activeModel" -ForegroundColor Green
    # Note: llama.cpp doesn't always show LoRA in the model ID, 
    # but we check if the server is up and responsive.
} catch {
    Write-Host "❌ Error: Failed to fetch model info." -ForegroundColor Red
    exit 1
}

# 4. Test Inference (Legal prompt)
Write-Host "`n[4/4] Performing test legal inference..."
$prompt = "Define the hearsay rule in one sentence."
$body = @{
    model = "local"
    messages = @(
        @{ role = "user"; content = $prompt }
    )
    max_tokens = 64
    temperature = 0.1
} | ConvertTo-Json

try {
    $t0 = Get-Date
    $res = Invoke-RestMethod -Uri "$baseUrl/v1/chat/completions" -Method Post -Body $body -ContentType "application/json"
    $t1 = Get-Date
    $duration = ($t1 - $t0).TotalMilliseconds
    
    $answer = $res.choices[0].message.content
    Write-Host "`n--- Response ---" -ForegroundColor Gray
    Write-Host $answer
    Write-Host "----------------" -ForegroundColor Gray
    Write-Host "✅ Inference successful! (Duration: $($duration.ToString('F0'))ms)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Inference call failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n🏁 Smoke test COMPLETED successfully.`n" -ForegroundColor Cyan
