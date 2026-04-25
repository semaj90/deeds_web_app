# Loads .env.local into environment (simple parser) then runs npm dev for sveltekit frontend
param(
  [string]$DotEnvPath = "./sveltekit-frontend/.env.local",
  [string]$FrontendPath = "./sveltekit-frontend"
)

function Load-DotEnv($path) {
  if (-not $path) { Write-Host "No .env path provided" -ForegroundColor Yellow; return }
  if (!(Test-Path $path)) { Write-Host "No .env file found at $path" -ForegroundColor Yellow; return }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $parts = $line -split '=', 2
    if ($parts.Count -lt 2) { return }
    $key = $parts[0].Trim()
    $val = $parts[1].Trim().Trim('"')
    Write-Host "Setting env $key" -ForegroundColor Cyan
    Set-Item -Path env:$key -Value $val
  }
}

# Resolve possible locations for .env before changing directory
$resolvedDotEnv = $null
try {
  if (Test-Path $DotEnvPath) { $resolvedDotEnv = (Resolve-Path $DotEnvPath -ErrorAction SilentlyContinue).Path }
} catch {}
if (-not $resolvedDotEnv) {
  # Try the frontend-relative path (e.g., DotEnvPath may be ./sveltekit-frontend/.env.local)
  try {
    $frontendFull = (Resolve-Path $FrontendPath -ErrorAction SilentlyContinue).Path
    if ($frontendFull) {
      $candidate = Join-Path $frontendFull (Split-Path $DotEnvPath -Leaf)
      if (Test-Path $candidate) { $resolvedDotEnv = (Resolve-Path $candidate).Path }
    }
  } catch {}
}

if ($resolvedDotEnv) {
  Write-Host "Using .env file: $resolvedDotEnv" -ForegroundColor Green
} else {
  Write-Host "No .env.local found for frontend at provided paths. Continuing without loading env file." -ForegroundColor Yellow
}

Push-Location $FrontendPath
if ($resolvedDotEnv) { Load-DotEnv $resolvedDotEnv }
Write-Host "Starting SvelteKit dev server in $FrontendPath..." -ForegroundColor Green
npm run dev
Pop-Location
