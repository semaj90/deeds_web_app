#!/usr/bin/env pwsh
# Phase 89: Quick Status Check

Write-Host "`n🎯 Phase 89: Enhanced Embedding & Migration Status`n" -ForegroundColor Cyan
Write-Host "=" * 70

# 1. Check Indexer Process
Write-Host "`n1️⃣ Indexer Status:" -ForegroundColor Yellow
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $_.StartTime -and $_.StartTime -gt (Get-Date).AddHours(-2) }

if ($nodeProcs) {
    $oldest = $nodeProcs | Sort-Object StartTime | Select-Object -First 1
    $runtime = New-TimeSpan -Start $oldest.StartTime
    Write-Host "   ✅ Running ($($nodeProcs.Count) processes)" -ForegroundColor Green
    Write-Host "   Runtime: $($runtime.ToString('hh\:mm\:ss'))" -ForegroundColor White
} else {
    Write-Host "   ✅ Complete (or not running)" -ForegroundColor Green
}

# 2. Check Qdrant Collections
Write-Host "`n2️⃣ Qdrant Collections:" -ForegroundColor Yellow

$collections = @(
    "phase89_code_units",
    "phase89_code_chunks",
    "phase90_error_cards",
    "phase90_error_clusters"
)

foreach ($coll in $collections) {
    try {
        $url = "http://localhost:6333/collections/$coll"
        $response = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 3
        $count = $response.result.points_count
        $status = $response.result.status

        if ($count -gt 0) {
            Write-Host "   ✅ $coll`: $count points ($status)" -ForegroundColor Green
        } else {
            Write-Host "   ⏳ $coll`: Empty ($status)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ $coll`: Not found" -ForegroundColor Red
    }
}

# 3. Check Redis Cache
Write-Host "`n3️⃣ Redis Cache:" -ForegroundColor Yellow
try {
    $redisKeys = docker exec phase66-redis redis-cli DBSIZE 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Redis: $redisKeys keys" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Redis: Cannot connect" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Redis: Not accessible" -ForegroundColor Yellow
}

# 4. Check PostgreSQL
Write-Host "`n4️⃣ PostgreSQL:" -ForegroundColor Yellow
try {
    $pgCount = docker exec phase66-postgres psql -U user -d legal -t -c "SELECT COUNT(*) FROM phase89_unit_index;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ PostgreSQL: $($pgCount.Trim()) units indexed" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  PostgreSQL: Cannot query" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  PostgreSQL: Not accessible" -ForegroundColor Yellow
}

# 5. Check Available Tools
Write-Host "`n5️⃣ Migration Tools:" -ForegroundColor Yellow

$tools = @(
    @{Path="scripts/phase89-migration-query.mjs"; Name="Migration Query CLI"},
    @{Path="scripts/test-phase89-embedding.mjs"; Name="Embedding Test Suite"},
    @{Path="scripts/phase89-code-unit-indexer.mjs"; Name="Code Unit Indexer"}
)

foreach ($tool in $tools) {
    if (Test-Path $tool.Path) {
        Write-Host "   ✅ $($tool.Name)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($tool.Name) (missing)" -ForegroundColor Red
    }
}

# 6. Next Steps
Write-Host "`n" + "=" * 70
Write-Host "`n📋 Next Steps:`n" -ForegroundColor Cyan

if ($nodeProcs) {
    Write-Host "⏳ Indexing in progress. Wait for completion, then:" -ForegroundColor Yellow
} else {
    Write-Host "✅ Ready to query! Run:" -ForegroundColor Green
}

Write-Host "`n   # Find Svelte 4 → 5 migrations"
Write-Host "   node scripts/phase89-migration-query.mjs --svelte5`n"

Write-Host "   # Find Melt-UI → Bits-UI migrations"
Write-Host "   node scripts/phase89-migration-query.mjs --bits-ui`n"

Write-Host "   # Run all migration queries"
Write-Host "   node scripts/phase89-migration-query.mjs --all`n"

Write-Host "   # Test embedding system"
Write-Host "   node scripts/test-phase89-embedding.mjs`n"

Write-Host "=" * 70
Write-Host ""
