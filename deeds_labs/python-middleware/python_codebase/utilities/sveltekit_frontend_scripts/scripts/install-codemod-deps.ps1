<#
.SYNOPSIS
  Install codemod dependencies (ts-morph, glob)
.DESCRIPTION
  Sets up the isolated scripts/package.json environment for AST normalization
#>

$ErrorActionPreference = "Stop"
$scriptsPath = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\scripts"

Write-Host "Installing codemod dependencies..." -ForegroundColor Cyan

if (-not (Test-Path $scriptsPath)) {
    New-Item -ItemType Directory -Path $scriptsPath -Force | Out-Null
    Write-Host "Created scripts directory" -ForegroundColor Green
}

Push-Location $scriptsPath

# Install dependencies
Write-Host "Running npm install..." -ForegroundColor Yellow
& npm install --no-audit --no-fund

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installed packages:" -ForegroundColor Cyan
    & npm list --depth=0
} else {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Pop-Location

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run migration: cd .. && .\fix-svelte5-migration.ps1"
Write-Host "  2. Or test AST only: node --max-old-space-size=8192 scripts/codemods/ast-normalize.mjs"
