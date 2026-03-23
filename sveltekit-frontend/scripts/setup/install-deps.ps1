<#
  install-deps.ps1
  Simple, ASCII-only installer to work around npm workspace issues.
  Run from the sveltekit-frontend directory.
#>

Write-Host "Installing SvelteKit frontend dependencies..."

$currentDir = Get-Location
Write-Host ("Current directory: {0}" -f $currentDir)

# Normalize npm config to avoid workspace inheritance
Write-Host "Writing local .npmrc overrides..."
@(
  "workspaces=false",
  "legacy-peer-deps=true",
  "save-exact=true",
  "engine-strict=false"
) | Set-Content -Path ".npmrc" -Encoding ASCII

# Clear npm cache first
Write-Host "Clearing npm cache..."
npm cache clean --force | Out-Null

# First attempt
Write-Host "Running npm install (attempt 1)..."
npm install
$installResult = $LASTEXITCODE

if ($installResult -ne 0) {
  Write-Host "First attempt failed. Cleaning node_modules and retrying..."
  if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
  }
  if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
  }
  Write-Host "Running npm install with legacy-peer-deps..."
  npm install --legacy-peer-deps
  $installResult = $LASTEXITCODE
}

if ($installResult -eq 0) {
  Write-Host "Installation successful."
  Write-Host "Next steps:"
  Write-Host "  npm run build"
  Write-Host "  npm run dev"
  exit 0
} else {
  Write-Host "Installation failed." -ForegroundColor Red
  exit 1
}
