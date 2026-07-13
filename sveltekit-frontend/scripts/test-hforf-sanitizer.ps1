#!/usr/bin/env pwsh
<#
.SYNOPSIS
Test HForF sanitizer integration with OpenCode CLI.

.DESCRIPTION
Verifies that HForF model responses are cleaned of training markers when
routed through the SvelteKit /api/v1/chat/completions endpoint.

.PARAMETER Model
Model to test (default: turboquant/hforf.gguf)

.PARAMETER Query
Test query (default: "What is a Merkle tree in 10 words?")

.EXAMPLE
./test-hforf-sanitizer.ps1 -Model "turboquant/hforf.gguf" -Query "Hello"
#>

param(
  [string]$Model = "turboquant/hforf.gguf",
  [string]$Query = "What is a Merkle tree in 10 words?",
  [int]$MaxTokens = 100,
  [string]$BaseURL = "http://127.0.0.1:5173/api"
)

Write-Host "🧪 HForF Sanitizer Test" -ForegroundColor Cyan
Write-Host "Model: $Model" -ForegroundColor Gray
Write-Host "Query: $Query" -ForegroundColor Gray
Write-Host "BaseURL: $BaseURL" -ForegroundColor Gray
Write-Host ""

$payload = @{
  model = $Model
  messages = @(
    @{ role = "user"; content = $Query }
  )
  temperature = 0
  max_tokens = $MaxTokens
  stream = $false
} | ConvertTo-Json

Write-Host "📤 Sending request to $BaseURL/v1/chat/completions..." -ForegroundColor Cyan

try {
  $response = Invoke-WebRequest `
    -Uri "$BaseURL/v1/chat/completions" `
    -Method POST `
    -Headers @{
      "Content-Type" = "application/json"
      "User-Agent" = "hforf-test-cli"
    } `
    -Body $payload `
    -UseBasicParsing `
    -TimeoutSec 60

  $data = $response.Content | ConvertFrom-Json
  $content = $data.choices[0].message.content

  Write-Host "✅ Response received" -ForegroundColor Green
  Write-Host ""
  Write-Host "Response content:" -ForegroundColor Cyan
  Write-Host $content -ForegroundColor White
  Write-Host ""

  # Check for contamination markers
  $markers = @(
    "<end_of_turn>",
    "<start_of_turn>",
    "<thinking>",
    "</thinking>",
    "<|thinking|>",
    "<|endthinking|>",
    "<|channel>"
  )

  $foundMarkers = @()
  foreach ($marker in $markers) {
    if ($content -like "*$marker*") {
      $foundMarkers += $marker
    }
  }

  Write-Host "🔍 Contamination Check:" -ForegroundColor Cyan
  if ($foundMarkers.Count -eq 0) {
    Write-Host "✅ PASS — No training markers detected" -ForegroundColor Green
  } else {
    Write-Host "❌ FAIL — Found markers:" -ForegroundColor Red
    foreach ($marker in $foundMarkers) {
      Write-Host "  - $marker" -ForegroundColor Red
    }
  }

} catch {
  Write-Host "❌ Request failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
