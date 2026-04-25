#!/usr/bin/env pwsh
# Phase 89: CUDA-Accelerated System Verification
# Checks: Docker, CUDA, PyTorch, Qdrant, CouchDB, Neo4j, PostgreSQL

Write-Host "`n🚀 Phase 89: CUDA-Accelerated System Verification`n" -ForegroundColor Cyan
Write-Host "="*70

$allGood = $true

# ============================================================
# 1. Docker Containers
# ============================================================
Write-Host "`n1️⃣  Checking Docker containers..." -ForegroundColor Yellow

$requiredContainers = @(
    @{Name="phase66-postgres"; Port=5434; Service="PostgreSQL"},
    @{Name="phase66-couchdb"; Port=5984; Service="CouchDB"},
    @{Name="phase66-redis"; Port=6379; Service="Redis"},
    @{Name="ollama-gemma"; Port=11434; Service="Ollama"}
)

foreach ($container in $requiredContainers) {
    $status = docker ps --filter "name=$($container.Name)" --format "{{.Status}}" 2>$null
    if ($status) {
        Write-Host "   ✅ $($container.Service) ($($container.Name)) - $status" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($container.Service) ($($container.Name)) - NOT RUNNING" -ForegroundColor Red
        Write-Host "      Start: docker start $($container.Name)" -ForegroundColor Gray
        $allGood = $false
    }
}

# Check Neo4j (optional)
$neo4jStatus = docker ps --filter "name=neo4j" --format "{{.Status}}" 2>$null
if ($neo4jStatus) {
    Write-Host "   ✅ Neo4j (optional) - $neo4jStatus" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Neo4j (optional) - NOT RUNNING (will be created on first use)" -ForegroundColor Yellow
}

# ============================================================
# 2. CUDA/GPU Check
# ============================================================
Write-Host "`n2️⃣  Checking CUDA/GPU..." -ForegroundColor Yellow

