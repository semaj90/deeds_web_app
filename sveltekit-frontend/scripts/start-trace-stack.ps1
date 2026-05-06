# start-trace-stack.ps1
#
# Launches the full TRACE inference stack as detached background processes:
#   1. llama-server.exe  :8090  (TurboQuant / Gemma4 GGUF)
#   2. topology-search   :8101  (4D manifold search engine)
#   3. trace-mcp-server  :8788  (TypeScript MCP — graph/KAG tools)
#   4. SvelteKit dev     :5173  (main app)
#
# Usage:
#   npm run trace:start
#   powershell -ExecutionPolicy Bypass -File scripts/start-trace-stack.ps1

$Root      = Split-Path -Parent $PSScriptRoot   # deeds-web-app
$Frontend  = Join-Path $Root "sveltekit-frontend"
$BinDir    = Join-Path $Frontend "bin"
$ModelDir  = Join-Path $Frontend "models"

# ── 1. llama-server.exe (TurboQuant) ─────────────────────────────────────────

$LlamaExe = Join-Path $BinDir "llama-server.exe"
$Model    = Join-Path $ModelDir "gemma4-legal-q4_k_m.gguf"
$Mmproj   = Join-Path $ModelDir "mmproj-BF16.gguf"

if (Test-Path $LlamaExe) {
  $llamaArgs = @(
    "-m", $Model,
    "--host", "127.0.0.1",
    "--port", "8090",
    "-c",  "8192",
    "-ngl", "99",
    "--cache-prompt",
    "-ctk", "q8_0",
    "-ctv", "q8_0"
  )
  if (Test-Path $Mmproj) { $llamaArgs += @("--mmproj", $Mmproj) }

  Write-Host "Starting llama-server.exe on :8090 ..." -ForegroundColor Cyan
  Start-Process -FilePath $LlamaExe -ArgumentList $llamaArgs `
    -WorkingDirectory $Frontend -WindowStyle Minimized
  Start-Sleep -Milliseconds 1500
} else {
  Write-Host "llama-server.exe not found at $LlamaExe — skipping" -ForegroundColor Yellow
}

# ── 2. Topology search server :8101 ──────────────────────────────────────────

$TopoScript = Join-Path $Frontend "scripts\topology-search-server.mjs"
if (Test-Path $TopoScript) {
  Write-Host "Starting topology-search-server on :8101 ..." -ForegroundColor Cyan
  Start-Process -FilePath "node.exe" -ArgumentList @($TopoScript) `
    -WorkingDirectory $Frontend -WindowStyle Minimized
  Start-Sleep -Milliseconds 800
} else {
  Write-Host "topology-search-server.mjs not found — skipping" -ForegroundColor Yellow
}

# ── 3. TRACE MCP server :8788 ─────────────────────────────────────────────────

$TsxBin    = Join-Path $Frontend "node_modules\.bin\tsx.cmd"
$McpServer = Join-Path $Frontend "src\mcp\trace-mcp-server.ts"
if ((Test-Path $TsxBin) -and (Test-Path $McpServer)) {
  Write-Host "Starting TRACE MCP server on :8788 ..." -ForegroundColor Cyan
  Start-Process -FilePath $TsxBin -ArgumentList @($McpServer) `
    -WorkingDirectory $Frontend -WindowStyle Minimized
  Start-Sleep -Milliseconds 800
} else {
  Write-Host "tsx or trace-mcp-server.ts not found — skipping MCP server" -ForegroundColor Yellow
}

# ── 4. SvelteKit dev server :5173 ─────────────────────────────────────────────

Write-Host "Starting SvelteKit dev server on :5173 ..." -ForegroundColor Cyan
Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-Command", "cd `"$Frontend`"; npm run dev") `
  -WorkingDirectory $Frontend -WindowStyle Normal

Write-Host ""
Write-Host "TRACE stack launched:" -ForegroundColor Green
Write-Host "  llama-server   http://127.0.0.1:8090"
Write-Host "  topo-search    http://127.0.0.1:8101/health"
Write-Host "  trace-mcp      http://127.0.0.1:8788/health"
Write-Host "  SvelteKit      http://127.0.0.1:5173"
Write-Host ""
Write-Host "Connect MCP clients to: http://127.0.0.1:8788"