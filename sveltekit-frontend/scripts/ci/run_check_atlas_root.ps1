param()

# Wrapper to set ATLAS_ROOT to the repository root and run the atlas report checker.
# Usage: pwsh -File run_check_atlas_root.ps1

Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Build candidate roots to tolerate nested layouts like sveltekit-frontend/sveltekit-frontend
$candidates = @()
$candidates += (Resolve-Path (Join-Path $scriptDir '..\..') -ErrorAction SilentlyContinue)
$candidates += (Resolve-Path (Join-Path $scriptDir '..\..\..') -ErrorAction SilentlyContinue)
$candidates += (Resolve-Path (Join-Path $scriptDir '..') -ErrorAction SilentlyContinue)
$candidates += (Resolve-Path (Join-Path $scriptDir '..\..\sveltekit-frontend') -ErrorAction SilentlyContinue)
$candidates += (Resolve-Path (Join-Path $scriptDir '..\sveltekit-frontend') -ErrorAction SilentlyContinue)

$candidates = $candidates | ForEach-Object { $_.Path } | Where-Object { $_ -ne $null } | Select-Object -Unique

if ($env:ATLAS_ROOT) { $candidates = ,(Resolve-Path $env:ATLAS_ROOT).Path + $candidates }

Write-Host "Candidate roots:" -ForegroundColor Cyan
$candidates | ForEach-Object { Write-Host " - $_" }

$nodeScript = $null
foreach ($r in $candidates) {
  $p1 = Join-Path $r 'sveltekit-frontend\scripts\ci\check_atlas_reports.mjs'
  $p2 = Join-Path $r 'scripts\ci\check_atlas_reports.mjs'
  if (Test-Path $p1) { $nodeScript = $p1; break }
  if (Test-Path $p2) { $nodeScript = $p2; break }
}

if (-not $nodeScript) {
  Write-Error "Checker not found in candidate roots. Set ATLAS_ROOT to repo root or run from repo." -ForegroundColor Red
  exit 2
}

Write-Host "Using checker: $nodeScript" -ForegroundColor Green
$env:ATLAS_ROOT = Split-Path $nodeScript -Parent | Split-Path -Parent | Split-Path -Parent
node $nodeScript
