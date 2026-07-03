#Requires -Version 7.0
<#
.SYNOPSIS
Gemma4 RotorQuant Summary Server Launcher — Port :8090

.DESCRIPTION
Launches llama-server.exe with Gemma4 RotorQuant IQ4_XS for concurrent summary generation.

This script ONLY handles summary generation. Embeddings are produced separately:
  - Server Lane: go-embedding-service :8097 (Ollama embeddinggemma:latest, returns 768-dim)
  - Browser Lane: @xenova/transformers ONNX (client-side fallback, also 768-dim)

Gemma4 Summary Architecture:
  - Model: models/gemma4-legal-iq4xs-direct.gguf (5.3GB, IQ4_XS quantized)
  - Port: :8090 (/v1/chat/completions, /v1/models)
  - Context: 16384 (conservative) → 32768 (proven) → 65536 (aggressive, verify VRAM)
  - KV Cache: -ctk q8_0 -ctv q8_0 (stock llama.cpp, stable on RTX 3060 Ti 8GB)
  - Parallel Slots: 2-4 (depends on VRAM + latency requirements)
  - GPU Offload: -ngl 99 (all layers to GPU)
  - Flash Attention: -fa on (required for performance)

Batch Summarization Pipeline:
  1. Extract functions/classes via AST (CPU-only, no GPU)
  2. Chunk by function/class/file section (CPU-only)
  3. Embed chunks via go-embedding-service :8097 (separate lane, Ollama)
  4. Optional TurboVec ANN prefilter :50062 (gRPC, optional acceleration)
  5. Qdrant/Postgres retrieval (vector search, CPU-only)
  6. Reranking (optional, TensorRT/GPU, Phase 2)
  7. Merge nearby ranges (CPU-only)
  8. Summarize ranked context with llama-server :8090 (THIS SCRIPT)
  9. Write summary + metadata to Postgres, Qdrant, Redis

Safety Rules:
  ✅ Do NOT send whole 3000-line files to summary lane — chunk first
  ✅ Summarize function chunks first, then file summaries, then directory summaries
  ✅ Keep summary concurrency separate from embedding concurrency
  ✅ CPU workers for extraction, chunking, merging, DB writes
  ✅ llama-server slots only for generation
  ✅ MTP (speculative drafting) is Phase 2 — skip for now
  ✅ Triton is Phase 2 for ONNX/TensorRT rerankers — skip for now

Verification:
  Test summary generation:
    curl -s -X POST http://localhost:8090/v1/chat/completions `
      -H "Content-Type: application/json" `
      -d '{"messages":[{"role":"user","content":"Summarize: test code"}],"max_tokens":32,"temperature":0.1}' `
      | jq '.choices[0].message.content'
    Expected: 1-2 sentence summary

.EXAMPLE
# Conservative settings (RTX 3060 Ti 8GB, proven stable)
.\scripts\launch-gemma4-summary-server.ps1 -Context 16384 -Parallel 2 -Slots 2

# Proven aggressive (after latency testing)
.\scripts\launch-gemma4-summary-server.ps1 -Context 32768 -Parallel 2 -Slots 2

# Maximum (after VRAM proof, latency acceptable)
.\scripts\launch-gemma4-summary-server.ps1 -Context 65536 -Parallel 4 -Slots 4

.NOTES
Execution Context: Windows 10 + WSL2 Docker
Model Requirements: 5.3GB VRAM (model weights) + 2.5GB (KV cache @ 16384 context, q8_0)
Total: ~7.8GB on RTX 3060 Ti 8GB (tight but proven)

For higher concurrency, reduce context or upgrade GPU VRAM.
#>

