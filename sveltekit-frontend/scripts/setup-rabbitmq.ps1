# RabbitMQ Setup Script for Windows
# Automatically detects and starts RabbitMQ (Docker or Native Windows)

param(
    [switch]$Docker,
    [switch]$Native,
    [switch]$Status,
    [switch]$Stop
)

Write-Host "🐰 RabbitMQ Setup for Windows" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host ""

function Test-DockerRabbitMQ {
    try {
        $container = docker ps --filter "name=rabbitmq" --format "{{.Names}}" 2>$null
        return $container -eq "rabbitmq"
    } catch {
        return $false
    }
}

function Test-NativeRabbitMQ {
    try {
        $service = Get-Service -Name RabbitMQ -ErrorAction SilentlyContinue
        return $service -ne $null
    } catch {
        return $false
    }
}

function Get-RabbitMQStatus {
    Write-Host "📊 Checking RabbitMQ Status..." -ForegroundColor Yellow
    Write-Host ""

    # Check Docker
    if (Test-DockerRabbitMQ) {
        Write-Host "✅ Docker RabbitMQ: RUNNING" -ForegroundColor Green
        docker ps --filter "name=rabbitmq" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    } else {
        Write-Host "⏹️  Docker RabbitMQ: NOT RUNNING" -ForegroundColor Gray
    }

    Write-Host ""

    # Check Native Windows
    if (Test-NativeRabbitMQ) {
        $service = Get-Service -Name RabbitMQ
        $status = $service.Status
        $color = if ($status -eq "Running") { "Green" } else { "Yellow" }
        Write-Host "✅ Native Windows RabbitMQ: $status" -ForegroundColor $color

        if ($status -eq "Running") {
            Write-Host "   Port: 5672 (AMQP), 15672 (Management UI)" -ForegroundColor Gray
            Write-Host "   Credentials: guest/guest" -ForegroundColor Gray
        }
    } else {
        Write-Host "⏹️  Native Windows RabbitMQ: NOT INSTALLED" -ForegroundColor Gray
    }

    Write-Host ""

    # Test connection
    Write-Host "🔍 Testing Connection..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:15672/api/overview" -Credential (New-Object PSCredential("guest", (ConvertTo-SecureString "guest" -AsPlainText -Force))) -ErrorAction SilentlyContinue
        Write-Host "✅ RabbitMQ Management API: ACCESSIBLE" -ForegroundColor Green
        Write-Host "   Version: $($response.rabbitmq_version)" -ForegroundColor Gray
        Write-Host "   Erlang: $($response.erlang_version)" -ForegroundColor Gray
    } catch {
        Write-Host "⚠️  RabbitMQ Management API: NOT ACCESSIBLE" -ForegroundColor Yellow
    }
}

