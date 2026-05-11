<#
.SYNOPSIS
    One-shot starter for the local Hermes stack. Assumes the install has
    already been run by setup-hermes-desktop-ollama.ps1 — this script just
    brings the services up + opens the UI.

.DESCRIPTION
    Idempotent: every step is a "start-if-not-running" check.

    1. Ensure GPU-tuned Ollama env vars are set (User scope, RTX 3060 Ti tuned).
    2. Start Ollama if :11434 is down.
    3. Docker-start local-deep-research + searxng if installed but stopped.
    4. Start Hermes Workspace vite dev on :3000 (direct invocation — bypasses
       the pnpm 11 ERR_PNPM_IGNORED_BUILDS gotcha that kills `pnpm dev`).
    5. Wait up to 60s for :3000 to come up.
    6. Open the browser to http://localhost:3000.

    Designed for the desktop shortcut. Click-and-go.

.PARAMETER NoBrowser
    Skip the auto-open of the browser at the end.

.PARAMETER WorkspaceDir
    Path to the cloned hermes-workspace. Default: $env:USERPROFILE\Downloads\Hermes-Ollama\hermes-workspace

.PARAMETER OllamaExe
    Path to ollama.exe. Auto-resolves from PATH if not provided.

.NOTES
    GPU tuning for RTX 3060 Ti (8GB VRAM, Ampere sm_86):
      OLLAMA_FLASH_ATTENTION=1          enable Flash Attention (faster + lower VRAM)
      OLLAMA_KV_CACHE_TYPE=q8_0         8-bit KV quant (50% VRAM savings vs f16)
      OLLAMA_CONTEXT_LENGTH=65536       64K context (fits with q8_0 KV @ 5.3GB model)
      OLLAMA_NUM_PARALLEL=1             single request at a time (8GB can't share)
      OLLAMA_KEEP_ALIVE=30m             keep model resident, avoid reload churn
      OLLAMA_MAX_LOADED_MODELS=1        never try to hold 2 models in VRAM
      OLLAMA_GPU_OVERHEAD=0             let Ollama use all available VRAM
      OLLAMA_NUM_GPU=999                offload all layers to GPU
      OLLAMA_LLM_LIBRARY=cuda_v12       explicit CUDA 12 (avoids detection ambiguity)
#>

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [string]$WorkspaceDir = (Join-Path $env:USERPROFILE 'Downloads\Hermes-Ollama\hermes-workspace'),
    [string]$OllamaExe
)

$ErrorActionPreference = 'Continue'   # don't bail on individual step failures — keep starting

function Test-Port {
    param([int]$Port)
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $a = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $a.AsyncWaitHandle.WaitOne(500, $false)
        if ($ok) { $c.EndConnect($a) }
        $c.Close()
        return $ok
    } catch { return $false }
}

function Write-Step { param([string]$M) Write-Host "" ; Write-Host "==> $M" -ForegroundColor Cyan }

# ── 1. GPU-tuned Ollama env vars (idempotent User-scope set) ─────────────────

Write-Step "Ensuring GPU-tuned Ollama env vars (RTX 3060 Ti profile)"
$gpuEnv = @{
    OLLAMA_FLASH_ATTENTION    = '1'
    OLLAMA_KV_CACHE_TYPE      = 'q8_0'
    OLLAMA_CONTEXT_LENGTH     = '65536'
    OLLAMA_NUM_PARALLEL       = '1'
    OLLAMA_KEEP_ALIVE         = '30m'
    OLLAMA_MAX_LOADED_MODELS  = '1'
    OLLAMA_GPU_OVERHEAD       = '0'
    OLLAMA_NUM_GPU            = '999'
    OLLAMA_LLM_LIBRARY        = 'cuda_v12'
}
foreach ($k in $gpuEnv.Keys) {
    $cur = [Environment]::GetEnvironmentVariable($k, 'User')
    if ($cur -ne $gpuEnv[$k]) {
        [Environment]::SetEnvironmentVariable($k, $gpuEnv[$k], 'User')
        Write-Host "  SET  $k=$($gpuEnv[$k])"
    } else {
        Write-Host "  OK   $k=$cur"
    }
    # Apply to this process too so any process we spawn inherits.
    Set-Item -Path "env:$k" -Value $gpuEnv[$k]
}

# ── 2. Start Ollama if down ──────────────────────────────────────────────────

