# Simple CUDA 13.0 Fix Script - Enhanced but working
param([switch]$DryRun, [switch]$Force)

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "CUDA 13.0 Simple Fix Pipeline" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
$logFile = Join-Path $scriptDir "cuda-fix.log"

function Write-Log($msg) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    $logMsg = "[$timestamp] $msg"
    Write-Host $logMsg
    Add-Content $logFile $logMsg
}

Write-Log "Starting CUDA fix pipeline..."

# Step 1: Check environment
Write-Log "Step 1: Checking environment..."

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ Administrator privileges required" -ForegroundColor Red
    if (-not $Force) { exit 1 }
}

$cudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
if (-not (Test-Path $cudaPath)) {
    Write-Log "❌ CUDA 13.0 not found"
    exit 1
}

Write-Log "✅ Environment checks passed"

# Step 2: Run header patch
Write-Log "Step 2: Patching CUDA headers..."

try {
    $patchScript = Join-Path $scriptDir "fix-cuda13-headers.ps1"
    if (Test-Path $patchScript) {
        if ($DryRun) {
            & $patchScript -DryRun
        } else {
            & $patchScript
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "✅ Headers patched successfully"
        } else {
            Write-Log "❌ Header patching failed"
            exit 1
        }
    } else {
        Write-Log "❌ Patch script not found"
        exit 1
    }
} catch {
    Write-Log "❌ Error in header patching: $_"
    exit 1
}

# Step 3: Test CUDA compilation
Write-Log "Step 3: Testing CUDA compilation..."

if (-not $DryRun) {
    try {
        # Use PowerShell job to test CUDA in clean environment
        $testJob = Start-Job -ScriptBlock {
            Import-Module 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\Microsoft.VisualStudio.DevShell.dll' -ErrorAction SilentlyContinue
            Enter-VsDevShell -VsInstallPath 'C:\Program Files\Microsoft Visual Studio\2022\Community' -SkipAutomaticLocation
            Set-Location $using:scriptDir
            
            $result = & nvcc -c -o test_simple.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86 2>&1
            return @{ ExitCode = $LASTEXITCODE; Output = $result -join "`n" }
        }
        
        $testResult = Receive-Job $testJob -Wait
        Remove-Job $testJob
        
        if ($testResult.ExitCode -eq 0) {
            Write-Log "✅ CUDA compilation test passed"
            # Clean up test file
            $testFile = Join-Path $scriptDir "test_simple.o"
            if (Test-Path $testFile) { Remove-Item $testFile -Force }
        } else {
            Write-Log "❌ CUDA compilation failed:"
            Write-Log $testResult.Output
            exit 1
        }
    } catch {
        Write-Log "❌ Error testing CUDA: $_"
        exit 1
    }
} else {
    Write-Log "🔍 Skipping CUDA test (dry run)"
}

# Step 4: Build Go service
Write-Log "Step 4: Building Go service..."

if (-not $DryRun) {
    try {
        # Clean old build
        $oldExe = Join-Path $scriptDir "enhanced-rag-service.exe"
        if (Test-Path $oldExe) { Remove-Item $oldExe -Force }
        
        # Build Go service
        $buildJob = Start-Job -ScriptBlock {
            Set-Location $using:scriptDir
            $result = & go build -o enhanced-rag-service.exe . 2>&1
            return @{ ExitCode = $LASTEXITCODE; Output = $result -join "`n" }
        }
        
        $buildResult = Receive-Job $buildJob -Wait -Timeout 120
        Remove-Job $buildJob
        
        if ($buildResult.ExitCode -eq 0 -and (Test-Path $oldExe)) {
            $fileSize = [math]::Round((Get-Item $oldExe).Length / 1MB, 2)
            Write-Log "✅ Go build successful ($fileSize MB)"
        } else {
            Write-Log "❌ Go build failed:"
            Write-Log $buildResult.Output
            exit 1
        }
    } catch {
        Write-Log "❌ Error building Go service: $_"
        exit 1
    }
} else {
    Write-Log "🔍 Skipping Go build (dry run)"
}

# Success!
Write-Host ""
Write-Host "🎉 CUDA 13.0 Fix Complete!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

if (-not $DryRun) {
    $finalExe = Join-Path $scriptDir "enhanced-rag-service.exe"
    if (Test-Path $finalExe) {
        Write-Host "✅ Enhanced RAG Service built with CUDA support" -ForegroundColor Green
        Write-Host "   File: $finalExe" -ForegroundColor Gray
        Write-Host "   Size: $([math]::Round((Get-Item $finalExe).Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host ""
        Write-Host "To test the service:" -ForegroundColor Yellow
        Write-Host "   .\enhanced-rag-service.exe" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Log saved to: $logFile" -ForegroundColor Gray