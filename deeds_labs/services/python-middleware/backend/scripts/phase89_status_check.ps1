# Phase 89: Complete System Status Check
# Verifies all infrastructure + fixes applied

Write-Host "🔍 Phase 89: Complete System Status" -ForegroundColor Cyan
Write-Host "=" * 70
Write-Host ""

$success = "Green"
$warning = "Yellow"
$error = "Red"
$checks_passed = 0
$total_checks = 10

# 1. Qdrant Collections
Write-Host "1️⃣ Qdrant Collections:" -ForegroundColor $warning
try {
    $collections = curl -s http://localhost:6333/collections | ConvertFrom-Json
    $phase89_collections = $collections.result.collections | Where-Object { $_.name -match "phase89|knowledge_base" }

    if ($phase89_collections.Count -ge 7) {
        Write-Host "   ✅ Found $($phase89_collections.Count) Phase 89 collections" -ForegroundColor $success
        $phase89_collections | Select-Object -First 5 | ForEach-Object {
            Write-Host "      - $($_.name)" -ForegroundColor $success
        }
        $checks_passed++
    } else {
        Write-Host "   ⚠️  Only $($phase89_collections.Count)/7 collections found" -ForegroundColor $warning
    }
} catch {
    Write-Host "   ❌ Qdrant not responding" -ForegroundColor $error
}
Write-Host ""

# 2. PostgreSQL Timeline Tables
Write-Host "2️⃣ PostgreSQL Timeline Tables:" -ForegroundColor $warning
try {
    $tables = docker exec phase66-postgres psql -U user -d legal -c "\dt phase89*" 2>&1 | Select-String -Pattern "phase89"

    if ($tables) {
        Write-Host "   ✅ Timeline tables created:" -ForegroundColor $success
        $tables | ForEach-Object { Write-Host "      $_" -ForegroundColor $success }
        $checks_passed++
    } else {
        Write-Host "   ⚠️  No phase89 tables found" -ForegroundColor $warning
    }
} catch {
    Write-Host "   ❌ PostgreSQL check failed" -ForegroundColor $error
}
Write-Host ""

# 3. CouchDB Access
Write-Host "3️⃣ CouchDB Authentication:" -ForegroundColor $warning
try {
    $dbs = curl -s http://admin:password@localhost:5984/_all_dbs | ConvertFrom-Json
    Write-Host "   ✅ Auth successful - $($dbs.Count) databases" -ForegroundColor $success
    $checks_passed++
} catch {
    Write-Host "   ❌ CouchDB auth failed" -ForegroundColor $error
}
Write-Host ""

# 4. Ollama Models
Write-Host "4️⃣ Ollama Models:" -ForegroundColor $warning
$models = docker exec ollama-gemma ollama list 2>&1
if ($models -match "gemma") {
    Write-Host "   ✅ Gemma model available" -ForegroundColor $success
    Write-Host "      $models" -ForegroundColor $success
    $checks_passed++
} else {
    Write-Host "   ⚠️  No Gemma model found" -ForegroundColor $warning
}
Write-Host ""

# 5. Redis
Write-Host "5️⃣ Redis Cache:" -ForegroundColor $warning
$redisStatus = docker inspect phase66-redis --format '{{.State.Status}}' 2>$null
if ($redisStatus -eq "running") {
    Write-Host "   ✅ Redis running" -ForegroundColor $success
    $checks_passed++
} else {
    Write-Host "   ❌ Redis not running" -ForegroundColor $error
}
Write-Host ""

# 6. Backend API
Write-Host "6️⃣ Backend API (port 8001):" -ForegroundColor $warning
try {
    $health = curl -s http://localhost:8001/health 2>&1 | ConvertFrom-Json
    if ($health.status -eq "healthy" -or $health.ok) {
        Write-Host "   ✅ API responding: $($health.service)" -ForegroundColor $success
        $checks_passed++
    } else {
        Write-Host "   ⚠️  API responded but not healthy" -ForegroundColor $warning
    }
} catch {
    Write-Host "   ⚠️  API not responding (may need restart)" -ForegroundColor $warning
}
Write-Host ""

