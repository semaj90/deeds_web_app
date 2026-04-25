# PNG + MinIO Implementation Validation Script
# This script validates all components of the Legal AI PNG Evidence Workflow

Write-Host "🔍 PNG + MinIO Implementation Validation" -ForegroundColor Cyan
Write-Host "=" * 50

# Configuration
$MINIO_ENDPOINT = "localhost:9000"
$MINIO_ACCESS_KEY = "minioadmin"
$MINIO_SECRET_KEY = "minioadmin"
$MINIO_BUCKET = "legal-artifacts"
$ARTIFACT_SERVICE_PORT = "8095"
$FRONTEND_PORT = "5173"

$results = @()

# Function to check service health
function Test-ServiceHealth {
    param(
        [string]$ServiceName,
        [string]$Endpoint,
        [string]$ExpectedContent = ""
    )

    try {
        $response = Invoke-RestMethod -Uri $Endpoint -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($ExpectedContent -and $response -notlike "*$ExpectedContent*") {
            return @{ Status = "❌"; Message = "$ServiceName - Unexpected response" }
        }
        return @{ Status = "✅"; Message = "$ServiceName - Healthy" }
    }
    catch {
        return @{ Status = "❌"; Message = "$ServiceName - Not accessible ($($_.Exception.Message))" }
    }
}

# Function to test network connectivity
function Test-NetworkPort {
    param(
        [string]$ServiceName,
        [string]$HostName,
        [int]$Port
    )

    try {
        $tcpConnection = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
        if ($tcpConnection.TcpTestSucceeded) {
            return @{ Status = "✅"; Message = "$ServiceName - Port $Port accessible" }
        } else {
            return @{ Status = "❌"; Message = "$ServiceName - Port $Port not accessible" }
        }
    }
    catch {
        return @{ Status = "❌"; Message = "$ServiceName - Network test failed" }
    }
}

Write-Host "`n1️⃣ Checking MinIO Server..." -ForegroundColor Yellow

# Check MinIO port accessibility
$minioPortTest = Test-NetworkPort -ServiceName "MinIO" -HostName "localhost" -Port 9000
$results += $minioPortTest
Write-Host "   $($minioPortTest.Status) $($minioPortTest.Message)"

# Check MinIO API health
$minioHealthTest = Test-ServiceHealth -ServiceName "MinIO API" -Endpoint "http://$MINIO_ENDPOINT/minio/health/live"
$results += $minioHealthTest
Write-Host "   $($minioHealthTest.Status) $($minioHealthTest.Message)"

# Check MinIO Console
$minioConsoleTest = Test-NetworkPort -ServiceName "MinIO Console" -HostName "localhost" -Port 9001
$results += $minioConsoleTest
Write-Host "   $($minioConsoleTest.Status) $($minioConsoleTest.Message)"

Write-Host "`n2️⃣ Checking Artifact Indexing Service..." -ForegroundColor Yellow

# Check service port
$artifactPortTest = Test-NetworkPort -ServiceName "Artifact Service" -HostName "localhost" -Port $ARTIFACT_SERVICE_PORT
$results += $artifactPortTest
Write-Host "   $($artifactPortTest.Status) $($artifactPortTest.Message)"

# Check service health endpoint
$artifactHealthTest = Test-ServiceHealth -ServiceName "Artifact Service Health" -Endpoint "http://localhost:$ARTIFACT_SERVICE_PORT/health"
$results += $artifactHealthTest
Write-Host "   $($artifactHealthTest.Status) $($artifactHealthTest.Message)"

Write-Host "`n3️⃣ Checking Database Connectivity..." -ForegroundColor Yellow

# Check PostgreSQL port
$postgresTest = Test-NetworkPort -ServiceName "PostgreSQL" -HostName "localhost" -Port 5432
$results += $postgresTest
Write-Host "   $($postgresTest.Status) $($postgresTest.Message)"

Write-Host "`n4️⃣ Checking Frontend Development Server..." -ForegroundColor Yellow

# Check SvelteKit dev server
$frontendTest = Test-NetworkPort -ServiceName "SvelteKit Frontend" -HostName "localhost" -Port $FRONTEND_PORT
$results += $frontendTest
Write-Host "   $($frontendTest.Status) $($frontendTest.Message)"

Write-Host "`n5️⃣ Environment Variables Check..." -ForegroundColor Yellow

$envVars = @{
    "DATABASE_URL" = $env:DATABASE_URL
    "MINIO_ENDPOINT" = $env:MINIO_ENDPOINT
    "MINIO_ACCESS_KEY" = $env:MINIO_ACCESS_KEY
    "MINIO_SECRET_KEY" = $env:MINIO_SECRET_KEY
    "SERVER_PORT" = $env:SERVER_PORT
}

foreach ($var in $envVars.GetEnumerator()) {
    if ($var.Value) {
        Write-Host "   ✅ $($var.Key) = $($var.Value)" -ForegroundColor Green
        $results += @{ Status = "✅"; Message = "Environment variable $($var.Key) set" }
    } else {
        Write-Host "   ❌ $($var.Key) = NOT SET" -ForegroundColor Red
        $results += @{ Status = "❌"; Message = "Environment variable $($var.Key) missing" }
    }
}

Write-Host "`n6️⃣ Testing MinIO Bucket Operations..." -ForegroundColor Yellow

