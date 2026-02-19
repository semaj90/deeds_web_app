#!/usr/bin/env pwsh
# Test Svelte 5 Documentation Search

Write-Host "🧪 Testing Knowledge Plane - Svelte Docs Search" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:8099"

# 1. Health check
Write-Host "1. Checking service health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 5
    Write-Host "   ✅ Service is running" -ForegroundColor Green
    Write-Host "   DB: $($health.db_identity.current_database) as $($health.db_identity.current_user)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Service not running on port 8099" -ForegroundColor Red
    Write-Host "   Start with: ./run.ps1" -ForegroundColor Yellow
    exit 1
}

# 2. Search Svelte docs
Write-Host "`n2. Searching Svelte docs for '$state rune'..." -ForegroundColor Yellow
$body = @{
    query = "`$state rune"
    sources = @("svelte")
    max_results = 3
    context = 2
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/svelte/docs/search" -Method Post -Body $body -ContentType "application/json"
    Write-Host "   ✅ Found $($result.results.Count) results in $($result.meta.duration_ms)ms" -ForegroundColor Green

    foreach ($hit in $result.results | Select-Object -First 3) {
        Write-Host "`n   📄 $($hit.source):$($hit.line)" -ForegroundColor Cyan
        Write-Host "      Category: $($hit.category)" -ForegroundColor Gray
        Write-Host "      Match: $($hit.match.Substring(0, [Math]::Min(80, $hit.match.Length)))..." -ForegroundColor White
    }
} catch {
    Write-Host "   ❌ Search failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Search codebase for getOllamaEndpoint
Write-Host "`n3. Searching codebase for 'getOllamaEndpoint'..." -ForegroundColor Yellow
$body = @{
    query = "getOllamaEndpoint"
    sources = @("codebase")
    max_results = 5
    context = 3
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/svelte/docs/search" -Method Post -Body $body -ContentType "application/json"
    Write-Host "   ✅ Found $($result.results.Count) results" -ForegroundColor Green

    foreach ($hit in $result.results | Select-Object -First 3) {
        Write-Host "`n   📄 $($hit.source):$($hit.line)" -ForegroundColor Cyan
        Write-Host "      $($hit.snippet)" -ForegroundColor White
    }
} catch {
    Write-Host "   ⚠️  Search failed (may be no matches): $($_.Exception.Message)" -ForegroundColor Yellow
}

# 4. Search for Svelte 5 runes in codebase
Write-Host "`n4. Searching for Svelte 5 runes in codebase..." -ForegroundColor Yellow
$body = @{
    query = "`$state|`$derived|`$effect|`$props"
    sources = @("codebase")
    max_results = 10
    context = 2
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/svelte/docs/search" -Method Post -Body $body -ContentType "application/json"
    Write-Host "   ✅ Found $($result.results.Count) Svelte 5 patterns" -ForegroundColor Green

    $categories = $result.results | Group-Object -Property category | Sort-Object Count -Descending
    foreach ($cat in $categories) {
        Write-Host "      $($cat.Name): $($cat.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  Search failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n✅ All tests complete!`n" -ForegroundColor Green
