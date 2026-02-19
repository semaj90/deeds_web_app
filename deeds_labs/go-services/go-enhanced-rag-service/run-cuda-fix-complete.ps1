# Complete CUDA 13.0 Fix and Build Script
# Runs all steps safely with error checking and rollback capability

param(
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$Force
)

$ErrorActionPreference = "Continue"  # Don't stop on non-critical errors
Set-StrictMode -Version Latest

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Complete CUDA 13.0 Fix & Build Pipeline" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $scriptDir "cuda-fix-log.txt"

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry
    Add-Content $logFile $logEntry
}

# Step tracker
$steps = @(
    @{ Name = "Pre-flight checks"; Status = "Pending" }
    @{ Name = "Patch CUDA headers"; Status = "Pending" }
    @{ Name = "Test CUDA compilation"; Status = "Pending" }
    @{ Name = "Build Go service"; Status = "Pending" }
    @{ Name = "Verify final build"; Status = "Pending" }
)

function Update-StepStatus {
    param([int]$StepIndex, [string]$Status)
    $steps[$StepIndex].Status = $Status
    Write-Log "Step $($StepIndex + 1): $($steps[$StepIndex].Name) - $Status"
}

# Initialize log
Write-Log "Starting CUDA 13.0 fix pipeline" "START"
Write-Log "Parameters: DryRun=$DryRun, Verbose=$Verbose, Force=$Force"

