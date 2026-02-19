# Enhanced PowerShell script to fix CUDA 13.0 inline assembly errors
# This patches cuda_fp16.hpp and cuda_bf16.hpp to use correct pointer constraints
# Features: Error checking, memory safety, OOM protection, rollback capability

param(
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Verbose
)

# Set error handling
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Enhanced CUDA 13.0 Header Fix Script v2.0" -ForegroundColor Cyan  
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Memory and system checks
function Test-SystemResources {
    try {
        $memory = Get-WmiObject -Class Win32_OperatingSystem
        $availableGB = [math]::Round($memory.FreePhysicalMemory / 1MB, 2)
        
        if ($availableGB -lt 1) {
            Write-Host "⚠️ Warning: Low memory ($availableGB GB available)" -ForegroundColor Yellow
            return $false
        }
        
        Write-Host "✅ Memory check passed ($availableGB GB available)" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "⚠️ Warning: Could not check system resources" -ForegroundColor Yellow
        return $true
    }
}

# File safety checks
function Test-FileSafety {
    param([string]$FilePath)
    
    try {
        # Check file size (prevent OOM on huge files)
        $fileInfo = Get-Item $FilePath
        $fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
        
        if ($fileSizeMB -gt 100) {
            Write-Host "❌ File too large ($fileSizeMB MB): $FilePath" -ForegroundColor Red
            return $false
        }
        
        # Check if file is locked
        $stream = $null
        try {
            $stream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            $stream.Close()
            return $true
        }
        catch {
            Write-Host "❌ File is locked or in use: $FilePath" -ForegroundColor Red
            return $false
        }
        finally {
            if ($stream) { $stream.Dispose() }
        }
    }
    catch {
        Write-Host "❌ Cannot access file: $FilePath" -ForegroundColor Red
        return $false
    }
}

$cudaIncludePath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include"

# Enhanced administrator check
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator"))
{
    Write-Host "❌ This script requires administrator privileges" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator" -ForegroundColor Yellow
    Write-Host "Or run: Start-Process PowerShell -Verb RunAs" -ForegroundColor Gray
    exit 1
}

# System resource check
if (-not (Test-SystemResources)) {
    if (-not $Force) {
        Write-Host "❌ Insufficient system resources. Use -Force to override" -ForegroundColor Red
        exit 1
    }
}

# Verify CUDA headers exist
$fp16Header = Join-Path $cudaIncludePath "cuda_fp16.hpp"
$bf16Header = Join-Path $cudaIncludePath "cuda_bf16.hpp"

if (-not (Test-Path $fp16Header)) {
    Write-Host "❌ cuda_fp16.hpp not found at $fp16Header" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $bf16Header)) {
    Write-Host "❌ cuda_bf16.hpp not found at $bf16Header" -ForegroundColor Red
    exit 1
}

Write-Host "✅ CUDA headers found" -ForegroundColor Green
Write-Host ""

