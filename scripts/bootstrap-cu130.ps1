##############################################################################
# bootstrap-cu130.ps1 — Create a native Windows CUDA 13 / PyTorch env
#
# Purpose: create a separate Windows venv for CUDA-capable PyTorch work
#          without mutating the existing CPU fallback .venv.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-cu130.ps1
#       (dry-run; prints commands)
#   powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-cu130.ps1 -Apply
#       (creates .venv-cu130 and installs CUDA-enabled PyTorch wheels)
#
##############################################################################

param(
    [switch]$Apply = $false,
    [string]$PythonVersion = '3.14'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venvRoot = Join-Path $repoRoot '.venv-cu130'
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
$pyExe = "py -$PythonVersion"
$torchIndex = 'https://download.pytorch.org/whl/cu130'

Write-Host "🔍 Native Windows CUDA 13 bootstrap" -ForegroundColor Green
Write-Host "═" * 60 -ForegroundColor Green
Write-Host "Repo root: $repoRoot" -ForegroundColor Gray
Write-Host "Venv:      $venvRoot" -ForegroundColor Gray
Write-Host "Python:    $PythonVersion" -ForegroundColor Gray
Write-Host "Mode:      $([string]::Join('', $(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })))" -ForegroundColor Gray
Write-Host ""

try {
    $pythonCheck = & py -$PythonVersion --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Python $PythonVersion launcher not available"
    }
    Write-Host "✓ Found $pythonCheck" -ForegroundColor Green
} catch {
    Write-Host "✗ Python $PythonVersion not available via py launcher" -ForegroundColor Red
    Write-Host "  Install Python $PythonVersion first, then rerun this script." -ForegroundColor Yellow
    exit 1
}

if (-not $Apply) {
    Write-Host ""
    Write-Host "[DRY-RUN] Would run:" -ForegroundColor Yellow
    Write-Host "  $pyExe -m venv `"$venvRoot`""
    Write-Host "  `"$venvPython`" -m pip install --upgrade pip setuptools wheel"
    Write-Host "  `"$venvPython`" -m pip install torch torchvision torchaudio --index-url $torchIndex"
    Write-Host "  `"$venvPython`" -c `"import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())`""
    exit 0
}

Write-Host ""
Write-Host "1) Creating virtual environment..." -ForegroundColor Cyan
& py -$PythonVersion -m venv $venvRoot

Write-Host "2) Upgrading packaging tools..." -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip setuptools wheel

Write-Host "3) Installing CUDA-enabled PyTorch wheels..." -ForegroundColor Cyan
& $venvPython -m pip install torch torchvision torchaudio --index-url $torchIndex

Write-Host "4) Verifying CUDA access..." -ForegroundColor Cyan
$verify = & $venvPython -c @'
import json
import torch
report = {
    "python": __import__("sys").version.split()[0],
    "torch": getattr(torch, "__version__", None),
    "torch_cuda": getattr(torch.version, "cuda", None),
    "cuda_available": bool(torch.cuda.is_available()),
    "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
}
print(json.dumps(report))
'@

Write-Host $verify
Write-Host ""
Write-Host "✅ .venv-cu130 created and verified" -ForegroundColor Green
Write-Host "Next: run the CUDA smoke test with atlas:gpu:python-cuda:smoke" -ForegroundColor Green

$summary = [ordered]@{
    host = [ordered]@{
        repo_root = $repoRoot
        venv = $venvRoot
        python = $PythonVersion
        apply = [bool]$Apply
    }
}

Write-Output ($summary | ConvertTo-Json -Compress -Depth 4)