try {
    $gpuInfo = nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>$null
    if ($gpuInfo) {
        Write-Host "   ✅ NVIDIA GPU detected: $gpuInfo" -ForegroundColor Green

        # Check GPU utilization
        $gpuUtil = nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>$null
        Write-Host "      Current GPU utilization: $gpuUtil%" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  nvidia-smi not found - CUDA may not be available" -ForegroundColor Yellow
        Write-Host "      Pipeline will fall back to CPU (slower)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  nvidia-smi not found - CUDA may not be available" -ForegroundColor Yellow
}

# ============================================================
# 3. PyTorch CUDA Check
# ============================================================
Write-Host "`n3️⃣  Checking PyTorch CUDA support..." -ForegroundColor Yellow

$pythonPath = if ($env:PHASE72_PYTHON) { $env:PHASE72_PYTHON } else { "python" }

try {
    $cudaCheck = & $pythonPath -c "import torch; print(f'{torch.cuda.is_available()}|{torch.cuda.device_count() if torch.cuda.is_available() else 0}|{torch.version.cuda if torch.cuda.is_available() else \"N/A\"}')" 2>$null

    if ($cudaCheck) {
        $parts = $cudaCheck.Split('|')
        $cudaAvailable = $parts[0]
        $deviceCount = $parts[1]
        $cudaVersion = $parts[2]

        if ($cudaAvailable -eq "True") {
            Write-Host "   ✅ PyTorch CUDA available" -ForegroundColor Green
            Write-Host "      CUDA version: $cudaVersion" -ForegroundColor Gray
            Write-Host "      GPU devices: $deviceCount" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  PyTorch installed but CUDA not available" -ForegroundColor Yellow
            Write-Host "      Install: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ⚠️  PyTorch not installed or Python not found" -ForegroundColor Yellow
    Write-Host "      Install: pip install torch torch-geometric" -ForegroundColor Gray
}

# ============================================================
# 4. Ollama Models
# ============================================================
Write-Host "`n4️⃣  Checking Ollama models..." -ForegroundColor Yellow

try {
    $models = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction SilentlyContinue

    $requiredModels = @("embeddinggemma:latest", "gemma3-legal:latest")
    $foundModels = $models.models | ForEach-Object { $_.name }

    foreach ($model in $requiredModels) {
        if ($foundModels -contains $model) {
            $modelInfo = $models.models | Where-Object { $_.name -eq $model }
            $sizeMB = [math]::Round($modelInfo.size / 1MB, 1)
            Write-Host "   ✅ $model ($sizeMB MB)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $model - NOT FOUND" -ForegroundColor Red
            Write-Host "      Pull: docker exec ollama-gemma ollama pull $model" -ForegroundColor Gray
            $allGood = $false
        }
    }
} catch {
    Write-Host "   ❌ Cannot connect to Ollama" -ForegroundColor Red
    Write-Host "      Check: docker ps --filter name=ollama" -ForegroundColor Gray
    $allGood = $false
}

# ============================================================
# 5. Qdrant Collections
# ============================================================
Write-Host "`n5️⃣  Checking Qdrant collections..." -ForegroundColor Yellow

try {
    $collections = Invoke-RestMethod -Uri "http://localhost:6333/collections" -TimeoutSec 5

    $requiredCollections = @("phase89_error_chunks", "phase89_learning_patterns", "phase89_app_topology")
    $existingCollections = $collections.result.collections | ForEach-Object { $_.name }

    foreach ($coll in $requiredCollections) {
        if ($existingCollections -contains $coll) {
            $collInfo = Invoke-RestMethod -Uri "http://localhost:6333/collections/$coll"
            $points = $collInfo.result.points_count
            Write-Host "   ✅ $coll ($points points)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  $coll - NOT FOUND (will be created on first run)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ❌ Cannot connect to Qdrant" -ForegroundColor Red
    Write-Host "      Check: docker ps --filter name=qdrant" -ForegroundColor Gray
    $allGood = $false
}

# ============================================================
# 6. CouchDB Views
# ============================================================
Write-Host "`n6️⃣  Checking CouchDB MapReduce views..." -ForegroundColor Yellow

try {
    $couchAuth = "admin:password"
    $couchAuthB64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($couchAuth))

    # Check database exists
    $dbs = Invoke-RestMethod -Uri "http://localhost:5984/_all_dbs" -Headers @{Authorization="Basic $couchAuthB64"} -TimeoutSec 5

    if ($dbs -contains "error_graph") {
        Write-Host "   ✅ error_graph database exists" -ForegroundColor Green

        # Check design doc
        try {
            $designDoc = Invoke-RestMethod -Uri "http://localhost:5984/error_graph/_design/error_analysis" -Headers @{Authorization="Basic $couchAuthB64"} -TimeoutSec 5
            $views = $designDoc.views.PSObject.Properties.Name
            Write-Host "      Views: $($views -join ', ')" -ForegroundColor Gray
        } catch {
            Write-Host "   ⚠️  MapReduce views NOT FOUND (will be created on first run)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  error_graph database NOT FOUND (will be created on first run)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Cannot connect to CouchDB" -ForegroundColor Red
    Write-Host "      Check: docker ps --filter name=couchdb" -ForegroundColor Gray
    $allGood = $false
}

# ============================================================
# 7. PostgreSQL Schema
# ============================================================
Write-Host "`n7️⃣  Checking PostgreSQL schema..." -ForegroundColor Yellow

try {
    $errorCount = docker exec phase66-postgres psql -U user -d legal -t -c "SELECT COUNT(*) FROM raw_error_embeddings WHERE source = 'svelte-check'" 2>&1 | Select-String "\d+" | ForEach-Object { $_.Matches.Value }

    if ($errorCount) {
        Write-Host "   ✅ raw_error_embeddings table exists ($errorCount errors)" -ForegroundColor Green

        if ([int]$errorCount -lt 100) {
            Write-Host "      ⚠️  Low error count - run svelte-check to populate" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ❌ raw_error_embeddings table NOT FOUND" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host "   ❌ Cannot query PostgreSQL" -ForegroundColor Red
    $allGood = $false
}

# ============================================================
# 8. Neo4j Graph (Optional)
# ============================================================
Write-Host "`n8️⃣  Checking Neo4j graph (optional)..." -ForegroundColor Yellow

try {
    $neo4jUrl = "http://localhost:7474/db/data/"
    $neo4jAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("neo4j:password"))

    $neo4jInfo = Invoke-RestMethod -Uri $neo4jUrl -Headers @{Authorization="Basic $neo4jAuth"} -TimeoutSec 5 -ErrorAction SilentlyContinue

    if ($neo4jInfo) {
        Write-Host "   ✅ Neo4j reachable (version: $($neo4jInfo.neo4j_version))" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Neo4j not reachable (optional - will start on first use)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Neo4j not available (optional - graph features disabled)" -ForegroundColor Yellow
    Write-Host "      Start: docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest" -ForegroundColor Gray
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n"
Write-Host "="*70
Write-Host "`n📊 Verification Summary`n" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "✅ All critical systems ready!" -ForegroundColor Green
    Write-Host "`nNext step:" -ForegroundColor Yellow
    Write-Host "   node scripts/phase89-cuda-accelerated-pipeline.mjs`n" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Some systems need attention (see above)" -ForegroundColor Yellow
    Write-Host "`nStart missing containers:" -ForegroundColor Yellow
    Write-Host "   cd ../go-services/knowledge-plane" -ForegroundColor Gray
    Write-Host "   .\run-safe.ps1`n" -ForegroundColor Gray
}

Write-Host "Performance Configuration:" -ForegroundColor Cyan
Write-Host "   CUDA Batch Size: 32 chunks" -ForegroundColor Gray
Write-Host "   Parallel Requests: 16" -ForegroundColor Gray
Write-Host "   Target Time: <15 minutes" -ForegroundColor Gray
Write-Host "   HNSW Config: m=48, ef_construct=200" -ForegroundColor Gray
Write-Host "   Quantization: 8-bit scalar" -ForegroundColor Gray

Write-Host "`n✅ Verification complete!`n" -ForegroundColor Green
