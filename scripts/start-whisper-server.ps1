<#
.SYNOPSIS
  Start a persistent whisper.cpp server on :8178 for GPU-resident transcription.

.DESCRIPTION
  Keeps ggml-base.bin loaded in VRAM so each transcription request is ~50ms
  instead of the 2-3s cold-start cost of per-request whisper-cli.exe spawning.

  API surface (whisper.cpp server):
    POST /inference   multipart/form-data, field "file"
    GET  /health      → {"status":"ok"}

  Discovery order for the server binary (first match wins):
    1. WHISPER_PATH env var (must be the whisper-server.exe path, not the CLI)
    2. <script-dir>/../sveltekit-frontend/node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/Release/whisper-server.exe
    3. Fatal error with build instructions

  Discovery order for the model file:
    1. WHISPER_MODEL_PATH env var (full path to a .bin file)
    2. <whisper-dir>/models/ggml-<WHISPER_MODEL>.bin   (WHISPER_MODEL default: base)

  VRAM budget: ggml-base.bin ≈ 142MB; fits alongside gemma4-legal-vlm ≈ 5.8GB on 8GB RTX 3060 Ti.

.PARAMETER Detached
  Start with -WindowStyle Hidden, poll /health, return after PID is stable.
  Without this switch, runs whisper-server.exe in the foreground.

.PARAMETER GpuLayers
  Number of model layers to offload to GPU (default 99 = full offload).
  Set to 0 to force CPU-only (override for WHISPER_DEVICE=cpu).

.ENV
  WHISPER_PATH         Path to whisper-server.exe (auto-detected if unset)
  WHISPER_MODEL        Model name: tiny|base|small|medium|large  (default: base)
  WHISPER_MODEL_PATH   Full path to .bin file (overrides WHISPER_MODEL discovery)
  WHISPER_DEVICE       cpu|cuda  (default: cpu — sets GPU layers to 0 when cpu)
  WHISPER_SERVER_URL   Informational only — used by SvelteKit; default http://127.0.0.1:8178
  WHISPER_USE_SERVER   Set to true in .env to activate server-mode in SvelteKit
  WHISPER_PORT         Override port (default: 8178 parsed from WHISPER_SERVER_URL)
#>
[CmdletBinding()]
param(
  [switch] $Detached,
  [int]    $GpuLayers = -1   # -1 means "derive from WHISPER_DEVICE"
)

$ErrorActionPreference = 'Stop'

# ── Resolve port from WHISPER_SERVER_URL (or explicit WHISPER_PORT) ─────────
$serverUrl = if ($env:WHISPER_SERVER_URL) { $env:WHISPER_SERVER_URL } else { 'http://127.0.0.1:8178' }
$port = if ($env:WHISPER_PORT) {
  $env:WHISPER_PORT
} else {
  try { ([System.Uri]$serverUrl).Port } catch { '8178' }
}

# ── Derive GPU layers from WHISPER_DEVICE (explicit -GpuLayers overrides) ──
$device     = if ($env:WHISPER_DEVICE) { $env:WHISPER_DEVICE.ToLower() } else { 'cpu' }
$gpuLayersResolved = if ($GpuLayers -ge 0) {
  $GpuLayers
} elseif ($device -eq 'cuda') {
  99
} else {
  0
}

# ── Resolve server binary ────────────────────────────────────────────────────
$defaultServerPath = Join-Path $PSScriptRoot '..\sveltekit-frontend\node_modules\nodejs-whisper\cpp\whisper.cpp\build\bin\Release\whisper-server.exe'
$serverExe = if ($env:WHISPER_PATH) { $env:WHISPER_PATH } else { $defaultServerPath }

