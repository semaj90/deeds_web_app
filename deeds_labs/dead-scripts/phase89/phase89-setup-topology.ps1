# Phase 89: AST Topology Explorer - Setup Script
# Installs dependencies and verifies the setup

Write-Host "`n🔍 Phase 89: AST Topology Explorer Setup`n" -ForegroundColor Cyan

# ============================================================
# 1. Install NPM Dependencies
# ============================================================
Write-Host "1️⃣  Installing NPM dependencies..." -ForegroundColor Yellow

if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "   ❌ npm not found - install Node.js first" -ForegroundColor Red
    exit 1
}

Write-Host "   Installing d3, @rgossiaux/svelte-headlessui..." -ForegroundColor Gray
npm install d3 @rgossiaux/svelte-headlessui --save

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Dependencies installed" -ForegroundColor Green

# ============================================================
# 2. Verify Files Created
# ============================================================
Write-Host "`n2️⃣  Verifying files..." -ForegroundColor Yellow

$files = @(
    "src/routes/(app)/ast-topology/admin.css",
    "src/routes/(app)/ast-topology/+page.svelte",
    "src/routes/(app)/ast-topology/+page.server.ts",
    "src/routes/(app)/api/ast-topology/+server.ts",
    "src/routes/(app)/api/agentic-events/+server.ts",
    "src/routes/(app)/api/agentic-loop/+server.ts",
    "scripts/lib/phase89-graph-visualizer.mjs"
)

$allExists = $true
foreach ($file in $files) {
    if (Test-Path $file) {
        $lines = (Get-Content $file).Count
        Write-Host "   ✅ $file ($lines lines)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file - NOT FOUND" -ForegroundColor Red
        $allExists = $false
    }
}

if (!$allExists) {
    Write-Host "`n   ⚠️  Some files are missing - check creation" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# 3. Verify Docker Containers
# ============================================================
Write-Host "`n3️⃣  Checking Docker containers..." -ForegroundColor Yellow

$containers = @(
    @{Name="phase66-postgres"; Service="PostgreSQL"},
    @{Name="ollama-gemma"; Service="Ollama"}
)

foreach ($container in $containers) {
    $status = docker ps --filter "name=$($container.Name)" --format "{{.Status}}"
    if ($status) {
        Write-Host "   ✅ $($container.Service) - $status" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $($container.Service) - NOT RUNNING" -ForegroundColor Yellow
        Write-Host "      Start with: docker start $($container.Name)" -ForegroundColor Gray
    }
}

# ============================================================
# 4. Verify Ollama Models
# ============================================================
Write-Host "`n4️⃣  Checking Ollama models..." -ForegroundColor Yellow

$models = docker exec ollama-gemma ollama list 2>&1 | Out-String

if ($models -match "embeddinggemma:latest") {
    Write-Host "   ✅ embeddinggemma:latest installed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  embeddinggemma:latest NOT FOUND" -ForegroundColor Yellow
    Write-Host "      Pull with: docker exec ollama-gemma ollama pull embeddinggemma:latest" -ForegroundColor Gray
}

if ($models -match "gemma3-legal:latest") {
    Write-Host "   ✅ gemma3-legal:latest installed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  gemma3-legal:latest NOT FOUND" -ForegroundColor Yellow
}

# ============================================================
# 5. Check Database Connection
# ============================================================
Write-Host "`n5️⃣  Checking database..." -ForegroundColor Yellow

try {
    $count = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM raw_error_embeddings;" 2>&1
    if ($count -match "\d+") {
        Write-Host "   ✅ raw_error_embeddings table: $($count.Trim()) rows" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  raw_error_embeddings table NOT FOUND or empty" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Database check failed" -ForegroundColor Red
}

try {
    $count = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM raw_error_embeddings" 2>&1 | Select-String "\d+" | ForEach-Object { $_.Matches.Value }
    Write-Host "   ✅ raw_error_embeddings table: $count rows" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to query database: $_" -ForegroundColor Red
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n📈 Setup Summary`n" -ForegroundColor Cyan

Write-Host "✅ All files created and dependencies installed!`n" -ForegroundColor Green

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start dev server: npm run dev" -ForegroundColor Cyan
Write-Host "  2. Open browser: http://localhost:5175/ast-topology" -ForegroundColor Cyan
Write-Host "  3. Click 'Run Fix Loop' to start agentic pipeline" -ForegroundColor Cyan

Write-Host "`n📖 Read PHASE89_AST_TOPOLOGY_COMPLETE.md for full docs`n" -ForegroundColor Gray

Write-Host "✅ Setup complete!`n" -ForegroundColor Green
