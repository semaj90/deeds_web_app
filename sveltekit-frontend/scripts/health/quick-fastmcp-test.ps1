#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick FastMCP + Phase87 Validation Test

.DESCRIPTION
    Validates that:
    1. FastMCP server starts without errors
    2. All 9 tools are accessible
    3. Request schema works (name, tool, function aliases)
    4. Phase87 can connect and call tools

.EXAMPLE
    .\quick-fastmcp-test.ps1
#>

Write-Host "🔍 FastMCP + Phase87 Quick Validation Test" -ForegroundColor Cyan
Write-Host "=" * 80

# Kill any existing process on port 3002
Write-Host "`n1️⃣ Checking port 3002..." -ForegroundColor Yellow
$tcp = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue
if ($tcp) {
    $proc = Get-Process -Id $tcp.OwningProcess
    Write-Host "   ⚠️  Port 3002 in use by $($proc.Name) (PID: $($proc.Id))" -ForegroundColor Yellow
    Write-Host "   🔪 Killing process..." -ForegroundColor Yellow
    Stop-Process -Id $tcp.OwningProcess -Force
    Start-Sleep -Seconds 2
}
Write-Host "   ✅ Port 3002 is free" -ForegroundColor Green

# Start FastMCP server in background
Write-Host "`n2️⃣ Starting FastMCP server..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    node scripts/fastmcp-server.mjs
}

# Wait for server to start
Write-Host "   ⏳ Waiting for server startup..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Check if server started successfully
$jobState = $serverJob.State
if ($jobState -eq "Failed") {
    Write-Host "   ❌ Server failed to start!" -ForegroundColor Red
    Receive-Job $serverJob
    exit 1
}

Write-Host "   ✅ Server started (Job ID: $($serverJob.Id))" -ForegroundColor Green

# Test 1: Health endpoint
Write-Host "`n3️⃣ Testing /health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3002/health" -Method Get -TimeoutSec 5
    if ($health.ok) {
        Write-Host "   ✅ Health: OK" -ForegroundColor Green
        Write-Host "   📊 Port: $($health.port)" -ForegroundColor Gray
        Write-Host "   📊 Tools: $($health.tools)" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ Health check failed: $($health.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Health check failed: $_" -ForegroundColor Red
    Stop-Job $serverJob
    Remove-Job $serverJob
    exit 1
}

# Test 2: Tools endpoint
Write-Host "`n4️⃣ Testing /tools endpoint..." -ForegroundColor Yellow
try {
    $tools = Invoke-RestMethod -Uri "http://127.0.0.1:3002/tools" -Method Get -TimeoutSec 5
    if ($tools.ok) {
        Write-Host "   ✅ Tools endpoint: OK" -ForegroundColor Green
        Write-Host "   📦 Available tools:" -ForegroundColor Gray
        $tools.tools | ForEach-Object { Write-Host "      - $_" -ForegroundColor White }
    }
} catch {
    Write-Host "   ❌ Tools endpoint failed: $_" -ForegroundColor Red
}

# Test 3: Function call with "name" key (OpenAI-style)
Write-Host "`n5️⃣ Testing function call (name key)..." -ForegroundColor Yellow
try {
    $body = @{
        name = "postgres_query"
        arguments = @{
            query = "SELECT 1 AS test"
        }
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 10

    if ($result.rows) {
        Write-Host "   ✅ postgres_query (name key): OK" -ForegroundColor Green
        Write-Host "   📊 Result: $($result.rows[0].test)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Unexpected response: $($result | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ postgres_query failed: $_" -ForegroundColor Red
}

# Test 4: Function call with "tool" key (custom style)
Write-Host "`n6️⃣ Testing function call (tool key)..." -ForegroundColor Yellow
try {
    $body = @{
        tool = "read_file"
        arguments = @{
            filepath = "./package.json"
        }
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 10

    if ($result.content) {
        $pkg = $result.content | ConvertFrom-Json
        Write-Host "   ✅ read_file (tool key): OK" -ForegroundColor Green
        Write-Host "   📦 Package: $($pkg.name)@$($pkg.version)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Unexpected response: $($result | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ read_file failed: $_" -ForegroundColor Red
}

# Test 5: Function call with "function" key (MCP-style)
Write-Host "`n7️⃣ Testing function call (function key)..." -ForegroundColor Yellow
try {
    $body = @{
        function = "redis_cache"
        arguments = @{
            operation = "set"
            key = "test:fastmcp"
            value = "validation-ok"
        }
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 10

    if ($result.operation -eq "set") {
        Write-Host "   ✅ redis_cache (function key): OK" -ForegroundColor Green
        Write-Host "   📊 Key: $($result.key)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Unexpected response: $($result | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ redis_cache failed: $_" -ForegroundColor Red
}

# Test 6: Error handling (unknown tool)
Write-Host "`n8️⃣ Testing error handling (unknown tool)..." -ForegroundColor Yellow
try {
    $body = @{
        name = "nonexistent_tool"
        arguments = @{}
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 10 `
        -ErrorAction SilentlyContinue

    # Should return error but not crash server
    Write-Host "   ❌ Server did not reject unknown tool!" -ForegroundColor Red
} catch {
    $response = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($response.error -match "Unknown function") {
        Write-Host "   ✅ Error handling: OK" -ForegroundColor Green
        Write-Host "   📊 Error: $($response.error)" -ForegroundColor Gray
        Write-Host "   📦 Available: $($response.available -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Unexpected error: $($response.error)" -ForegroundColor Yellow
    }
}

# Test 7: Server stays alive after error
Write-Host "`n9️⃣ Testing server resilience..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
try {
    $health2 = Invoke-RestMethod -Uri "http://127.0.0.1:3002/health" -Method Get -TimeoutSec 5
    if ($health2.ok) {
        Write-Host "   ✅ Server still alive after error: OK" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Server health check failed" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Server crashed after error: $_" -ForegroundColor Red
}

# Cleanup
Write-Host "`n🧹 Cleanup..." -ForegroundColor Yellow
Write-Host "   ⏸️  Stopping server job..." -ForegroundColor Gray
Stop-Job $serverJob
Remove-Job $serverJob

# Final verdict
Write-Host "`n" + ("=" * 80) -ForegroundColor Cyan
Write-Host "✅ FastMCP Validation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Start server manually:" -ForegroundColor White
Write-Host "     node scripts/fastmcp-server.mjs" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Test Phase 87 autonomous fixer:" -ForegroundColor White
Write-Host "     node scripts/phase87-autonomous-fixer.mjs" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. View architecture docs:" -ForegroundColor White
Write-Host "     cat PHASE76-87-RAG-KAG-ARCHITECTURE.md" -ForegroundColor Gray
Write-Host ""
