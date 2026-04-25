param(
  [string]$LogPath = "$PSScriptRoot\..\logs\hmr-errors.log"
)

if (-Not (Test-Path $LogPath)) {
  Write-Host "No error log found at: $LogPath" -ForegroundColor Yellow
  Write-Host "WebSocket errors will be logged when they occur." -ForegroundColor Yellow
  exit 0
}

Write-Host "🔍 Analyzing WebSocket errors..." -ForegroundColor Cyan
Write-Host ""

$errors = Get-Content $LogPath | Select-String -Pattern "WebSocket|error|Reconnection"

if ($errors.Count -eq 0) {
  Write-Host "✅ No WebSocket errors found!" -ForegroundColor Green
  exit 0
}

Write-Host "❌ Found $($errors.Count) error entries" -ForegroundColor Red
Write-Host ""

# Count error types
$wsErrors = ($errors | Select-String "WebSocket error").Count
$reconnectAttempts = ($errors | Select-String "Reconnection attempt").Count
$failedInit = ($errors | Select-String "Failed to initialize").Count

Write-Host "Error Breakdown:" -ForegroundColor Yellow
Write-Host "  - WebSocket errors: $wsErrors"
Write-Host "  - Reconnection attempts: $reconnectAttempts"
Write-Host "  - Failed initializations: $failedInit"
Write-Host ""

Write-Host "💡 Suggested Fixes:" -ForegroundColor Cyan
Write-Host ""

if ($wsErrors -gt 0) {
  Write-Host "1. Check if Go WebSocket backend is running:"
  Write-Host "   npm run ws:orchestrator"
  Write-Host ""
}

if ($reconnectAttempts -gt 3) {
  Write-Host "2. Backend may be down or port mismatch:"
  Write-Host "   - Check .env.local for VITE_WS_PORT"
  Write-Host "   - Verify Go service is listening on that port"
  Write-Host ""
}

if ($failedInit -gt 0) {
  Write-Host "3. Frontend WebSocket client may need restart:"
  Write-Host "   - Stop dev server (Ctrl+C)"
  Write-Host "   - Clear error log: npm run clear:logs"
  Write-Host "   - Restart: npm run dev:full"
  Write-Host ""
}

Write-Host "📋 Recent errors (last 5):" -ForegroundColor Yellow
$errors | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" }
Write-Host ""

Write-Host "🔧 Quick fix command:" -ForegroundColor Green
Write-Host "  npm run dev:full"
