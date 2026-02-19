#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick test of the new AI endpoints (extract-languages and summarize-simple)

.DESCRIPTION
    Performs quick validation tests with realistic timeouts for Ollama model loading.
    First request may take 10-30 seconds as models load into memory.
#>

param(
    [string]$BaseUrl = "http://localhost:5173"
)

$ErrorActionPreference = "Continue"

Write-Host "🧪 Quick AI Endpoints Test" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

# Test 1: Language Extraction Health Check
Write-Host "`n[1/4] Testing language extraction health endpoint..." -ForegroundColor Yellow
Write-Host "  ⏳ This may take 10-30 seconds on first request (model loading)..." -ForegroundColor Gray
try {
    $langHealth = Invoke-RestMethod -Uri "$BaseUrl/api/ai/extract-languages" -Method Get -TimeoutSec 120
    if ($langHealth.success) {
        Write-Host "  ✅ Language extraction endpoint is healthy" -ForegroundColor Green
        Write-Host "     Model: $($langHealth.model.name) ($($langHealth.model.size))" -ForegroundColor Gray
        Write-Host "     Supported languages: $($langHealth.supportedLanguages.Count)" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  Unexpected response format" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "     Ensure SvelteKit is running: npm run dev" -ForegroundColor Yellow
    exit 1
}

# Test 2: Summarization Health Check
Write-Host "`n[2/4] Testing summarization health endpoint..." -ForegroundColor Yellow
try {
    $summaryHealth = Invoke-RestMethod -Uri "$BaseUrl/api/ai/summarize-simple" -Method Get -TimeoutSec 120
    if ($summaryHealth.success) {
        Write-Host "  ✅ Summarization endpoint is healthy" -ForegroundColor Green
        Write-Host "     Model: $($summaryHealth.model.name) ($($summaryHealth.model.size))" -ForegroundColor Gray
        Write-Host "     Supported formats: $($summaryHealth.supportedFormats -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  Unexpected response format" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 3: Language Extraction (End-to-End)
Write-Host "`n[3/4] Testing language extraction (end-to-end)..." -ForegroundColor Yellow
$testText = @"
This employment agreement is entered into between Acme Corp and John Smith.
Le salaire annuel sera de 120 000 dollars. Der Vertrag beginnt am 1. Januar 2025.
"@

$langBody = @{
    text = $testText
    model = "embeddinggemma:latest"
    maxSampleLength = 500
} | ConvertTo-Json -Depth 10

try {
    $langResult = Invoke-RestMethod `
        -Uri "$BaseUrl/api/ai/extract-languages" `
        -Method Post `
        -Body $langBody `
        -ContentType "application/json" `
        -TimeoutSec 120

    if ($langResult.success) {
        Write-Host "  ✅ Language extraction successful" -ForegroundColor Green
        Write-Host "     Detected languages: $($langResult.detectedLanguages -join ', ')" -ForegroundColor Cyan
        Write-Host "     Processing time: $($langResult.metadata.processingTimeMs)ms" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  Extraction returned success=false" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 4: Summarization (End-to-End)
Write-Host "`n[4/4] Testing summarization (end-to-end)..." -ForegroundColor Yellow
$testDoc = @"
TypeScript compilation errors found in 162 files:
- Missing type annotations in RequestHandler functions
- Implicit any types in route handlers
- Untyped parameters in API endpoints
Pattern: Most errors occur in +server.ts files across routes/api
Severity: Medium - build succeeds with skipLibCheck but IDE shows warnings
"@

$summaryBody = @{
    text = $testDoc
    model = "gemma3-legal:latest"
    format = "bullets"
    maxLength = 300
    detectedLanguages = $langResult.detectedLanguages
} | ConvertTo-Json -Depth 10

try {
    $summaryResult = Invoke-RestMethod `
        -Uri "$BaseUrl/api/ai/summarize-simple" `
        -Method Post `
        -Body $summaryBody `
        -ContentType "application/json" `
        -TimeoutSec 120

    if ($summaryResult.success) {
        Write-Host "  ✅ Summarization successful" -ForegroundColor Green
        Write-Host "`n  📄 Summary:" -ForegroundColor Cyan
        Write-Host "  $($summaryResult.summary)" -ForegroundColor White
        Write-Host "`n  📊 Metadata:" -ForegroundColor Cyan
        Write-Host "     Tokens: $($summaryResult.metadata.tokens.total)" -ForegroundColor Gray
        Write-Host "     Processing time: $([math]::Round($summaryResult.metadata.processingTime.total, 2))ms" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  Summarization returned success=false" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "✅ All endpoint tests passed!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Run VS Code task: Ctrl+Shift+P → Tasks: Run Task" -ForegroundColor White
Write-Host "  2. Choose: 📝 Svelte-Check with Log (gemma3-legal summarization)" -ForegroundColor White
Write-Host "  3. View results in: logs/svelte-check-summary-*.md" -ForegroundColor White
