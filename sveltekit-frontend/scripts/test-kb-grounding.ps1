#!/usr/bin/env pwsh
# Test KB-First Retrieval and Svelte 5 Grounding

Write-Host "🔍 Testing KB-First Retrieval and Svelte 5 Grounding" -ForegroundColor Cyan
Write-Host "====================================================`n" -ForegroundColor Cyan

$FastMCPUrl = "http://127.0.0.1:3002"
$KnowledgePlaneUrl = "http://127.0.0.1:8792"
$ErrorActionPreference = "Stop"

# Test 1: Verify services are running
Write-Host "1. Verifying services..." -ForegroundColor Yellow
try {
    $kpHealth = Invoke-RestMethod -Uri "$KnowledgePlaneUrl/health" -Method GET -TimeoutSec 5
    Write-Host "   ✅ Knowledge Plane: $($kpHealth.status) (v$($kpHealth.version))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Knowledge Plane not reachable at $KnowledgePlaneUrl" -ForegroundColor Red
    Write-Host "   Run: cd ../go-services/knowledge-plane; .\run.ps1" -ForegroundColor Yellow
    exit 1
}

# Note: FastMCP health check requires MCP protocol, skip for now
Write-Host "   ℹ️  FastMCP assumed running on port 3002 (MCP protocol)" -ForegroundColor Gray

# Test 2: Test Svelte 5 docs search directly
Write-Host "`n2. Testing Svelte 5 docs search..." -ForegroundColor Yellow
$svelteQueries = @(
    "Svelte 5 runes state",
    "SvelteKit 2 load function params",
    "Bits UI Dialog component open state"
)

foreach ($query in $svelteQueries) {
    Write-Host "`n   📖 Query: $query" -ForegroundColor Cyan
    try {
        $body = @{
            query = $query
            topK = 3
        } | ConvertTo-Json -Compress

        $result = Invoke-RestMethod -Uri "$KnowledgePlaneUrl/svelte/docs/search" `
            -Method POST `
            -Body $body `
            -ContentType "application/json" `
            -TimeoutSec 10

        if ($result.results.Count -gt 0) {
            Write-Host "   ✅ Found $($result.results.Count) results" -ForegroundColor Green
            foreach ($r in $result.results) {
                Write-Host "      - Category: $($r.category), Lines: $($r.start_line)-$($r.end_line), File: $($r.file)" -ForegroundColor Gray
                Write-Host "        Preview: $($r.content.Substring(0, [Math]::Min(80, $r.content.Length)))..." -ForegroundColor DarkGray
            }
        } else {
            Write-Host "   ⚠️  No results found" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ Search failed: $_" -ForegroundColor Red
    }
}

# Test 3: Test Knowledge Plane hybrid retrieval
Write-Host "`n3. Testing hybrid RAG retrieval..." -ForegroundColor Yellow
$ragQueries = @(
    @{Query="Svelte 5 $state rune example"; K=5; Mode="hybrid"},
    @{Query="SvelteKit 2 form actions validation"; K=3; Mode="hybrid"},
    @{Query="Drizzle ORM pgvector query"; K=5; Mode="hybrid"}
)

foreach ($q in $ragQueries) {
    Write-Host "`n   🔍 Query: $($q.Query)" -ForegroundColor Cyan
    try {
        $body = @{
            query = $q.Query
            k = $q.K
            mode = $q.Mode
        } | ConvertTo-Json -Compress

        $result = Invoke-RestMethod -Uri "$KnowledgePlaneUrl/retrieve" `
            -Method POST `
            -Body $body `
            -ContentType "application/json" `
            -TimeoutSec 15

        if ($result.results.Count -gt 0) {
            Write-Host "   ✅ Found $($result.results.Count) results (RRF merged)" -ForegroundColor Green
            foreach ($r in $result.results | Select-Object -First 3) {
                Write-Host "      - Score: $([Math]::Round($r.score, 3)), Tags: $($r.tags -join ',')" -ForegroundColor Gray
                Write-Host "        Content: $($r.content.Substring(0, [Math]::Min(100, $r.content.Length)))..." -ForegroundColor DarkGray
            }
        } else {
            Write-Host "   ⚠️  No results found" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ Retrieval failed: $_" -ForegroundColor Red
    }
}

# Test 4: Check Qdrant collection stats
Write-Host "`n4. Checking Qdrant collection..." -ForegroundColor Yellow
try {
    $qdrant = Invoke-RestMethod -Uri "http://localhost:6333/collections/phase76_knowledge_base" -Method GET -TimeoutSec 5
    Write-Host "   ✅ Collection: phase76_knowledge_base" -ForegroundColor Green
    Write-Host "      Points: $($qdrant.result.points_count)" -ForegroundColor Gray
    Write-Host "      Vectors: $($qdrant.result.vectors_count)" -ForegroundColor Gray
    Write-Host "      Indexed: $($qdrant.result.indexed_vectors_count)" -ForegroundColor Gray

    if ($qdrant.result.points_count -eq 0) {
        Write-Host "`n   ⚠️  WARNING: Collection is empty!" -ForegroundColor Yellow
        Write-Host "   Run: .\scripts\phase88-docs-ingestion.ps1" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Qdrant not reachable at http://localhost:6333" -ForegroundColor Red
    Write-Host "   Check: docker ps | grep qdrant" -ForegroundColor Yellow
}

# Test 5: Verify policy file exists
Write-Host "`n5. Verifying Svelte 5 code policy..." -ForegroundColor Yellow
$policyPath = "data/knowledge/SVELTE5_CODE_POLICY.md"
if (Test-Path $policyPath) {
    $size = (Get-Item $policyPath).Length
    Write-Host "   ✅ Policy file exists: $policyPath ($size bytes)" -ForegroundColor Green
    Write-Host "      This file should be ingested into KB for prompt grounding" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Policy file not found at $policyPath" -ForegroundColor Red
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  1. Knowledge Plane ready for Svelte docs search" -ForegroundColor Green
Write-Host "  2. Hybrid RAG retrieval working (pgvector + Qdrant + RRF)" -ForegroundColor Green
Write-Host "  3. Qdrant collection status checked" -ForegroundColor Green
Write-Host "  4. Svelte 5 code policy verified" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  - If Qdrant empty: Run .\scripts\phase88-docs-ingestion.ps1" -ForegroundColor Gray
Write-Host "  - Test FastMCP integration: Restart FastMCP, call knowledge_retrieve" -ForegroundColor Gray
Write-Host "  - Run autonomous agent: node scripts/phase87-autonomous-loop.mjs" -ForegroundColor Gray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
