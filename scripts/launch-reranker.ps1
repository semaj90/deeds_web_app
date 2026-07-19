<#
.SYNOPSIS
  Launch the Mixedbread CrossEncoder reranker sidecar on :8099.
  Sets CUDA 12.8 + cuDNN 9 paths so onnxruntime-gpu activates CUDAExecutionProvider.

.PARAMETER Detached
  Run Python in a hidden background window and return immediately.

.PARAMETER Port
  Override RERANKER_PORT (default: 8099).
#>
param(
    [switch]$Detached,
    [int]$Port = 8099
)

$ErrorActionPreference = 'Stop'

# ── Paths ──────────────────────────────────────────────────────────────────
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot    = Split-Path -Parent $ScriptDir
$SidecarPath = Join-Path $ScriptDir 'reranker-sidecar.py'
$LogDir      = Join-Path $RepoRoot 'logs'

# ── CUDA / cuDNN DLL directories ───────────────────────────────────────────
# onnxruntime-gpu 1.x on Windows does NOT bundle CUDA or cuDNN.
# Both directories must be on PATH before the Python process starts.
$CudaBin   = 'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8\bin'
$CudnnLib  = 'C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib'

foreach ($dir in @($CudaBin, $CudnnLib)) {
    if (Test-Path $dir) {
        $env:PATH = "$dir;$env:PATH"
    } else {
        Write-Warning "[reranker] $dir not found — CUDAExecutionProvider may not load"
    }
}

# ── Env vars ───────────────────────────────────────────────────────────────
$env:RERANKER_PORT = "$Port"

# Load .env.local if present (non-fatal)
$envFile = Join-Path $RepoRoot 'sveltekit-frontend' '.env.local'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
        }
    }
}

Write-Host "[reranker] CUDA bin : $CudaBin"
Write-Host "[reranker] cuDNN lib: $CudnnLib"
Write-Host "[reranker] Port     : $Port"
Write-Host "[reranker] Script   : $SidecarPath"

if ($Detached) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
    $stdoutLog = Join-Path $LogDir 'reranker-stdout.log'
    $stderrLog = Join-Path $LogDir 'reranker-stderr.log'

    # Build PATH string to pass explicitly as env to Start-Process
    $newPath = "$CudaBin;$CudnnLib;$env:PATH"

    $startArgs = @{
        FilePath               = 'python'
        ArgumentList           = @($SidecarPath)
        WindowStyle            = 'Hidden'
        RedirectStandardOutput = $stdoutLog
        RedirectStandardError  = $stderrLog
        EnvironmentVariables   = @{
            PATH          = $newPath
            RERANKER_PORT = "$Port"
        }
    }

    $proc = Start-Process @startArgs -PassThru
    Write-Host "[reranker] Started PID $($proc.Id) — logs at $LogDir\reranker-*.log"
} else {
    python $SidecarPath
}