try {
    # Step 1: Pre-flight checks
    Update-StepStatus 0 "Running"
    
    Write-Host "Step 1: Pre-flight system checks..." -ForegroundColor Yellow
    
    # Check if running as admin
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
    
    if (-not $isAdmin) {
        Write-Log "Not running as administrator" "ERROR"
        if (-not $Force) {
            Write-Host "❌ Administrator privileges required. Use -Force to continue anyway." -ForegroundColor Red
            exit 1
        }
    }
    
    # Check CUDA installation
    $cudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
    if (-not (Test-Path $cudaPath)) {
        Write-Log "CUDA 13.0 not found at $cudaPath" "ERROR"
        Write-Host "❌ CUDA 13.0 not found. Please install CUDA 13.0 first." -ForegroundColor Red
        exit 1
    }
    
    # Check VS environment
    $vsPath = "C:\Program Files\Microsoft Visual Studio\2022\Community"
    if (-not (Test-Path $vsPath)) {
        Write-Log "Visual Studio 2022 Community not found" "WARNING"
        Write-Host "⚠️ Visual Studio 2022 Community not found at expected location" -ForegroundColor Yellow
    }
    
    # Check Go installation
    try {
        $goVersion = & go version 2>&1
        Write-Log "Go version: $goVersion"
    }
    catch {
        Write-Log "Go not found in PATH" "ERROR"
        Write-Host "❌ Go not found. Please install Go 1.21+ first." -ForegroundColor Red
        exit 1
    }
    
    Update-StepStatus 0 "✅ Completed"
    
    # Step 2: Patch CUDA headers
    Update-StepStatus 1 "Running"
    
    Write-Host ""
    Write-Host "Step 2: Patching CUDA headers..." -ForegroundColor Yellow
    
    $patchScript = Join-Path $scriptDir "fix-cuda13-headers.ps1"
    if (-not (Test-Path $patchScript)) {
        Write-Log "Patch script not found: $patchScript" "ERROR"
        Update-StepStatus 1 "❌ Failed"
        exit 1
    }
    
    # Run patch script
    $patchArgs = @()
    if ($DryRun) { $patchArgs += "-DryRun" }
    if ($Verbose) { $patchArgs += "-Verbose" }
    if ($Force) { $patchArgs += "-Force" }
    
    try {
        if ($isAdmin) {
            & $patchScript @patchArgs
            $patchResult = $LASTEXITCODE
        } else {
            Write-Log "Running patch script without admin privileges" "WARNING"
            $patchResult = 1
        }
        
        if ($patchResult -eq 0) {
            Update-StepStatus 1 "✅ Completed"
        } else {
            Update-StepStatus 1 "❌ Failed"
            Write-Host "❌ Header patching failed. Check log for details." -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Log "Error running patch script: $_" "ERROR"
        Update-StepStatus 1 "❌ Failed"
        exit 1
    }
    
    # Step 3: Test CUDA compilation
    Update-StepStatus 2 "Running"
    
    Write-Host ""
    Write-Host "Step 3: Testing CUDA compilation..." -ForegroundColor Yellow
    
    if (-not $DryRun) {
        # Set up VS environment and test CUDA
        try {
            $testResult = Start-Process powershell -ArgumentList @(
                "-Command",
                "Import-Module 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\Microsoft.VisualStudio.DevShell.dll' -ErrorAction SilentlyContinue; " +
                "Enter-VsDevShell -VsInstallPath 'C:\Program Files\Microsoft Visual Studio\2022\Community' -SkipAutomaticLocation -ErrorAction SilentlyContinue; " +
                "cd '$scriptDir'; " +
                "nvcc -c -o test_cuda_fix.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86; " +
                "exit `$LASTEXITCODE"
            ) -Wait -PassThru -WindowStyle Hidden
            
            if ($testResult.ExitCode -eq 0) {
                Write-Log "CUDA compilation test passed"
                Update-StepStatus 2 "✅ Completed"
                
                # Clean up test file
                $testFile = Join-Path $scriptDir "test_cuda_fix.o"
                if (Test-Path $testFile) {
                    Remove-Item $testFile -Force
                }
            } else {
                Write-Log "CUDA compilation test failed with exit code $($testResult.ExitCode)" "ERROR"
                Update-StepStatus 2 "❌ Failed"
                Write-Host "❌ CUDA compilation still failing. Headers may need manual fixing." -ForegroundColor Red
                exit 1
            }
        }
        catch {
            Write-Log "Error testing CUDA compilation: $_" "ERROR"
            Update-StepStatus 2 "❌ Failed"
            exit 1
        }
    } else {
        Write-Log "Skipping CUDA compilation test (dry run)"
        Update-StepStatus 2 "🔍 Skipped (Dry Run)"
    }
    
    # Step 4: Build Go service
    Update-StepStatus 3 "Running"
    
    Write-Host ""
    Write-Host "Step 4: Building Go service with CUDA..." -ForegroundColor Yellow
    
    if (-not $DryRun) {
        try {
            # Clean previous builds
            $oldExe = Join-Path $scriptDir "enhanced-rag-service.exe"
            if (Test-Path $oldExe) {
                Remove-Item $oldExe -Force
            }
            
            # Build with CUDA support
            $buildResult = Start-Process "go" -ArgumentList @("build", "-o", "enhanced-rag-service.exe", ".") -WorkingDirectory $scriptDir -Wait -PassThru -WindowStyle Hidden
            
            if ($buildResult.ExitCode -eq 0 -and (Test-Path $oldExe)) {
                $fileSize = (Get-Item $oldExe).Length / 1MB
                Write-Log "Go build successful. Binary size: $([math]::Round($fileSize, 2)) MB"
                Update-StepStatus 3 "✅ Completed"
            } else {
                Write-Log "Go build failed with exit code $($buildResult.ExitCode)" "ERROR"
                Update-StepStatus 3 "❌ Failed"
                Write-Host "❌ Go build failed. Check compilation errors." -ForegroundColor Red
                exit 1
            }
        }
        catch {
            Write-Log "Error building Go service: $_" "ERROR"
            Update-StepStatus 3 "❌ Failed"
            exit 1
        }
    } else {
        Write-Log "Skipping Go build (dry run)"
        Update-StepStatus 3 "🔍 Skipped (Dry Run)"
    }
    
    # Step 5: Verify final build
    Update-StepStatus 4 "Running"
    
    Write-Host ""
    Write-Host "Step 5: Final verification..." -ForegroundColor Yellow
    
    if (-not $DryRun) {
        $finalExe = Join-Path $scriptDir "enhanced-rag-service.exe"
        if (Test-Path $finalExe) {
            $fileInfo = Get-Item $finalExe
            Write-Log "Final binary: $($fileInfo.Name), Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB, Modified: $($fileInfo.LastWriteTime)"
            Update-StepStatus 4 "✅ Completed"
        } else {
            Write-Log "Final binary not found" "ERROR"
            Update-StepStatus 4 "❌ Failed"
            exit 1
        }
    } else {
        Update-StepStatus 4 "🔍 Skipped (Dry Run)"
    }
    
    # Success summary
    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host "🎉 CUDA 13.0 Fix Pipeline Completed!" -ForegroundColor Green
    Write-Host "===========================================" -ForegroundColor Green
    
} catch {
    Write-Log "Pipeline failed with error: $_" "FATAL"
    Write-Host "❌ Pipeline failed. Check $logFile for details." -ForegroundColor Red
    exit 1
} finally {
    # Final status report
    Write-Host ""
    Write-Host "Pipeline Status:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $steps.Length; $i++) {
        $step = $steps[$i]
        $status = $step.Status
        $color = switch ($status) {
            "✅ Completed" { "Green" }
            "❌ Failed" { "Red" }
            "🔍 Skipped (Dry Run)" { "Cyan" }
            default { "Yellow" }
        }
        Write-Host "  $($i + 1). $($step.Name): $status" -ForegroundColor $color
    }
    
    Write-Host ""
    Write-Host "Log file: $logFile" -ForegroundColor Gray
    Write-Log "Pipeline completed" "END"
}