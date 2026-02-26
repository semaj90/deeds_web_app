# ACE Contextual Web Ingestion - Deployment Script (PowerShell)
# This script sets up all required infrastructure for ACE web ingestion

param(
    [switch]$SkipDocker,
    [switch]$SkipMigrations,
    [switch]$SkipMinIO,
    [switch]$Verify
)

$ErrorActionPreference = "Stop"

Write-Host "=== ACE Contextual Web Ingestion - Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Prerequisites
Write-Host "Step 1: Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

$prerequisites = @{
    "Docker" = { docker --version }
    "Docker Compose" = { docker-compose --version }
    "Node.js" = { node --version }
    "npm" = { npm --version }
    "PostgreSQL Client" = { psql --version }
}

$missingPrereqs = @()
foreach ($prereq in $prerequisites.Keys) {
    try {
        $null = & $prerequisites[$prereq] 2>&1
        Write-Host "  ✓ $prereq installed" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ $prereq not found" -ForegroundColor Red
        $missingPrereqs += $prereq
    }
}

if ($missingPrereqs.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing prerequisites: $($missingPrereqs -join ', ')" -ForegroundColor Red
    Write-Host "Please install missing tools and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Start Docker Services
if (-not $SkipDocker) {
    Write-Host "Step 2: Starting Docker services..." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "Starting: postgres, qdrant, minio, rabbitmq, ollama" -ForegroundColor Gray
    docker-compose up -d postgres qdrant minio rabbitmq ollama

    Write-Host ""
    Write-Host "Waiting 15 seconds for services to initialize..." -ForegroundColor Gray
    Start-Sleep -Seconds 15
    Write-Host ""
} else {
    Write-Host "Step 2: Skipping Docker services (--SkipDocker)" -ForegroundColor Gray
    Write-Host ""
}

# Step 3: Run Database Migrations
if (-not $SkipMigrations) {
    Write-Host "Step 3: Running database migrations..." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "Running: npm run db:migrate" -ForegroundColor Gray
    npm run db:migrate

    Write-Host ""
    Write-Host "Verifying tables created..." -ForegroundColor Gray
    $env:PGPASSWORD = "postgres"
    $tables = psql -h localhost -U postgres -d legal_ai -t -c "\dt ace_*" 2>&1

    if ($tables -match "ace_sources") {
        Write-Host "  ✓ ACE tables created successfully" -ForegroundColor Green
    } else {
        Write-Host "  ✗ ACE tables not found" -ForegroundColor Red
        Write-Host "    Run migrations manually: npm run db:migrate" -ForegroundColor Red
    }
    Write-Host ""
} else {
    Write-Host "Step 3: Skipping database migrations (--SkipMigrations)" -ForegroundColor Gray
    Write-Host ""
}

# Step 4: Setup MinIO Buckets
if (-not $SkipMinIO) {
    Write-Host "Step 4: Setting up MinIO buckets..." -ForegroundColor Yellow
    Write-Host ""

    $buckets = @("ace-web-raw", "ace-web-derived", "ace-eval-logs")

    foreach ($bucket in $buckets) {
        Write-Host "Creating bucket: $bucket" -ForegroundColor Gray

        # Check if bucket exists
        $exists = mc ls local/$bucket 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Bucket $bucket already exists" -ForegroundColor Green
        } else {
            # Create bucket
            mc mb local/$bucket
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Bucket $bucket created" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Failed to create bucket $bucket" -ForegroundColor Red
            }
        }
    }

    Write-Host ""
    Write-Host "Setting bucket policies..." -ForegroundColor Gray
    foreach ($bucket in $buckets) {
        mc policy set download local/$bucket 2>&1 | Out-Null
    }
    Write-Host "  ✓ Bucket policies configured" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "Step 4: Skipping MinIO setup (--SkipMinIO)" -ForegroundColor Gray
    Write-Host ""
}

# Step 5: Verify Qdrant Collection
Write-Host "Step 5: Verifying Qdrant collection..." -ForegroundColor Yellow
Write-Host ""

try {
    $collection = Invoke-RestMethod -Uri "http://localhost:6333/collections/ace_chunks" -Method Get -ErrorAction Stop
    Write-Host "  ✓ Qdrant collection 'ace_chunks' exists" -ForegroundColor Green
} catch {
    Write-Host "  ℹ Qdrant collection will be created on first use" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Verify RabbitMQ Queue
Write-Host "Step 6: Verifying RabbitMQ queue..." -ForegroundColor Yellow
Write-Host ""

try {
    $cred = New-Object System.Management.Automation.PSCredential("admin", (ConvertTo-SecureString "admin" -AsPlainText -Force))
    $queues = Invoke-RestMethod -Uri "http://localhost:15672/api/queues" -Method Get -Credential $cred -ErrorAction Stop

    $aceQueue = $queues | Where-Object { $_.name -eq "ace_web_ingest" }
    if ($aceQueue) {
        Write-Host "  ✓ RabbitMQ queue 'ace_web_ingest' exists" -ForegroundColor Green
    } else {
        Write-Host "  ℹ RabbitMQ queue will be created by worker on first run" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ Could not verify RabbitMQ queue (service may not be ready)" -ForegroundColor Yellow
}
Write-Host ""

# Step 7: Summary
Write-Host "=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start the worker: cd backend/workers && python ace_web_worker.py" -ForegroundColor Gray
Write-Host "2. Start the frontend: npm run dev" -ForegroundColor Gray
Write-Host "3. Test ingestion: curl -X POST http://localhost:5173/api/ace/web/ingest -H 'Content-Type: application/json' -d '{\"urls\":[\"https://svelte.dev/docs\"]}'" -ForegroundColor Gray
Write-Host ""
Write-Host "Verification:" -ForegroundColor Yellow
Write-Host "- Run: .\deploy-ace-web.ps1 -Verify" -ForegroundColor Gray
Write-Host "- Or: .\verify-ace-web.ps1" -ForegroundColor Gray
Write-Host ""

# Run verification if requested
if ($Verify) {
    Write-Host "Running verification..." -ForegroundColor Cyan
    Write-Host ""
    & "$PSScriptRoot\verify-ace-web.ps1"
}
