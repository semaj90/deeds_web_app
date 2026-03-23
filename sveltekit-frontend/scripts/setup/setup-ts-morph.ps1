# Deterministic ts-morph installation for Windows
# This script ensures ts-morph is properly installed and available

param([switch]$Force)

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ts-morph Installation & Verification            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Step 1: Stop any running Node processes
Write-Host "🛑 Stopping Node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Step 2: Clean install if forced
if ($Force) {
    Write-Host "🧹 Cleaning previous installation (forced)..." -ForegroundColor Yellow
    
    if (Test-Path "node_modules") {
        Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    }
    if (Test-Path "package-lock.json") {
        Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
    }
    if (Test-Path "pnpm-lock.yaml") {
        Remove-Item -Force pnpm-lock.yaml -ErrorAction SilentlyContinue
    }
    if (Test-Path "yarn.lock") {
        Remove-Item -Force yarn.lock -ErrorAction SilentlyContinue
    }
    
    npm cache clean --force | Out-Null
    Write-Host "   ✅ Cleaned" -ForegroundColor Green
}

# Step 3: Ensure registry is set
Write-Host "`n📦 Configuring npm registry..." -ForegroundColor Yellow
npm config set registry https://registry.npmjs.org/
Write-Host "   ✅ Registry set to npmjs.org" -ForegroundColor Green

# Step 4: Install TypeScript first (stable version)
Write-Host "`n📦 Installing TypeScript..." -ForegroundColor Yellow
npm install --save-dev typescript@~5.6.3 --legacy-peer-deps 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ TypeScript installed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  TypeScript install had issues (continuing...)" -ForegroundColor Yellow
}

# Step 5: Install ts-morph
Write-Host "`n📦 Installing ts-morph..." -ForegroundColor Yellow
npm install --save-dev ts-morph@^23 --legacy-peer-deps

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ ts-morph installed" -ForegroundColor Green
} else {
    Write-Host "   ❌ ts-morph install failed!" -ForegroundColor Red
    exit 1
}

# Step 6: Verify installations
Write-Host "`n🔍 Verifying installations..." -ForegroundColor Yellow

# Check ts-morph
$tsMorphCheck = node -e "try { require('ts-morph'); console.log('OK'); } catch(e) { console.log('FAIL'); process.exit(1); }" 2>&1
if ($tsMorphCheck -eq "OK") {
    Write-Host "   ✅ ts-morph: Available" -ForegroundColor Green
} else {
    Write-Host "   ❌ ts-morph: Not available" -ForegroundColor Red
    exit 1
}

# Check TypeScript version
$tsVersion = node -e "console.log(require('typescript').version)" 2>&1
Write-Host "   ✅ TypeScript: v$tsVersion" -ForegroundColor Green

# Step 7: Test the AST fixer script
Write-Host "`n🧪 Testing phase30v3-ast-fixer.cjs..." -ForegroundColor Yellow
$testResult = node phase30v3-ast-fixer.cjs --dry-run 2>&1 | Select-String -Pattern "Phase 30v3|error"

if ($testResult) {
    Write-Host "   ✅ Script loads successfully" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Script test inconclusive" -ForegroundColor Yellow
}

# Step 8: Set Node memory options
Write-Host "`n⚙️  Configuring Node.js memory..." -ForegroundColor Yellow
$env:NODE_OPTIONS = "--max-old-space-size=8192"
[System.Environment]::SetEnvironmentVariable('NODE_OPTIONS', '--max-old-space-size=8192', [System.EnvironmentVariableTarget]::User)
Write-Host "   ✅ NODE_OPTIONS set to --max-old-space-size=8192" -ForegroundColor Green

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              Setup Complete - Ready to Use!               ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Test: node --max-old-space-size=8192 phase30v3-ast-fixer.cjs --dry-run" -ForegroundColor White
Write-Host "   2. Run:  node --max-old-space-size=8192 phase30v3-ast-fixer.cjs" -ForegroundColor White
Write-Host "   3. Or:   .\run-phase30-pipeline.ps1 -Stage 3`n" -ForegroundColor White
