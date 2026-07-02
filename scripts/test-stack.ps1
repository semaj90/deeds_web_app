<#
.SYNOPSIS
  Test the complete stack without Ollama.

.DESCRIPTION
  Verifies:
  1. TurboQuant (legal GGUF inference)
  2. Qdrant (vector store REST)
  3. Bifrost (cache + routing)
  4. Redis (cache backend)
  5. Postgres (identity DB)

.EXAMPLE
  .\scripts\test-stack.ps1
#>

$ErrorActionPreference = 'Continue'

Write-Host "🧪 Testing Legal GGUF Stack (No Ollama)" -ForegroundColor Cyan
Write-Host ""

$tests = @(
  @{
    name = "1️⃣  TurboQuant (legal GGUF)"
    url = "http://127.0.0.1:8090/health"
    check = { $_ -like "*ok*" }
  }
  @{
    name = "2️⃣  Qdrant REST"
    url = "http://127.0.0.1:6333/collections"
    check = { $_ -like "*result*" }
  }
  @{
    name = "3️⃣  Bifrost Cache"
    url = "http://127.0.0.1:3040/health"
    check = { $_ -like "*ok*" }
  }
)

foreach ($test in $tests) {
  Write-Host $test.name -ForegroundColor Yellow
  try {
    $response = Invoke-WebRequest $test.url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    $content = $response.Content

    if ($content | Where-Object { $_ -match ($test.check) }) {
      Write-Host "   ✅ OK" -ForegroundColor Green
    } else {
      Write-Host "   ⚠️  Response received but check failed" -ForegroundColor Yellow
      Write-Host "      Response: $content" -ForegroundColor Gray
    }
  } catch {
    Write-Host "   ❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
  }
  Write-Host ""
}

# Redis test
Write-Host "4️⃣  Redis/Valkey" -ForegroundColor Yellow
try {
  $ping = docker exec legal-ai-valkey redis-cli PING 2>&1
  if ($ping -eq "PONG") {
    Write-Host "   ✅ OK (PONG)" -ForegroundColor Green
  } else {
    Write-Host "   ⚠️  Got: $ping" -ForegroundColor Yellow
  }
} catch {
  Write-Host "   ❌ FAIL: Docker exec failed" -ForegroundColor Red
}
Write-Host ""

# Postgres test
Write-Host "5️⃣  Postgres" -ForegroundColor Yellow
try {
  $result = docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1" 2>&1
  if ($result -match "1") {
    Write-Host "   ✅ OK" -ForegroundColor Green
  } else {
    Write-Host "   ⚠️  Response: $result" -ForegroundColor Yellow
  }
} catch {
  Write-Host "   ❌ FAIL: Docker exec failed" -ForegroundColor Red
}
Write-Host ""

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Stack test complete (Ollama not tested)" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Test legal GGUF: .\scripts\atlas\test-legal-gguf.ps1" -ForegroundColor Gray
Write-Host "  2. Warm cache: npm run atlas:warm" -ForegroundColor Gray
Write-Host "  3. Monitor: docker logs legal-ai-bifrost --tail 50 --follow" -ForegroundColor Gray
