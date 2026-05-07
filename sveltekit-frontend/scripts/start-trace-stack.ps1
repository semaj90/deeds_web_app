# start-trace-stack.ps1
#
# Full TRACE inference + indexing stack — detached background processes:
#
#   Tier 0 (pre-flight):   Langfuse :3030 health, Bifrost :3040 health
#   Tier 1 (parallel):     llama-server.exe :8090  (TurboQuant + Gemma4 GGUF)
#                          topology-search  :8101  (4D manifold search engine)
#   Tier 2 (after Tier 1): TRACE MCP cluster :8788  (TypeScript agentic tools)
#   Tier 3:                SvelteKit dev :5173
#   Background (non-block):graphify:som — SOM centroid clustering refresh
#
# Artifacts written to memory/runs/<run_id>/:
#   startup_health.json   — service reachability per tier
#   trace_stack_pids.json — PIDs of launched background processes
#   background_jobs.json  — async jobs kicked off (synthesis, SOM, etc.)
#
# Env overrides:
#   LLAMA_SERVER_PATH   path to llama-server.exe
#   TURBO_MODEL_PATH    path to GGUF model blob
#   TURBO_MMPROJ_PATH   path to mmproj-BF16.gguf
#   TURBO_PORT          default 8090
#   TRACE_MCP_PORT      default 8788
#   TRACE_MCP_WORKERS   default min(cpuCount, 4)
#   LANGFUSE_URL        default http://127.0.0.1:3030
#   BIFROST_URL         default http://127.0.0.1:3040
#   STRICT_TRACE_HEALTH set to "true" to fail if Langfuse is down
#
# Usage:
#   npm run trace:start
#   powershell -ExecutionPolicy Bypass -File scripts/start-trace-stack.ps1

$ErrorActionPreference = 'Continue'

$Root     = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root "sveltekit-frontend"

# ── Run identity + artifact directory ───────────────────────────────────────

$RunId  = (Get-Date -Format "yyyy-MM-ddTHH-mm-ss")
$RunDir = Join-Path $Frontend "memory\runs\$RunId"
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null

# Mutable state accumulated during startup
$health  = [ordered]@{}
$pids    = [ordered]@{}
$bgJobs  = [System.Collections.Generic.List[object]]::new()

function Write-RunArtifacts {
  $health  | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $RunDir "startup_health.json")   -Encoding UTF8
  $pids    | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $RunDir "trace_stack_pids.json") -Encoding UTF8
  $bgJobs  | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $RunDir "background_jobs.json")  -Encoding UTF8
}

# ── Helpers ─────────────────────────────────────────────────────────────────

function Test-Service {
  param([string]$Url, [string]$Label)
  try {
    Invoke-RestMethod $Url -TimeoutSec 2 -ErrorAction Stop | Out-Null
    Write-Host "  v $Label ($Url)" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "  x $Label unreachable ($Url) -- continuing" -ForegroundColor Yellow
    return $false
  }
}

function Wait-Service {
  param([string]$Url, [string]$Label, [int]$RetryCount = 40, [int]$DelayMs = 500)
  Write-Host "  Waiting for $Label ..." -ForegroundColor Cyan
  for ($i = 0; $i -lt $RetryCount; $i++) {
    try {
      Invoke-RestMethod $Url -TimeoutSec 1 -ErrorAction Stop | Out-Null
      Write-Host "  v $Label ready" -ForegroundColor Green
      return $true
    } catch {
      [System.Threading.Thread]::Sleep($DelayMs)
    }
  }
  Write-Host "  x $Label timed out -- continuing" -ForegroundColor Yellow
  return $false
}

# ── Path resolution (env-overridable, fallback to known locations) ──────────

$LlamaExe = if ($env:LLAMA_SERVER_PATH) { $env:LLAMA_SERVER_PATH }
            elseif (Test-Path (Join-Path $Frontend "bin\llama-server.exe")) {
              Join-Path $Frontend "bin\llama-server.exe"
            } else { "C:\Users\james\Desktop\llama-server-cuda\llama-server.exe" }

