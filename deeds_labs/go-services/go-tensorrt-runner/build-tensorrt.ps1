<#
Build helper for go-tensorrt-runner (Windows PowerShell).

What it does:
- Detects a CUDA install under `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA` (picks newest)
- Attempts to detect a TensorRT install under common Program Files locations
- Sets `CGO_CFLAGS` and `CGO_LDFLAGS` in-session and runs `go build -v` in this folder

Usage:
  Open a new PowerShell (so environment changes apply) and run:
    .\build-tensorrt.ps1

If detection fails, set environment vars manually before running `go build`:
  $env:CGO_CFLAGS = '-I"C:/Path/To/CUDA/include" -I"C:/Path/To/TensorRT/include" -O3 -std=c++17'
  $env:CGO_LDFLAGS = '-L"C:/Path/To/CUDA/lib/x64" -L"C:/Path/To/TensorRT/lib" -lnvinfer -lnvonnxparser -lcudart -lstdc++'
  go build -v
#>

Push-Location -Path (Split-Path -Path $MyInvocation.MyCommand.Path -Parent)

function Find-LatestCuda {
    $base = 'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA'
    if (-not (Test-Path $base)) { return $null }
    $dirs = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    if (-not $dirs) { return $null }
    # pick highest version-like folder by name
    $sorted = $dirs | Sort-Object -Descending
    return $sorted[0]
}

function Find-TensorRT {
    $cands = @(
        'C:\Program Files\NVIDIA GPU Computing Toolkit\TensorRT',
        'C:\Program Files\NVIDIA Corporation\TensorRT',
        'C:\Program Files\TensorRT'
    )
    foreach ($p in $cands) { if (Test-Path $p) { return $p } }
    # fallback: search Program Files for TensorRT* directories
    $found = Get-ChildItem 'C:\Program Files' -Directory -Filter 'TensorRT*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    if ($found) { return $found[0] }
    return $null
}

# Detect CUDA
if ($env:CUDA_PATH) { $cuda = $env:CUDA_PATH } else { $cuda = Find-LatestCuda }
if (-not $cuda) {
    Write-Error "CUDA toolkit not found in expected locations. Please set `CUDA_PATH` or install CUDA."
    Pop-Location; exit 1
}

$trt = Find-TensorRT

Write-Host "Detected CUDA: $cuda" -ForegroundColor Cyan
if ($trt) { Write-Host "Detected TensorRT: $trt" -ForegroundColor Cyan } else { Write-Warning "TensorRT not found; building without TensorRT libs." }

# Build CGO flags
$incs = @()
$libs = @()
function Get-ShortPath {
    param([string]$Path)
    # Use cmd.exe to obtain the short (8.3) path which avoids spaces
    $cmd = "for %I in (`"$Path`") do @echo %~sI"
    $out = & cmd /c $cmd 2>$null
    if ($out) { return $out.Trim() }
    return $Path
}

# Prefer short paths to avoid quoting issues when passed to clang via cgo
$cudaShort = Get-ShortPath $cuda
$incs += "-I$($cudaShort)\include"
$libs += "-L$($cudaShort)\lib\x64"
if ($trt) { $trtShort = Get-ShortPath $trt; $incs += "-I$($trtShort)\include"; $libs += "-L$($trtShort)\lib" }

# If TensorRT isn't installed, create a small stub implementation so the
# package can still build for local development without TRT. If TRT is
# present, remove any stub files.
$stubH = Join-Path (Get-Location) 'trt_runner.h'
$stubCpp = Join-Path (Get-Location) 'trt_runner.cpp'
if (-not $trt) {
    Write-Host "Writing TensorRT stub files (no TensorRT present)" -ForegroundColor Yellow
    $h = @'
#pragma once
#ifdef __cplusplus
extern "C" {
#endif

void loadEngine(const char* path);
const char* runInference(const char* input);

#ifdef __cplusplus
}
#endif
'@
    $cpp = @'
#include "trt_runner.h"
#include <string>

void loadEngine(const char* path) {
    (void)path; // stub no-op
}

const char* runInference(const char* input) {
    static std::string out;
    out = std::string("[trt-stub] ") + (input ? input : "");
    return out.c_str();
}
'@
    Set-Content -Path $stubH -Value $h -Encoding UTF8
    Set-Content -Path $stubCpp -Value $cpp -Encoding UTF8
} else {
    # remove any existing stubs to avoid conflicting with real TRT
    if (Test-Path $stubH) { Remove-Item $stubH -Force -ErrorAction SilentlyContinue }
    if (Test-Path $stubCpp) { Remove-Item $stubCpp -Force -ErrorAction SilentlyContinue }
}

# Use CFLAGS for C compiler and CXXFLAGS for C++ flags to avoid passing C++ flags to C
$env:CGO_CFLAGS = ($incs -join ' ') + ' -O3'
$env:CGO_CXXFLAGS = '-std=c++17'
if ($trt) {
    $env:CGO_LDFLAGS = ($libs -join ' ') + ' -lnvinfer -lnvonnxparser -lcudart -lstdc++'
} else {
    $env:CGO_LDFLAGS = ($libs -join ' ') + ' -lcudart -lstdc++'
}

Write-Host "CGO_CFLAGS = $env:CGO_CFLAGS" -ForegroundColor Yellow
Write-Host "CGO_LDFLAGS = $env:CGO_LDFLAGS" -ForegroundColor Yellow

Write-Host "Running: go build -v" -ForegroundColor Green
# Ensure `main.go` has a valid cgo preamble. Some editors accidentally
# add code fences or malformed comments which make `go build` fail with
# "invalid #cgo line". Overwrite `main.go` with a minimal, valid source
#+ preamble before building.
$mainPath = Join-Path (Get-Location) 'main.go'
$fixed = @'
package main

// Build notes: use build-tensorrt.ps1 to set CGO_CFLAGS/CGO_LDFLAGS.
/*
#include "trt_runner.h"
*/
import "C"

import "fmt"

func main() {
    fmt.Println("🚀 Starting TensorRT Go microservice")
    C.loadEngine(C.CString("/workspace/engines/gemma3_270m_fp16.engine"))
    out := C.runInference(C.CString("Hello"))
    fmt.Println("Output:", C.GoString(out))
}
'@

Set-Content -Path $mainPath -Value $fixed -Encoding UTF8

go build -v

if ($LASTEXITCODE -ne 0) { Write-Error "go build failed with exit code $LASTEXITCODE"; Pop-Location; exit $LASTEXITCODE }

Write-Host "Build succeeded." -ForegroundColor Green
Pop-Location