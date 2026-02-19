<#
PowerShell build script for Emscripten WebAssembly (Windows-friendly).

Prerequisites:
- Install Emscripten SDK (emsdk) and activate it. Recommended: use WSL or Git Bash for easiest path, but this PowerShell script works if `emcc` is on PATH.
- Open a Developer PowerShell or ensure environment variables from emsdk are loaded.

This script will produce two files in the same folder:
- bvh_accelerator.wasm
- bvh_accelerator.js

Place both files under your frontend static folder (e.g. sveltekit-frontend/static/wasm/) so the browser can import `/wasm/bvh_accelerator.js`.

Usage:
.
\build-wasm.ps1
#>

param(
  [string]$OutDir = "${PSScriptRoot}\..\..\sveltekit-frontend\static\wasm",
  [string]$SourceDir = "${PSScriptRoot}"
)

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
  Write-Error "emcc not found on PATH. Ensure Emscripten is installed and 'emcc' is available in this PowerShell session. Use emsdk activate and run emsdk_env or open a shell with emsdk variables set.";
  exit 1;
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$main = Join-Path $SourceDir "main.cpp"
$src = Join-Path $SourceDir "bvh.cpp"
$hdr = Join-Path $SourceDir "bvh.h"

Write-Host "🐘 Building Cyber Elephant WebAssembly Accelerator..."
Write-Host "Sources: $main, $src"

$outJs = Join-Path $OutDir "cyber-elephant-accelerator.js"
$outWasm = Join-Path $OutDir "cyber-elephant-accelerator.wasm"

$cmd = @(
  'emcc',
  $main,
  $src,
  '-std=c++17',
  '-O3',
  '-s', 'WASM=1',
  '-s', 'MODULARIZE=1',
  '-s', 'EXPORT_ES6=1',
  '-s', 'EXPORT_NAME="createCyberElephantAccelerator"',
  '-s', 'EXTRA_EXPORTED_RUNTIME_METHODS=["cwrap"]',
  '-s', 'ALLOW_MEMORY_GROWTH=1',
  '-s', 'INITIAL_MEMORY=16777216',
  '-s', 'MAXIMUM_MEMORY=268435456',
  '-lembind',
  '--no-entry',
  '-o', $outJs
)

Write-Host "Running: $($cmd -join ' ')"

$proc = Start-Process -FilePath emcc -ArgumentList $cmd[1..($cmd.Length-1)] -NoNewWindow -Wait -PassThru
if ($proc.ExitCode -ne 0) { Write-Error "emcc failed with exit code $($proc.ExitCode)"; exit $proc.ExitCode }

Write-Host "✅ WebAssembly build successful!"
Write-Host "📦 Output files:"
Write-Host "   - $outJs"
Write-Host "   - $outWasm"
Write-Host "Copy these files to: sveltekit-frontend/static/wasm/ and then start your dev server. Import path used by frontend: /wasm/bvh_accelerator.js"