$ModelPath = if ($env:TURBO_MODEL_PATH) { $env:TURBO_MODEL_PATH } else {
  $blob = Join-Path $env:USERPROFILE ".ollama\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43"
  if (Test-Path $blob) { $blob } else { Join-Path $Frontend "models\gemma4-legal-q4_k_m.gguf" }
}

$MmprojPath = if ($env:TURBO_MMPROJ_PATH) { $env:TURBO_MMPROJ_PATH } else {
  $dl = Join-Path $env:USERPROFILE "Downloads\gemma4-mmproj\mmproj-BF16.gguf"
  if (Test-Path $dl) { $dl } else { $null }
}

$TurboPort   = if ($env:TURBO_PORT)        { $env:TURBO_PORT }        else { "8090" }
$McpPort     = if ($env:TRACE_MCP_PORT)    { $env:TRACE_MCP_PORT }    else { "8788" }
$McpWorkers  = if ($env:TRACE_MCP_WORKERS) { $env:TRACE_MCP_WORKERS } else {
  [Math]::Min([System.Environment]::ProcessorCount, 4)
}
$LangfuseUrl = if ($env:LANGFUSE_URL) { $env:LANGFUSE_URL } else { "http://127.0.0.1:3030" }
$BifrostUrl  = if ($env:BIFROST_URL)  { $env:BIFROST_URL }  else { "http://127.0.0.1:3040/health" }
$StrictHealth = $env:STRICT_TRACE_HEALTH -eq "true"

$TopoScript    = Join-Path $Frontend "scripts\topology-search-server.mjs"
$ClusterScript = Join-Path $Frontend "scripts\start-trace-mcp-cluster.mjs"
$McpServerTs   = Join-Path $Frontend "src\mcp\trace-mcp-server.ts"
$TsxCmd        = Join-Path $Frontend "node_modules\.bin\tsx.cmd"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host " TRACE inference stack startup  ($RunId)" -ForegroundColor Magenta
Write-Host "=====================================================" -ForegroundColor Magenta
Write-Host ""

# ── TIER 0: pre-flight (Langfuse + Bifrost must be running via Docker) ──────

Write-Host "[Tier 0] Pre-flight: Langfuse + Bifrost" -ForegroundColor Blue

# Langfuse :3030 — inference trace autoencoding (read-only health check)
$langfuseOk = Test-Service -Url $LangfuseUrl -Label "Langfuse  :3030 (inference traces)"
$health["langfuse"] = @{ url = $LangfuseUrl; healthy = $langfuseOk; tier = 0 }
if ($StrictHealth -and -not $langfuseOk) {
  Write-Host "  STRICT_TRACE_HEALTH=true and Langfuse is down — aborting" -ForegroundColor Red
  Write-RunArtifacts; exit 1
}

# Bifrost :3040 — L2 semantic cache; start via Docker if not already up
$bifrostHealthy = $false
try {
  Invoke-RestMethod $BifrostUrl -TimeoutSec 2 -ErrorAction Stop | Out-Null
  Write-Host "  v Bifrost   :3040 (semantic KV cache)" -ForegroundColor Green
  $bifrostHealthy = $true
} catch {}

if (-not $bifrostHealthy) {
  Write-Host "  -> Bifrost :3040 not running — attempting docker compose start ..." -ForegroundColor Cyan
  & docker compose --profile full up -d bifrost 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Start-Sleep -Seconds 3
    try {
      Invoke-RestMethod $BifrostUrl -TimeoutSec 2 -ErrorAction Stop | Out-Null
      Write-Host "  v Bifrost :3040 started (L2 semantic cache active)" -ForegroundColor Green
      $bifrostHealthy = $true
    } catch {
      Write-Host "  x Bifrost started but not yet responding — L2 cache may warm up shortly" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  x docker compose could not start Bifrost — L2 cache inactive, falling back to L3 direct" -ForegroundColor Yellow
    Write-Host "    Run: docker compose --profile full up -d bifrost" -ForegroundColor DarkGray
  }
}
$health["bifrost"] = @{ url = $BifrostUrl; healthy = $bifrostHealthy; tier = 0 }
Write-Host ""

