#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 88: System Status Check

.DESCRIPTION
    Comprehensive health check for Phase 88 KB foundation:
    - Knowledge Plane service status
    - FastMCP server status
    - Qdrant collection status
    - PostgreSQL connection
    - Svelte docs availability

.EXAMPLE
    .\scripts\phase88-status-check.ps1
#>

$ErrorActionPreference = 'Continue'
Set-StrictMode -Version Latest

Write-Host "`n🔍 Phase 88: System Status Check" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$allHealthy = $true

# 1. Knowledge Plane Service
Write-Host "🏥 Knowledge Plane (port 8792)" -ForegroundColor Cyan
try {
    $kpHealth = Invoke-RestMethod -Uri "http://localhost:8792/health" -Method GET -TimeoutSec 3
    Write-Host "   ✅ Running" -ForegroundColor Green
    if ($kpHealth.database) {
        Write-Host "      DB: $($kpHealth.database.current_database) as $($kpHealth.database.current_user)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Not responding" -ForegroundColor Red
    Write-Host "      Start with: cd go-services\knowledge-plane && .\run.ps1" -ForegroundColor Yellow
    $allHealthy = $false
}
Write-Host ""

# 2. FastMCP Server
Write-Host "🔧 FastMCP Server (port 3002)" -ForegroundColor Cyan
try {
    $mcpHealth = Invoke-RestMethod -Uri "http://localhost:3002/health" -Method GET -TimeoutSec 3
    if ($mcpHealth.ok) {
        Write-Host "   ✅ Running ($($mcpHealth.tools) tools)" -ForegroundColor Green
        if ($mcpHealth.database) {
            Write-Host "      DB: $($mcpHealth.database.current_database) as $($mcpHealth.database.current_user)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  Degraded: $($mcpHealth.error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Not responding" -ForegroundColor Red
    Write-Host "      Start with: node scripts/fastmcp-server.mjs" -ForegroundColor Yellow
    $allHealthy = $false
}
Write-Host ""

# 3. Qdrant Collection
Write-Host "📊 Qdrant Collection" -ForegroundColor Cyan
$QDRANT_URL = $env:QDRANT_URL ?? "http://localhost:6333"
$COLLECTION = $env:QDRANT_COLLECTION ?? "phase76_knowledge_base"
try {
    $qdrantHealth = Invoke-RestMethod -Uri "$QDRANT_URL/health" -Method GET -TimeoutSec 3
    Write-Host "   ✅ Qdrant: healthy" -ForegroundColor Green

    try {
        $collInfo = Invoke-RestMethod -Uri "$QDRANT_URL/collections/$COLLECTION" -Method GET
        $pointCount = $collInfo.result.points_count
        Write-Host "      Collection: $COLLECTION" -ForegroundColor Gray
        Write-Host "      Points: $pointCount" -ForegroundColor Gray

        if ($pointCount -lt 100) {
            Write-Host "      ⚠️  Low point count - consider running ingestion" -ForegroundColor Yellow
        } elseif ($pointCount -lt 1000) {
            Write-Host "      ⚠️  Partial ingestion - run phase88-quick-start.ps1" -ForegroundColor Yellow
        } else {
            Write-Host "      ✅ Well-populated KB" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ⚠️  Collection not found: $COLLECTION" -ForegroundColor Yellow
        Write-Host "      Run: .\scripts\phase88-quick-start.ps1" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Qdrant unreachable: $QDRANT_URL" -ForegroundColor Red
    Write-Host "      Start with: docker start qdrant" -ForegroundColor Yellow
    $allHealthy = $false
}
Write-Host ""

# 4. PostgreSQL Connection
Write-Host "🗄️  PostgreSQL" -ForegroundColor Cyan
$PG_URL = $env:DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5434/legal"
Write-Host "   Connection: $($PG_URL -replace ':[^:@]+@', ':***@')" -ForegroundColor Gray
try {
    $pgTest = Invoke-RestMethod -Uri "http://localhost:3002/health" -Method GET -TimeoutSec 3
    if ($pgTest.database) {
        Write-Host "   ✅ Connected: $($pgTest.database.current_database)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Connection details unavailable" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Cannot verify (FastMCP not running)" -ForegroundColor Yellow
}
Write-Host ""

# 5. Svelte Docs Availability
Write-Host "📚 Svelte Documentation" -ForegroundColor Cyan
$svelteTxtPath = "sveltekit-frontend\data\svelte-docs\svelte.txt"
$svelteKitTxtPath = "sveltekit-frontend\data\svelte-docs\sveltekit.txt"

if (Test-Path $svelteTxtPath) {
    $svelteSize = [math]::Round((Get-Item $svelteTxtPath).Length / 1KB, 2)
    Write-Host "   ✅ svelte.txt: $svelteSize KB" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  svelte.txt not found" -ForegroundColor Yellow
    Write-Host "      Download with: node scripts/phase76-knowledge-builder.mjs --force-download" -ForegroundColor Yellow
}

if (Test-Path $svelteKitTxtPath) {
    $svelteKitSize = [math]::Round((Get-Item $svelteKitTxtPath).Length / 1KB, 2)
    Write-Host "   ✅ sveltekit.txt: $svelteKitSize KB" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  sveltekit.txt not found" -ForegroundColor Yellow
}
Write-Host ""

# 6. Test knowledge_retrieve Tool
Write-Host "🧪 Testing knowledge_retrieve Tool" -ForegroundColor Cyan
try {
    $testBody = @{
        name = 'knowledge_retrieve'
        arguments = @{
            query = 'Svelte 5 runes'
            limit = 3
            threshold = 0.5
        }
    } | ConvertTo-Json -Depth 10

    $testResponse = Invoke-RestMethod -Uri "http://localhost:3002/function-call" `
        -Method POST `
        -Body $testBody `
        -ContentType 'application/json' `
        -TimeoutSec 10

    if ($testResponse.contexts) {
        Write-Host "   ✅ Tool working: $($testResponse.contexts.Count) results" -ForegroundColor Green
        Write-Host "      Method: $($testResponse.retrieval_method)" -ForegroundColor Gray
    } elseif ($testResponse.results) {
        Write-Host "   ✅ Tool working: $($testResponse.results.Count) results (fallback format)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Tool returned unexpected format" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Tool test failed: $($_.Exception.Message)" -ForegroundColor Red
    $allHealthy = $false
}
Write-Host ""

# 7. Test Svelte Docs Search (if Knowledge Plane running)
Write-Host "📖 Testing Svelte Docs Search" -ForegroundColor Cyan
try {
    $docsBody = @{
        query = 'runes $state'
        context_lines = 3
    } | ConvertTo-Json

    $docsResponse = Invoke-RestMethod -Uri "http://localhost:8792/svelte/docs/search" `
        -Method POST `
        -Body $docsBody `
        -ContentType 'application/json' `
        -TimeoutSec 10

    if ($docsResponse.results) {
        Write-Host "   ✅ Search working: $($docsResponse.results.Count) results" -ForegroundColor Green
        Write-Host "      Response time: $($docsResponse.response_time_ms)ms" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Search returned no results" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Svelte docs search unavailable (Knowledge Plane not running)" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "================================================" -ForegroundColor Cyan
if ($allHealthy) {
    Write-Host "✅ All critical services healthy!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Test autonomous agent:" -ForegroundColor Gray
    Write-Host "      node scripts/phase86-autonomous-loop.mjs" -ForegroundColor White
    Write-Host ""
    Write-Host "   2. Run KB verification:" -ForegroundColor Gray
    Write-Host "      .\scripts\phase88-verify-kb.ps1 -Quick" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "⚠️  Some services are not running" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Quick fixes:" -ForegroundColor Cyan
    Write-Host "   - Start all services: .\start-phase87.ps1" -ForegroundColor Gray
    Write-Host "   - Or start individually (see messages above)" -ForegroundColor Gray
    Write-Host ""
}

exit $(if ($allHealthy) { 0 } else { 1 })