if (-not (Test-Path $serverExe)) {
  $whisperCppDir = Join-Path $PSScriptRoot '..\sveltekit-frontend\node_modules\nodejs-whisper\cpp\whisper.cpp'
  Write-Host ''
  Write-Host 'ERROR: whisper-server.exe not found at:' -ForegroundColor Red
  Write-Host "  $serverExe" -ForegroundColor DarkYellow
  Write-Host ''
  Write-Host 'Build it with one of:' -ForegroundColor Cyan
  Write-Host '  # Option A — install nodejs-whisper (builds whisper.cpp via node-gyp)' -ForegroundColor DarkGray
  Write-Host '  cd sveltekit-frontend && npm i nodejs-whisper' -ForegroundColor White
  Write-Host ''
  Write-Host '  # Option B — manual CMake build (requires cmake + Visual Studio)' -ForegroundColor DarkGray
  Write-Host "  cd `"$whisperCppDir`"" -ForegroundColor White
  Write-Host '  cmake -B build -DWHISPER_CUDA=ON -DCMAKE_BUILD_TYPE=Release' -ForegroundColor White
  Write-Host '  cmake --build build --config Release --target whisper-server' -ForegroundColor White
  Write-Host ''
  Write-Host '  # After building, download the model (if not present):' -ForegroundColor DarkGray
  Write-Host "  cd `"$whisperCppDir`" && .\models\download-ggml-model.cmd base" -ForegroundColor White
  Write-Host ''
  Write-Host 'Or set WHISPER_PATH to the server binary path.' -ForegroundColor DarkGray
  exit 1
}

# ── Resolve model file ───────────────────────────────────────────────────────
$modelName = if ($env:WHISPER_MODEL) { $env:WHISPER_MODEL.ToLower() } else { 'base' }
$whisperDir = Split-Path (Split-Path (Split-Path (Split-Path $serverExe -Parent) -Parent) -Parent) -Parent

$modelFile = if ($env:WHISPER_MODEL_PATH) {
  $env:WHISPER_MODEL_PATH
} else {
  Join-Path $whisperDir "models\ggml-$modelName.bin"
}

if (-not (Test-Path $modelFile)) {
  Write-Host ''
  Write-Host "ERROR: Model not found at: $modelFile" -ForegroundColor Red
  Write-Host ''
  Write-Host "Download it:" -ForegroundColor Cyan
  Write-Host "  cd `"$whisperDir`" && .\models\download-ggml-model.cmd $modelName" -ForegroundColor White
  Write-Host "Or set WHISPER_MODEL_PATH to the full path of a .bin file." -ForegroundColor DarkGray
  Write-Host ''
  exit 1
}

# ── Already healthy? ──────────────────────────────────────────────────────────
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 1
  if ($h.status -eq 'ok' -or $h.status -eq 'loading') {
    Write-Host "Whisper server already healthy on http://127.0.0.1:$port" -ForegroundColor Yellow
    exit 0
  }
} catch { }

# ── Build argument list ───────────────────────────────────────────────────────
$serverArgs = @(
  '--model',  $modelFile,
  '--port',   $port,
  '--host',   '127.0.0.1'
)
if ($gpuLayersResolved -gt 0) {
  $serverArgs += @('--gpu-layers', $gpuLayersResolved)
}

Write-Host ''
Write-Host '  Whisper Server' -ForegroundColor Cyan
Write-Host "  Port  : $port" -ForegroundColor DarkGray
Write-Host "  Model : $(Split-Path $modelFile -Leaf)" -ForegroundColor DarkGray
Write-Host "  Device: $device (gpu-layers=$gpuLayersResolved)" -ForegroundColor DarkGray
Write-Host ''

# ── Foreground branch ─────────────────────────────────────────────────────────
if (-not $Detached) {
  & $serverExe @serverArgs
  exit $LASTEXITCODE
}

# ── Detached branch ───────────────────────────────────────────────────────────
$logDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'logs\whisper'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp   = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
$errPath = Join-Path $logDir "launch-$stamp.err"
$outPath = Join-Path $logDir "launch-$stamp.out"

$proc = Start-Process -FilePath $serverExe `
                      -ArgumentList $serverArgs `
                      -PassThru -WindowStyle Hidden `
                      -RedirectStandardError  $errPath `
                      -RedirectStandardOutput $outPath

# Poll /health for up to 30s (model load is fast — base ≈ 1s on CPU, <0.5s on GPU)
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  if ($proc.HasExited) { break }
  try {
    $h = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 1
    if ($h.status -eq 'ok' -or $h.status -eq 'loading') { $ready = $true; break }
  } catch { }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  Write-Host '─── whisper-server stderr (tail) ───' -ForegroundColor Red
  if (Test-Path $errPath) {
    Get-Content $errPath -Tail 20 | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }
  }
  throw "Whisper server failed to become healthy on :$port — see $errPath"
}

Write-Host "Whisper server ready (model=$modelName device=$device) on http://127.0.0.1:$port (PID $($proc.Id))" -ForegroundColor Green
Write-Host "  stderr: $errPath" -ForegroundColor DarkGray
