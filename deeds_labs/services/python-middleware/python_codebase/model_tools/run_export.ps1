# Force UTF-8 everywhere
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Container = "phase66-tensorrt-llm"
$LocalScriptPath = "C:\Users\james\Videos\deeds-web-app\python_codebase\model_tools\export_gemma3_final.py"
$ScriptInContainer = "/workspace/export_gemma3_final.py"
$LogPathInContainer = "/workspace/gemma3_export.log"
$LocalLog = "C:\Users\james\Videos\deeds-web-app\python_codebase\model_tools\gemma3_export.log"


Write-Host "=== COPYING EXPORT SCRIPT TO DOCKER CONTAINER ===" -ForegroundColor Cyan
docker cp $LocalScriptPath "${Container}:${ScriptInContainer}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "FATAL: docker cp failed." -ForegroundColor Red
    exit 1
}

Write-Host "=== RUNNING EXPORT SCRIPT INSIDE DOCKER CONTAINER ===" -ForegroundColor Cyan
docker exec $Container bash -lc "python3 -u $ScriptInContainer > $LogPathInContainer 2>&1; echo EXIT:\$? >> $LogPathInContainer"

Write-Host "=== COPYING LOGS BACK FROM CONTAINER ===" -ForegroundColor Cyan
docker cp "${Container}:${LogPathInContainer}" $LocalLog

Write-Host "=== DONE ==="
Write-Host "Log saved to: $LocalLog" -ForegroundColor Green
