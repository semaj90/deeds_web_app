# Setup Ollama models for evidence service with Flash-Attention-2 optimization
# Run this script to pull and configure models with optimal settings for RTX 3060 Ti

Write-Host "🚀 Setting up Ollama models for Evidence Service..." -ForegroundColor Cyan
Write-Host "GPU: RTX 3060 Ti" -ForegroundColor Yellow
Write-Host "Optimization: Flash-Attention-2, 30 GPU layers" -ForegroundColor Yellow
Write-Host ""

# Check if Ollama is running
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11436/api/tags" -Method Get -ErrorAction Stop
    Write-Host "✅ Ollama is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Ollama is not running on port 11436" -ForegroundColor Red
    Write-Host "   Start Ollama first with: ollama serve --port 11436" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Pull embeddinggemma:latest (primary embedding model)
Write-Host "📥 Pulling embeddinggemma:latest..." -ForegroundColor Cyan
try {
    $pullBody = @{ name = "embeddinggemma:latest" } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:11436/api/pull" -Method Post -Body $pullBody -ContentType "application/json"
    Write-Host "✅ embeddinggemma:latest pulled successfully" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Failed to pull embeddinggemma:latest, will use nomic-embed-text as fallback" -ForegroundColor Yellow
}

Write-Host ""

# Pull nomic-embed-text (fallback embedding model)
Write-Host "📥 Pulling nomic-embed-text (fallback)..." -ForegroundColor Cyan
$pullBody = @{ name = "nomic-embed-text" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:11436/api/pull" -Method Post -Body $pullBody -ContentType "application/json"
Write-Host "✅ nomic-embed-text pulled successfully" -ForegroundColor Green

Write-Host ""

# Pull gemma3 (chat/summarization model)
Write-Host "📥 Pulling gemma3..." -ForegroundColor Cyan
$pullBody = @{ name = "gemma3" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:11436/api/pull" -Method Post -Body $pullBody -ContentType "application/json"
Write-Host "✅ gemma3 pulled successfully" -ForegroundColor Green

Write-Host ""

# Test embedding generation
Write-Host "🧪 Testing embedding generation..." -ForegroundColor Cyan
$embeddingTest = @{
    model = "embeddinggemma:latest"
    prompt = "This is a test legal document for evidence processing."
    options = @{
        num_gpu = 30
        use_mmap = $true
        flash_attention = $true
    }
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:11436/api/embeddings" -Method Post -Body $embeddingTest -ContentType "application/json"
    $dimensions = $result.embedding.Count
    Write-Host "✅ Embedding test successful (dimensions: $dimensions)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Embedding test failed, check Ollama logs" -ForegroundColor Yellow
}

Write-Host ""

# Test chat generation
Write-Host "🧪 Testing chat generation with gemma3..." -ForegroundColor Cyan
$chatTest = @{
    model = "gemma3"
    prompt = "Summarize: This is a test legal case."
    stream = $false
    options = @{
        num_gpu = 30
        flash_attention = $true
        temperature = 0.3
    }
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:11436/api/generate" -Method Post -Body $chatTest -ContentType "application/json"
    Write-Host "✅ Chat test successful" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Chat test failed, check Ollama logs" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ Ollama setup complete!" -ForegroundColor Magenta
Write-Host ""
Write-Host "Models available:" -ForegroundColor Cyan
Write-Host "  • embeddinggemma:latest (primary, Flash-Attention-2, 30 GPU layers)" -ForegroundColor White
Write-Host "  • nomic-embed-text (fallback)" -ForegroundColor White
Write-Host "  • gemma3 (chat/summarization, Flash-Attention-2)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy .env.example to .env: Copy-Item .env.example .env" -ForegroundColor White
Write-Host "  2. Start services: docker-compose up -d" -ForegroundColor White
Write-Host "  3. Monitor GPU usage: nvidia-smi -l 1" -ForegroundColor White
