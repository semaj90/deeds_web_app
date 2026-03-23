#!/usr/bin/env powershell
<#
.SYNOPSIS
Complete SSE Error Streaming Setup Script
#>

Write-Host "🚀 SSE Error Streaming Setup" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Step 1: Check Redis
Write-Host "📋 Step 1: Checking Redis..." -ForegroundColor Yellow
$redisCheck = Get-Service redis -ErrorAction SilentlyContinue
if ($redisCheck -and $redisCheck.Status -eq 'Running') {
    Write-Host "✅ Redis service is running" -ForegroundColor Green
} else {
    Write-Host "⚠️  Redis service not found as Windows Service" -ForegroundColor Yellow
    Write-Host "   Try: redis-server.exe (from redis-latest folder)" -ForegroundColor Gray
}

# Step 2: Check Node packages
Write-Host "`n📋 Step 2: Checking Node dependencies..." -ForegroundColor Yellow
$redisPackage = npm list redis 2>&1 | Select-String "redis@"
if ($redisPackage) {
    Write-Host "✅ Redis npm package installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Installing redis package..." -ForegroundColor Yellow
    npm install redis
}

# Step 3: Show quick start
Write-Host "`n📋 Step 3: Quick Start Commands" -ForegroundColor Yellow
Write-Host @"
Run these in separate terminals:

Terminal 1 - Start Error Watcher:
  cd sveltekit-frontend
  node scripts/error-analysis-redis.mjs --watch

Terminal 2 - Start Dev Server:
  cd sveltekit-frontend
  npm run dev

Terminal 3 - View Error Stream (optional):
  node scripts/error-analysis-redis.mjs --report

Then visit: http://localhost:5173/errors/stream
"@ -ForegroundColor Cyan

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
