#Requires -Version 7.0
<#
.SYNOPSIS
Batch Summarization Pipeline Orchestrator (3-lane dual-execution)

.DESCRIPTION
Orchestrates three independent lanes working in parallel:

LANE 1 (Browser Client-side Classification):
  - Transformers.js ONNX WebGPU (Gemma4 E2B q4f16)
  - Non-blocking UI, IndexedDB caching
  - Runs via SvelteKit admin dashboard at http://localhost:5173/admin/batch-summaries

LANE 2 (Server Gemma4 Synthesis):
  - llama-server :8090 (gemma4-legal-iq4xs-direct.gguf)
  - RabbitMQ queue-based job processing
  - Sequential synthesis (no --parallel slots to fit 8GB VRAM)
  - Persists summaries to Postgres

LANE 3 (Parallel Embedding Generation):
  - go-embedding-service :8097 (embeddinggemma:latest → 768-dim via Ollama)
  - Generates embeddings for codebase_chunk_index
  - Optional, runs alongside lanes 1 & 2

.EXAMPLE
# Full pipeline (all 3 lanes)
.\scripts\batch-summarization-orchestrator.ps1 -StartAll

# Browser + synthesis only (no embedding)
.\scripts\batch-summarization-orchestrator.ps1 -StartBrowserAndSynthesis

# Just summarization synthesis
.\scripts\batch-summarization-orchestrator.ps1 -StartSynthesisOnly

.NOTES
Execution order:
1. Verify all services (Ollama, Docker, Redis, RabbitMQ, Postgres)
2. Start llama-server :8090 (Gemma4 synthesis)
3. Start SvelteKit dev server (browser admin UI)
4. Open admin dashboard
5. Click "▶️ Start Batch Processing" to begin
6. Monitor all 3 lanes in parallel
#>

param(
    [switch]$StartAll,
    [switch]$StartBrowserAndSynthesis,
    [switch]$StartSynthesisOnly,
    [switch]$SkipEmbedding
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $(if($Level -eq "ERROR") { "Red" } elseif($Level -eq "WARN") { "Yellow" } else { "Green" })
}

function Test-Service {
    param([string]$Name, [string]$Url)
    try {
        $response = curl.exe -s -m 2 $Url 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "✅ $Name responding at $Url" "INFO"
            return $true
        }
    } catch {}
    Write-Log "❌ $Name not responding at $Url" "WARN"
    return $false
}

Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Log "BATCH SUMMARIZATION PIPELINE ORCHESTRATOR"
Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Log ""

# ─────────────────────────────────────────────────────────────────────
# PHASE 1: SERVICE HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────

Write-Log "PHASE 1: SERVICE HEALTH CHECK"
Write-Log ""

$services_ok = $true

