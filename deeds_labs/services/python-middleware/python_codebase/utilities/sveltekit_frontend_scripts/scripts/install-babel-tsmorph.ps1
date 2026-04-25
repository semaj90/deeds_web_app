<#
  install-babel-tsmorph.ps1
  ─────────────────────────────────────────────────────────────
  Sets up AST development stack for VS Code + SvelteKit 2.
#>

$ErrorActionPreference = "Stop"
Write-Host "🔧 Installing Babel + ts-morph environment..." -ForegroundColor Cyan
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

# Safety check
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "❌ npm not found – install Node.js 20+ first."
}

# Install core dev dependencies
Write-Host "`n📦 Installing AST parsing and transformation packages..." -ForegroundColor Yellow
npm install --save-dev @babel/core @babel/parser @babel/traverse @babel/types ts-morph recast

# Verify versions
Write-Host "`n📦 Installed package versions:" -ForegroundColor Yellow
npm list @babel/core @babel/parser @babel/traverse @babel/types ts-morph recast

# Create config hint for VS Code
$config = @'
{
  "babel": {
    "plugins": [],
    "parserOpts": {
      "sourceType": "module",
      "plugins": ["typescript", "jsx", "classProperties"]
    }
  }
}
'@
Set-Content "$root/.babelrc" $config -Encoding UTF8

Write-Host "`n📝 Created .babelrc configuration" -ForegroundColor Green

Pop-Location
Write-Host "`n✅ Babel + ts-morph environment installed successfully." -ForegroundColor Green
Write-Host "   Next: Run scripts/fix-phase34d-ai-patterns.mjs" -ForegroundColor Cyan
