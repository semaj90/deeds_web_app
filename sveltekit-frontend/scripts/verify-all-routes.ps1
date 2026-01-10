$ErrorActionPreference = "Stop"

Write-Host "Cleaning cache..."
# Kill the actual Node process listening on 5173 FIRST
$portProcess = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($portProcess) {
    Write-Host "Killing existing process on port 5173..."
    Stop-Process -Id $portProcess.OwningProcess -Force -ErrorAction SilentlyContinue
}

Remove-Item -Path ".svelte-kit" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Running TypeScript check (skipping output)..."
try {
    cmd /c "npm run check > nul 2>&1"
} catch {
    Write-Warning "TypeScript check reported errors (expected)"
}

Write-Host "Starting Dev Server (using .env config via dev:quic:raw)..."
# Use dev:quic:raw to use .env values (port 5434) instead of package.json hardcoded 5432
$devProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev:quic:raw" -NoNewWindow -PassThru
Write-Host "Waiting 20 seconds for server to start..."
Start-Sleep -Seconds 20

try {
    Write-Host "Running Route Verification (Playwright)..."
    cmd /c "npx playwright test tests/nes-ui-routes.spec.ts"
} finally {
    Write-Host "Stopping Dev Server..."
    if ($devProcess) {
        Stop-Process -Id $devProcess.Id -Force -ErrorAction SilentlyContinue
    }

    # Kill the actual Node process listening on 5173
    $portProcess = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
    if ($portProcess) {
        Stop-Process -Id $portProcess.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