# Create backup directory
$backupDir = Join-Path $cudaIncludePath "backup_original"
if (-not (Test-Path $backupDir)) {
    Write-Host "Creating backup directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

# Backup original headers
Write-Host "Backing up original headers..." -ForegroundColor Yellow
Copy-Item $fp16Header (Join-Path $backupDir "cuda_fp16.hpp.backup") -Force
Copy-Item $bf16Header (Join-Path $backupDir "cuda_bf16.hpp.backup") -Force
Write-Host "✅ Backups created" -ForegroundColor Green

# Enhanced patching function with safety checks
function Invoke-SafePatch {
    param(
        [string]$FilePath,
        [string]$FileName,
        [hashtable]$Replacements
    )
    
    Write-Host ""
    Write-Host "Patching $FileName..." -ForegroundColor Yellow
    
    if ($DryRun) {
        Write-Host "🔍 DRY RUN: Would patch $FileName" -ForegroundColor Cyan
        return $true
    }
    
    try {
        # Safety checks
        if (-not (Test-FileSafety $FilePath)) {
            return $false
        }
        
        # Read content with memory management
        $content = $null
        try {
            $content = Get-Content $FilePath -Raw -ErrorAction Stop
        }
        catch {
            Write-Host "❌ Failed to read $FileName: $_" -ForegroundColor Red
            return $false
        }
        
        if ([string]::IsNullOrEmpty($content)) {
            Write-Host "❌ $FileName is empty or unreadable" -ForegroundColor Red
            return $false
        }
        
        # Apply patches with change tracking
        $originalContent = $content
        $changeCount = 0
        
        foreach ($pattern in $Replacements.Keys) {
            $replacement = $Replacements[$pattern]
            $matches = [regex]::Matches($content, $pattern)
            
            if ($matches.Count -gt 0) {
                $content = $content -replace $pattern, $replacement
                $changeCount += $matches.Count
                
                if ($Verbose) {
                    Write-Host "  ✓ Applied $($matches.Count) replacements for pattern: $pattern" -ForegroundColor Gray
                }
            }
        }
        
        if ($changeCount -eq 0) {
            Write-Host "⚠️ No changes needed in $FileName" -ForegroundColor Yellow
            return $true
        }
        
        # Verify changes before writing
        if ($content.Length -eq 0) {
            Write-Host "❌ Patch would result in empty file: $FileName" -ForegroundColor Red
            return $false
        }
        
        # Create temp file first (atomic operation)
        $tempFile = "$FilePath.tmp"
        try {
            Set-Content $tempFile $content -Encoding UTF8 -ErrorAction Stop
            
            # Verify temp file
            $tempContent = Get-Content $tempFile -Raw -ErrorAction Stop
            if ($tempContent.Length -ne $content.Length) {
                Write-Host "❌ Temp file verification failed for $FileName" -ForegroundColor Red
                Remove-Item $tempFile -Force
                return $false
            }
            
            # Atomic replace
            Move-Item $tempFile $FilePath -Force -ErrorAction Stop
            Write-Host "✅ $FileName patched successfully ($changeCount changes)" -ForegroundColor Green
            return $true
        }
        catch {
            Write-Host "❌ Failed to write $FileName: $_" -ForegroundColor Red
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            }
            return $false
        }
    }
    catch {
        Write-Host "❌ Unexpected error patching $FileName: $_" -ForegroundColor Red
        return $false
    }
    finally {
        # Force garbage collection for large files
        if ($content -and $content.Length -gt 10MB) {
            $content = $null
            [System.GC]::Collect()
        }
    }
}

# Define patch patterns (escaped for safety)
$patchPatterns = @{
    ': "r"\(ptr\)' = ': "l"(ptr)'
    ': "r"\(address\)' = ': "l"(address)'
    '"r"\(\*\(reinterpret_cast<[^>]+>\(&\([^)]+\)\)\)\)' = '"l"(*__ptr)'
}

# Patch cuda_fp16.hpp
$fp16Success = Invoke-SafePatch -FilePath $fp16Header -FileName "cuda_fp16.hpp" -Replacements $patchPatterns

# Patch cuda_bf16.hpp  
$bf16Success = Invoke-SafePatch -FilePath $bf16Header -FileName "cuda_bf16.hpp" -Replacements $patchPatterns

# Final status and instructions
Write-Host ""
if ($fp16Success -and $bf16Success) {
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host "✅ All Patches Applied Successfully!" -ForegroundColor Green
    Write-Host "===========================================" -ForegroundColor Green
    $exitCode = 0
} elseif ($DryRun) {
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "🔍 Dry Run Completed" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    $exitCode = 0
} else {
    Write-Host "===========================================" -ForegroundColor Red
    Write-Host "❌ Patch Failed" -ForegroundColor Red
    Write-Host "===========================================" -ForegroundColor Red
    $exitCode = 1
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  cuda_fp16.hpp: $(if ($fp16Success) { '✅ Patched' } else { '❌ Failed' })" -ForegroundColor $(if ($fp16Success) { 'Green' } else { 'Red' })
Write-Host "  cuda_bf16.hpp: $(if ($bf16Success) { '✅ Patched' } else { '❌ Failed' })" -ForegroundColor $(if ($bf16Success) { 'Green' } else { 'Red' })

if ($exitCode -eq 0 -and -not $DryRun) {
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Test CUDA compilation:" -ForegroundColor White
    Write-Host "     nvcc -c -o test.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86" -ForegroundColor Gray
    Write-Host "  2. Build Go service:" -ForegroundColor White  
    Write-Host "     go build -o enhanced-rag-service.exe ." -ForegroundColor Gray
    Write-Host "  3. Test with GPU acceleration:" -ForegroundColor White
    Write-Host "     .\enhanced-rag-service.exe" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Backup/Restore Commands:" -ForegroundColor Yellow
Write-Host "  Restore: Copy-Item '$backupDir\*.backup' '$cudaIncludePath\' -Force" -ForegroundColor Gray
Write-Host "  Verify:  nvcc --version && where cl" -ForegroundColor Gray

Write-Host ""
exit $exitCode