<#
.SYNOPSIS
  Test script: Verify legal GGUF is loaded and working via TurboQuant.

.DESCRIPTION
  Checks:
  1. TurboQuant health (:8090)
  2. Legal model loaded (gemma4-legal-iq4xs-direct.gguf)
  3. Context length configured
  4. Inference working (legal prompt test)
  5. Bifrost integration ready

.EXAMPLE
  .\scripts\atlas\test-legal-gguf.ps1
#>

$ErrorActionPreference = 'Continue'

$TURBO_URL = "http://127.0.0.1:8090"
$BIFROST_URL = "http://127.0.0.1:3040"
$MODEL = "gemma4-legal-iq4xs-direct.gguf"

Write-Host "🧪 Testing Legal GGUF via TurboQuant..." -ForegroundColor Cyan
Write-Host ""

# 1. Health check
Write-Host "1️⃣  Health check..." -ForegroundColor Yellow
try {
  $health = Invoke-RestMethod "$TURBO_URL/health" -ErrorAction Stop
  Write-Host "   ✅ TurboQuant is running" -ForegroundColor Green
} catch {
  Write-Host "   ❌ TurboQuant is NOT running" -ForegroundColor Red
  Write-Host "   → Start with: npm run turbo:start:detached" -ForegroundColor Gray
  exit 1
}

# 2. Model list
Write-Host ""
Write-Host "2️⃣  Checking loaded model..." -ForegroundColor Yellow
try {
  $models = Invoke-RestMethod "$TURBO_URL/v1/models" -ErrorAction Stop
  $hasLegal = $models.data | Where-Object { $_.id -like "*gemma4-legal*" }

  if ($hasLegal) {
    Write-Host "   ✅ Legal GGUF model is loaded" -ForegroundColor Green
    Write-Host "   Model: $($hasLegal.id)" -ForegroundColor Gray
  } else {
    Write-Host "   ❌ Legal GGUF not found in model list" -ForegroundColor Red
    Write-Host "   Available models:" -ForegroundColor Gray
    $models.data | ForEach-Object { Write-Host "      - $($_.id)" -ForegroundColor Gray }
    exit 1
  }
} catch {
  Write-Host "   ❌ Failed to get model list: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 3. Context length
Write-Host ""
Write-Host "3️⃣  Checking context length..." -ForegroundColor Yellow
try {
  $context = $models.data[0].metadata.context_length ?? "unknown"
  Write-Host "   Context length: $context tokens" -ForegroundColor Gray
} catch {
  Write-Host "   ⚠️  Could not determine context length" -ForegroundColor Yellow
}

# 4. Simple inference test
Write-Host ""
Write-Host "4️⃣  Testing inference with legal prompt..." -ForegroundColor Yellow
try {
  $body = @{
    model = $MODEL
    messages = @(
      @{ role = "system"; content = "You are a legal expert. Answer concisely." }
      @{ role = "user"; content = "What is hearsay evidence in one sentence?" }
    )
    max_tokens = 100
    temperature = 0.3
    stream = $false
  } | ConvertTo-Json

  $response = Invoke-RestMethod "$TURBO_URL/v1/chat/completions" `
    -Method Post `
    -Headers @{ "Content-Type" = "application/json" } `
    -Body $body `
    -ErrorAction Stop

  if ($response.choices[0].message.content) {
    Write-Host "   ✅ Inference successful" -ForegroundColor Green
    $content = $response.choices[0].message.content
    Write-Host "   Response: $content" -ForegroundColor Gray
  } else {
    Write-Host "   ❌ No content in response" -ForegroundColor Red
    Write-Host $response | ConvertTo-Json -ForegroundColor Gray
    exit 1
  }
} catch {
  Write-Host "   ❌ Inference failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 5. Bifrost caching test
Write-Host ""
Write-Host "5️⃣  Testing Bifrost cache integration..." -ForegroundColor Yellow
try {
  $bifrost = Invoke-RestMethod "$BIFROST_URL/health" -ErrorAction Stop
  Write-Host "   ✅ Bifrost is running" -ForegroundColor Green
  Write-Host "   → Cache should now route to legal GGUF via TurboQuant intercept" -ForegroundColor Gray
} catch {
  Write-Host "   ⚠️  Bifrost is not responding (optional, cache won't work)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Legal GGUF is ready for Atlas!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start warm: npm run atlas:warm" -ForegroundColor Gray
Write-Host "  2. Check cache: docker exec legal-ai-redis redis-cli KEYS 'bifrost:*' | wc -l" -ForegroundColor Gray
Write-Host "  3. Monitor: docker logs legal-ai-bifrost --tail 50 --follow" -ForegroundColor Gray
Write-Host ""
