# ACE Contextual Web Ingestion - Verification Script
# Checks that all services and components are properly configured

$ErrorActionPreference = "Continue"

Write-Host "=== ACE Web Ingestion - System Verification ===" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# Test 1: Docker Services
Write-Host "Test 1: Docker Services" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Yellow

$requiredServices = @("postgres", "qdrant", "minio", "rabbitmq", "ollama")
$runningServices = docker ps --format "{{.Names}}" 2>&1

foreach ($service in $requiredServices) {
    if ($runningServices -match $service) {
        Write-Host "  ✓ $service is running" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $service is NOT running" -ForegroundColor Red
        $allPassed = $false
    }
}
Write-Host ""

# Test 2: PostgreSQL Connection
Write-Host "Test 2: PostgreSQL Connection" -ForegroundColor Yellow
Write-Host "------------------------------" -ForegroundColor Yellow

try {
    $env:PGPASSWORD = "postgres"
    $result = psql -h localhost -U postgres -d legal_ai -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ PostgreSQL connection successful" -ForegroundColor Green
    } else {
        Write-Host "  ✗ PostgreSQL connection failed" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ PostgreSQL connection error: $_" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 3: ACE Tables
Write-Host "Test 3: ACE Database Tables" -ForegroundColor Yellow
Write-Host "----------------------------" -ForegroundColor Yellow

$requiredTables = @("ace_sources", "ace_docs", "ace_chunks", "ace_entities", "ace_edges")
try {
    $env:PGPASSWORD = "postgres"
    $tables = psql -h localhost -U postgres -d legal_ai -t -c "\dt ace_*" 2>&1

    foreach ($table in $requiredTables) {
        if ($tables -match $table) {
            Write-Host "  ✓ Table $table exists" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Table $table NOT found" -ForegroundColor Red
            $allPassed = $false
        }
    }
} catch {
    Write-Host "  ✗ Could not check tables: $_" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 4: pgvector Extension
Write-Host "Test 4: pgvector Extension" -ForegroundColor Yellow
Write-Host "---------------------------" -ForegroundColor Yellow

try {
    $env:PGPASSWORD = "postgres"
    $result = psql -h localhost -U postgres -d legal_ai -t -c "SELECT * FROM pg_extension WHERE extname = 'vector';" 2>&1

    if ($result -match "vector") {
        Write-Host "  ✓ pgvector extension installed" -ForegroundColor Green
    } else {
        Write-Host "  ✗ pgvector extension NOT installed" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ Could not check pgvector: $_" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 5: MinIO Buckets
Write-Host "Test 5: MinIO Buckets" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

$requiredBuckets = @("ace-web-raw", "ace-web-derived", "ace-eval-logs")
try {
    $buckets = mc ls local/ 2>&1

    foreach ($bucket in $requiredBuckets) {
        if ($buckets -match $bucket) {
            Write-Host "  ✓ Bucket $bucket exists" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Bucket $bucket NOT found" -ForegroundColor Red
            $allPassed = $false
        }
    }
} catch {
    Write-Host "  ✗ Could not check MinIO buckets: $_" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 6: Qdrant Health
Write-Host "Test 6: Qdrant Service" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

try {
    $qdrantInfo = Invoke-RestMethod -Uri "http://localhost:6333/" -Method Get -ErrorAction Stop -TimeoutSec 5
    if ($qdrantInfo.title -match "qdrant") {
        Write-Host "  ✓ Qdrant is healthy (version: $($qdrantInfo.version))" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Qdrant responded but unexpected format" -ForegroundColor Yellow
    }

    # Check collection
    try {
        $collection = Invoke-RestMethod -Uri "http://localhost:6333/collections/ace_chunks" -Method Get -ErrorAction Stop
        Write-Host "  ✓ Collection 'ace_chunks' exists" -ForegroundColor Green
    } catch {
        Write-Host "  ℹ Collection 'ace_chunks' will be created on first use" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Qdrant is not responding" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 7: RabbitMQ Health
Write-Host "Test 7: RabbitMQ Service" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Yellow

try {
    $cred = New-Object System.Management.Automation.PSCredential("admin", (ConvertTo-SecureString "admin" -AsPlainText -Force))
    $overview = Invoke-RestMethod -Uri "http://localhost:15672/api/overview" -Method Get -Credential $cred -ErrorAction Stop -TimeoutSec 5
    Write-Host "  ✓ RabbitMQ is healthy" -ForegroundColor Green

    # Check queue
    try {
        $queues = Invoke-RestMethod -Uri "http://localhost:15672/api/queues" -Method Get -Credential $cred -ErrorAction Stop
        $aceQueue = $queues | Where-Object { $_.name -eq "ace_web_ingest" }

        if ($aceQueue) {
            Write-Host "  ✓ Queue 'ace_web_ingest' exists" -ForegroundColor Green
        } else {
            Write-Host "  ℹ Queue 'ace_web_ingest' will be created by worker" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ⚠ Could not check queue" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ RabbitMQ is not responding" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 8: Ollama Service
Write-Host "Test 8: Ollama Service" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

try {
    $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host "  ✓ Ollama is healthy" -ForegroundColor Green

    # Check for required models
    $hasEmbedding = $tags.models | Where-Object { $_.name -match "embeddinggemma" }
    $hasGemma = $tags.models | Where-Object { $_.name -match "gemma" }

    if ($hasEmbedding) {
        Write-Host "  ✓ Model 'embeddinggemma:latest' available" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Model 'embeddinggemma:latest' not found (required for embeddings)" -ForegroundColor Yellow
    }

    if ($hasGemma) {
        Write-Host "  ✓ Model 'gemma3-legal' or similar available" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Gemma model not found (required for LLM)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Ollama is not responding" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 9: API Endpoints
Write-Host "Test 9: API Endpoints" -ForegroundColor Yellow
Write-Host "---------------------" -ForegroundColor Yellow

# Check if frontend is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173" -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host "  ✓ Frontend is running (http://localhost:5173)" -ForegroundColor Green

    # Try ACE endpoints
    try {
        $contextResponse = Invoke-WebRequest -Uri "http://localhost:5173/api/ace/context?query=test" -Method Get -ErrorAction Stop -TimeoutSec 5
        Write-Host "  ✓ Context API endpoint responding" -ForegroundColor Green
    } catch {
        Write-Host "  ℹ Context API endpoint not yet tested (start frontend first)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ℹ Frontend not running (start with: npm run dev)" -ForegroundColor Yellow
}
Write-Host ""

# Test 10: Worker Status
Write-Host "Test 10: Worker Status" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

$workerProcess = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "ace_web_worker" }
if ($workerProcess) {
    Write-Host "  ✓ ACE worker is running" -ForegroundColor Green
} else {
    Write-Host "  ℹ ACE worker not running (start with: cd backend/workers && python ace_web_worker.py)" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "=== Verification Summary ===" -ForegroundColor Cyan
Write-Host ""

if ($allPassed) {
    Write-Host "✓ All critical tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "System is ready for ACE web ingestion." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Start worker: cd backend/workers && python ace_web_worker.py" -ForegroundColor Gray
    Write-Host "2. Start frontend: npm run dev" -ForegroundColor Gray
    Write-Host "3. Test ingestion: See MANUAL_TESTING_GUIDE.md" -ForegroundColor Gray
} else {
    Write-Host "✗ Some tests failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix the issues above before proceeding." -ForegroundColor Red
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor Yellow
    Write-Host "- Start services: docker-compose up -d postgres qdrant minio rabbitmq ollama" -ForegroundColor Gray
    Write-Host "- Run migrations: npm run db:migrate" -ForegroundColor Gray
    Write-Host "- Setup MinIO: scripts/setup-ace-minio.sh" -ForegroundColor Gray
    Write-Host "- Pull Ollama models: ollama pull embeddinggemma:latest && ollama pull gemma3-legal" -ForegroundColor Gray
}
Write-Host ""
