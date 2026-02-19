Write-Host "CUDA 13.0 Header Fix - Basic Version" -ForegroundColor Cyan

$cudaInclude = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include"
$fp16File = "$cudaInclude\cuda_fp16.hpp"
$bf16File = "$cudaInclude\cuda_bf16.hpp"

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "Administrator privileges required" -ForegroundColor Red
    exit 1
}

# Check files exist
if (-not (Test-Path $fp16File)) {
    Write-Host "cuda_fp16.hpp not found" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $bf16File)) {
    Write-Host "cuda_bf16.hpp not found" -ForegroundColor Red  
    exit 1
}

Write-Host "Files found, creating backups..." -ForegroundColor Yellow

# Create backup
$backupDir = "$cudaInclude\backup_original"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force
}

Copy-Item $fp16File "$backupDir\cuda_fp16.hpp.backup" -Force
Copy-Item $bf16File "$backupDir\cuda_bf16.hpp.backup" -Force

Write-Host "Patching cuda_fp16.hpp..." -ForegroundColor Yellow

# Patch fp16
$content = Get-Content $fp16File -Raw
$content = $content -replace ': "r"\(ptr\)', ': "l"(ptr)'
$content = $content -replace ': "r"\(address\)', ': "l"(address)'
Set-Content $fp16File $content

Write-Host "Patching cuda_bf16.hpp..." -ForegroundColor Yellow

# Patch bf16
$content = Get-Content $bf16File -Raw
$content = $content -replace ': "r"\(ptr\)', ': "l"(ptr)'
$content = $content -replace ': "r"\(address\)', ': "l"(address)'
Set-Content $bf16File $content

Write-Host "Patches applied successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Test CUDA compilation with:" -ForegroundColor Yellow
Write-Host "nvcc -c -o test.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86" -ForegroundColor Gray