#!/usr/bin/env pwsh
# Phase 76: ACP Tool Registry - Simple Verification Script

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "   Phase 76: ACP Tool Registry Verification" -ForegroundColor Cyan
Write-Host "================================================================`n" -ForegroundColor Cyan

$Success = 0
$Fail = 0

# Test 1: Check files
Write-Host "[1] Checking required files..." -ForegroundColor Yellow

$Files = @(
    "src/lib/services/knowledge-search/ACPToolRegistry.ts",
    "src/routes/api/acp/tools/+server.ts",
    "src/routes/api/acp/execute/+server.ts",
    "scripts/phase76-acp-server.mjs",
    "scripts/phase76-acp-cli.mjs",
    "PHASE76_ACP_TOOL_REGISTRY.md"
)

foreach ($f in $Files) {
    if (Test-Path $f) {
        Write-Host "   [OK] $f" -ForegroundColor Green
        $Success++
    } else {
        Write-Host "   [FAIL] $f" -ForegroundColor Red
        $Fail++
    }
}

# Test 2: Check npm scripts
Write-Host "`n[2] Checking npm scripts..." -ForegroundColor Yellow

$pkg = Get-Content "package.json" -Raw
$scripts = @(
    "phase76:acp:tools",
    "phase76:acp:execute",
    "phase76:mcp:server"
)

foreach ($s in $scripts) {
    if ($pkg -match $s) {
        Write-Host "   [OK] $s" -ForegroundColor Green
        $Success++
    } else {
        Write-Host "   [FAIL] $s" -ForegroundColor Red
        $Fail++
    }
}

# Test 3: Check VS Code tasks
Write-Host "`n[3] Checking VS Code tasks..." -ForegroundColor Yellow

if (Test-Path ".vscode/tasks.json") {
    $tasks = Get-Content ".vscode/tasks.json" -Raw
    if ($tasks -match "Phase 76.*ACP MCP Server") {
        Write-Host "   [OK] ACP MCP Server task" -ForegroundColor Green
        $Success++
    } else {
        Write-Host "   [FAIL] ACP MCP Server task" -ForegroundColor Red
        $Fail++
    }
}

# Test 4: Check API (if server running)
Write-Host "`n[4] Checking API endpoint..." -ForegroundColor Yellow

try {
    $resp = Invoke-RestMethod http://localhost:5175/api/acp/tools -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   [OK] API responding - $($resp.count) tools found" -ForegroundColor Green
    $Success++
} catch {
    Write-Host "   [SKIP] Dev server not running (optional)" -ForegroundColor Yellow
}

# Summary
Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "   Results: $Success passed, $Fail failed" -ForegroundColor Cyan
Write-Host "================================================================`n" -ForegroundColor Cyan

if ($Fail -eq 0) {
    Write-Host "[OK] All tests passed!`n" -ForegroundColor Green
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. npm run dev:quic" -ForegroundColor Gray
    Write-Host "  2. npm run phase76:acp:tools" -ForegroundColor Gray
    Write-Host "  3. npm run phase76:mcp:server`n" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "[FAIL] Some tests failed`n" -ForegroundColor Red
    exit 1
}