# ── TIER 0.5: Go retrieval service :8100 / gRPC :50053 ──────────────────────

Write-Host "[Tier 0.5] Go retrieval service (gRPC :50053 / HTTP :8100)" -ForegroundColor Blue

$retrievalUp = $false
try {
  Invoke-RestMethod "http://127.0.0.1:8100/health" -TimeoutSec 1 -ErrorAction Stop | Out-Null
  Write-Host "  v go-retrieval-service already :8100" -ForegroundColor Yellow
  $retrievalUp = $true
} catch {}

$retrievalPid = $null
if (-not $retrievalUp) {
  $GoServiceDir = Join-Path $Root "services\go-retrieval-service"
  $GoExe        = Join-Path $GoServiceDir "go-retrieval-service.exe"
  $GoCmd        = "C:\Program Files\Go\bin\go.exe"
  if (Test-Path $GoExe) {
    Write-Host "  -> Starting go-retrieval-service.exe :8100 ..." -ForegroundColor Cyan
    $env:HTTP_PORT              = "8100"
    $env:GRPC_PORT              = "50053"
    $env:QDRANT_URL             = "http://localhost:6333"
    $env:REDIS_URL              = "redis://localhost:6379"
    $env:OLLAMA_URL             = "http://localhost:11434"
    $env:EMBED_SERVICE_URL      = "localhost:50051"
    $env:GPU_EMBED_ENABLED      = "true"
    $env:EMBED_MODEL            = "embeddinggemma:latest"
    $env:RETRIEVAL_HTTP_ENABLED = "true"
    $retrievalPid = (Start-Process -FilePath $GoExe -WorkingDirectory $GoServiceDir -WindowStyle Minimized -PassThru)?.Id
    Start-Sleep -Seconds 2
  } elseif (Test-Path $GoCmd) {
    Write-Host "  -> go run go-retrieval-service :8100 (slow first start) ..." -ForegroundColor Cyan
    $retrievalPid = (Start-Process -FilePath "powershell.exe" `
      -ArgumentList @("-NonInteractive", "-Command",
        "cd `"$GoServiceDir`"; `$env:HTTP_PORT='8100'; `$env:GRPC_PORT='50053'; & `"$GoCmd`" run .") `
      -WindowStyle Minimized -PassThru)?.Id
    Start-Sleep -Seconds 5
  } else {
    Write-Host "  x go-retrieval-service not found — retrieval falls back to inline TS pipeline" -ForegroundColor Yellow
    Write-Host "    Build: npm run go:retrieval:build" -ForegroundColor DarkGray
  }
  try {
    Invoke-RestMethod "http://127.0.0.1:8100/health" -TimeoutSec 1 -ErrorAction Stop | Out-Null
    Write-Host "  v go-retrieval-service :8100 ready" -ForegroundColor Green
    $retrievalUp = $true
  } catch {}
}
$health["go_retrieval"] = @{ url = "http://127.0.0.1:8100/health"; healthy = $retrievalUp; tier = "0.5" }
if ($retrievalPid) { $pids["go_retrieval"] = $retrievalPid }
Write-Host ""

# ── TIER 1: TurboQuant + Topology search (parallel, detached) ───────────────

Write-Host "[Tier 1] TurboQuant + Topology search" -ForegroundColor Blue

# 1a. TurboQuant llama-server.exe :8090
$turboUp  = $false
$turboPid = $null
try {
  Invoke-RestMethod "http://127.0.0.1:$TurboPort/health" -TimeoutSec 1 -ErrorAction Stop | Out-Null
  Write-Host "  v TurboQuant already healthy on :$TurboPort" -ForegroundColor Yellow
  $turboUp = $true
} catch {}

if (-not $turboUp) {
  if (-not (Test-Path $LlamaExe)) {
    Write-Host "  x llama-server.exe not found at $LlamaExe" -ForegroundColor Yellow
    Write-Host "    Set LLAMA_SERVER_PATH env var to override" -ForegroundColor DarkYellow
  } elseif (-not (Test-Path $ModelPath)) {
    Write-Host "  x Model not found at $ModelPath" -ForegroundColor Yellow
  } else {
    $llamaArgs = @(
      "-m",  $ModelPath,
      "--host", "127.0.0.1",
      "--port", $TurboPort,
      "-c", "65536",
      "-ngl", "99",
      "-fa", "on",
      "-ctk", "q8_0",
      "-ctv", "q8_0",
      "--log-disable"
    )
    if ($MmprojPath -and (Test-Path $MmprojPath)) {
      $llamaArgs += @("--mmproj", $MmprojPath)
      Write-Host "  -> TurboQuant :$TurboPort  VLM + mmproj, KV q8_0, FA on" -ForegroundColor Cyan
    } else {
      Write-Host "  -> TurboQuant :$TurboPort  text-only, KV q8_0, FA on" -ForegroundColor Cyan
    }
    $turboPid = (Start-Process -FilePath $LlamaExe -ArgumentList $llamaArgs `
      -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru)?.Id
  }
}

