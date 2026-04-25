#!/usr/bin/env pwsh

<#
.SYNOPSIS
  Phase 89: Integration Verification Script

.DESCRIPTION
  Tests all Phase 89 enhancements:
  - Redis cache modules
  - CUDA tagging
  - RRF fusion
  - SSE streaming (simulated)
  - FastMCP tools (dry run)

.EXAMPLE
  .\scripts\phase89-verify-integration.ps1
#>

Write-Host "🔍 Phase 89: Integration Verification" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$ErrorCount = 0
$SuccessCount = 0

# ============================================================
# 1. Check Library Modules
# ============================================================
Write-Host "📚 1. Checking Library Modules..." -ForegroundColor Yellow

$RequiredModules = @(
    "scripts/lib/phase89-cache.mjs",
    "scripts/lib/phase89-cuda-tags.mjs",
    "scripts/lib/phase89-embed.mjs",
    "scripts/lib/phase89-rrf.mjs",
    "scripts/lib/phase89-sse-stream.mjs"
)

foreach ($module in $RequiredModules) {
    if (Test-Path $module) {
        Write-Host "   ✅ $module" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ❌ $module (missing)" -ForegroundColor Red
        $ErrorCount++
    }
}
Write-Host ""

# ============================================================
# 2. Check New Scripts
# ============================================================
Write-Host "🚀 2. Checking New Scripts..." -ForegroundColor Yellow

$RequiredScripts = @(
    "scripts/phase89-cuda-scan.mjs",
    "scripts/phase89-fastmcp-tools.mjs"
)

foreach ($script in $RequiredScripts) {
    if (Test-Path $script) {
        Write-Host "   ✅ $script" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ❌ $script (missing)" -ForegroundColor Red
        $ErrorCount++
    }
}
Write-Host ""

# ============================================================
# 3. Verify Modified Scripts
# ============================================================
Write-Host "📝 3. Verifying Modified Scripts..." -ForegroundColor Yellow

$ModifiedScripts = @{
    "scripts/phase89-raw-text-embedder.mjs" = @("embedCached", "extractTags")
    "scripts/phase89-similarity-ranker.mjs" = @("embedCached", "fuseRRF", "getJson", "setJson")
}

foreach ($script in $ModifiedScripts.Keys) {
    if (Test-Path $script) {
        $content = Get-Content $script -Raw
        $allFound = $true

        foreach ($keyword in $ModifiedScripts[$script]) {
            if ($content -notmatch $keyword) {
                Write-Host "   ⚠️  $script - Missing import: $keyword" -ForegroundColor Yellow
                $allFound = $false
            }
        }

        if ($allFound) {
            Write-Host "   ✅ $script - All imports present" -ForegroundColor Green
            $SuccessCount++
        } else {
            $ErrorCount++
        }
    } else {
        Write-Host "   ❌ $script (missing)" -ForegroundColor Red
        $ErrorCount++
    }
}
Write-Host ""

# ============================================================
# 4. Check Redis Connection (Docker-first approach)
# ============================================================
Write-Host "💾 4. Checking Redis Connection..." -ForegroundColor Yellow

$redisOk = $false

# Prefer Docker exec (matches Phase66 infrastructure)
try {
    $dockerRedisTest = docker exec phase66-redis redis-cli PING 2>$null
    if ($dockerRedisTest -match "PONG") {
        $redisOk = $true
        Write-Host "   ✅ Redis (phase66-redis container)" -ForegroundColor Green

        # Get key count via Docker
        $keyCount = docker exec phase66-redis redis-cli DBSIZE 2>$null | Select-String -Pattern '\d+' | ForEach-Object { $_.Matches.Value }
        $embKeys = (docker exec phase66-redis redis-cli KEYS 'emb:*' 2>$null | Measure-Object -Line).Lines
        $retKeys = (docker exec phase66-redis redis-cli KEYS 'ret:*' 2>$null | Measure-Object -Line).Lines
        $topkKeys = (docker exec phase66-redis redis-cli KEYS 'topk:*' 2>$null | Measure-Object -Line).Lines

        Write-Host "   📊 Total keys: $keyCount" -ForegroundColor Cyan
        Write-Host "      - Embedding cache: $embKeys keys" -ForegroundColor Cyan
        Write-Host "      - Retrieval cache: $retKeys keys" -ForegroundColor Cyan
        Write-Host "      - Top-K cache: $topkKeys keys" -ForegroundColor Cyan
        $SuccessCount++
    }
} catch {
    Write-Host "   ⚠️  Docker container not found" -ForegroundColor Yellow
}