# 7. Phase 89 Collections Status
Write-Host "7️⃣ Phase 89 Collection Stats:" -ForegroundColor $warning
$phase89_names = @("phase89_cache_index", "phase89_code_chunks", "phase89_error_chunks", "phase89_kb_cards", "phase89_timeline_cards")
$found_count = 0
foreach ($name in $phase89_names) {
    try {
        $info = curl -s http://localhost:6333/collections/$name 2>&1 | ConvertFrom-Json
        if ($info.result.points_count -ne $null) {
            $found_count++
        }
    } catch {}
}

if ($found_count -eq 5) {
    Write-Host "   ✅ All 5 Phase 89 core collections exist" -ForegroundColor $success
    $checks_passed++
} else {
    Write-Host "   ⚠️  Only $found_count/5 collections found" -ForegroundColor $warning
}
Write-Host ""

# 8. Week 3 Tables
Write-Host "8️⃣ Week 3 KB Fixing Tables:" -ForegroundColor $warning
$week3_tables = docker exec phase66-postgres psql -U user -d legal -c "\dt" 2>&1 | Select-String -Pattern "approval|provenance"
if ($week3_tables) {
    Write-Host "   ✅ Week 3 tables exist" -ForegroundColor $success
    $checks_passed++
} else {
    Write-Host "   ⚠️  Week 3 tables not found" -ForegroundColor $warning
}
Write-Host ""

# 9. UTF-8 Console Fix
Write-Host "9️⃣ Console Encoding:" -ForegroundColor $warning
if ($env:PYTHONIOENCODING -eq "utf-8" -or $env:PYTHONUTF8 -eq "1") {
    Write-Host "   ✅ Python UTF-8 mode enabled" -ForegroundColor $success
    $checks_passed++
} else {
    Write-Host "   ⚠️  UTF-8 not set (may cause emoji crashes)" -ForegroundColor $warning
    Write-Host "      Run: `$env:PYTHONUTF8='1'; `$env:PYTHONIOENCODING='utf-8'" -ForegroundColor $warning
}
Write-Host ""

# 10. Docker Services
Write-Host "🔟 Docker Services:" -ForegroundColor $warning
$phase66_services = docker ps --filter "name=phase66" --format "{{.Names}}" 2>$null
$running_count = ($phase66_services | Measure-Object).Count

if ($running_count -ge 6) {
    Write-Host "   ✅ $running_count Phase 66 services running" -ForegroundColor $success
    $checks_passed++
} else {
    Write-Host "   ⚠️  Only $running_count services running" -ForegroundColor $warning
}
Write-Host ""

# Summary
Write-Host "=" * 70
Write-Host "📊 System Status: $checks_passed/$total_checks checks passed" -ForegroundColor $(if ($checks_passed -ge 8) { $success } else { $warning })
Write-Host ""

if ($checks_passed -ge 8) {
    Write-Host "✅ READY FOR WEEK 3 TESTING!" -ForegroundColor $success
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor $warning
    Write-Host "  1. python backend/scripts/verify_week3_ready.py" -ForegroundColor $success
    Write-Host "  2. python backend/scripts/test_week3_tasks_2_4.py" -ForegroundColor $success
    Write-Host "  3. http://localhost:8001/docs (API documentation)" -ForegroundColor $success
} else {
    Write-Host "⚠️  Some checks failed - review above" -ForegroundColor $warning
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor $warning
    Write-Host "  - Restart API: uvicorn backend.api.main:app --port 8001 --reload" -ForegroundColor $success
    Write-Host "  - Set UTF-8: `$env:PYTHONUTF8='1'" -ForegroundColor $success
    Write-Host "  - Check logs: docker logs phase66-postgres" -ForegroundColor $success
}

Write-Host "=" * 70
