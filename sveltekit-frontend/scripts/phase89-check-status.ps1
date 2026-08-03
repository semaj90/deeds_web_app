#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: Comprehensive Status Checker

.DESCRIPTION
    Displays current status of all Phase 89 components:
    - Error embeddings progress
    - Top-K index build progress
    - Redis cache statistics
    - Agentic fixer results
#>

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 Phase 89: Comprehensive Status Check" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

# ============================================================
# 1. Error Embeddings Status
# ============================================================
Write-Host "1️⃣  Error Embeddings Status" -ForegroundColor Yellow

try {
    $embedStats = docker exec phase66-postgres psql -U user -d legal -t -c @"
SELECT
    source,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded,
    ROUND(COUNT(*) FILTER (WHERE embedding IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 1) as pct
FROM raw_error_embeddings
GROUP BY source
ORDER BY source
"@ 2>&1

    if ($embedStats -match "\w") {
        Write-Host $embedStats
    } else {
        Write-Host "   ⚠️  No embedding data found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Failed to query embeddings: $_" -ForegroundColor Red
}

# ============================================================
# 2. Top-K Index Status
# ============================================================
Write-Host "`n2️⃣  Top-K Inverse Index Status" -ForegroundColor Yellow

try {
    $indexStats = docker exec phase66-postgres psql -U user -d legal -t -c @"
SELECT
    COUNT(DISTINCT error_id) as indexed_errors,
    COUNT(*) as total_relationships,
    ROUND(AVG(similarity)::numeric, 4) as avg_similarity,
    COUNT(*) FILTER (WHERE source_match) as same_source_matches,
    ROUND(COUNT(*) FILTER (WHERE source_match)::numeric / COUNT(*)::numeric * 100, 1) as same_source_pct
FROM error_topk_index
"@ 2>&1

    if ($indexStats -match "\d") {
        $parts = $indexStats -split '\|'
        if ($parts.Count -ge 5) {
            Write-Host "   Indexed Errors:        $($parts[0].Trim())" -ForegroundColor Green
            Write-Host "   Total Relationships:   $($parts[1].Trim())" -ForegroundColor Green
            Write-Host "   Avg Similarity:        $($parts[2].Trim())" -ForegroundColor Green
            Write-Host "   Same-Source Matches:   $($parts[3].Trim()) ($($parts[4].Trim())%)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Index is empty or building" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  No index data found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Failed to query index: $_" -ForegroundColor Red
}

# ============================================================
# 3. Redis Cache Status
# ============================================================
Write-Host "`n3️⃣  Redis Cache Status" -ForegroundColor Yellow

try {
    $totalKeys = docker exec phase66-redis redis-cli DBSIZE 2>&1

    if ($totalKeys -match "(\d+)") {
        $keyCount = $Matches[1]
        Write-Host "   Total Keys:            $keyCount" -ForegroundColor Green

        # Count different key types
        $embKeys = docker exec phase66-redis redis-cli KEYS "emb:*" 2>&1 | Measure-Object -Line | Select-Object -ExpandProperty Lines
        $fixKeys = docker exec phase66-redis redis-cli KEYS "fix:*" 2>&1 | Measure-Object -Line | Select-Object -ExpandProperty Lines
        $topkKeys = docker exec phase66-redis redis-cli KEYS "topk:*" 2>&1 | Measure-Object -Line | Select-Object -ExpandProperty Lines

        Write-Host "   Embedding Cache:       $embKeys keys" -ForegroundColor Cyan
        Write-Host "   Fix Cache:             $fixKeys keys" -ForegroundColor Cyan
        Write-Host "   Top-K Cache:           $topkKeys keys" -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ❌ Failed to query Redis: $_" -ForegroundColor Red
}

# ============================================================
# 4. Top Error Codes
# ============================================================
Write-Host "`n4️⃣  Top 10 Error Codes" -ForegroundColor Yellow

try {
    $topErrors = docker exec phase66-postgres psql -U user -d legal -t -c @"
SELECT
    SUBSTRING(raw_text FROM 'TS\d+') as error_code,
    COUNT(*) as count
FROM raw_error_embeddings
WHERE raw_text ~ 'TS\d+'
GROUP BY error_code
ORDER BY count DESC
LIMIT 10
"@ 2>&1

    if ($topErrors -match "\w") {
        Write-Host $topErrors
    }
} catch {
    Write-Host "   ❌ Failed to query errors: $_" -ForegroundColor Red
}

# ============================================================
# 5. System Health
# ============================================================
Write-Host "`n5️⃣  System Health" -ForegroundColor Yellow

$services = @(
    @{Name="phase66-postgres"; Port=5434},
    @{Name="phase66-redis"; Port=6379}
)

foreach ($svc in $services) {
    $status = docker ps --filter "name=$($svc.Name)" --format "{{.Status}}" 2>&1
    if ($status -match "Up") {
        Write-Host "   ✅ $($svc.Name.PadRight(20)) $status" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($svc.Name.PadRight(20)) NOT RUNNING" -ForegroundColor Red
    }
}

Write-Host "`n6️⃣  Phase 89 llama-server" -ForegroundColor Yellow
try {
    $models = Invoke-RestMethod -Uri "http://127.0.0.1:8090/v1/models" -Method GET -TimeoutSec 3
    $modelId = if ($models.data -and $models.data.Count -gt 0) { $models.data[0].id } else { '(no models reported)' }
    Write-Host "   ✅ llama-server :8090 READY ($modelId)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ llama-server :8090 NOT READY" -ForegroundColor Red
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📈 Next Steps:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

Write-Host "Run agentic fixer on top error code:" -ForegroundColor Yellow
Write-Host "  node scripts/phase89-agentic-fixer.mjs --error-code TS1005 --limit 50`n" -ForegroundColor White

Write-Host "Query similar errors:" -ForegroundColor Yellow
Write-Host "  node scripts/phase89-similarity-ranker.mjs `"TS1005 brace errors`"`n" -ForegroundColor White

Write-Host "Build more neighbors (if index incomplete):" -ForegroundColor Yellow
Write-Host "  node scripts/phase89-build-topk-index.mjs 20`n" -ForegroundColor White

Write-Host "✅ Status check complete!`n" -ForegroundColor Green