Write-Step "Ollama (port 11434)"
if (Test-Port 11434) {
    Write-Host "  already running"
} else {
    if (-not $OllamaExe) {
        $cmd = Get-Command ollama -ErrorAction SilentlyContinue
        if ($cmd) { $OllamaExe = $cmd.Source }
    }
    if (-not $OllamaExe -or -not (Test-Path $OllamaExe)) {
        Write-Host "  WARN: ollama.exe not found — skipping. Run setup-hermes-desktop-ollama.ps1 first." -ForegroundColor Yellow
    } else {
        Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Minimized
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Port 11434) { Write-Host "  started after $($i + 1)s"; break }
        }
        if (-not (Test-Port 11434)) { Write-Host "  WARN: still not responding on 11434 after 20s" -ForegroundColor Yellow }
    }
}

# ── 3. Docker-start LDR + SearXNG if containers exist + stopped ──────────────

Write-Step "Docker containers (LDR + SearXNG)"
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $needed = @('local-deep-research', 'searxng')
    foreach ($name in $needed) {
        $state = & docker inspect -f '{{.State.Status}}' $name 2>$null
        if (-not $state) {
            Write-Host "  $name : not installed (run setup script with -IncludeLocalDeepResearch)"
            continue
        }
        $state = $state.Trim()
        if ($state -eq 'running') {
            Write-Host "  $name : already running"
        } else {
            Write-Host "  $name : starting ($state -> running)"
            & docker start $name 2>&1 | Out-Null
        }
    }
} else {
    Write-Host "  WARN: docker not on PATH — skipping" -ForegroundColor Yellow
}

# ── 4. Hermes Workspace vite dev on :3000 ────────────────────────────────────

Write-Step "Hermes Workspace (port 3000)"
if (Test-Port 3000) {
    Write-Host "  already running"
} elseif (-not (Test-Path $WorkspaceDir)) {
    Write-Host "  WARN: workspace dir not found at $WorkspaceDir" -ForegroundColor Yellow
    Write-Host "         run setup-hermes-desktop-ollama.ps1 -IncludeHermesWorkspace first"
} else {
    $vitePath = Join-Path $WorkspaceDir 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path $vitePath)) {
        Write-Host "  WARN: vite not at $vitePath — running pnpm install first..." -ForegroundColor Yellow
        Push-Location $WorkspaceDir
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) {
                & $pnpm.Source install 2>&1 | Out-Null
            } else {
                Write-Host "  WARN: pnpm not on PATH — install via 'npm install -g pnpm'" -ForegroundColor Yellow
            }
        } finally { Pop-Location }
    }

    if (Test-Path $vitePath) {
        # Run vite directly to bypass pnpm 11's IGNORED_BUILDS deps-check gotcha.
        $cmd = "Set-Location '$WorkspaceDir'; `$env:NODE_OPTIONS='--max-old-space-size=2048'; `$env:PORT='3000'; node '$vitePath' dev --host 0.0.0.0 --port 3000"
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList '-NoExit', '-Command', $cmd `
            -WindowStyle Minimized

        Write-Host "  launched; waiting up to 60s for :3000..."
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            if (Test-Port 3000) { Write-Host "  ready after $($i * 2)s"; break }
        }
        if (-not (Test-Port 3000)) { Write-Host "  WARN: :3000 still down after 60s — check the minimized PowerShell window for errors" -ForegroundColor Yellow }
    }
}

# ── 5. Health summary ────────────────────────────────────────────────────────

Write-Step "Stack health"
$checks = @(
    @{ Name = 'Ollama';              Url = 'http://localhost:11434'; Port = 11434 },
    @{ Name = 'Hermes Workspace';    Url = 'http://localhost:3000';  Port = 3000  },
    @{ Name = 'Local Deep Research'; Url = 'http://localhost:5000';  Port = 5000  },
    @{ Name = 'SearXNG';             Url = 'http://localhost:8080';  Port = 8080  },
    @{ Name = 'TRACE MCP (regen)';   Url = 'http://localhost:8788';  Port = 8788  },
    @{ Name = 'SvelteKit (project)'; Url = 'http://localhost:5173';  Port = 5173  }
)
foreach ($c in $checks) {
    $up = Test-Port $c.Port
    Write-Host ("  {0,-22} {1,-4} {2}" -f $c.Name, $(if ($up) { 'UP' } else { 'DOWN' }), $c.Url)
}

# ── 6. Open browser ──────────────────────────────────────────────────────────

if (-not $NoBrowser) {
    Write-Step "Opening Hermes Workspace"
    Start-Process 'http://localhost:3000'
}

Write-Host ""
Write-Host "Stack started. To stop everything: run stop-hermes-stack.ps1 (TODO)." -ForegroundColor Green
Write-Host "Backend URLs for the Workspace 'Connect Backend' prompt:"
Write-Host "  http://127.0.0.1:11434/v1                (Ollama direct)"
Write-Host "  http://127.0.0.1:5173/api/v1             (project facade — ACE + regen pipeline)"
