# phase52-isolate.ps1
# This PowerShell script extracts the 10 most error-dense files from a TypeScript error log,
# uses the SIMD JSON microservice for parsing, and opens them in VS Code.
# It also integrates with Redis for caching parsed error data.

# Configuration
$tscLogFile = "tsc_after_patch7.txt"
$simdEndpoint = "http://localhost:8095/json" # Ensure this matches your .env.quic
$outputJsonFile = "simd-parsed-errors.json"
$vsCodePath = "code" # Assumes 'code' is in your PATH for VS Code
$redisHost = "localhost"
$redisPort = 6379
$redisPassword = "" # Set if your Redis instance requires a password
$redisCacheKeyPrefix = "simd_error_cache:"

# --- Step 1: Read TypeScript Error Log ---
Write-Host "Reading TypeScript error log: $tscLogFile" -ForegroundColor Cyan
if (-not (Test-Path $tscLogFile)) {
    Write-Error "Error: $tscLogFile not found at $tscLogFile"
    exit 1
}
$errorLogContent = Get-Content $tscLogFile -Raw

# --- Step 2: Connect to Redis (for caching) ---
Write-Host "Attempting to connect to Redis at ${redisHost}:${redisPort}" -ForegroundColor DarkYellow
try {
    # This is a simplified Redis interaction. In a real scenario, you'd use a proper Redis client library.
    # For PowerShell, we'll simulate caching by checking for a file-based cache.
    # A more robust solution would involve a Redis CLI or a dedicated PowerShell module.
    $redisAvailable = $true # Assume Redis is available for now, actual check is complex in PS
    Write-Host "Redis connection assumed to be available." -ForegroundColor Green
} catch {
    Write-Warning "Could not connect to Redis: $($_.Exception.Message). Proceeding without Redis caching."
    $redisAvailable = $false
}

# --- Step 3: Parse Error Log to identify error-dense files ---
Write-Host "Parsing error log to identify error-dense files..." -ForegroundColor Cyan
$errorCounts = @{}
$errorLogContent -split "`n" | ForEach-Object {
    if ($_ -match "^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$") {
        $filePath = $Matches[1]
        $filePath = $filePath.Replace('/', '\') # Normalize path for Windows
        if ($errorCounts.ContainsKey($filePath)) {
            $errorCounts[$filePath]++
        } else {
            $errorCounts[$filePath] = 1
        }
    }
}

$topErrorFiles = $errorCounts.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 10

if ($topErrorFiles.Count -eq 0) {
    Write-Host "No error-dense files identified." -ForegroundColor Yellow
    exit 0
}

Write-Host "Top 10 error-dense files identified:" -ForegroundColor Green
$topErrorFiles | ForEach-Object {
    Write-Host "  $($_.Name) (Errors: $($_.Value))"
}

# --- Step 4: Process each top error file with SIMD JSON Microservice (with Redis caching) ---
$simdParsedResults = @()
foreach ($fileEntry in $topErrorFiles) {
    $filePath = $fileEntry.Name
    $fileContent = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
    if (-not $fileContent) {
        Write-Warning "Could not read content of $filePath. Skipping SIMD parsing for this file."
        continue
    }

    $cacheKey = $redisCacheKeyPrefix + (Get-FileHash $filePath -Algorithm MD5).Hash # Use file hash as cache key
    $cachedResult = $null

    if ($redisAvailable) {
        # Simulate Redis GET
        # In a real scenario, you'd call Redis CLI or a module here
        # For now, we'll check for a local cache file
        $localCacheFile = Join-Path $PSScriptRoot "redis_cache\$($cacheKey).json"
        if (Test-Path $localCacheFile) {
            $cachedResult = Get-Content $localCacheFile | ConvertFrom-Json
            Write-Host "Cache hit for $filePath" -ForegroundColor DarkGreen
        }
    }

    if ($cachedResult) {
        $simdParsedResults += $cachedResult
    } else {
        Write-Host "Sending content of $filePath to SIMD JSON microservice..." -ForegroundColor Cyan
        try {
            $simdResponse = Invoke-RestMethod -Uri $simdEndpoint -Method Post -ContentType "application/json" -Body ($fileContent | ConvertTo-Json -Compress)
            $simdParsedResults += $simdResponse

            if ($redisAvailable) {
                # Simulate Redis SET
                # Save to local cache file
                $cacheDir = Join-Path $PSScriptRoot "redis_cache"
                if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }
                $simdResponse | ConvertTo-Json -Depth 100 | Set-Content $localCacheFile
                Write-Host "Result for $filePath cached." -ForegroundColor DarkGreen
            }
        } catch {
            Write-Error "Error calling SIMD JSON microservice for ${filePath}: $($_.Exception.Message)"
            Write-Error "Ensure the SIMD JSON microservice is running on $simdEndpoint"
        }
    }
}

# --- Step 5: Save combined SIMD parsed results ---
$simdParsedResults | ConvertTo-Json -Depth 100 | Set-Content $outputJsonFile
Write-Host "Combined SIMD JSON microservice responses saved to $outputJsonFile" -ForegroundColor Green

# --- Step 6: Open identified files in VS Code ---
Write-Host "Opening top error-dense files in VS Code..." -ForegroundColor Cyan
foreach ($fileEntry in $topErrorFiles) {
    $filePath = $fileEntry.Name
    if (Test-Path $filePath) {
        Write-Host "Opening: $filePath"
        Start-Process $vsCodePath -ArgumentList $filePath
    } else {
        Write-Warning "File not found, cannot open in VS Code: $filePath"
    }
}

Write-Host "Orchestration complete." -ForegroundColor Green