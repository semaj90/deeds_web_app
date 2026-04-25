# Phase 90 - Simple Parallel Launcher (No Logs)

$ErrorActionPreference = "Stop"

Write-Host "`n[Phase 90] Starting Parallel Embedding..." -ForegroundColor Cyan

# Configuration
$PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
$SCRIPT = "C:\Users\james\Videos\deeds-web-app\backend\scripts\phase90_parallel_embedder.py"
$INPUT = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\check_output.txt"
$TOTAL_ERRORS = 73313
$NUM_WORKERS = 2
$BATCH_SIZE = 100

# Calculate chunks
$chunkSize = [Math]::Ceiling($TOTAL_ERRORS / $NUM_WORKERS)

Write-Host "  Total Errors: $TOTAL_ERRORS"
Write-Host "  Workers: $NUM_WORKERS"
Write-Host "  Chunk Size: $chunkSize per worker"
Write-Host "  Batch Size: $BATCH_SIZE`n"

# Stop existing
Stop-Process -Name python -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Launch workers
for ($i = 0; $i -lt $NUM_WORKERS; $i++) {
    $workerId = $i + 1
    $start = $i * $chunkSize
    $end = [Math]::Min(($i + 1) * $chunkSize, $TOTAL_ERRORS)

    $cmd = "& '$PYTHON' '$SCRIPT' --input '$INPUT' --start $start --end $end --worker-id $workerId --ollama-port 11434 --batch-size $BATCH_SIZE"

    Write-Host "  [Worker $workerId] $start - $end" -ForegroundColor Green

    Start-Process pwsh -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
    Start-Sleep -Milliseconds 500
}

Write-Host "`n[Launched] Check the 2 terminal windows for progress" -ForegroundColor Yellow
Write-Host "[Monitor] Run: .\phase90-status.ps1`n"
