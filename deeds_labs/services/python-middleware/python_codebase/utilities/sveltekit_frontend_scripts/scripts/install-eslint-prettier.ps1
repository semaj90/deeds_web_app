<#
  Phase 42 – ESLint + Prettier Installation & Configuration

  Installs and configures ESLint + Prettier for SvelteKit 2 + TypeScript + Svelte 5
  with proper parser chain and formatting rules.
#>

$ErrorActionPreference = "Stop"
Write-Host "🔧 Phase 42 – Installing ESLint + Prettier..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Push-Location "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

# Install ESLint + Prettier + plugins
Write-Host "`n📦 Installing npm packages..." -ForegroundColor Yellow
npm install --save-dev `
  eslint `
  prettier `
  eslint-config-prettier `
  @typescript-eslint/eslint-plugin `
  @typescript-eslint/parser `
  svelte `
  eslint-plugin-svelte

# ESLint configuration for SvelteKit 2 + TypeScript + Svelte 5
$eslintConfig = @'
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint", "svelte"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:svelte/recommended",
    "prettier"
  ],
  "overrides": [
    {
      "files": ["*.svelte"],
      "parser": "svelte-eslint-parser",
      "parserOptions": {
        "parser": "@typescript-eslint/parser"
      }
    }
  ],
  "env": {
    "browser": true,
    "es2020": true,
    "node": true
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-constant-condition": "warn",
    "no-empty": "warn"
  }
}
'@

$eslintConfig | Set-Content .eslintrc.json -Encoding UTF8
Write-Host "✅ Created .eslintrc.json" -ForegroundColor Green

# Prettier configuration for Svelte 5
$prettierConfig = @'
{
  "semi": true,
  "singleQuote": false,
  "printWidth": 100,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "svelteStrictMode": false,
  "svelteSortOrder": "scripts-markup-styles",
  "svelteAllowShorthand": true,
  "svelteIndentScriptAndStyle": true,
  "endOfLine": "lf"
}
'@

$prettierConfig | Set-Content .prettierrc -Encoding UTF8
Write-Host "✅ Created .prettierrc" -ForegroundColor Green

# .prettierignore
$prettierIgnore = @'
node_modules
.svelte-kit
dist
build
*.log
*.lock
'@

$prettierIgnore | Set-Content .prettierignore -Encoding UTF8
Write-Host "✅ Created .prettierignore" -ForegroundColor Green

Pop-Location

Write-Host "`n✅ Phase 42 ESLint + Prettier Installation Complete" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "`n🚀 Next steps:" -ForegroundColor Cyan
Write-Host "  1. node scripts/phase42-ast-validator.mjs" -ForegroundColor White
Write-Host "  2. npm run check:svelte" -ForegroundColor White
Write-Host "  3. npm run build" -ForegroundColor White