if ($minioPortTest.Status -eq "✅") {
    try {
        # Test bucket creation/existence using REST API
        $headers = @{
            "Authorization" = "AWS4-HMAC-SHA256 Credential=$MINIO_ACCESS_KEY/$(Get-Date -Format 'yyyyMMdd')/us-east-1/s3/aws4_request"
        }

        # Simple bucket list test
        $bucketTest = @{ Status = "⚠️"; Message = "MinIO accessible but bucket operations need manual verification" }
        $results += $bucketTest
        Write-Host "   $($bucketTest.Status) $($bucketTest.Message)"

        Write-Host "   💡 Manual verification needed: Open http://localhost:9001 and check for '$MINIO_BUCKET' bucket"

    }
    catch {
        $bucketTest = @{ Status = "❌"; Message = "MinIO bucket operations failed" }
        $results += $bucketTest
        Write-Host "   $($bucketTest.Status) $($bucketTest.Message)"
    }
}

Write-Host "`n7️⃣ Testing PNG Upload Endpoint..." -ForegroundColor Yellow

if ($artifactPortTest.Status -eq "✅") {
    try {
        # Create a minimal test payload
        $testPayload = @{
            evidence_id = "test-validation-$(Get-Date -Format 'yyyyMMddHHmmss')"
            case_id = "VALIDATION-CASE-001"
            document_type = "evidence"
            file_data = @(137, 80, 78, 71, 13, 10, 26, 10) # PNG header bytes
            metadata = @{
                validation = "true"
                timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
            ai_analysis = @{
                summary = "Validation test file"
                confidence = 1.0
            }
            risk_assessment = "low"
            confidence = 1.0
        } | ConvertTo-Json -Depth 10

        # Test the upload endpoint (expect it to fail gracefully without MinIO)
        try {
            Invoke-RestMethod -Uri "http://localhost:$ARTIFACT_SERVICE_PORT/api/artifacts/upload" -Method POST -Body $testPayload -ContentType "application/json" -TimeoutSec 10 | Out-Null
            $uploadTest = @{ Status = "✅"; Message = "Upload endpoint accessible and responding" }
        }
        catch {
            if ($_.Exception.Response.StatusCode -eq 500) {
                $uploadTest = @{ Status = "⚠️"; Message = "Upload endpoint accessible but MinIO connection needed" }
            } else {
                $uploadTest = @{ Status = "❌"; Message = "Upload endpoint error: $($_.Exception.Message)" }
            }
        }

        $results += $uploadTest
        Write-Host "   $($uploadTest.Status) $($uploadTest.Message)"

    }
    catch {
        $uploadTest = @{ Status = "❌"; Message = "Upload endpoint test failed: $($_.Exception.Message)" }
        $results += $uploadTest
        Write-Host "   $($uploadTest.Status) $($uploadTest.Message)"
    }
}

Write-Host "`n📊 Validation Summary" -ForegroundColor Cyan
Write-Host "=" * 50

$successCount = ($results | Where-Object { $_.Status -eq "✅" }).Count
$warningCount = ($results | Where-Object { $_.Status -eq "⚠️" }).Count
$errorCount = ($results | Where-Object { $_.Status -eq "❌" }).Count
$totalCount = $results.Count

Write-Host "✅ Passed: $successCount" -ForegroundColor Green
Write-Host "⚠️  Warnings: $warningCount" -ForegroundColor Yellow
Write-Host "❌ Failed: $errorCount" -ForegroundColor Red
Write-Host "📋 Total Checks: $totalCount"

$healthPercentage = [math]::Round(($successCount / $totalCount) * 100, 1)
Write-Host "`n🎯 System Health: $healthPercentage%" -ForegroundColor $(
    if ($healthPercentage -ge 80) { "Green" }
    elseif ($healthPercentage -ge 60) { "Yellow" }
    else { "Red" }
)

Write-Host "`n🚀 Next Steps:" -ForegroundColor Cyan

if ($errorCount -eq 0 -and $warningCount -eq 0) {
    Write-Host "   🎉 All systems operational! Ready for PNG evidence workflow testing."
} elseif ($errorCount -eq 0) {
    Write-Host "   ✅ Core systems ready. Address warnings for full functionality."
} else {
    Write-Host "   🔧 Fix failed services before proceeding:"

    $failedServices = $results | Where-Object { $_.Status -eq "❌" }
    foreach ($failed in $failedServices) {
        Write-Host "      • $($failed.Message)" -ForegroundColor Red
    }
}

Write-Host "`n💡 Quick Start Commands:" -ForegroundColor Cyan
Write-Host "   Start MinIO Server: docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address :9001"
Write-Host "   Start Artifact Service: cd go-microservice; .\bin\artifact-indexing-service.exe"
Write-Host "   Start Frontend: cd sveltekit-frontend; npm run dev"
Write-Host "   Open MinIO Console: http://localhost:9001 (minioadmin / minioadmin)"
Write-Host "   Open Legal AI App: http://localhost:5173"

# Save results to file
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$resultFile = "validation-results-$timestamp.json"
$results | ConvertTo-Json -Depth 3 | Out-File $resultFile
Write-Host "`n📝 Detailed results saved to: $resultFile" -ForegroundColor Green