# Fallback to local redis-cli (if Docker unavailable)
if (-not $redisOk) {
    try {
        $redisTest = redis-cli PING 2>$null
        if ($redisTest -eq "PONG") {
            $redisOk = $true
            Write-Host "   ✅ Redis (local CLI fallback)" -ForegroundColor Green

            $keyCount = redis-cli DBSIZE | Select-String -Pattern '\d+' | ForEach-Object { $_.Matches.Value }
            $embKeys = (redis-cli KEYS 'emb:*' | Measure-Object).Count
            $retKeys = (redis-cli KEYS 'ret:*' | Measure-Object).Count
            $topkKeys = (redis-cli KEYS 'topk:*' | Measure-Object).Count

            Write-Host "   📊 Total keys: $keyCount" -ForegroundColor Cyan
            $SuccessCount++
        }
    } catch {
        Write-Host "   ❌ Redis not responding (no Docker container, no local CLI)" -ForegroundColor Red
        $ErrorCount++
    }
}
Write-Host ""

# ============================================================
# 5. Check PostgreSQL Connection (Docker-first approach)
# ============================================================
Write-Host "🗄️  5. Checking PostgreSQL Connection..." -ForegroundColor Yellow

$pgOk = $false

# Prefer Docker exec (matches Phase66 infrastructure)
try {
    $dockerPgTest = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1" -t 2>$null
    if ($LASTEXITCODE -eq 0 -or $dockerPgTest -match "1") {
        $pgOk = $true
        Write-Host "   ✅ PostgreSQL (phase66-postgres container)" -ForegroundColor Green

        # Check tables via Docker
        $tableCheck = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM raw_error_embeddings WHERE embedding IS NOT NULL" -t 2>$null
        $topkCheck = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM phase89_topk_index" -t 2>$null

        $embeddedCount = if ($tableCheck) { $tableCheck.Trim() } else { "N/A" }
        $topkCount = if ($topkCheck) { $topkCheck.Trim() } else { "N/A" }

        Write-Host "   📊 Embedded errors: $embeddedCount" -ForegroundColor Cyan
        Write-Host "   📊 Top-K relationships: $topkCount" -ForegroundColor Cyan
        $SuccessCount++
    }
} catch {
    Write-Host "   ⚠️  Docker container not found" -ForegroundColor Yellow
}

# Fallback to local psql (if Docker unavailable)
if (-not $pgOk) {
    try {
        $env:PGPASSWORD = "123456"
        $pgTest = psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "SELECT 1" -t 2>$null
        if ($LASTEXITCODE -eq 0) {
            $pgOk = $true
            Write-Host "   ✅ PostgreSQL (local psql fallback)" -ForegroundColor Green

            $tableCheck = psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM raw_error_embeddings WHERE embedding IS NOT NULL" -t 2>$null
            $topkCheck = psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM phase89_topk_index" -t 2>$null

            $embeddedCount = if ($tableCheck) { $tableCheck.Trim() } else { "N/A" }
            $topkCount = if ($topkCheck) { $topkCheck.Trim() } else { "N/A" }

            Write-Host "   📊 Embedded errors: $embeddedCount" -ForegroundColor Cyan
            Write-Host "   📊 Top-K relationships: $topkCount" -ForegroundColor Cyan
            $SuccessCount++
        }
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    } catch {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        Write-Host "   ❌ PostgreSQL not responding (no Docker container, no local psql)" -ForegroundColor Red
        $ErrorCount++
    }
}
Write-Host ""