function Start-DockerRabbitMQ {
    Write-Host "🐳 Starting Docker RabbitMQ..." -ForegroundColor Cyan

    if (Test-DockerRabbitMQ) {
        Write-Host "✅ Docker RabbitMQ is already running" -ForegroundColor Green
        return
    }

    # Check if container exists but is stopped
    $exists = docker ps -a --filter "name=rabbitmq" --format "{{.Names}}" 2>$null

    if ($exists -eq "rabbitmq") {
        Write-Host "🔄 Starting existing container..." -ForegroundColor Yellow
        docker start rabbitmq
    } else {
        Write-Host "📦 Creating new container..." -ForegroundColor Yellow
        docker run -d --name rabbitmq `
            -p 5672:5672 `
            -p 15672:15672 `
            -e RABBITMQ_DEFAULT_USER=guest `
            -e RABBITMQ_DEFAULT_PASS=guest `
            rabbitmq:3-management
    }

    Write-Host ""
    Write-Host "⏳ Waiting for RabbitMQ to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    Write-Host "✅ Docker RabbitMQ started successfully" -ForegroundColor Green
    Write-Host "   AMQP Port: 5672" -ForegroundColor Gray
    Write-Host "   Management UI: http://localhost:15672" -ForegroundColor Gray
    Write-Host "   Credentials: guest/guest" -ForegroundColor Gray
}

function Start-NativeRabbitMQ {
    Write-Host "🪟 Starting Native Windows RabbitMQ..." -ForegroundColor Cyan

    if (-not (Test-NativeRabbitMQ)) {
        Write-Host "❌ Native Windows RabbitMQ is not installed" -ForegroundColor Red
        Write-Host ""
        Write-Host "To install RabbitMQ on Windows:" -ForegroundColor Yellow
        Write-Host "  1. Install Erlang: https://www.erlang.org/downloads" -ForegroundColor Gray
        Write-Host "  2. Install RabbitMQ: https://www.rabbitmq.com/install-windows.html" -ForegroundColor Gray
        Write-Host "  3. Enable Management Plugin:" -ForegroundColor Gray
        Write-Host "     rabbitmq-plugins enable rabbitmq_management" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Or use Docker instead: .\scripts\setup-rabbitmq.ps1 -Docker" -ForegroundColor Cyan
        return
    }

    $service = Get-Service -Name RabbitMQ

    if ($service.Status -eq "Running") {
        Write-Host "✅ Native Windows RabbitMQ is already running" -ForegroundColor Green
        return
    }

    Write-Host "🔄 Starting RabbitMQ service..." -ForegroundColor Yellow
    Start-Service -Name RabbitMQ

    Write-Host ""
    Write-Host "⏳ Waiting for RabbitMQ to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    Write-Host "✅ Native Windows RabbitMQ started successfully" -ForegroundColor Green
    Write-Host "   AMQP Port: 5672" -ForegroundColor Gray
    Write-Host "   Management UI: http://localhost:15672" -ForegroundColor Gray
    Write-Host "   Credentials: guest/guest" -ForegroundColor Gray
}

function Stop-AllRabbitMQ {
    Write-Host "🛑 Stopping All RabbitMQ Instances..." -ForegroundColor Yellow
    Write-Host ""

    # Stop Docker
    if (Test-DockerRabbitMQ) {
        Write-Host "🐳 Stopping Docker RabbitMQ..." -ForegroundColor Cyan
        docker stop rabbitmq
        Write-Host "✅ Docker RabbitMQ stopped" -ForegroundColor Green
    }

    # Stop Native Windows
    if (Test-NativeRabbitMQ) {
        $service = Get-Service -Name RabbitMQ
        if ($service.Status -eq "Running") {
            Write-Host "🪟 Stopping Native Windows RabbitMQ..." -ForegroundColor Cyan
            Stop-Service -Name RabbitMQ
            Write-Host "✅ Native Windows RabbitMQ stopped" -ForegroundColor Green
        }
    }
}

# Main logic
if ($Status) {
    Get-RabbitMQStatus
    exit 0
}

if ($Stop) {
    Stop-AllRabbitMQ
    exit 0
}

if ($Docker) {
    Start-DockerRabbitMQ
    Write-Host ""
    Get-RabbitMQStatus
    exit 0
}

if ($Native) {
    Start-NativeRabbitMQ
    Write-Host ""
    Get-RabbitMQStatus
    exit 0
}

# Auto-detect and start
Write-Host "🔍 Auto-detecting RabbitMQ installation..." -ForegroundColor Yellow
Write-Host ""

if (Test-DockerRabbitMQ) {
    Write-Host "✅ Found running Docker RabbitMQ" -ForegroundColor Green
    Get-RabbitMQStatus
} elseif (Test-NativeRabbitMQ) {
    Write-Host "✅ Found Native Windows RabbitMQ" -ForegroundColor Green
    Start-NativeRabbitMQ
    Write-Host ""
    Get-RabbitMQStatus
} else {
    Write-Host "⚠️  No RabbitMQ installation detected" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Choose an option:" -ForegroundColor Cyan
    Write-Host "  1. Start Docker RabbitMQ (recommended)" -ForegroundColor Gray
    Write-Host "  2. Start Native Windows RabbitMQ" -ForegroundColor Gray
    Write-Host ""

    # Try Docker first (most common)
    try {
        docker --version >$null 2>&1
        Write-Host "🐳 Docker is available. Starting Docker RabbitMQ..." -ForegroundColor Cyan
        Start-DockerRabbitMQ
        Write-Host ""
        Get-RabbitMQStatus
    } catch {
        Write-Host "❌ Docker not available" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please install:" -ForegroundColor Yellow
        Write-Host "  - Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Gray
        Write-Host "  OR" -ForegroundColor Yellow
        Write-Host "  - Native RabbitMQ: https://www.rabbitmq.com/install-windows.html" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "📚 Usage Examples:" -ForegroundColor Cyan
Write-Host "  .\scripts\setup-rabbitmq.ps1 -Status    # Check status" -ForegroundColor Gray
Write-Host "  .\scripts\setup-rabbitmq.ps1 -Docker    # Start Docker" -ForegroundColor Gray
Write-Host "  .\scripts\setup-rabbitmq.ps1 -Native    # Start Native Windows" -ForegroundColor Gray
Write-Host "  .\scripts\setup-rabbitmq.ps1 -Stop      # Stop all instances" -ForegroundColor Gray
Write-Host ""