# Check Ollama (required for embeddings)
if (-not $SkipEmbedding) {
    if (Test-Service "Ollama" "http://127.0.0.1:11434/api/tags") {
        $models = (curl.exe -s http://127.0.0.1:11434/api/tags 2>$null | ConvertFrom-Json).models
        if ($models -and $models.name -contains "embeddinggemma:latest") {
            Write-Log "  ✓ embeddinggemma:latest loaded" "INFO"
        } else {
            Write-Log "  ⚠️  embeddinggemma:latest not loaded, will pull on first request" "WARN"
        }
    } else {
        $services_ok = $false
    }
}

# Check Docker services (required for all pipelines)
Write-Log "Docker services:" "INFO"
foreach ($container in @("legal-ai-postgres", "legal-ai-redis", "legal-ai-rabbitmq", "legal-ai-qdrant", "legal-ai-go-embedding")) {
    $status = docker ps --filter "name=$container" --format "{{.State}}" 2>$null
    if ($status -eq "running") {
        Write-Log "  ✓ $container running" "INFO"
    } else {
        Write-Log "  ⚠️  $container not running" "WARN"
    }
}

Write-Log ""

# ─────────────────────────────────────────────────────────────────────
# PHASE 2: LAUNCH SERVERS
# ─────────────────────────────────────────────────────────────────────

Write-Log "PHASE 2: LAUNCHING SERVERS"
Write-Log ""

$processes = @()

# Lane 3: Start go-embedding-service (if enabled)
if (-not $SkipEmbedding -and -not $StartSynthesisOnly) {
    Write-Log "Lane 3: Starting go-embedding-service (embeddings)" "INFO"
    docker restart legal-ai-go-embedding | Out-Null
    Start-Sleep -Seconds 2

    if (Test-Service "go-embedding-service" "http://localhost:8097/health") {
        Write-Log "  ✓ Lane 3 (embeddings) ready at :8097" "INFO"
    } else {
        Write-Log "  ⚠️  Lane 3 (embeddings) health check failed" "WARN"
    }
}

Write-Log ""

# Lane 2: Start llama-server :8090 for Gemma4 synthesis
if (-not $StartBrowserAndSynthesis -or $StartAll -or $StartSynthesisOnly) {
    Write-Log "Lane 2: Starting llama-server :8090 (Gemma4 synthesis)" "INFO"

    # Kill any existing llama-server processes
    Get-Process | Where-Object { $_.Name -like "*llama*" } | ForEach-Object {
        Write-Log "  Stopping existing llama-server (PID: $($_.Id))" "INFO"
        $_ | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2

    # Start llama-server with synthesis config
    $llama_args = @(
        "-m", "models/gemma4-legal-iq4xs-direct.gguf",
        "--port", "8090",
        "-c", "65536",
        "-ctk", "q8_0",
        "-ctv", "q8_0",
        "-fa", "on",
        "-ngl", "99",
        "--cache-prompt",
        "--cache-reuse", "256"
    )

    $llama_process = Start-Process -FilePath "llama-server.exe" `
        -ArgumentList $llama_args `
        -PassThru `
        -WindowStyle Minimized `
        -ErrorAction SilentlyContinue

    if ($llama_process) {
        Write-Log "  ✓ llama-server started (PID: $($llama_process.Id))" "INFO"
        $processes += $llama_process

        # Wait for readiness
        $ready = $false
        $timeout = 0
        while (-not $ready -and $timeout -lt 30) {
            try {
                $health = curl.exe -s http://127.0.0.1:8090/v1/models 2>$null | ConvertFrom-Json
                if ($health.data -and $health.data[0].id -like "*gemma4*") {
                    $ready = $true
                    Write-Log "  ✓ Lane 2 (synthesis) ready at :8090" "INFO"
                }
            } catch {}

            if (-not $ready) {
                Start-Sleep -Seconds 1
                $timeout++
            }
        }

        if (-not $ready) {
            Write-Log "  ⚠️  llama-server startup timeout (may still initialize)" "WARN"
        }
    } else {
        Write-Log "  ❌ Failed to start llama-server" "ERROR"
        $services_ok = $false
    }
}

Write-Log ""

# Lane 1: Start SvelteKit dev server
if (-not $StartSynthesisOnly) {
    Write-Log "Lane 1: Starting SvelteKit dev server (browser UI)" "INFO"

    $sveltekit_process = Start-Process -FilePath "npm" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory "sveltekit-frontend" `
        -PassThru `
        -WindowStyle Minimized `
        -ErrorAction SilentlyContinue

    if ($sveltekit_process) {
        Write-Log "  ✓ SvelteKit dev server started (PID: $($sveltekit_process.Id))" "INFO"
        $processes += $sveltekit_process

        # Wait for readiness
        Start-Sleep -Seconds 5
        if (Test-Service "SvelteKit" "http://localhost:5173") {
            Write-Log "  ✓ Lane 1 (browser UI) ready at :5173" "INFO"
            Write-Log "  → Admin dashboard: http://localhost:5173/admin/batch-summaries" "INFO"
        } else {
            Write-Log "  ⚠️  SvelteKit health check failed (may still initialize)" "WARN"
        }
    } else {
        Write-Log "  ❌ Failed to start SvelteKit dev server" "ERROR"
        $services_ok = $false
    }
}

Write-Log ""
Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Log "✅ PIPELINE READY"
Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Log ""

Write-Log "THREE-LANE EXECUTION MODEL:"
Write-Log ""
Write-Log "Lane 1 — Browser Client Classification (CONCURRENT):" "INFO"
Write-Log "  • Transformers.js ONNX WebGPU (Gemma4 E2B q4f16)" "INFO"
Write-Log "  • URL: http://localhost:5173/admin/batch-summaries" "INFO"
Write-Log "  • Click '▶️ Start Batch Processing' to begin" "INFO"
Write-Log "  • Time: 2-4 min for 501 jobs × 20 tuples" "INFO"
Write-Log "  • Output: Hints cached in IndexedDB" "INFO"
Write-Log ""

Write-Log "Lane 2 — Server Gemma4 Synthesis (SEQUENTIAL):" "INFO"
Write-Log "  • llama-server :8090 (gemma4-legal-iq4xs-direct.gguf)" "INFO"
Write-Log "  • RabbitMQ queue-based job processing" "INFO"
Write-Log "  • Time: 2-3 hours for 501 summary jobs" "INFO"
Write-Log "  • Output: Summaries persisted to Postgres" "INFO"
Write-Log ""

Write-Log "Lane 3 — Parallel Embedding Generation (OPTIONAL):" "INFO"
Write-Log "  • go-embedding-service :8097 (embeddinggemma:latest)" "INFO"
Write-Log "  • HTTP /embed endpoint for 768-dim vectors" "INFO"
Write-Log "  • Time: 20-30 min for 40K+ codebase chunks" "INFO"
Write-Log "  • Output: Embeddings updated in codebase_chunk_index" "INFO"
Write-Log ""

Write-Log "MONITORING:"
Write-Log "  • Admin dashboard: http://localhost:5173/admin/batch-summaries" "INFO"
Write-Log "  • Real-time progress bars and status tracking" "INFO"
Write-Log "  • Browser ONNX: 0% → 100% (2-4 min)" "INFO"
Write-Log "  • Server synthesis: 0% → 100% (2-3 hours)" "INFO"
Write-Log ""

Write-Log "VERIFICATION (when complete):"
Write-Log "  psql -U legal_admin -d legal_ai_db -c \"SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL;\"" "INFO"
Write-Log "  Expected: 501 summaries written" "INFO"
Write-Log ""

Write-Log "Press Ctrl+C in any terminal to stop services"
Write-Log ""

# Keep processes alive
if ($processes.Count -gt 0) {
    $processes | Wait-Process -ErrorAction SilentlyContinue
}
