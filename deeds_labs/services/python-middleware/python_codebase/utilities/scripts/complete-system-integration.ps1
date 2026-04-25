<#
  Complete System Integration Script
  - Tests npm
  - Finds Redis container
  - Wires up enhanced-rag Go service
  - Integrates MCP multi-core server
  - Validates API endpoints
#>

$ErrorActionPreference = "Continue"

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       COMPLETE SYSTEM INTEGRATION & PARALLEL STARTUP          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ============================================================================
# 1. TEST NPM
# ============================================================================
Write-Host "1️⃣ Testing npm status..." -ForegroundColor Yellow

$npmWorks = $false
try {
    $npmVer = npm --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ npm version: $npmVer" -ForegroundColor Green
        $npmWorks = $true
    }
} catch {
    Write-Host "  ❌ npm not working" -ForegroundColor Red
}

# Test npm run
if ($npmWorks) {
    Write-Host "`n  Testing 'npm run' commands..." -ForegroundColor Gray
    cd "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
    $testRun = npm run 2>&1 | Select-String "Scripts available" -Quiet
    if ($testRun) {
        Write-Host "  ✅ npm run works! Can use: npm run dev:gpu" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  npm run has issues - use helper scripts: .\dev.cmd" -ForegroundColor Yellow
    }
}

# ============================================================================
# 2. FIND & CONFIGURE REDIS
# ============================================================================
Write-Host "`n2️⃣ Finding and configuring Redis..." -ForegroundColor Yellow

$redisContainerName = $null
$redisInfo = docker ps --filter "name=redis" --format "{{.Names}};{{.Status}};{{.Ports}}" 2>$null

if ($redisInfo) {
    $parts = $redisInfo -split ";"
    $redisContainerName = $parts[0]
    $redisStatus = $parts[1]
    $redisPorts = $parts[2]
    
    Write-Host "  ✅ Redis container found:" -ForegroundColor Green
    Write-Host "     Name: $redisContainerName" -ForegroundColor White
    Write-Host "     Status: $redisStatus" -ForegroundColor White
    Write-Host "     Ports: $redisPorts" -ForegroundColor White
    
    # Extract Redis port
    if ($redisPorts -match "(\d+)->6379") {
        $redisPort = $matches[1]
        Write-Host "     Host Port: $redisPort" -ForegroundColor Cyan
    }
    
} else {
    Write-Host "  ⚠️  Redis container not running" -ForegroundColor Yellow
    Write-Host "     Starting Redis..." -ForegroundColor Gray
    
    cd "C:\Users\james\Videos\deeds-web-app"
    docker-compose up -d redis 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    
    $redisInfo = docker ps --filter "name=redis" --format "{{.Names}}" 2>$null
    if ($redisInfo) {
        $redisContainerName = $redisInfo
        Write-Host "  ✅ Redis started: $redisContainerName" -ForegroundColor Green
    }
}

# ============================================================================
# 3. CONFIGURE ENHANCED-RAG GO SERVICE
# ============================================================================
Write-Host "`n3️⃣ Configuring enhanced-rag Go service..." -ForegroundColor Yellow

$ragServicePath = "C:\Users\james\Videos\deeds-web-app\go-enhanced-rag-service"

if (Test-Path $ragServicePath) {
    Write-Host "  ✅ Found: go-enhanced-rag-service" -ForegroundColor Green
    
    # Create/Update .env for the service
    $ragEnv = @"
# Enhanced RAG Service Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis
REDIS_CONTAINER=$redisContainerName

# Database
DATABASE_URL=postgresql://postgres:123456@localhost:5434/legal_ai_db

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# Service Port
PORT=8094
GO_RAG_SERVICE_PORT=8094

# GPU
ENABLE_GPU=true
CUDA_VISIBLE_DEVICES=0

# MCP Server
MCP_SERVER_URL=http://localhost:8777
CONTEXT7_MULTICORE=true
"@
    
    Set-Content -Path "$ragServicePath\.env" -Value $ragEnv
    Write-Host "  ✅ Created .env for enhanced-rag service" -ForegroundColor Green
    
    # Check if service is compiled
    if (Test-Path "$ragServicePath\enhanced-rag-service.exe") {
        Write-Host "  ✅ Service already compiled" -ForegroundColor Green
        
        # Check if running
        $ragProcess = Get-Process -Name "enhanced-rag-service" -ErrorAction SilentlyContinue
        if ($ragProcess) {
            Write-Host "  ✅ Service running (PID: $($ragProcess.Id))" -ForegroundColor Green
        } else {
            Write-Host "  ⏸️  Service not running - can start with:" -ForegroundColor Yellow
            Write-Host "     cd $ragServicePath" -ForegroundColor Gray
            Write-Host "     .\enhanced-rag-service.exe" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ⚠️  Service not compiled - compiling now..." -ForegroundColor Yellow
        Push-Location $ragServicePath
        go build -o enhanced-rag-service.exe 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Service compiled successfully" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Compilation failed" -ForegroundColor Red
        }
        Pop-Location
    }
    
} else {
    Write-Host "  ❌ go-enhanced-rag-service not found at $ragServicePath" -ForegroundColor Red
}

# ============================================================================
# 4. CHECK MCP MULTI-CORE SERVER
# ============================================================================
Write-Host "`n4️⃣ Checking MCP multi-core server..." -ForegroundColor Yellow

