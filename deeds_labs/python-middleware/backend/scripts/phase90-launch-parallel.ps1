# Phase 90 - Parallel Embedding Launcher
# Splits 73,313 errors across multiple Ollama instances

$ErrorActionPreference = "Stop"

Write-Host "🚀 Phase 90: Parallel Embedding Launcher" -ForegroundColor Cyan
Write-Host "═" * 70
Write-Host ""

# Configuration
$PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
$SCRIPT = "C:\Users\james\Videos\deeds-web-app\backend\scripts\phase90_parallel_embedder.py"
$INPUT = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\check_output.txt"
$TOTAL_ERRORS = 73313
$NUM_WORKERS = 2  # RTX 3060 Ti can handle 2 Ollama instances
$BATCH_SIZE = 100

# Calculate chunks
$chunkSize = [Math]::Ceiling($TOTAL_ERRORS / $NUM_WORKERS)

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Total Errors: $TOTAL_ERRORS"
Write-Host "  Workers: $NUM_WORKERS"
Write-Host "  Chunk Size: ~$chunkSize errors per worker"
Write-Host "  Batch Size: $BATCH_SIZE (per API call)"
Write-Host ""

# Stop existing pipeline
Write-Host "🛑 Stopping existing pipeline..." -ForegroundColor Yellow
Get-Process python -ErrorAction SilentlyContinue |
    Where-Object { $_.StartTime -gt (Get-Date).AddHours(-1) } |
    Stop-Process -Force
Start-Sleep -Seconds 2
Write-Host "✅ Cleared old processes" -ForegroundColor Green
Write-Host ""

# Launch workers in separate terminals
Write-Host "🚀 Launching $NUM_WORKERS workers..." -ForegroundColor Cyan
Write-Host ""

$logDir = "C:\Users\james\Videos\deeds-web-app\backend\scripts\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

for ($i = 0; $i -lt $NUM_WORKERS; $i++) {
    $workerId = $i + 1
    $start = $i * $chunkSize
    $end = [Math]::Min(($i + 1) * $chunkSize, $TOTAL_ERRORS)
    $ollamaPort = 11434  # All use same Ollama instance for now

    $title = "Worker $workerId ($start-$end)"
    $logFile = "$logDir\worker_$workerId.log"
    $cmd = "$PYTHON `"$SCRIPT`" --input `"$INPUT`" --start $start --end $end --worker-id $workerId --ollama-port $ollamaPort --batch-size $BATCH_SIZE 2>&1 | Tee-Object -FilePath `"$logFile`""

    Write-Host "  ✓ Worker $workerId`: [$start - $end] ($(($end - $start).ToString('N0')) errors)" -ForegroundColor Green
    Write-Host "    Log: $logFile" -ForegroundColor Gray

    # Launch in new terminal window
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal

    Start-Sleep -Milliseconds 500  # Stagger starts
}Write-Host ""
Write-Host "═" * 70
Write-Host "✅ All workers launched!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Monitoring:" -ForegroundColor Yellow
Write-Host "  Each worker will process ~$($chunkSize.ToString('N0')) errors"
Write-Host "  Batch size: $BATCH_SIZE errors per API call"
Write-Host "  Expected rate: 20-50 errors/min per worker"
Write-Host "  Total rate: 40-100 errors/min"
Write-Host ""
Write-Host "⏱️  Estimated completion: 12-30 minutes" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Monitor progress:" -ForegroundColor Yellow
Write-Host "  cd sveltekit-frontend"
Write-Host "  node scripts/phase90-monitor.mjs"
Write-Host ""