# 1b. Topology search server :8101
$topoUp  = $false
$topoPid = $null
try {
  Invoke-RestMethod "http://127.0.0.1:8101/health" -TimeoutSec 1 -ErrorAction Stop | Out-Null
  Write-Host "  v Topology search already healthy on :8101" -ForegroundColor Yellow
  $topoUp = $true
} catch {}

if (-not $topoUp -and (Test-Path $TopoScript)) {
  Write-Host "  -> Topology search :8101" -ForegroundColor Cyan
  $topoPid = (Start-Process -FilePath "node.exe" -ArgumentList @($TopoScript) `
    -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru)?.Id
}

# Wait for TurboQuant before opening MCP (Gemma4 tool calls need it)
if (-not $turboUp) {
  $turboUp = Wait-Service -Url "http://127.0.0.1:$TurboPort/health" `
    -Label "TurboQuant :$TurboPort" -RetryCount 120 -DelayMs 500
}
# Quick topo check after brief wait (non-blocking)
if (-not $topoUp) {
  Start-Sleep -Milliseconds 1500
  try {
    Invoke-RestMethod "http://127.0.0.1:8101/health" -TimeoutSec 1 -ErrorAction Stop | Out-Null
    $topoUp = $true
  } catch {}
}

$health["turbo_quant"] = @{ url = "http://127.0.0.1:$TurboPort/health"; healthy = $turboUp;  tier = 1; kvProfile = "q8_0"; faOn = $true }
$health["topo_search"]  = @{ url = "http://127.0.0.1:8101/health";        healthy = $topoUp;  tier = 1 }
if ($turboPid) { $pids["turbo_quant"] = $turboPid }
if ($topoPid)  { $pids["topo_search"] = $topoPid }
Write-Host ""

# ── TIER 2: TRACE MCP cluster :8788 ─────────────────────────────────────────

Write-Host "[Tier 2] TRACE MCP server (Gemma4 agentic tools)" -ForegroundColor Blue

$mcpUp  = $false
$mcpPid = $null
try {
  Invoke-RestMethod "http://127.0.0.1:$McpPort/health" -TimeoutSec 1 -ErrorAction Stop | Out-Null
  Write-Host "  v TRACE MCP already healthy on :$McpPort" -ForegroundColor Yellow
  $mcpUp = $true
} catch {}

if (-not $mcpUp) {
  if ((Test-Path $ClusterScript) -and (Test-Path $McpServerTs)) {
    Write-Host "  -> MCP cluster :$McpPort  ($McpWorkers workers, SSE-transparent)" -ForegroundColor Cyan
    $mcpPid = (Start-Process -FilePath "node.exe" `
      -ArgumentList @($ClusterScript, $McpWorkers) `
      -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru)?.Id
  } elseif (Test-Path $McpServerTs) {
    Write-Host "  -> MCP single-worker :$McpPort" -ForegroundColor Cyan
    $tsxExe  = if (Test-Path $TsxCmd) { $TsxCmd } else { "npx" }
    $tsxArgs = if (Test-Path $TsxCmd) { @($McpServerTs) } else { @("tsx", $McpServerTs) }
    $env:TRACE_MCP_PORT = $McpPort
    $mcpPid = (Start-Process -FilePath $tsxExe -ArgumentList $tsxArgs `
      -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru)?.Id
  } else {
    Write-Host "  x trace-mcp-server.ts not found -- skipping" -ForegroundColor Yellow
  }
  $mcpUp = Wait-Service -Url "http://127.0.0.1:$McpPort/health" `
    -Label "TRACE MCP :$McpPort" -RetryCount 40 -DelayMs 500
}
$health["trace_mcp"] = @{ url = "http://127.0.0.1:$McpPort/health"; healthy = $mcpUp; tier = 2; workers = $McpWorkers }
if ($mcpPid) { $pids["trace_mcp"] = $mcpPid }
Write-Host ""

# ── TIER 3: SvelteKit dev :5173 ─────────────────────────────────────────────

Write-Host "[Tier 3] SvelteKit dev :5173" -ForegroundColor Blue
$skProc = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-Command", "cd `"$Frontend`"; npm run dev") `
  -WorkingDirectory $Frontend -WindowStyle Normal -PassThru
$health["sveltekit"] = @{ url = "http://127.0.0.1:5173"; healthy = "starting"; tier = 3 }
if ($skProc?.Id) { $pids["sveltekit"] = $skProc.Id }
Write-Host ""

# ── BACKGROUND: SOM centroid clustering ─────────────────────────────────────

Write-Host "[Background] Launching SOM + graphify:som (non-blocking)" -ForegroundColor DarkGray
$logsDir = Join-Path $Frontend "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
$bgJobs.Add([ordered]@{
  job       = "graphify:som"
  pid       = (Start-Process -FilePath "powershell.exe" `
                 -ArgumentList @("-NonInteractive", "-Command",
                   "cd `"$Frontend`"; npm run graphify:som 2>&1 | Tee-Object -FilePath `"$logsDir\graphify-som.log`"") `
                 -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru)?.Id
  logFile   = "logs/graphify-som.log"
  startedAt = (Get-Date -Format o)
})
Write-Host "  logs -> sveltekit-frontend/logs/graphify-som.log" -ForegroundColor DarkGray

