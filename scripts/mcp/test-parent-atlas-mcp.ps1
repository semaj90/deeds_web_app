#!/usr/bin/env pwsh
<#
.SYNOPSIS
Test the Parent Atlas MCP Server via stdio

.DESCRIPTION
Launches the MCP server and sends test JSON-RPC requests, validating responses

.PARAMETER ServerScript
Path to the MCP server script (default: ./scripts/mcp/parent-atlas-mcp-server.ps1)

.EXAMPLE
.\scripts\mcp\test-parent-atlas-mcp.ps1
#>

param([string]$ServerScript = "./scripts/mcp/parent-atlas-mcp-server.ps1")

$ErrorActionPreference = 'Stop'

function Test-MCP {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Parent Atlas MCP Server Test" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

    if (-not (Test-Path $ServerScript)) {
        Write-Host "ERROR: Server script not found: $ServerScript" -ForegroundColor Red
        exit 1
    }

    # Prepare pipes
    $stdinWriter = [System.IO.StreamWriter][System.IO.StreamReader]::Null.BaseStream
    $stdoutReader = [System.IO.StreamReader]::Null
    $stderrReader = [System.IO.StreamReader]::Null

    # Start server process
    Write-Host "Starting server: $ServerScript" -ForegroundColor Yellow
    try {
        $process = Start-Process pwsh `
            -ArgumentList "-NoProfile", "-Command", "& '$ServerScript' -Verbose -DryRun" `
            -RedirectStandardInput (New-TemporaryFile) `
            -RedirectStandardOutput (New-TemporaryFile) `
            -RedirectStandardError (New-TemporaryFile) `
            -PassThru `
            -NoNewWindow

        Write-Host "Server started. PID: $($process.Id)" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to start server: $_" -ForegroundColor Red
        exit 1
    }

    Start-Sleep -Milliseconds 500

    # Get stream handles
    $stdin = $process.StandardInput
    $stdout = $process.StandardOutput
    $stderr = $process.StandardError

    # Test 1: tools/list
    Write-Host "`n[Test 1] tools/list" -ForegroundColor Yellow
    $req1 = @{
        jsonrpc = "2.0"
        method = "tools/list"
        params = @{}
        id = "1"
    } | ConvertTo-Json -Compress

    Write-Host "→ Send: $req1" -ForegroundColor Cyan
    $stdin.WriteLine($req1)
    $stdin.Flush()

    Start-Sleep -Milliseconds 100
    if ($stdout.Peek() -gt 0) {
        $resp1 = $stdout.ReadLine()
        Write-Host "← Recv: $($resp1.Substring(0, [Math]::Min(120, $resp1.Length)))..." -ForegroundColor Green
        $parsed = $resp1 | ConvertFrom-Json
        if ($parsed.result.tools.Count -gt 0) {
            Write-Host "✅ PASS: $($parsed.result.tools.Count) tools returned" -ForegroundColor Green
        } else {
            Write-Host "❌ FAIL: No tools returned" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ FAIL: No response" -ForegroundColor Red
    }

    # Test 2: atlas/packet-search
    Write-Host "`n[Test 2] atlas/packet-search" -ForegroundColor Yellow
    $req2 = @{
        jsonrpc = "2.0"
        method = "atlas/packet-search"
        params = @{ query = "auth"; limit = 5 }
        id = "2"
    } | ConvertTo-Json -Compress

    Write-Host "→ Send: $req2" -ForegroundColor Cyan
    $stdin.WriteLine($req2)
    $stdin.Flush()

    Start-Sleep -Milliseconds 100
    if ($stdout.Peek() -gt 0) {
        $resp2 = $stdout.ReadLine()
        Write-Host "← Recv: $($resp2.Substring(0, [Math]::Min(120, $resp2.Length)))..." -ForegroundColor Green
        $parsed = $resp2 | ConvertFrom-Json
        if ($parsed.result.count -ge 0) {
            Write-Host "✅ PASS: Search returned $($parsed.result.count) results" -ForegroundColor Green
        } else {
            Write-Host "❌ FAIL: Invalid response" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ FAIL: No response" -ForegroundColor Red
    }

    # Test 3: atlas/lineage-validate
    Write-Host "`n[Test 3] atlas/lineage-validate" -ForegroundColor Yellow
    $req3 = @{
        jsonrpc = "2.0"
        method = "atlas/lineage-validate"
        params = @{ packet_key = "ace:packet:auth:001"; store = "postgres" }
        id = "3"
    } | ConvertTo-Json -Compress

    Write-Host "→ Send: $req3" -ForegroundColor Cyan
    $stdin.WriteLine($req3)
    $stdin.Flush()

    Start-Sleep -Milliseconds 100
    if ($stdout.Peek() -gt 0) {
        $resp3 = $stdout.ReadLine()
        Write-Host "← Recv: $($resp3.Substring(0, [Math]::Min(120, $resp3.Length)))..." -ForegroundColor Green
        $parsed = $resp3 | ConvertFrom-Json
        if ($parsed.result.status) {
            Write-Host "✅ PASS: Validation status = $($parsed.result.status)" -ForegroundColor Green
        } else {
            Write-Host "❌ FAIL: Invalid response" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ FAIL: No response" -ForegroundColor Red
    }

    # Test 4: Invalid method (should return error)
    Write-Host "`n[Test 4] Invalid method (error handling)" -ForegroundColor Yellow
    $req4 = @{
        jsonrpc = "2.0"
        method = "nonexistent/method"
        params = @{}
        id = "4"
    } | ConvertTo-Json -Compress

    Write-Host "→ Send: $req4" -ForegroundColor Cyan
    $stdin.WriteLine($req4)
    $stdin.Flush()

    Start-Sleep -Milliseconds 100
    if ($stdout.Peek() -gt 0) {
        $resp4 = $stdout.ReadLine()
        Write-Host "← Recv: $($resp4.Substring(0, [Math]::Min(120, $resp4.Length)))..." -ForegroundColor Green
        $parsed = $resp4 | ConvertFrom-Json
        if ($parsed.error -and $parsed.error.code -eq -32601) {
            Write-Host "✅ PASS: Correct error code for method not found" -ForegroundColor Green
        } else {
            Write-Host "❌ FAIL: Expected error not returned" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ FAIL: No response" -ForegroundColor Red
    }

    # Cleanup
    Write-Host "`n[Cleanup]" -ForegroundColor Yellow
    $stdin.Close()
    $process | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Server stopped" -ForegroundColor Yellow

    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "All tests complete" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

Test-MCP
