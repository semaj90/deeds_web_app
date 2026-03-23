# Quick RAG endpoint sanity check script
# Test the RAG API endpoints after deployment

Write-Host "🧪 Testing RAG API Endpoints..." -ForegroundColor Green
Write-Host ""

# Test basic health check
Write-Host "1. Testing API health..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/api/v1" -Method GET -TimeoutSec 10
    Write-Host "✅ API Health: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | Format-Table -AutoSize
} catch {
    Write-Host "❌ API Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test RAG search endpoint
Write-Host "2. Testing RAG search..." -ForegroundColor Cyan
try {
    $body = @{
        query = "test legal document search"
        limit = 5
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "http://localhost:5173/api/v1/rag/search" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ RAG Search: $($response.StatusCode)" -ForegroundColor Green

    $result = $response.Content | ConvertFrom-Json
    Write-Host "   Results: $($result.totalResults)" -ForegroundColor Yellow
    Write-Host "   Model: $($result.model)" -ForegroundColor Yellow
    Write-Host "   Cached: $($result.cached)" -ForegroundColor Yellow
} catch {
    Write-Host "❌ RAG Search Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test file upload endpoint (if it exists)
Write-Host "3. Testing file upload endpoint..." -ForegroundColor Cyan
try {
    # Create a simple test file
    $testContent = "This is a test legal document for RAG processing."
    $testFile = [System.IO.Path]::GetTempFileName()
    $testContent | Out-File -FilePath $testFile -Encoding UTF8

    # Create multipart form data
    $boundary = "----WebKitFormBoundary" + [System.Guid]::NewGuid().ToString("N")
    $fileContent = Get-Content $testFile -Raw
    $fileName = [System.IO.Path]::GetFileName($testFile)

    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: text/plain",
        "",
        $fileContent,
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"

    $response = Invoke-WebRequest -Uri "http://localhost:5173/api/v1/files/upload" -Method POST -Body $body -ContentType "multipart/form-data; boundary=$boundary" -TimeoutSec 60
    Write-Host "✅ File Upload: $($response.StatusCode)" -ForegroundColor Green

    $result = $response.Content | ConvertFrom-Json
    if ($result.success) {
        Write-Host "   Document ID: $($result.doc.id)" -ForegroundColor Yellow
        Write-Host "   Title: $($result.doc.title)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ File Upload Failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Clean up test file
    if (Test-Path $testFile) {
        Remove-Item $testFile -Force
    }
}

Write-Host ""
Write-Host "🎯 RAG API Testing Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "If you see errors above, check:" -ForegroundColor Yellow
Write-Host "1. All Docker containers are running: docker ps" -ForegroundColor Yellow
Write-Host "2. SvelteKit dev server is running: netstat -ano | findstr :5173" -ForegroundColor Yellow
Write-Host "3. Environment variables are set correctly" -ForegroundColor Yellow
Write-Host "4. Database migrations have been run" -ForegroundColor Yellow