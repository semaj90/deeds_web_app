# Docker VHDX Compaction Script
# Run as Administrator: powershell -ExecutionPolicy Bypass -File scripts/compact-docker-vhdx.ps1

$ErrorActionPreference = 'Stop'
$vhdxPath = "C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx"

# Step 1: Check VHDX size before
if (Test-Path $vhdxPath) {
    $sizeBefore = [math]::Round((Get-Item $vhdxPath).Length / 1GB, 2)
    Write-Host "VHDX size before: ${sizeBefore} GB" -ForegroundColor Cyan
} else {
    Write-Host "VHDX not found at $vhdxPath" -ForegroundColor Red
    exit 1
}

# Step 2: Quit Docker Desktop
Write-Host "Stopping Docker Desktop..." -ForegroundColor Yellow
Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process 'com.docker.backend' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Step 3: Shutdown WSL
Write-Host "Shutting down WSL..." -ForegroundColor Yellow
wsl --shutdown
Start-Sleep -Seconds 5

# Step 4: Compact via diskpart
Write-Host "Compacting VHDX (this may take several minutes)..." -ForegroundColor Yellow
$scriptPath = Join-Path $PSScriptRoot "compact-vhdx.txt"
diskpart /s $scriptPath

# Step 5: Check size after
if (Test-Path $vhdxPath) {
    $sizeAfter = [math]::Round((Get-Item $vhdxPath).Length / 1GB, 2)
    $saved = [math]::Round($sizeBefore - $sizeAfter, 2)
    Write-Host "`nVHDX size after:  ${sizeAfter} GB" -ForegroundColor Green
    Write-Host "Space reclaimed:  ${saved} GB" -ForegroundColor Green
} else {
    Write-Host "VHDX file not found after compaction (detach may have moved it)" -ForegroundColor Yellow
}

# Step 6: Restart Docker Desktop
Write-Host "`nStarting Docker Desktop..." -ForegroundColor Yellow
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
Write-Host "Docker Desktop starting. Wait ~30s, then run:" -ForegroundColor Cyan
Write-Host "  docker compose --profile gpu up -d" -ForegroundColor White