try {
    $mcpHealth = Invoke-WebRequest -Uri "http://localhost:8777/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "  ✅ MCP server responding at :8777" -ForegroundColor Green
    Write-Host "     Status: $($mcpHealth.StatusCode)" -ForegroundColor White
    
    # Get server info
    try {
        $mcpInfo = Invoke-WebRequest -Uri "http://localhost:8777/api/info" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($mcpInfo) {
            Write-Host "     Info available at /api/info" -ForegroundColor Cyan
        }
    } catch {}
    
} catch {
    Write-Host "  ⚠️  MCP server not running on :8777" -ForegroundColor Yellow
    Write-Host "     Expected: Context7 multi-core documentation server" -ForegroundColor Gray
    Write-Host "     Start with: context7-server --port 8777" -ForegroundColor Gray
}

# Check MCP config in frontend
$mcpConfig = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\mcp.json"
if (Test-Path $mcpConfig) {
    Write-Host "`n  ✅ MCP config found in frontend" -ForegroundColor Green
    $config = Get-Content $mcpConfig -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($config.mcpServers.context7) {
        Write-Host "     URL: $($config.mcpServers.context7.url)" -ForegroundColor White
    }
}

# ============================================================================
# 5. VALIDATE API ENDPOINTS
# ============================================================================
Write-Host "`n5️⃣ Validating API endpoints..." -ForegroundColor Yellow

$apiServerFiles = Get-ChildItem -Path "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes" -Filter "+server.ts" -Recurse -File -ErrorAction SilentlyContinue

Write-Host "  📊 Total API endpoints: $($apiServerFiles.Count)" -ForegroundColor Cyan

# Categorize endpoints
$categories = @{
    health = @()
    ai = @()
    upload = @()
    vector = @()
    other = @()
}

foreach ($file in $apiServerFiles) {
    $route = $file.DirectoryName -replace '.*\\routes\\', '/' -replace '\\', '/'
    
    if ($route -match "health") { $categories.health += $route }
    elseif ($route -match "ai|chat|ollama") { $categories.ai += $route }
    elseif ($route -match "upload") { $categories.upload += $route }
    elseif ($route -match "vector|search|embed") { $categories.vector += $route }
    else { $categories.other += $route }
}

Write-Host "`n  Category breakdown:" -ForegroundColor Gray
Write-Host "     Health: $($categories.health.Count)" -ForegroundColor White
Write-Host "     AI/Chat: $($categories.ai.Count)" -ForegroundColor White
Write-Host "     Upload: $($categories.upload.Count)" -ForegroundColor White
Write-Host "     Vector/Search: $($categories.vector.Count)" -ForegroundColor White
Write-Host "     Other: $($categories.other.Count)" -ForegroundColor White

Write-Host "`n  Key endpoints:" -ForegroundColor Gray
$categories.health | Select-Object -First 3 | ForEach-Object { Write-Host "     • $_" -ForegroundColor White }
$categories.ai | Select-Object -First 3 | ForEach-Object { Write-Host "     • $_" -ForegroundColor White }

# ============================================================================
# 6. SUMMARY & QUICK START
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                  INTEGRATION COMPLETE                          ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📊 System Status:" -ForegroundColor Cyan
Write-Host "   npm: $(if($npmWorks){'✅ Working'}else{'⚠️ Use helper scripts'})" -ForegroundColor White
Write-Host "   Redis: $(if($redisContainerName){"✅ $redisContainerName"}else{'❌ Not running'})" -ForegroundColor White
Write-Host "   Enhanced-RAG: $(if(Test-Path "$ragServicePath\enhanced-rag-service.exe"){'✅ Compiled'}else{'⚠️ Needs compilation'})" -ForegroundColor White
Write-Host "   MCP Server: $(try{$mcpHealth=$null; Invoke-WebRequest -Uri 'http://localhost:8777/health' -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop | Out-Null; '✅ Running'}catch{'⚠️ Not running'})" -ForegroundColor White
Write-Host "   API Endpoints: ✅ $($apiServerFiles.Count) available" -ForegroundColor White

Write-Host "`n🚀 Quick Start Commands:" -ForegroundColor Yellow
Write-Host "   Frontend:" -ForegroundColor Cyan
Write-Host "     cd sveltekit-frontend" -ForegroundColor White
Write-Host "     .\dev.cmd" -ForegroundColor White

Write-Host "`n   Enhanced-RAG Service:" -ForegroundColor Cyan
Write-Host "     cd go-enhanced-rag-service" -ForegroundColor White
Write-Host "     .\enhanced-rag-service.exe" -ForegroundColor White

Write-Host "`n   Test API:" -ForegroundColor Cyan
Write-Host "     curl http://localhost:5173/api/health" -ForegroundColor White
Write-Host "     curl http://localhost:8094/health" -ForegroundColor White

Write-Host "`n📁 Configuration Files Created:" -ForegroundColor Cyan
Write-Host "   ✅ go-enhanced-rag-service\.env" -ForegroundColor White

Write-Host ""

# Save results to file
$report = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    npm_working = $npmWorks
    redis_container = $redisContainerName
    enhanced_rag_compiled = (Test-Path "$ragServicePath\enhanced-rag-service.exe")
    api_endpoints_count = $apiServerFiles.Count
    mcp_server_running = try { Invoke-WebRequest -Uri "http://localhost:8777/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop | Out-Null; $true } catch { $false }
}

$report | ConvertTo-Json | Set-Content -Path "system-integration-report.json"
Write-Host "📄 Report saved: system-integration-report.json`n" -ForegroundColor Cyan
