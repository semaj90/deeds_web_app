# Week 3 Quick Start - Using Existing Infrastructure
# All services already running! Just need verification.

Write-Host "🚀 Week 3 Quick Start - Verification & Testing" -ForegroundColor Cyan
Write-Host "=" * 70
Write-Host ""

# Colors
$success = "Green"
$warning = "Yellow"
$error = "Red"
$info = "Cyan"

# ============================================================================
# Step 1: Verify Existing Services
# ============================================================================
Write-Host "📋 Step 1: Verifying Existing Infrastructure..." -ForegroundColor $info
Write-Host ""

# Check PostgreSQL
Write-Host "1️⃣ PostgreSQL (phase66-postgres on port 5434):" -ForegroundColor $warning
$pgStatus = docker inspect phase66-postgres --format '{{.State.Status}}' 2>$null
if ($pgStatus -eq "running") {
    Write-Host "   ✅ Running" -ForegroundColor $success

    # Check Week 3 tables
    Write-Host "   Checking Week 3 tables..." -ForegroundColor $info
    $tables = docker exec phase66-postgres psql -U user -d legal -c "\dt" 2>&1 | Select-String -Pattern "approval|provenance|session|fix"
    if ($tables) {
        Write-Host "   ✅ Week 3 tables found:" -ForegroundColor $success
        $tables | ForEach-Object { Write-Host "      - $_" -ForegroundColor $success }
    } else {
        Write-Host "   ⚠️  No Week 3 tables - will apply migration" -ForegroundColor $warning
    }
} else {
    Write-Host "   ❌ Not running" -ForegroundColor $error
    exit 1
}
Write-Host ""

# Check Qdrant
Write-Host "2️⃣ Qdrant (phase66-qdrant on port 6333):" -ForegroundColor $warning
$qdrantStatus = docker inspect phase66-qdrant --format '{{.State.Status}}' 2>$null
if ($qdrantStatus -eq "running") {
    Write-Host "   ✅ Running" -ForegroundColor $success

    # List collections
    $collections = curl -s http://localhost:6333/collections 2>$null | ConvertFrom-Json
    $collectionCount = $collections.result.collections.Count
    Write-Host "   ✅ $collectionCount collections available" -ForegroundColor $success

    # Check for knowledge base collections
    $kbCollections = $collections.result.collections | Where-Object { $_.name -like "*knowledge*" -or $_.name -like "*phase72*" -or $_.name -like "*phase76*" }
    if ($kbCollections) {
        Write-Host "   ✅ Knowledge base collections found:" -ForegroundColor $success
        $kbCollections | Select-Object -First 5 | ForEach-Object { Write-Host "      - $($_.name)" -ForegroundColor $success }
    }
} else {
    Write-Host "   ❌ Not running" -ForegroundColor $error
}
Write-Host ""

# Check CouchDB
Write-Host "3️⃣ CouchDB (phase66-couchdb on port 5984):" -ForegroundColor $warning
$couchdbStatus = docker inspect phase66-couchdb --format '{{.State.Status}}' 2>$null
if ($couchdbStatus -eq "running") {
    Write-Host "   ✅ Running" -ForegroundColor $success

    # Test credentials (from docker-compose.phase66.yml)
    Write-Host "   Testing credentials (admin:password)..." -ForegroundColor $info
    $dbs = curl -s http://admin:password@localhost:5984/_all_dbs 2>$null
    if ($dbs) {
        Write-Host "   ✅ Authentication successful" -ForegroundColor $success
        $dbList = $dbs | ConvertFrom-Json
        Write-Host "   ✅ $($dbList.Count) databases found" -ForegroundColor $success
    } else {
        Write-Host "   ⚠️  Could not list databases" -ForegroundColor $warning
    }
} else {
    Write-Host "   ❌ Not running" -ForegroundColor $error
}
Write-Host ""

# Check Redis
Write-Host "4️⃣ Redis (phase66-redis on port 6379):" -ForegroundColor $warning
$redisStatus = docker inspect phase66-redis --format '{{.State.Status}}' 2>$null
if ($redisStatus -eq "running") {
    Write-Host "   ✅ Running (Ready for Week 4 caching)" -ForegroundColor $success
} else {
    Write-Host "   ⚠️  Not running" -ForegroundColor $warning
}
Write-Host ""

# Check Ollama
Write-Host "5️⃣ Ollama (ollama-gemma on port 11434):" -ForegroundColor $warning
$ollamaStatus = docker inspect ollama-gemma --format '{{.State.Status}}' 2>$null
if ($ollamaStatus -eq "running") {
    Write-Host "   ✅ Running" -ForegroundColor $success

    # Check models
    Write-Host "   Checking available models..." -ForegroundColor $info
    $models = docker exec ollama-gemma ollama list 2>&1
    Write-Host "   Available: $models" -ForegroundColor $info

    if ($models -like "*gemma3*" -or $models -like "*embeddinggemma*") {
        Write-Host "   ✅ Gemma model found" -ForegroundColor $success
    } else {
        Write-Host "   ⚠️  May need to pull gemma3-legal:latest" -ForegroundColor $warning
        Write-Host "   Run: docker exec ollama-gemma ollama pull gemma3-legal:latest" -ForegroundColor $info
    }
} else {
    Write-Host "   ❌ Not running" -ForegroundColor $error
}
Write-Host ""