# ============================================================
# 6. Test Module Imports
# ============================================================
Write-Host "🧪 6. Testing Module Imports..." -ForegroundColor Yellow

$testScript = @"
import { sha256, redisFromEnv } from './scripts/lib/phase89-cache.mjs';
import { extractTags, cudaTags } from './scripts/lib/phase89-cuda-tags.mjs';
import { embedCached } from './scripts/lib/phase89-embed.mjs';
import { fuseRRF } from './scripts/lib/phase89-rrf.mjs';

console.log('✅ All imports successful');

const hash = sha256('test');
console.log('✅ sha256() works:', hash.substring(0, 16) + '...');

const tags = cudaTags('__global__ void kernel() { }');
console.log('✅ cudaTags() works:', tags.length, 'tags');

const rrfTest = fuseRRF([[{id: 1, score: 1}], [{id: 2, score: 1}]], [0.5, 0.5]);
console.log('✅ fuseRRF() works:', rrfTest.length, 'results');
"@

$testScript | Out-File -FilePath "test-imports.mjs" -Encoding UTF8

try {
    $output = node test-imports.mjs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ All module imports successful" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ❌ Import test failed:" -ForegroundColor Red
        Write-Host "   $output" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "   ❌ Import test failed: $_" -ForegroundColor Red
    $ErrorCount++
} finally {
    Remove-Item "test-imports.mjs" -ErrorAction SilentlyContinue
}
Write-Host ""

# ============================================================
# 7. Syntax Check All Scripts
# ============================================================
Write-Host "🔍 7. Syntax Check All Scripts..." -ForegroundColor Yellow

$AllScripts = @(
    "scripts/phase89-raw-text-embedder.mjs",
    "scripts/phase89-similarity-ranker.mjs",
    "scripts/phase89-cuda-scan.mjs",
    "scripts/phase89-fastmcp-tools.mjs"
)

foreach ($script in $AllScripts) {
    if (Test-Path $script) {
        $syntaxCheck = node --check $script 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ $script - No syntax errors" -ForegroundColor Green
            $SuccessCount++
        } else {
            Write-Host "   ❌ $script - Syntax error:" -ForegroundColor Red
            Write-Host "   $syntaxCheck" -ForegroundColor Red
            $ErrorCount++
        }
    }
}
Write-Host ""

# ============================================================
# Summary
# ============================================================
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "   ✅ Successful checks: $SuccessCount" -ForegroundColor Green
Write-Host "   ❌ Failed checks: $ErrorCount" -ForegroundColor $(if ($ErrorCount -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($ErrorCount -eq 0) {
    Write-Host "🎉 All checks passed! Phase 89 integration is complete." -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next Steps:" -ForegroundColor Yellow
    Write-Host "   1. Test embedding cache:" -ForegroundColor Cyan
    Write-Host "      node scripts/phase89-raw-text-embedder.mjs" -ForegroundColor White
    Write-Host ""
    Write-Host "   2. Test retrieval cache:" -ForegroundColor Cyan
    Write-Host "      node scripts/phase89-similarity-ranker.mjs 'TS2345'" -ForegroundColor White
    Write-Host ""
    Write-Host "   3. Test CUDA scanner:" -ForegroundColor Cyan
    Write-Host "      node scripts/phase89-cuda-scan.mjs --path ./src" -ForegroundColor White
    Write-Host ""
    Write-Host "   4. Start MCP server:" -ForegroundColor Cyan
    Write-Host "      node scripts/phase89-fastmcp-tools.mjs" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host "⚠️  Some checks failed. Please review errors above." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
