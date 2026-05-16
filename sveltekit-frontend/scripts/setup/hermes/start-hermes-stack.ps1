<#
.SYNOPSIS
    Starts the local Hermes Workspace stack.

.DESCRIPTION
    Starts Ollama if needed, starts local Docker services if present,
    launches Hermes Workspace directly on port 3000, then opens the browser.
#>

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [string]$WorkspaceDir = (Join-Path $env:USERPROFILE 'Downloads\Hermes-Ollama\hermes-workspace'),
    [string]$OllamaExe
)

$ErrorActionPreference = 'Continue'

function Test-Port {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(500, $false)
        if ($ok) { $client.EndConnect($async) }
        $client.Close()
        return $ok
    } catch {
        return $false
    }
}

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host ("==> {0}" -f $Message) -ForegroundColor Cyan
}

function Write-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $lines = @()
    if (Test-Path $Path) {
        $lines = Get-Content $Path -ErrorAction SilentlyContinue
    }

    $updated = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ("^{0}=" -f [regex]::Escape($Key))) {
            $lines[$i] = "${Key}=${Value}"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $lines += "${Key}=${Value}"
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    Set-Content -Path $Path -Value $lines -Encoding UTF8
}

function Write-HermesMcpConfig {
    $hermesDir = Join-Path $env:USERPROFILE '.hermes'
    New-Item -ItemType Directory -Force -Path $hermesDir | Out-Null

    $cfgPath = Join-Path $hermesDir 'mcp.json'
    $cfg = [ordered]@{
        '$schema' = 'https://schemas.hermes.dev/mcp-config/v1.json'
        generatedBy = 'start-hermes-stack.ps1'
        generatedAt = (Get-Date).ToString('o')
        mcpServers = [ordered]@{
            'trace-readonly' = [ordered]@{
                url = 'http://127.0.0.1:8788/mcp'
                transport = 'http'
                description = 'TRACE read-only MCP for Hermes Workspace'
                allow = @(
                    'trace.kag_search',
                    'trace.explain_retrieval',
                    'kb.hybrid_search',
                    'kb.trace_search',
                    'kb.search_pathways',
                    'kb.wiki_note_lookup',
                    'kb.search_summary_tree',
                    'db.schema_overview',
                    'db.table_inspect',
                    'topology.search_4d',
                    'topology.search_som_neighborhood',
                    'graph.expand_neighborhood',
                    'graph.pagerank_top',
                    'graph.shortest_path',
                    'context.build_kv_packet',
                    'context.get_compressed_card',
                    'context.prefetch_feature_context'
                )
                block = @(
                    'shell.*', 'bash.*', 'exec.*',
                    'db.execute_write', 'db.run_migration', 'db.*write*',
                    'cache.delete_*', 'redis.flush*',
                    'rabbitmq.publish_*', 'queue.publish_*',
                    'graph.materialize_pathway', 'topology.recompute*',
                    'kag.ingest_*'
                )
            }
        }
    }

    $cfg | ConvertTo-Json -Depth 10 | Set-Content -Path $cfgPath -Encoding UTF8
    Write-Host ("  wrote {0}" -f $cfgPath)
}

Write-Step 'Ollama'
if (Test-Port 11434) {
    Write-Host '  already running'
} else {
    if (-not $OllamaExe) {
        $cmd = Get-Command ollama -ErrorAction SilentlyContinue
        if ($cmd) { $OllamaExe = $cmd.Source }
    }

    if (-not $OllamaExe -or -not (Test-Path $OllamaExe)) {
        Write-Host '  WARN: ollama.exe not found - skipping' -ForegroundColor Yellow
    } else {
        Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Minimized
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Port 11434) {
                Write-Host ("  started after {0}s" -f ($i + 1))
                break
            }
        }
    }
}

