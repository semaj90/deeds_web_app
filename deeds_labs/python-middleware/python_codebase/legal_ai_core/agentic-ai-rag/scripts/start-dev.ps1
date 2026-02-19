Param()
Write-Host "Starting dev environment for agentic-ai-rag" -ForegroundColor Cyan
$root = Join-Path $PSScriptRoot '..'
Set-Location $root\backend\node-api
if (Test-Path package.json) {
    Write-Host "Installing Node dependencies (if needed)..." -ForegroundColor Yellow
    npm install
}
if ((npm run | Out-String) -match 'dev') {
    npm run dev
} else {
    Write-Host "No 'dev' script found in backend/node-api/package.json. Start manually with node or add a dev script." -ForegroundColor Yellow
}