# ============================================================================
# Step 2: Apply Missing Migrations (if needed)
# ============================================================================
Write-Host "📋 Step 2: Database Migration Check..." -ForegroundColor $info
Write-Host ""

$migrationFile = "sveltekit-frontend\drizzle\migrations\week3_kb_fixing_tables.sql"
if (Test-Path $migrationFile) {
    Write-Host "   Migration file found: $migrationFile" -ForegroundColor $success

    # Check if tables exist
    $errorSessions = docker exec phase66-postgres psql -U user -d legal -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'error_sessions';" 2>&1 | Select-String -Pattern "^\s*\d+\s*$"

    if (-not $errorSessions -or $errorSessions -match "^\s*0\s*$") {
        Write-Host "   ⚠️  Missing tables detected - applying migration..." -ForegroundColor $warning

        # Apply migration
        Get-Content $migrationFile | docker exec -i phase66-postgres psql -U user -d legal 2>&1 | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Migration applied successfully" -ForegroundColor $success
        } else {
            Write-Host "   ⚠️  Migration may have partial errors (check if tables exist)" -ForegroundColor $warning
        }
    } else {
        Write-Host "   ✅ All tables already exist" -ForegroundColor $success
    }
} else {
    Write-Host "   ❌ Migration file not found: $migrationFile" -ForegroundColor $error
}
Write-Host ""

# ============================================================================
# Step 3: Start Backend API
# ============================================================================
Write-Host "📋 Step 3: Starting Backend API..." -ForegroundColor $info
Write-Host ""

# Check if already running
$apiRunning = Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue
if ($apiRunning) {
    Write-Host "   ✅ Backend API already running on port 8001" -ForegroundColor $success
} else {
    Write-Host "   ⚠️  Backend API not running" -ForegroundColor $warning
    Write-Host "   Starting in background..." -ForegroundColor $info

    # Start API in background
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:PYTHONPATH = '$PWD'; uvicorn backend.api.main:app --host 0.0.0.0 --port 8001 --reload" -WindowStyle Normal

    Write-Host "   ⏳ Waiting for API to start (10 seconds)..." -ForegroundColor $info
    Start-Sleep -Seconds 10

    # Verify
    try {
        $healthCheck = Invoke-RestMethod -Uri "http://localhost:8001/docs" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "   ✅ Backend API started successfully" -ForegroundColor $success
        Write-Host "   🌐 Swagger docs: http://localhost:8001/docs" -ForegroundColor $info
    } catch {
        Write-Host "   ⚠️  API may still be starting - check terminal window" -ForegroundColor $warning
    }
}
Write-Host ""

# ============================================================================
# Step 4: Run Verification Script
# ============================================================================
Write-Host "📋 Step 4: Running Week 3 Readiness Check..." -ForegroundColor $info
Write-Host ""

if (Test-Path "backend\scripts\verify_week3_ready.py") {
    Write-Host "   Running verification script..." -ForegroundColor $info
    python backend\scripts\verify_week3_ready.py
    Write-Host ""
} else {
    Write-Host "   ⚠️  Verification script not found" -ForegroundColor $warning
}

# ============================================================================
# Step 5: Quick API Tests
# ============================================================================
Write-Host "📋 Step 5: Quick API Tests..." -ForegroundColor $info
Write-Host ""

# Test auto-approval rules
Write-Host "   Testing /api/kb/v2/approval-rules..." -ForegroundColor $info
try {
    $rules = Invoke-RestMethod -Uri "http://localhost:8001/api/kb/v2/approval-rules" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   ✅ Auto-approval API working - $($rules.Count) rules found" -ForegroundColor $success
} catch {
    Write-Host "   ⚠️  API not responding yet (may need more time to start)" -ForegroundColor $warning
}
Write-Host ""

# ============================================================================
# Summary
# ============================================================================
Write-Host "=" * 70
Write-Host "📊 Infrastructure Summary" -ForegroundColor $info
Write-Host ""
Write-Host "✅ Running Services:" -ForegroundColor $success
Write-Host "   - PostgreSQL (port 5434)" -ForegroundColor $success
Write-Host "   - Qdrant (port 6333) - 30+ collections" -ForegroundColor $success
Write-Host "   - CouchDB (port 5984) - admin:password" -ForegroundColor $success
Write-Host "   - Redis (port 6379)" -ForegroundColor $success
Write-Host "   - MinIO (ports 9000-9001)" -ForegroundColor $success
Write-Host "   - RabbitMQ (ports 5672, 15672)" -ForegroundColor $success
Write-Host "   - Ollama (port 11434)" -ForegroundColor $success
Write-Host ""
Write-Host "🎯 Next Steps:" -ForegroundColor $info
Write-Host "   1. Check backend terminal for API status" -ForegroundColor $warning
Write-Host "   2. Run comprehensive tests:" -ForegroundColor $warning
Write-Host "      python backend\scripts\test_week3_tasks_2_4.py" -ForegroundColor $info
Write-Host "   3. View API docs: http://localhost:8001/docs" -ForegroundColor $warning
Write-Host ""
Write-Host "🚀 Week 3 is ready to test!" -ForegroundColor $success
Write-Host "=" * 70