$hermesExe = $null
$hermesCmd = Get-Command hermes -ErrorAction SilentlyContinue | Select-Object -First 1
if ($hermesCmd) {
    $hermesExe = $hermesCmd.Source
}
if (-not $hermesExe) {
    $fallbackShim = Join-Path $env:LOCALAPPDATA 'hermes\bin\hermes.cmd'
    if (Test-Path $fallbackShim) {
        $hermesExe = $fallbackShim
    }
}
if ($hermesExe) {
    Write-Step 'Hermes Agent gateway'
    $hermesHome = Join-Path $env:USERPROFILE '.hermes'
    $hermesEnv = Join-Path $hermesHome '.env'
    Write-EnvValue -Path $hermesEnv -Key 'API_SERVER_ENABLED' -Value 'true'
    Write-HermesMcpConfig

    if (-not (Test-Port 8642)) {
        Start-Process -FilePath $hermesExe -ArgumentList 'gateway run' -WindowStyle Minimized
    } else {
        Write-Host '  already running'
    }

    Write-Step 'Hermes Dashboard'
    if (-not (Test-Port 9119)) {
        Start-Process -FilePath $hermesExe -ArgumentList 'dashboard --no-open' -WindowStyle Minimized
    } else {
        Write-Host '  already running'
    }
}

Write-Step 'Docker containers'
if (Get-Command docker -ErrorAction SilentlyContinue) {
    foreach ($name in @('local-deep-research', 'searxng')) {
        $state = & docker inspect -f '{{.State.Status}}' $name 2>$null
        if (-not $state) {
            Write-Host ("  {0} : not installed" -f $name)
            continue
        }

        $state = $state.Trim()
        if ($state -eq 'running') {
            Write-Host ("  {0} : already running" -f $name)
        } else {
            Write-Host ("  {0} : starting ({1} to running)" -f $name, $state)
            & docker start $name 2>&1 | Out-Null
        }
    }
} else {
    Write-Host '  WARN: docker not on PATH - skipping' -ForegroundColor Yellow
}

Write-Step 'Hermes Workspace'
if (Test-Port 3000) {
    Write-Host '  already running'
} elseif (-not (Test-Path $WorkspaceDir)) {
    Write-Host ("  WARN: workspace dir not found at {0}" -f $WorkspaceDir) -ForegroundColor Yellow
} else {
    $workspaceEnv = Join-Path $WorkspaceDir '.env'
    Write-EnvValue -Path $workspaceEnv -Key 'HERMES_API_URL' -Value 'http://127.0.0.1:8642'
    Write-EnvValue -Path $workspaceEnv -Key 'HERMES_DASHBOARD_URL' -Value 'http://127.0.0.1:9119'

    $vitePath = Join-Path $WorkspaceDir 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path $vitePath)) {
        Write-Host '  WARN: vite not installed - run pnpm install in the workspace' -ForegroundColor Yellow
    } else {
        $cmd = "Set-Location '$WorkspaceDir'; `$env:NODE_OPTIONS='--max-old-space-size=2048'; `$env:PORT='3000'; node '$vitePath' dev --host 0.0.0.0 --port 3000"
        Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) -WindowStyle Minimized
        Write-Host '  launched; waiting up to 60s for :3000...'
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            if (Test-Port 3000) {
                Write-Host ("  ready after {0}s" -f ($i * 2))
                break
            }
        }
    }
}

Write-Step 'Stack health'
foreach ($check in @(
    @{ Name = 'Ollama'; Url = 'http://localhost:11434'; Port = 11434 },
    @{ Name = 'Hermes Workspace'; Url = 'http://localhost:3000'; Port = 3000 },
    @{ Name = 'Local Deep Research'; Url = 'http://localhost:5000'; Port = 5000 },
    @{ Name = 'SearXNG'; Url = 'http://localhost:8080'; Port = 8080 },
    @{ Name = 'TRACE MCP (regen)'; Url = 'http://localhost:8788'; Port = 8788 },
    @{ Name = 'SvelteKit (project)'; Url = 'http://localhost:5173'; Port = 5173 }
)) {
    $up = Test-Port $check.Port
    Write-Host ("  {0,-22} {1,-4} {2}" -f $check.Name, $(if ($up) { 'UP' } else { 'DOWN' }), $check.Url)
}

if (-not $NoBrowser) {
    Write-Step 'Opening browser'
    Start-Process 'http://localhost:3000'
}

Write-Host ''
Write-Host 'Stack started.' -ForegroundColor Green
