#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run svelte-check with gemma3-legal summarization and embeddinggemma language extraction
.DESCRIPTION
    This script:
    1. Runs svelte-check and captures output
    2. Sends output to /api/ai/extract-languages for language detection
    3. Sends output to /api/ai/summarize for gemma3-legal summarization
    4. Saves summary and displays results
#>

param(
    [string]$Port = "5173",
    [string]$MaxLength = "1000"
)

# Configuration
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = "logs/svelte-check-$timestamp.log"
$summaryFile = "logs/svelte-check-summary-$timestamp.md"
$baseUrl = "http://localhost:$Port"

# Ensure logs directory exists
New-Item -ItemType Directory -Force -Path logs | Out-Null

# Step 1: Run svelte-check
Write-Host "📝 Running svelte-check..." -ForegroundColor Cyan
try {
    $checkOutput = npx svelte-check --output human 2>&1 | Tee-Object -FilePath $logFile
    Write-Host "✅ svelte-check complete" -ForegroundColor Green
} catch {
    Write-Host "⚠️  svelte-check had errors (expected)" -ForegroundColor Yellow
}

# Read log content
$logContent = Get-Content $logFile -Raw

if ([string]::IsNullOrWhiteSpace($logContent)) {
    Write-Host "❌ No output from svelte-check" -ForegroundColor Red
    exit 1
}

Write-Host "`n🔍 Log size: $($logContent.Length) characters" -ForegroundColor Gray

# Step 2: Extract languages
Write-Host "`n🌐 Extracting languages with embeddinggemma..." -ForegroundColor Cyan
try {
    $langBody = @{
        text = $logContent
        model = "embeddinggemma:latest"
        maxSampleLength = 1000
    } | ConvertTo-Json -Compress

    $langResponse = Invoke-RestMethod `
        -Uri "$baseUrl/api/ai/extract-languages" `
        -Method Post `
        -Body $langBody `
        -ContentType 'application/json' `
        -TimeoutSec 30

    $detectedLanguages = $langResponse.languages
    Write-Host "✅ Detected languages: $($detectedLanguages -join ', ')" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Language extraction failed: $_" -ForegroundColor Yellow
    $detectedLanguages = @("English")
}

# Step 3: Summarize with gemma3-legal
Write-Host "`n🤖 Summarizing with gemma3-legal:latest..." -ForegroundColor Cyan
try {
    $summaryBody = @{
        text = $logContent
        model = "gemma3-legal:latest"
        maxLength = [int]$MaxLength
        temperature = 0.7
        topP = 0.9
        detectedLanguages = $detectedLanguages
        format = "bullets"
    } | ConvertTo-Json -Compress

    $summaryResponse = Invoke-RestMethod `
        -Uri "$baseUrl/api/ai/summarize-simple" `
        -Method Post `
        -Body $summaryBody `
        -ContentType 'application/json' `
        -TimeoutSec 60

    # Save summary
    $summaryContent = @"
# Svelte-Check Summary
**Generated:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
**Model:** $($summaryResponse.metadata.model)
**Languages:** $($detectedLanguages -join ', ')

## Summary

$($summaryResponse.summary)

## Metadata

- **Input Tokens:** $($summaryResponse.metadata.tokens.input)
- **Output Tokens:** $($summaryResponse.metadata.tokens.output)
- **Total Tokens:** $($summaryResponse.metadata.tokens.total)
- **Processing Time:** $([math]::Round($summaryResponse.metadata.processingTime.total, 2))ms
- **Format:** $($summaryResponse.metadata.format)

---
*Full log: $logFile*
"@

    $summaryContent | Out-File -FilePath $summaryFile -Encoding UTF8

    # Display results
    Write-Host "`n✅ Summary saved to: $summaryFile" -ForegroundColor Green
    Write-Host "`n📊 Detected Languages: $($detectedLanguages -join ', ')" -ForegroundColor Cyan
    Write-Host "`n--- Summary ---" -ForegroundColor Magenta
    Write-Host $summaryResponse.summary -ForegroundColor White

    # Display metrics
    Write-Host "`n📈 Metrics:" -ForegroundColor Cyan
    Write-Host "   Tokens: $($summaryResponse.metadata.tokens.total)" -ForegroundColor Gray
    Write-Host "   Time: $([math]::Round($summaryResponse.metadata.processingTime.total, 2))ms" -ForegroundColor Gray

} catch {
    Write-Host "`n❌ Summarization failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host "`n📄 Full log: $logFile" -ForegroundColor Gray
Write-Host "📝 Summary: $summaryFile" -ForegroundColor Gray