# ── BACKGROUND: graph synthesis → next_actions.md P0/P1 ─────────────────────

$SynthScript = Join-Path $Frontend "scripts\graph\synthesize-next-actions.mjs"
if (Test-Path $SynthScript) {
  Write-Host "[Background] Launching audit synthesis (next_actions.md P0/P1)" -ForegroundColor DarkGray
  $bgJobs.Add([ordered]@{
    job       = "graph:synthesize"
    pid       = (Start-Process -FilePath "node.exe" `
                   -ArgumentList @($SynthScript, "--no-spec-fetch") `
                   -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru)?.Id
    startedAt = (Get-Date -Format o)
  })
  Write-Host "  reading: memory/runs/<latest>/ artifacts" -ForegroundColor DarkGray
}
Write-Host ""

# ── Write artifacts ──────────────────────────────────────────────────────────

Write-RunArtifacts
Write-Host "[Artifacts] Written to memory/runs/$RunId/" -ForegroundColor DarkGray
Write-Host "  startup_health.json   trace_stack_pids.json   background_jobs.json" -ForegroundColor DarkGray
Write-Host ""

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host "=====================================================" -ForegroundColor Green
Write-Host " TRACE stack launched  ($RunId)" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  Langfuse traces  $LangfuseUrl"
Write-Host "  Bifrost KV cache $BifrostUrl"
Write-Host "  TurboQuant GGUF  http://127.0.0.1:$TurboPort   (q8_0 KV, FA on)"
Write-Host "  Topo search      http://127.0.0.1:8101/health"
Write-Host "  TRACE MCP        http://127.0.0.1:$McpPort/health  ($McpWorkers workers)"
Write-Host "  SvelteKit dev    http://127.0.0.1:5173"
Write-Host ""
Write-Host "  MCP endpoint:    http://127.0.0.1:$McpPort" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Green