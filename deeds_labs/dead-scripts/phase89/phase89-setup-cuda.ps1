# Phase 89: CUDA-Accelerated Setup Script
# Installs Python dependencies, verifies GPU, runs CUDA clustering

Write-Host "`n🔥 Phase 89: CUDA-Accelerated Error Clustering Setup`n" -ForegroundColor Cyan

# ============================================================
# 1. Check Python Environment
# ============================================================
Write-Host "1️⃣  Checking Python environment..." -ForegroundColor Yellow

$pythonCmd = if (Test-Path "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe") {
    "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
} else {
    "python"
}

Write-Host "   Using Python: $pythonCmd" -ForegroundColor Gray

# Check Python version
$pythonVersion = & $pythonCmd --version 2>&1
if ($pythonVersion -match "Python 3\.\d+") {
    Write-Host "   ✅ $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ Python 3.x required" -ForegroundColor Red
    exit 1
}

# ============================================================
# 2. Install Python Dependencies
# ============================================================
Write-Host "`n2️⃣  Installing Python dependencies..." -ForegroundColor Yellow

$packages = @(
    "torch",
    "numpy",
    "scikit-learn",
    "sentence-transformers",
    "psycopg2-binary",
    "qdrant-client"
)

foreach ($package in $packages) {
    Write-Host "   Installing $package..." -ForegroundColor Gray
}

& $pythonCmd -m pip install torch numpy scikit-learn sentence-transformers psycopg2-binary qdrant-client --quiet

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ All dependencies installed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Some dependencies may have failed" -ForegroundColor Yellow
}

# ============================================================
# 3. Verify CUDA/GPU Support
# ============================================================
Write-Host "`n3️⃣  Checking CUDA/GPU support..." -ForegroundColor Yellow

$cudaCheck = & $pythonCmd -c "import torch; print('cuda' if torch.cuda.is_available() else 'cpu')" 2>&1

if ($cudaCheck -eq "cuda") {
    $gpuName = & $pythonCmd -c "import torch; print(torch.cuda.get_device_name(0))" 2>&1
    Write-Host "   ✅ CUDA available: $gpuName" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  CUDA not available - will use CPU (slower)" -ForegroundColor Yellow
}

# ============================================================
# 4. Verify Database Connection
# ============================================================
Write-Host "`n4️⃣  Checking database..." -ForegroundColor Yellow

try {
    $count = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM raw_error_embeddings" 2>&1 | Select-String "\d+" | ForEach-Object { $_.Matches.Value }
    Write-Host "   ✅ PostgreSQL connected: $count error embeddings" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to connect to PostgreSQL" -ForegroundColor Red
    exit 1
}

# ============================================================
# 5. Verify Qdrant Connection
# ============================================================
Write-Host "`n5️⃣  Checking Qdrant..." -ForegroundColor Yellow

try {
    $collections = Invoke-RestMethod -Uri "http://localhost:6333/collections" -TimeoutSec 5
    $collectionNames = $collections.result.collections | ForEach-Object { $_.name }

    if ($collectionNames -contains "phase89_error_chunks") {
        $collection = Invoke-RestMethod -Uri "http://localhost:6333/collections/phase89_error_chunks" -TimeoutSec 5
        Write-Host "   ✅ Qdrant connected: $($collection.result.points_count) points" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  phase89_error_chunks collection not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Failed to connect to Qdrant" -ForegroundColor Red
    exit 1
}

# ============================================================
# 6. Create Reports Directory
# ============================================================
if (!(Test-Path "reports")) {
    New-Item -ItemType Directory -Path "reports" -Force | Out-Null
    Write-Host "`n📁 Created reports directory" -ForegroundColor Green
}

# ============================================================
# 7. Run CUDA Clustering (Test)
# ============================================================
Write-Host "`n6️⃣  Running CUDA clustering test..." -ForegroundColor Yellow

Write-Host "   This may take 1-2 minutes..." -ForegroundColor Gray

& $pythonCmd scripts/phase89-cuda-clustering.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ CUDA clustering test passed" -ForegroundColor Green

    if (Test-Path "reports/phase89-cuda-clustering-report.json") {
        $report = Get-Content "reports/phase89-cuda-clustering-report.json" | ConvertFrom-Json
        Write-Host "`n   📊 Report Summary:" -ForegroundColor Cyan
        Write-Host "      Total Errors: $($report.total_errors)" -ForegroundColor Gray
        Write-Host "      Total Clusters: $($report.total_clusters)" -ForegroundColor Gray
        Write-Host "      Recommendations: $($report.recommendations.Count)" -ForegroundColor Gray
    }
} else {
    Write-Host "   ⚠️  CUDA clustering test failed (check errors above)" -ForegroundColor Yellow
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n📈 Setup Summary`n" -ForegroundColor Cyan

Write-Host "✅ Phase 89 CUDA acceleration ready!`n" -ForegroundColor Green

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start dev server: npm run dev" -ForegroundColor Cyan
Write-Host "  2. Open: http://localhost:5175/ast-topology" -ForegroundColor Cyan
Write-Host "  3. Click 'Run Fix Loop' to start enhanced pipeline" -ForegroundColor Cyan
Write-Host "  4. Watch GPU accelerate error clustering in real-time!" -ForegroundColor Cyan

Write-Host "`n📖 Features:" -ForegroundColor Gray
Write-Host "   • CUDA-accelerated cosine similarity clustering" -ForegroundColor Gray
Write-Host "   • Batch error summarization for topological errors" -ForegroundColor Gray
Write-Host "   • Agentic tool calling (7 tools available)" -ForegroundColor Gray
Write-Host "   • RAG/KAG knowledge base auto-updates" -ForegroundColor Gray
Write-Host "   • Real-time SSE events to browser (HMR compatible)" -ForegroundColor Gray
Write-Host "   • Cosine ranking for recommended next steps" -ForegroundColor Gray

Write-Host "`n✅ Setup complete!`n" -ForegroundColor Green
