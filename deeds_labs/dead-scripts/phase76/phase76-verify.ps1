#!/usr/bin/env pwsh
#
# Phase 76: ACP Tool Registry - Verification Script
# Tests all components of the ACP system
#

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   Phase 76: ACP Tool Registry Verification" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorCount = 0
$SuccessCount = 0

# Test 1: Check if files exist
Write-Host "📁 Test 1: Checking required files..." -ForegroundColor Yellow

$RequiredFiles = @(
    "src/lib/services/knowledge-search/ACPToolRegistry.ts",
    "src/routes/api/acp/tools/+server.ts",
    "src/routes/api/acp/execute/+server.ts",
    "scripts/phase76-acp-server.mjs",
    "scripts/phase76-acp-cli.mjs",
    "PHASE76_ACP_TOOL_REGISTRY.md",
    "PHASE76_ACP_COMPLETE.md"
)

foreach ($file in $RequiredFiles) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ❌ $file NOT FOUND" -ForegroundColor Red
        $ErrorCount++
    }
}

Write-Host ""

# Test 2: Check npm scripts
Write-Host "📦 Test 2: Checking npm scripts..." -ForegroundColor Yellow

$packageContent = Get-Content "package.json" -Raw
$RequiredScripts = @(
    "phase76:acp:tools",
    "phase76:acp:execute",
    "phase76:acp:schema",
    "phase76:acp:stats",
    "phase76:mcp:server"
)

foreach ($script in $RequiredScripts) {
    if ($packageContent -match "`"$script`"") {
        Write-Host "   ✅ $script" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ❌ $script NOT FOUND" -ForegroundColor Red
        $ErrorCount++
    }
}

Write-Host ""

# Test 3: Check VS Code tasks
Write-Host "⚙️  Test 3: Checking VS Code tasks..." -ForegroundColor Yellow

if (Test-Path ".vscode/tasks.json") {
    $tasksContent = Get-Content ".vscode/tasks.json" -Raw

    $RequiredTasks = @(
        "🔌 Phase 76: ACP MCP Server",
        "🧪 Phase 76: Test ACP Tools"
    )

    foreach ($task in $RequiredTasks) {
        if ($tasksContent -match [regex]::Escape($task)) {
            Write-Host "   ✅ $task" -ForegroundColor Green
            $SuccessCount++
        } else {
            Write-Host "   ❌ $task NOT FOUND" -ForegroundColor Red
            $ErrorCount++
        }
    }
} else {
    Write-Host "   ❌ .vscode/tasks.json NOT FOUND" -ForegroundColor Red
    $ErrorCount++
}

Write-Host ""# Test 4: Check if server is running (optional)
Write-Host "🌐 Test 4: Checking if dev server is running..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5175/api/acp/tools" -TimeoutSec 2 -ErrorAction Stop
    if ($response.success) {
        Write-Host "   ✅ API endpoint /api/acp/tools responding" -ForegroundColor Green
        Write-Host "   📊 Found $($response.count) tools" -ForegroundColor Cyan
        $SuccessCount++
    } else {
        Write-Host "   ❌ API endpoint returned error" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "   ⏸️  Dev server not running (optional - skip this test)" -ForegroundColor Yellow
    Write-Host "   💡 Start with: npm run dev:quic" -ForegroundColor Gray
}

Write-Host ""

# Test 5: Validate TypeScript files
Write-Host "🔍 Test 5: Validating TypeScript files..." -ForegroundColor Yellow

$TsFiles = @(
    "src/lib/services/knowledge-search/ACPToolRegistry.ts",
    "src/routes/api/acp/tools/+server.ts",
    "src/routes/api/acp/execute/+server.ts"
)

foreach ($file in $TsFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw

        # Check for export statements
        if ($content -match "export") {
            Write-Host "   ✅ $file has exports" -ForegroundColor Green
            $SuccessCount++
        } else {
            Write-Host "   ⚠️  $file missing exports" -ForegroundColor Yellow
        }

        # Check file size
        $size = (Get-Item $file).Length
        if ($size -gt 100) {
            Write-Host "   ✅ $file is $size bytes" -ForegroundColor Green
            $SuccessCount++
        } else {
            Write-Host "   ❌ $file is suspiciously small ($size bytes)" -ForegroundColor Red
            $ErrorCount++
        }
    }
}

Write-Host ""

# Summary
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   Verification Summary" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

if ($ErrorCount -eq 0) {
    Write-Host "✅ ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "✅ Successes: $SuccessCount" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Start dev server: npm run dev:quic" -ForegroundColor White
    Write-Host "   2. List tools: npm run phase76:acp:tools" -ForegroundColor White
    Write-Host "   3. Start MCP server: npm run phase76:mcp:server" -ForegroundColor White
    Write-Host "   4. Run tests: Tasks -> 🧪 Phase 76: Test ACP Tools" -ForegroundColor White
} else {
    Write-Host "❌ TESTS FAILED" -ForegroundColor Red
    Write-Host "✅ Successes: $SuccessCount" -ForegroundColor Green
    Write-Host "❌ Errors: $ErrorCount" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  Please review the errors above" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Optional: Show tool statistics if server is running
if ($response -and $response.success) {
    Write-Host "📊 Tool Statistics:" -ForegroundColor Cyan
    Write-Host ""

    $byCategory = @{}
    foreach ($tool in $response.tools) {
        $cat = $tool.category
        if (-not $byCategory.ContainsKey($cat)) {
            $byCategory[$cat] = 0
        }
        $byCategory[$cat]++
    }

    foreach ($cat in $byCategory.Keys | Sort-Object) {
        $count = $byCategory[$cat]
        $bar = "█" * $count
        Write-Host "   $cat".PadRight(15) "$bar $count" -ForegroundColor White
    }

    Write-Host ""
}

Write-Host "✨ Phase 76 ACP Tool Registry verification complete!" -ForegroundColor Green
Write-Host ""
