<#
.SYNOPSIS
  Launch Gemma4 via LiteRT-LM (optimized for SvelteKit 2 GPU dev).

.DESCRIPTION
  LiteRT-LM server with Gemma4-E2B-it.litertlm model.
  Provides OpenAI-compatible /v1/chat/completions API.

  Requires:
  - Python 3.10+ with litert-lm package
  - Gemma4 model imported via `litert-lm import ...`
  - WSL or native Python environment

.PARAMETER Port
  Port to listen on (default: 8070)

.PARAMETER Backend
  Compute backend: "cpu" (default) or "gpu"

.PARAMETER Model
  Model ID (default: gemma-4-E2B-it.litertlm)

.PARAMETER Detached
  Launch in detached mode (background process)

#>
[CmdletBinding()]
param(
  [int]$Port = 8070,
  [ValidateSet("cpu", "gpu")]
  [string]$Backend = "cpu",
  [string]$Model = "gemma-4-E2B-it.litertlm",
  [switch]$Detached
)

$ErrorActionPreference = 'Stop'
# Resolve to project root: PSScriptRoot is /launchers/litert, need to go up 3 levels
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  LiteRT Gemma4 (optimized for SvelteKit 2)                    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Check Python ───────────────────────────────────────────────────────────
Write-Host "Environment Setup:" -ForegroundColor Yellow

$pythonCmd = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } `
            elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } `
            else { $null }

if (-not $pythonCmd) {
  Write-Host "❌ Python not found in PATH" -ForegroundColor Red
  Write-Host "   Install Python 3.10+ and add to PATH, or use WSL" -ForegroundColor Red
  exit 1
}

Write-Host "  Python:        $pythonCmd (litert-lm backend)" -ForegroundColor Green

# ── Check litert-lm module ─────────────────────────────────────────────────
try {
  $litertCheck = & $pythonCmd -c "import litert_lm; print(litert_lm.__version__)" 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  litert-lm:     installed (v$litertCheck)" -ForegroundColor Green
  } else {
    throw "litert_lm import failed"
  }
} catch {
  Write-Host "❌ litert-lm module not found" -ForegroundColor Red
  Write-Host "   Install: pip install litert-lm" -ForegroundColor Red
  Write-Host "   Or use: pip install google-litert" -ForegroundColor Red
  exit 1
}

# ── Resolve model path ─────────────────────────────────────────────────────
Write-Host "  Model:         $Model (backend=$Backend)" -ForegroundColor Green
Write-Host "  Port:          $Port" -ForegroundColor Green

if ($Detached) {
  Write-Host "  Mode:          Detached (background)" -ForegroundColor Green
} else {
  Write-Host "  Mode:          Foreground (press Ctrl+C to stop)" -ForegroundColor Green
}

Write-Host ""

# ── Build Python command ───────────────────────────────────────────────────
$scriptPath = Join-Path $repoRoot 'scripts' 'litert-serve.py'
if (-not (Test-Path $scriptPath)) {
  Write-Host "❌ litert-serve.py not found at: $scriptPath" -ForegroundColor Red
  exit 1
}

$pythonArgs = @(
  $scriptPath,
  '--port', $Port,
  '--backend', $Backend,
  '--model', $Model
)

# ── Launch ─────────────────────────────────────────────────────────────────
Write-Host "Launching LiteRT server..."

if ($Detached) {
  # Use Start-Process for background execution
  $process = Start-Process $pythonCmd `
    -ArgumentList $pythonArgs `
    -WorkingDirectory $repoRoot `
    -PassThru `
    -WindowStyle Hidden

  Start-Sleep -Seconds 2

  # Check if process is still alive
  if ($process.HasExited) {
    $exitCode = $process.ExitCode
    Write-Host "❌ LiteRT server exited with code $exitCode" -ForegroundColor Red
    exit $exitCode
  }

  Write-Host "✓ LiteRT Gemma4 server launched (PID $($process.Id))" -ForegroundColor Green
  Write-Host ""
  Write-Host "Server Details:" -ForegroundColor Cyan
  Write-Host "  URL:         http://127.0.0.1:$Port/v1/chat/completions" -ForegroundColor Green
  Write-Host "  Health:      http://127.0.0.1:$Port/health" -ForegroundColor Green
  Write-Host "  Logs:        Check process output" -ForegroundColor Green
  Write-Host ""
  exit 0
}

# ── Foreground execution ───────────────────────────────────────────────────
& $pythonCmd @pythonArgs
$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "✓ LiteRT server closed cleanly" -ForegroundColor Green
} else {
  Write-Host "❌ LiteRT server exited with code $exitCode" -ForegroundColor Red
}

exit $exitCode
