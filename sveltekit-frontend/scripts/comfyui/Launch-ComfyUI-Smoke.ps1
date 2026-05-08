# Launch-ComfyUI-Smoke.ps1
#
# Windows PowerShell helper for the ComfyUI Phase 0 round-trip:
#   1. Auto-detects whether ComfyUI is reachable on Desktop port (:8000) or
#      Portable port (:8188); falls back to whichever responds.
#   2. Sets COMFYUI_BASE_URL for the current process.
#   3. Runs `npm run comfyui:smoke` (bridge reachability).
#   4. If a workflow file exists at scripts/comfyui/workflows/dev-workflow-api.json,
#      also runs `npm run comfyui:submit-smoke`.
#   5. Optional --Strict flag promotes both smokes to strict mode (exit 1 on skip).
#
# Does NOT start ComfyUI for you — operator launches Desktop or portable
# manually. This script is the verification chain only.
#
# Usage:
#   pwsh ./scripts/comfyui/Launch-ComfyUI-Smoke.ps1
#   pwsh ./scripts/comfyui/Launch-ComfyUI-Smoke.ps1 -Port 8000
#   pwsh ./scripts/comfyui/Launch-ComfyUI-Smoke.ps1 -Strict
#   pwsh ./scripts/comfyui/Launch-ComfyUI-Smoke.ps1 -Workflow path\to\wf.json

param(
  [int]    $Port      = 0,
  [string] $Workflow  = '',
  [switch] $Strict,
  [switch] $PollOnce
)

$ErrorActionPreference = 'Stop'

# Move to sveltekit-frontend if invoked from elsewhere
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir '..\..\')
Push-Location $RepoRoot

try {
  Write-Host ''
  Write-Host '🚀 ComfyUI smoke launcher' -ForegroundColor Cyan
  Write-Host "   repo: $RepoRoot"
  Write-Host ''

  # ── Step 1: detect ComfyUI port ─────────────────────────────────────────
  $candidates = if ($Port -gt 0) { @($Port) } else { @(8000, 8188) }
  $detected   = $null

  foreach ($p in $candidates) {
    $url = "http://127.0.0.1:$p/system_stats"
    Write-Host "   probing $url … " -NoNewline
    try {
      $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
      if ($r.StatusCode -eq 200) {
        Write-Host 'OK ✅' -ForegroundColor Green
        $detected = $p
        break
      } else {
        Write-Host "HTTP $($r.StatusCode)" -ForegroundColor Yellow
      }
    } catch {
      Write-Host 'no response' -ForegroundColor DarkGray
    }
  }

  if (-not $detected) {
    Write-Host ''
    Write-Host '⚠ ComfyUI not detected on :8000 or :8188.' -ForegroundColor Yellow
    Write-Host '   Start ComfyUI Desktop or portable, then re-run this script.'
    Write-Host '   Desktop default: 127.0.0.1:8000   Portable default: 127.0.0.1:8188'
    if ($Strict) {
      Write-Host ''
      Write-Host '✗ --Strict was passed — exiting 1.' -ForegroundColor Red
      exit 1
    }
    Write-Host ''
    Write-Host '   Continuing anyway — npm smokes will skip cleanly.' -ForegroundColor DarkGray
    $detected = 8188  # default for env var so smoke prints something useful
  }

  $env:COMFYUI_BASE_URL = "http://127.0.0.1:$detected"
  Write-Host ''
  Write-Host "   COMFYUI_BASE_URL = $env:COMFYUI_BASE_URL" -ForegroundColor Cyan
  Write-Host ''

  # ── Step 2: bridge reachability smoke ───────────────────────────────────
  Write-Host '── npm run comfyui:smoke ──' -ForegroundColor Magenta
  $smokeCmd = if ($Strict) { 'comfyui:smoke:strict' } else { 'comfyui:smoke' }
  npm run $smokeCmd
  $smokeExit = $LASTEXITCODE
  if ($smokeExit -ne 0) {
    Write-Host "✗ comfyui:smoke exited $smokeExit" -ForegroundColor Red
    exit $smokeExit
  }
  Write-Host ''

  # ── Step 3: submission smoke (only if workflow file exists) ────────────
  $wfPath = if ($Workflow) {
    $Workflow
  } else {
    Join-Path $RepoRoot 'scripts\comfyui\workflows\dev-workflow-api.json'
  }
  Write-Host '── npm run comfyui:submit-smoke ──' -ForegroundColor Magenta
  Write-Host "   workflow: $wfPath"

  if (-not (Test-Path $wfPath)) {
    Write-Host '   ⚠ no workflow file present — submission smoke will skip' -ForegroundColor Yellow
    Write-Host '     (build a graph in ComfyUI Desktop → Save (API Format) →'
    Write-Host '      save to scripts\comfyui\workflows\dev-workflow-api.json)'
  }

  $submitArgs = @()
  if ($Workflow)  { $submitArgs += '--workflow'; $submitArgs += $Workflow }
  if ($PollOnce)  { $submitArgs += '--poll-once' }
  if ($Strict)    { $submitArgs += '--strict' }

  if ($submitArgs.Count -gt 0) {
    node scripts\comfyui\submit-workflow-smoke.mjs @submitArgs
  } else {
    npm run comfyui:submit-smoke
  }
  $submitExit = $LASTEXITCODE

  Write-Host ''
  if ($submitExit -eq 0) {
    Write-Host '✅ ComfyUI smoke chain complete.' -ForegroundColor Green
  } else {
    Write-Host "✗ submit smoke exited $submitExit" -ForegroundColor Red
    exit $submitExit
  }
} finally {
  Pop-Location
}
