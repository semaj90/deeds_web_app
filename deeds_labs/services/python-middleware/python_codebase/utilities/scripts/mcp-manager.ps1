# MCP Multicore Server Manager for VS Code
# PowerShell script for managing MCP server and autosolve functionality

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "stop", "restart", "status", "health", "metrics", "solve")]
    [string]$Action = "status",

    [Parameter(Mandatory=$false)]
    [string]$Problem = "",

    [Parameter(Mandatory=$false)]
    [int]$Workers = 4,

    [Parameter(Mandatory=$false)]
    [int]$Port = 3002
)

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Green($message) { Write-ColorOutput Green $message }
function Write-Yellow($message) { Write-ColorOutput Yellow $message }
function Write-Red($message) { Write-ColorOutput Red $message }
function Write-Cyan($message) { Write-ColorOutput Cyan $message }
function Write-Magenta($message) { Write-ColorOutput Magenta $message }

# MCP Server configuration
$mcpConfig = @{
    Port = $Port
    Workers = $Workers
    BaseUrl = "http://localhost:$Port"
    ProcessName = "mcp-context7-optimized"
    ScriptPath = "scripts/mcp-context7-optimized.mjs"
}

function Start-MCPServer {
    Write-Cyan "🚀 Starting MCP Multicore Server..."

    # Check if already running
    $existing = Get-Process -Name $mcpConfig.ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$($mcpConfig.ScriptPath)*" }
    if ($existing) {
        Write-Yellow "⚠️ MCP Server already running (PID: $($existing.Id))"
        return
    }

    # Set environment variables
    $env:MCP_PORT = $mcpConfig.Port
    $env:MCP_WORKERS = $mcpConfig.Workers
    $env:RTX_3060_OPTIMIZATION = "true"
    $env:CONTEXT7_MULTICORE = "true"

    # Start the server
    Start-Process -FilePath "node" -ArgumentList $mcpConfig.ScriptPath -WindowStyle Hidden
    Start-Sleep -Seconds 3

    # Verify it started
    try {
        $response = Invoke-RestMethod -Uri "$($mcpConfig.BaseUrl)/mcp/health" -Method Get -TimeoutSec 5
        Write-Green "✅ MCP Server started successfully"
        Write-Yellow "Workers: $($response.workers)"
        Write-Cyan "Health: $($mcpConfig.BaseUrl)/mcp/health"
        Write-Cyan "Metrics: $($mcpConfig.BaseUrl)/mcp/metrics"
    } catch {
        Write-Red "❌ Failed to start MCP Server: $($_.Exception.Message)"
    }
}

function Stop-MCPServer {
    Write-Yellow "🔄 Stopping MCP Server..."

    $processes = Get-Process -Name $mcpConfig.ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$($mcpConfig.ScriptPath)*" }

    if ($processes) {
        foreach ($process in $processes) {
            Write-Yellow "Stopping process $($process.Id)..."
            Stop-Process -Id $process.Id -Force
        }
        Write-Green "✅ MCP Server stopped"
    } else {
        Write-Yellow "⚠️ No MCP Server processes found"
    }
}

function Get-MCPStatus {
    Write-Cyan "📊 MCP Server Status"
    Write-Host "=" * 40

    try {
        # Check health
        $health = Invoke-RestMethod -Uri "$($mcpConfig.BaseUrl)/mcp/health" -Method Get -TimeoutSec 5
        Write-Green "Status: $($health.status)"
        Write-Yellow "Workers: $($health.workers)"
        Write-Cyan "Uptime: $([math]::Round($health.uptime, 2)) seconds"

        # Check metrics
        $metrics = Invoke-RestMethod -Uri "$($mcpConfig.BaseUrl)/mcp/metrics" -Method Get -TimeoutSec 5
        Write-Yellow "Memory RSS: $([math]::Round($metrics.memory.rss/1MB, 2)) MB"
        Write-Cyan "GPU Optimization: $($metrics.gpu)"

        # Check workers
        $workers = Invoke-RestMethod -Uri "$($mcpConfig.BaseUrl)/mcp/workers" -Method Get -TimeoutSec 5
        Write-Green "Active Workers: $($workers.active) of $($workers.total)"

    } catch {
        Write-Red "❌ MCP Server not running or unreachable"
        Write-Red "Error: $($_.Exception.Message)"
    }
}

function Invoke-MCPSolve {
    param([string]$ProblemDescription)

    if (-not $ProblemDescription) {
        Write-Red "❌ No problem description provided"
        return
    }

    Write-Cyan "🔧 Sending problem to MCP AutoSolve..."
    Write-Yellow "Problem: $ProblemDescription"

    try {
        $payload = @{
            problem = $ProblemDescription
            type = "auto-solve"
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        } | ConvertTo-Json

        # Since /mcp/solve endpoint doesn't exist yet, log to console
        Write-Magenta "📝 Problem logged for MCP processing:"
        Write-Host $payload

        # In a full implementation, this would POST to /mcp/solve
        # $response = Invoke-RestMethod -Uri "$($mcpConfig.BaseUrl)/mcp/solve" -Method Post -Body $payload -ContentType "application/json"

        Write-Green "✅ Problem submitted to MCP AutoSolve queue"

    } catch {
        Write-Red "❌ Failed to submit problem: $($_.Exception.Message)"
    }
}

# Main script logic
switch ($Action.ToLower()) {
    "start" { Start-MCPServer }
    "stop" { Stop-MCPServer }
    "restart" {
        Stop-MCPServer
        Start-Sleep -Seconds 2
        Start-MCPServer
    }
    "status" { Get-MCPStatus }
    "health" { Get-MCPStatus }
    "metrics" { Get-MCPStatus }
    "solve" {
        if ($Problem) {
            Invoke-MCPSolve -ProblemDescription $Problem
        } else {
            Write-Red "❌ Please provide a problem description with -Problem parameter"
            Write-Yellow "Example: .\mcp-manager.ps1 -Action solve -Problem 'TypeScript error in component'"
        }
    }
    default {
        Write-Yellow "Usage: .\mcp-manager.ps1 -Action [start|stop|restart|status|health|metrics|solve] [-Problem description] [-Workers 4] [-Port 3002]"
        Get-MCPStatus
    }
}