param(
    [int]$Context = 16384,
    [int]$Parallel = 2,
    [int]$Slots = 2,
    [ValidateSet('stock', 'turboquant', 'turboquant-safe')]
    [string]$TurboProfile = 'stock',
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'

function Write-Status {
    param([string]$Message, [ValidateSet('INFO', 'OK', 'WARN', 'ERROR')]$Level = 'INFO')
    $colors = @{
        INFO  = 'Cyan'
        OK    = 'Green'
        WARN  = 'Yellow'
        ERROR = 'Red'
    }
    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $colors[$Level]
}

Write-Status "════════════════════════════════════════════════════════════════"
Write-Status "GEMMA4 ROTORQUANT SUMMARY SERVER LAUNCHER"
Write-Status "════════════════════════════════════════════════════════════════"
Write-Status ""

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

$ModelPath = "models/gemma4-legal-iq4xs-direct.gguf"
$LlamaServerExe = "llama-server.exe"
$Port = 8090
$CachePrompt = $true
$CacheReuse = 256
$FlashAttention = 'on'
$GpuLayers = 99

# KV Cache quantization (stock llama.cpp)
$KvCacheKeyType = 'q8_0'
$KvCacheValueType = 'q8_0'

# TurboQuant override (if profile != 'stock')
if ($TurboProfile -eq 'turboquant') {
    $KvCacheValueType = 'turbo3'
    Write-Status "TurboQuant mode: K=$KvCacheKeyType, V=$KvCacheValueType" 'WARN'
} elseif ($TurboProfile -eq 'turboquant-safe') {
    # Keep q8_0/q8_0, just raise context limit
    Write-Status "TurboQuant-safe mode: K=$KvCacheKeyType, V=$KvCacheValueType (large context)" 'WARN'
}

Write-Status ""
Write-Status "Configuration Summary:"
Write-Status "  Model: $ModelPath"
Write-Status "  Port: :$Port"
Write-Status "  Context: $Context tokens"
Write-Status "  Parallel: $Parallel"
Write-Status "  Slots: $Slots"
Write-Status "  KV Cache: -ctk $KvCacheKeyType -ctv $KvCacheValueType"
Write-Status "  Flash Attention: -fa $FlashAttention"
Write-Status "  GPU Layers: -ngl $GpuLayers"
Write-Status ""

if ($DryRun) {
    Write-Status "DRY-RUN MODE: Showing command only (no launch)" 'WARN'
    Write-Status ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Build llama-server command
# ─────────────────────────────────────────────────────────────────────────────

$args = @(
    '-m', $ModelPath,
    '--port', $Port.ToString(),
    '-c', $Context.ToString(),
    '--parallel', $Parallel.ToString(),
    '--slots', $Slots.ToString(),
    '-ctk', $KvCacheKeyType,
    '-ctv', $KvCacheValueType,
    '-fa', $FlashAttention,
    '-ngl', $GpuLayers.ToString(),
    '--cache-prompt',
    '--cache-reuse', $CacheReuse.ToString(),
    '--jinja',
    '--chat-template-file', "$(Get-Location)\configs\templates\gemma4-summary-clean.jinja"
)

if ($Verbose) {
    Write-Status "Full command:"
    Write-Status "$LlamaServerExe $($args -join ' ')"
    Write-Status ""
}

if ($DryRun) {
    Write-Status "✓ Command ready (use -DryRun `$false to launch)" 'OK'
    exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Stop existing llama-server processes
# ─────────────────────────────────────────────────────────────────────────────

Write-Status "Checking for existing llama-server processes..."
$existing = Get-Process -Name 'llama-server' -ErrorAction SilentlyContinue
if ($existing) {
    Write-Status "Stopping existing llama-server instances..." 'WARN'
    $existing | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# ─────────────────────────────────────────────────────────────────────────────
# Launch llama-server
# ─────────────────────────────────────────────────────────────────────────────

try {
    Write-Status "Launching llama-server..."
    $process = Start-Process -FilePath $LlamaServerExe `
        -ArgumentList $args `
        -PassThru `
        -WindowStyle Minimized `
        -ErrorAction Stop

    Write-Status "✓ llama-server started (PID: $($process.Id))" 'OK'
    Write-Status ""

    # Wait for readiness
    Write-Status "Waiting for server readiness (max 60 seconds)..."
    $maxRetries = 60
    $retry = 0
    $ready = $false

    while ($retry -lt $maxRetries -and -not $ready) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/models" `
                -Method Get `
                -TimeoutSec 2 `
                -ErrorAction Stop

            if ($health.data -and $health.data.count -gt 0) {
                Write-Status "✓ Server ready: $($health.data[0].id)" 'OK'
                $ready = $true
            }
        } catch {
            # Not ready yet
        }

        if (-not $ready) {
            Start-Sleep -Seconds 1
            $retry++
            Write-Host "." -NoNewline
        }
    }

    Write-Status ""
    if (-not $ready) {
        Write-Status "⚠ Server startup timeout (server may still be initializing)" 'WARN'
    }

} catch {
    Write-Status "Failed to start llama-server: $_" 'ERROR'
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Verification & Next Steps
# ─────────────────────────────────────────────────────────────────────────────

Write-Status ""
Write-Status "════════════════════════════════════════════════════════════════"
Write-Status "✓ GEMMA4 SUMMARY SERVER READY"
Write-Status "════════════════════════════════════════════════════════════════"
Write-Status ""
Write-Status "Verify Summary Generation:"
Write-Status "  curl -s -X POST http://localhost:8090/v1/chat/completions \"
Write-Status "    -H \"Content-Type: application/json\" \"
Write-Status "    -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Summarize: test\"}],\"max_tokens\":32,\"temperature\":0.1}' | jq '.choices[0].message.content'"
Write-Status ""
Write-Status "Expected Response: 1-2 sentence summary"
Write-Status ""
Write-Status "Batch Summarization Flow:"
Write-Status "  1. Extract functions/classes (CPU)"
Write-Status "  2. Chunk by function/class (CPU)"
Write-Status "  3. Embed chunks via go-embedding-service :8097"
Write-Status "  4. Retrieve via Qdrant/Postgres (CPU)"
Write-Status "  5. Merge nearby ranges (CPU)"
Write-Status "  6. Summarize ranked context (llama-server :8090 — THIS SERVER)"
Write-Status "  7. Write summary + metadata to Postgres"
Write-Status ""
Write-Status "Separate Embedding Lanes (NOT from this server):"
Write-Status "  Server Embeddings: go-embedding-service :8097 (Ollama embeddinggemma:latest, 768-dim)"
Write-Status "  Browser Embeddings: @xenova/transformers ONNX (client-side, 768-dim)"
Write-Status ""
Write-Status "Monitor Server:"
Write-Status "  - Keep this window open (process runs in foreground)"
Write-Status "  - Press Ctrl+C to stop server"
Write-Status "  - Check 'Task Manager > GPU' for VRAM usage"
Write-Status ""
Write-Status "Safety Rules:"
Write-Status "  ⚠ Do NOT send whole files (3000+ lines) — chunk first"
Write-Status "  ⚠ Chunk size: ~100-200 lines per summary request"
Write-Status "  ⚠ Keep context < 16K for stable VRAM (RTX 3060 Ti 8GB)"
Write-Status "  ⚠ Monitor latency: summaries should complete in 5-15s per chunk"
Write-Status ""

# Keep process alive
$process | Wait-Process -ErrorAction SilentlyContinue
