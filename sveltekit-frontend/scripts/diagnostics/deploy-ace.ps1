# ACE Deployment Script
Write-Host "🚀 Deploying ACE Agent Environment..." -ForegroundColor Cyan

# 1. Check for .env
if (-not (Test-Path .env)) {
    Write-Host "⚠️ .env not found. Creating from ace.env.example..." -ForegroundColor Yellow
    Copy-Item ace.env.example .env
    Write-Host "✅ Created .env. Please edit it with your API keys." -ForegroundColor Green
} else {
    Write-Host "✅ .env exists." -ForegroundColor Green
}

# 2. Install Dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed." -ForegroundColor Red
    exit 1
}

# 3. Check Services
Write-Host "🏥 Checking services..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File .kiro/specs/ace-contextual-web-ingestion/test-services.ps1

# 4. Build/Prepare
Write-Host "🔨 Preparing application..." -ForegroundColor Cyan
npm run check:ultra-fast

Write-Host "✅ Deployment Ready!" -ForegroundColor Green
Write-Host "Run 'npm run dev' to start the frontend."
Write-Host "Run 'npm run phase78:full' to start the self-repair pipeline."
