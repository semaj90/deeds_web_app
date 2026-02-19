<#
  Build & Run All Go Microservices with Environment-Aware Configuration
  -------------------------------------------------------------
  - Reads .env for PORTs, URLs, and service paths
  - Compiles Go binaries into ./bin/
  - Starts Redis (if required)
  - Launches each service and verifies /health endpoints
  - Consolidates all Go services with proper configuration
#>

param(
    [switch]$BuildOnly,
    [switch]$RunOnly,
    [switch]$HealthCheckOnly,
    [string[]]$Services
)

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app"
$binDir = "$root\bin"

# Create bin directory if it doesn't exist
if (!(Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
    Write-Host "✅ Created bin directory: $binDir" -ForegroundColor Green
}

# ============================================================================
# STEP 1: Load Environment Variables
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          GO MICROSERVICES BUILD & DEPLOYMENT SYSTEM            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "🔧 Step 1: Loading environment variables from .env..." -ForegroundColor Yellow
$envPath = "$root\.env"

if (!(Test-Path $envPath)) {
    Write-Host "❌ Missing .env file at $envPath" -ForegroundColor Red
    Write-Host "   Creating template .env file..." -ForegroundColor Yellow
    
    $templateEnv = @"
# Database Configuration
DATABASE_URL=postgresql://postgres:123456@localhost:5434/legal_ai_db
DB_HOST=localhost
DB_PORT=5434
DB_NAME=legal_ai_db
DB_USER=postgres
DB_PASSWORD=123456

# Redis Configuration
REDIS_URL=redis://:redis@localhost:6379/0
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis

# Ollama Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# Service Ports
GO_RAG_SERVICE_PORT=8094
LEGAL_ENGINE_PORT=8080
AUTH_SERVICE_PORT=8081
CUDA_SERVICE_PORT=8082

# GPU Configuration
GPU_ENABLED=true
CUDA_VISIBLE_DEVICES=0
"@
    
    Set-Content -Path $envPath -Value $templateEnv
    Write-Host "✅ Created template .env file" -ForegroundColor Green
}

# Parse and load .env
$envVars = @{}
Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim()
        $envVars[$key] = $val
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

Write-Host "`n✅ Environment loaded:" -ForegroundColor Green
Write-Host "  DATABASE_URL: $env:DATABASE_URL" -ForegroundColor White
Write-Host "  REDIS_URL: $env:REDIS_URL" -ForegroundColor White
Write-Host "  OLLAMA_URL: $env:OLLAMA_URL" -ForegroundColor White
Write-Host "  GPU_ENABLED: $env:GPU_ENABLED" -ForegroundColor White

# ============================================================================
# STEP 2: Check Dependencies
# ============================================================================
Write-Host "`n🔍 Step 2: Checking dependencies..." -ForegroundColor Yellow

# Check Go installation
try {
    $goVersion = go version 2>&1
    Write-Host "  ✅ Go: $goVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Go not found - install from https://go.dev/dl/" -ForegroundColor Red
    exit 1
}

# Check Redis
Write-Host "`n🧠 Checking Redis connection..." -ForegroundColor Gray
try {
    $redisHost = if ($env:REDIS_HOST) { $env:REDIS_HOST } else { "localhost" }
    $redisPort = if ($env:REDIS_PORT) { $env:REDIS_PORT } else { "6379" }
    
    $redisTest = Test-NetConnection -ComputerName $redisHost -Port $redisPort -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    if ($redisTest.TcpTestSucceeded) {
        Write-Host "  ✅ Redis reachable on ${redisHost}:${redisPort}" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Redis not reachable - starting via Docker..." -ForegroundColor Yellow
        docker-compose up -d redis 2>&1 | Out-Null
        Start-Sleep -Seconds 3
        Write-Host "  ✅ Redis started" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  Redis check failed - try 'docker-compose up -d redis'" -ForegroundColor Yellow
}

# Check Ollama
Write-Host "`n🤖 Checking Ollama connection..." -ForegroundColor Gray
try {
    $ollamaUrl = if ($env:OLLAMA_URL) { $env:OLLAMA_URL } else { "http://localhost:11434" }
    $ollamaTest = Invoke-WebRequest -Uri "$ollamaUrl/api/tags" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($ollamaTest.StatusCode -eq 200) {
        Write-Host "  ✅ Ollama reachable at $ollamaUrl" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Ollama not responding" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Ollama not available - GPU features may be limited" -ForegroundColor Yellow
}

# ============================================================================
# STEP 3: Define Services to Build
# ============================================================================
Write-Host "`n📦 Step 3: Defining Go services..." -ForegroundColor Yellow

# Production-ready services
$productionServices = @{
    # Core Infrastructure
    "auth-service" = @{ path = "cmd\auth-service"; port = 8081; critical = $true }
    "legal-gateway" = @{ path = "cmd\legal-gateway"; port = 8080; critical = $true }
    
    # GPU & Compute
    "cuda-service" = @{ path = "cmd\cuda-service"; port = 8082; critical = $true }
    "cuda-http-service" = @{ path = "cuda-http-service"; port = 8083; critical = $false }
    "cuda-search-service" = @{ path = "cuda-search-service"; port = 8084; critical = $false }
    "gpu-orchestrator" = @{ path = "cmd\gpu-orchestrator"; port = 8095; critical = $true }
    
    # RAG & AI
    "go-enhanced-rag-service" = @{ path = "go-enhanced-rag-service"; port = 8094; critical = $true }
    "unified-rag-service" = @{ path = "unified-rag-service"; port = 8096; critical = $false }
    "sse-rag-service" = @{ path = "sse-rag-service"; port = 8097; critical = $false }
    
    # Data Processing
    "vector-consumer-v2" = @{ path = "go-microservice\cmd\vector-consumer-v2"; port = 8098; critical = $false }
    "tensor-service" = @{ path = "go-microservice\tensor-service"; port = 8099; critical = $false }
    "upload-service" = @{ path = "go-microservice\cmd\upload-service"; port = 8100; critical = $true }
    "document-chunker" = @{ path = "document-chunker"; port = 8101; critical = $false }
    
    # Networking
    "multi-protocol-gateway" = @{ path = "go-microservice\cmd\multi-protocol-gateway"; port = 8102; critical = $false }
    "quic-nats-bridge" = @{ path = "quic-nats-bridge"; port = 8103; critical = $false }
    "nats-bridge-http" = @{ path = "nats-bridge-http"; port = 8104; critical = $false }
    
    # Monitoring
    "metrics-server" = @{ path = "cmd\metrics-server"; port = 9090; critical = $false }
    "load-tester" = @{ path = "load-tester"; port = 9091; critical = $false }
}

# Filter services if specific ones requested
if ($Services) {
    $servicesToBuild = @{}
    foreach ($svc in $Services) {
        if ($productionServices.ContainsKey($svc)) {
            $servicesToBuild[$svc] = $productionServices[$svc]
        }
    }
    if ($servicesToBuild.Count -eq 0) {
        Write-Host "❌ No matching services found: $($Services -join ', ')" -ForegroundColor Red
        exit 1
    }
} else {
    $servicesToBuild = $productionServices
}

Write-Host "  📋 Services to process: $($servicesToBuild.Count)" -ForegroundColor Cyan
foreach ($svc in $servicesToBuild.Keys) {
    $critical = if ($servicesToBuild[$svc].critical) { "CRITICAL" } else { "optional" }
    Write-Host "     • $svc [$critical]" -ForegroundColor $(if($productionServices[$svc].critical){'Green'}else{'Gray'})
}

# ============================================================================
# STEP 4: Build Services
# ============================================================================
if (!$RunOnly -and !$HealthCheckOnly) {
    Write-Host "`n🔨 Step 4: Building Go microservices..." -ForegroundColor Yellow
    Write-Host ("─" * 70) -ForegroundColor Gray

    $buildResults = @{
        success = 0
        failed = 0
        skipped = 0
    }

    foreach ($svc in $servicesToBuild.Keys) {
        $config = $servicesToBuild[$svc]
        $servicePath = Join-Path $root $config.path
        $exePath = Join-Path $binDir "$svc.exe"

        Write-Host "`n  🔨 Building: $svc" -ForegroundColor Cyan

        if (!(Test-Path $servicePath)) {
            Write-Host "     ⚠️  Skipping - path not found: $servicePath" -ForegroundColor Yellow
            $buildResults.skipped++
            continue
        }

        Push-Location $servicePath

        # Initialize go.mod if missing
        if (!(Test-Path "go.mod")) {
            Write-Host "     📝 Initializing go.mod..." -ForegroundColor Gray
            go mod init $svc 2>&1 | Out-Null
        }

        # Tidy dependencies
        Write-Host "     📥 Tidying dependencies..." -ForegroundColor Gray
        go mod tidy 2>&1 | Out-Null

        # Build with optimizations
        Write-Host "     🔧 Compiling..." -ForegroundColor Gray
        $buildOutput = go build -ldflags="-s -w" -o $exePath 2>&1

        if ($LASTEXITCODE -eq 0) {
            $size = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
            Write-Host "     ✅ Success! ($size MB) → $exePath" -ForegroundColor Green
            $buildResults.success++
        } else {
            Write-Host "     ❌ Build failed:" -ForegroundColor Red
            Write-Host "        $buildOutput" -ForegroundColor Gray
            $buildResults.failed++
        }

        Pop-Location
    }

    Write-Host "`n" -NoNewline
    Write-Host ("─" * 70) -ForegroundColor Gray
    Write-Host "`n  📊 Build Summary:" -ForegroundColor Cyan
    Write-Host "     ✅ Success: $($buildResults.success)" -ForegroundColor Green
    Write-Host "     ❌ Failed: $($buildResults.failed)" -ForegroundColor $(if($buildResults.failed -gt 0){'Red'}else{'Green'})
    Write-Host "     ⏭️  Skipped: $($buildResults.skipped)" -ForegroundColor Gray
}

# ============================================================================
# STEP 5: Run Services
# ============================================================================
if (!$BuildOnly -and !$HealthCheckOnly) {
    Write-Host "`n🚀 Step 5: Starting services..." -ForegroundColor Yellow
    Write-Host ("─" * 70) -ForegroundColor Gray

    $runningServices = @()

    foreach ($svc in $servicesToBuild.Keys) {
        $exePath = Join-Path $binDir "$svc.exe"

        if (!(Test-Path $exePath)) {
            Write-Host "  ⏭️  Skipping $svc (not built)" -ForegroundColor Gray
            continue
        }

        Write-Host "`n  ▶️  Starting: $svc" -ForegroundColor Cyan

        # Check if already running
        $existing = Get-Process -Name $svc -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "     ⚠️  Already running (PID: $($existing.Id))" -ForegroundColor Yellow
            $runningServices += $svc
            continue
        }

        # Start the service
        $port = $servicesToBuild[$svc].port
        $env:PORT = $port
        
        try {
            $process = Start-Process -FilePath $exePath -WorkingDirectory $binDir -PassThru -NoNewWindow
            Start-Sleep -Seconds 2

            if (!$process.HasExited) {
                Write-Host "     ✅ Started (PID: $($process.Id), Port: $port)" -ForegroundColor Green
                $runningServices += $svc
            } else {
                Write-Host "     ❌ Process exited immediately" -ForegroundColor Red
            }
        } catch {
            Write-Host "     ❌ Failed to start: $_" -ForegroundColor Red
        }
    }

    Write-Host "`n  📊 Services Running: $($runningServices.Count)/$($servicesToBuild.Count)" -ForegroundColor Cyan
}

# ============================================================================
# STEP 6: Health Checks
# ============================================================================
if (!$BuildOnly) {
    Write-Host "`n🏥 Step 6: Running health checks..." -ForegroundColor Yellow
    Write-Host ("─" * 70) -ForegroundColor Gray

    Start-Sleep -Seconds 3  # Give services time to start

    foreach ($svc in $servicesToBuild.Keys) {
        $port = $servicesToBuild[$svc].port
        $healthUrl = "http://localhost:$port/health"

        Write-Host "`n  🔍 Checking: $svc" -ForegroundColor Gray

        try {
            $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "     ✅ Healthy at $healthUrl" -ForegroundColor Green
            } else {
                Write-Host "     ⚠️  Status: $($response.StatusCode)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "     ❌ Not responding at $healthUrl" -ForegroundColor Red
        }
    }
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              DEPLOYMENT COMPLETE                               ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📁 Binaries: $binDir" -ForegroundColor Cyan
Write-Host "📊 Status: Use 'Get-Process | Where-Object {$_.Name -like '*service*'}' to monitor" -ForegroundColor Cyan
Write-Host "🛑 Stop All: Get-Process | Where-Object {$_.Name -like '*service*'} | Stop-Process" -ForegroundColor Cyan
Write-Host ""
