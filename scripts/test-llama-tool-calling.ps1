#!/usr/bin/env pwsh
<#
.SYNOPSIS
Direct smoke test for llama-server tool calling via parse_tool_calls: true

.DESCRIPTION
Tests that:
1. Server is running on :8090
2. /props reports supports_tools = true
3. Direct /v1/chat/completions call returns tool_calls array (not fenced content)
4. Tool name matches request function

.PARAMETER Verbose
Print detailed response JSON

.EXAMPLE
.\scripts\test-llama-tool-calling.ps1 -Verbose
#>
param(
    [switch]$Verbose
)

$baseUrl = "http://127.0.0.1:8090"

Write-Host "=== LLAMA Tool Calling Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# Gate 1: Server health
Write-Host "1️⃣  Checking server health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "$baseUrl/health" -ErrorAction Stop
    Write-Host "✅ Server alive" -ForegroundColor Green
} catch {
    Write-Host "❌ Server unreachable at $baseUrl" -ForegroundColor Red
    exit 1
}

# Gate 2: /props reports supports_tools
Write-Host "2️⃣  Checking /props for tool support..." -ForegroundColor Yellow
try {
    $props = Invoke-RestMethod "$baseUrl/props" -ErrorAction Stop
    if ($Verbose) {
        Write-Host "   Raw /props:" -ForegroundColor Gray
        $props | ConvertTo-Json -Depth 20 | Write-Host -ForegroundColor Gray
    }

    $supportsTools = $props.chat_template_caps.supports_tools -eq $true
    if ($supportsTools) {
        Write-Host "✅ supports_tools = true" -ForegroundColor Green
    } else {
        Write-Host "❌ supports_tools = $($props.chat_template_caps.supports_tools)" -ForegroundColor Red
        Write-Host "   Hint: launcher may be using --chat-template gemma or missing --jinja" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Failed to fetch /props: $_" -ForegroundColor Red
    exit 1
}

# Gate 3: Direct tool calling request
Write-Host "3️⃣  Sending tool-calling request..." -ForegroundColor Yellow

$body = @{
    model = "gemma4-legal-iq4xs-direct.gguf"
    messages = @(
        @{
            role = "user"
            content = "Search the codebase for 'packet_key'. Use the grep tool."
        }
    )
    tools = @(
        @{
            type = "function"
            function = @{
                name = "grep"
                description = "Search repository text using a ripgrep pattern"
                parameters = @{
                    type = "object"
                    properties = @{
                        pattern = @{
                            type = "string"
                            description = "ripgrep search pattern"
                        }
                    }
                    required = @("pattern")
                }
            }
        }
    )
    tool_choice = "required"
    parse_tool_calls = $true
    parallel_tool_calls = $false
    temperature = 0
    stream = $false
} | ConvertTo-Json -Depth 20

try {
    $result = Invoke-RestMethod `
        -Uri "$baseUrl/v1/chat/completions" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    if ($Verbose) {
        Write-Host "   Raw response:" -ForegroundColor Gray
        $result | ConvertTo-Json -Depth 20 | Write-Host -ForegroundColor Gray
    }

    # Gate 4: Check for tool_calls array
    $message = $result.choices[0].message
    $toolCalls = $message.tool_calls
    $content = $message.content

    Write-Host ""
    Write-Host "Response inspection:" -ForegroundColor Cyan
    Write-Host "  role: $($message.role)"
    Write-Host "  tool_calls count: $($toolCalls.Count)"
    Write-Host "  content: $($content.Substring(0, [Math]::Min(80, $content.Length)))"

    # Acceptance: tool_calls array exists with grep function
    if ($toolCalls -and $toolCalls.Count -gt 0) {
        $firstCall = $toolCalls[0]
        Write-Host ""
        Write-Host "✅ tool_calls array received" -ForegroundColor Green
        Write-Host "   function.name: $($firstCall.function.name)" -ForegroundColor Green
        Write-Host "   function.arguments: $($firstCall.function.arguments)" -ForegroundColor Green

        if ($firstCall.function.name -eq "grep") {
            Write-Host "✅ Tool name matches 'grep'" -ForegroundColor Green
            Write-Host ""
            Write-Host "🎉 DIRECT STRUCTURED TOOL CALL: PROVEN" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "⚠️  Unexpected tool name: $($firstCall.function.name)" -ForegroundColor Yellow
            exit 1
        }
    } elseif ($content -match "tool_call|```|<tool_call>") {
        Write-Host "❌ Tool call is in content as fenced block (not structured)" -ForegroundColor Red
        Write-Host "   Hint: parse_tool_calls ignored; check --skip-chat-parsing flag" -ForegroundColor Yellow
        Write-Host "   Content snippet: $($content.Substring(0, 200))" -ForegroundColor Gray
        exit 1
    } else {
        Write-Host "❌ No tool_calls array and no tool_call in content" -ForegroundColor Red
        Write-Host "   Content: $content" -ForegroundColor Gray
        exit 1
    }

} catch {
    Write-Host "❌ Request failed: $_" -ForegroundColor Red
    exit 1
}
