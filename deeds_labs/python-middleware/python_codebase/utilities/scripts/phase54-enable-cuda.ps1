<#
.SYNOPSIS
  Phase 54 – CUDA Verification & Auto-Healing Script
  Ensures NVIDIA GPU + Torch CUDA are working for YoRHa Legal AI pipelines.
#>

param(
    [string] $StatusFile = '',
    [switch] $AutoHeal
)

Write-Host "🚀 Phase 54 – Verifying CUDA Environment..." -ForegroundColor Cyan

# --- Step 1: Check NVIDIA driver presence ---
$nvidia = (Get-Command nvidia-smi -ErrorAction SilentlyContinue)
if (-not $nvidia) {
    Write-Warning "⚠️  NVIDIA driver not found or PATH missing. Install or update from https://www.nvidia.com/Download/index.aspx"
    exit 1
}

Write-Host "`n🧩 Running nvidia-smi ..." -ForegroundColor Yellow
try {
    & nvidia-smi
} catch {
    Write-Warning "nvidia-smi execution failed: $_"
}

# Also check for nvcc (optional)
$nvcc = Get-Command nvcc -ErrorAction SilentlyContinue
if ($nvcc) {
    Write-Host "`n🧩 nvcc found (CUDA Toolkit):" -ForegroundColor Yellow
    try { & nvcc --version } catch { Write-Host "nvcc --version failed" }
} else {
    Write-Host "`nℹ️ nvcc (CUDA Toolkit) not found in PATH — this is optional but useful for native builds." -ForegroundColor DarkYellow
}

# --- Step 2: Activate Python virtual environment ---
$venvPath = "$env:USERPROFILE\Videos\deeds-web-app\.venv-phase46\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    Write-Host "`n🧠 Activating virtual environment .venv-phase46..." -ForegroundColor Green
    try {
        & $venvPath
    } catch {
        Write-Warning "Failed to activate venv via Activate.ps1 - continuing by calling python executable directly."
    }
} else {
    Write-Warning "❌ Venv not found at $venvPath — please create it before continuing."
    exit 1
}

$python = "$env:USERPROFILE\Videos\deeds-web-app\.venv-phase46\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Warning "❌ Python executable not found at $python. Ensure your venv exists and try again."
    exit 1
}

# --- Step 3: Check Torch CUDA availability ---
Write-Host "`n🧠 Checking PyTorch GPU status..." -ForegroundColor Cyan

$pyCmd = @"
import json,sys
info = { 'executable': sys.executable }
try:
    import torch
    info['torch_version'] = getattr(torch, '__version__', 'unknown')
    try:
        info['cuda_available'] = torch.cuda.is_available()
        info['device_count'] = torch.cuda.device_count() if info['cuda_available'] else 0
        if info['cuda_available'] and info['device_count']>0:
            try:
                info['gpu_name'] = torch.cuda.get_device_name(0)
            except Exception as e:
                info['gpu_name_error'] = str(e)
    except Exception as e:
        info['cuda_check_error'] = str(e)
except Exception as e:
    info['torch_import_error'] = str(e)
print(json.dumps(info))
"@

$torchJson = & $python -c $pyCmd
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Python returned non-zero exit code ($LASTEXITCODE) while probing torch. Output:`n$torchJson"
}

Write-Host $torchJson

# --- Step 4: Interpret results ---
try {
    $torchData = $torchJson | ConvertFrom-Json
    if ($torchData.cuda_available -eq $true) {
        Write-Host "`n✅ CUDA is available on $($torchData.gpu_name) (using Torch $($torchData.torch_version))" -ForegroundColor Green
        Write-Host "Ready for Phase 53 QA dashboard and gpu-lint.mjs to use GPU acceleration." -ForegroundColor Yellow
        if ($StatusFile) {
            $status = @{ ok = $true; gpu = $torchData.gpu_name; torch = $torchData.torch_version; device_count = $torchData.device_count }
            $status | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding utf8
        }
        exit 0
    } else {
        Write-Warning "❌ Torch reported CUDA unavailable. Common fixes:"
        Write-Host "  • Ensure NVIDIA driver matches CUDA runtime version reported by nvidia-smi (see 'CUDA Version')." -ForegroundColor White
        Write-Host "  • Reinstall the GPU-enabled PyTorch wheel (example):" -ForegroundColor White
        Write-Host "      python -m pip install --upgrade pip setuptools wheel" -ForegroundColor DarkGray
        Write-Host "      python -m pip install --upgrade --force-reinstall --no-deps --index-url https://download.pytorch.org/whl/cu128 torch torchvision torchaudio" -ForegroundColor DarkGray
        Write-Host "  • If you can't use GPU, install CPU-only torch: python -m pip install --upgrade torch --index-url https://download.pytorch.org/whl/cpu" -ForegroundColor DarkGray

        # Auto-heal: prompt user to reinstall GPU wheel if -AutoHeal specified
        if ($AutoHeal) {
            $confirm = Read-Host "AutoHeal is enabled. Proceed to reinstall GPU wheels from cu128? (y/N)"
            if ($confirm -match '^[Yy]') {
                Write-Host "Attempting to reinstall GPU wheels from cu128 index..." -ForegroundColor Cyan
                & $python -m pip install --upgrade --force-reinstall --no-deps --index-url https://download.pytorch.org/whl/cu128 torch torchvision torchaudio
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Reinstall complete; re-running torch probe..." -ForegroundColor Green
                    & $python -c $pyCmd | Out-Null
                    # re-run the script in-process to get fresh result
                    $torchJson = & $python -c $pyCmd
                    try { $torchData = $torchJson | ConvertFrom-Json } catch { Write-Warning "Reprobe parse failed" }
                    if ($torchData.cuda_available -eq $true) {
                        Write-Host "✅ Auto-heal succeeded; CUDA now available." -ForegroundColor Green
                        if ($StatusFile) { @{ ok = $true; auto_heal = $true; gpu = $torchData.gpu_name; torch = $torchData.torch_version } | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding utf8 }
                        exit 0
                    } else {
                        Write-Warning "Auto-heal attempted but CUDA still unavailable." -ForegroundColor Yellow
                        if ($StatusFile) { @{ ok = $false; auto_heal = $true; reason = 'still_cpu' } | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding utf8 }
                        exit 4
                    }
                } else {
                    Write-Warning "Auto-heal pip install failed. Check network, pip logs, and wheel compatibility." -ForegroundColor Red
                    if ($StatusFile) { @{ ok = $false; auto_heal = $true; reason = 'pip_failed' } | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding utf8 }
                    exit 5
                }
            } else {
                Write-Host "Auto-heal cancelled by user." -ForegroundColor Yellow
                if ($StatusFile) { @{ ok = $false; gpu = 'none'; reason = 'cancelled' } | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding utf8 }
                exit 6
            }
        }

        Write-Host "`nℹ️ You can re-run this script after making fixes or use -AutoHeal to attempt a pip reinstall." -ForegroundColor Magenta
        if ($StatusFile) { @{ ok = $false; gpu = 'none'; reason = 'cpu_only' } | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding utf8 }
        exit 2
    }
} catch {
    Write-Warning "Could not parse Torch output. Please run the python probe manually:`n$python -c ""import torch; print(torch.__version__, torch.cuda.is_available())"""
    exit 3
}

# --- Step 5: Optional integration trigger ---
Write-Host "`n🔗 To rerun Phase 53 QA after CUDA check: npm run qa:dashboard" -ForegroundColor Magenta
