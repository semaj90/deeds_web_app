<#
.SYNOPSIS
  Launch an isolated llama-server.exe embedding server for the EmbeddingGemma 2 Q8 GGUF model.

.DESCRIPTION
  Runs the EmbeddingGemma 2 challenger on port 8082 (separate from the existing
  semantic_768 endpoint on 8081 and chat server on
  8090) with --embedding + --pooling mean + --embd-normalize 2. This exposes:
    POST /v1/embeddings   — OpenAI-compatible embedding endpoint
    POST /embeddings      — llama.cpp native endpoint

  Why a separate server?
    - Chat server (8090) is launched without --embeddings to conserve VRAM
      (gemma4 5.3GB model fills ~7.5GB of 8GB).
    - embeddinggemma (593MB GGUF) is a small model; it runs alongside the
      chat server sharing GPU at ~600MB extra VRAM.
    - MTP/speculative decoding does NOT help embedding (token-generation feature
      only). This server omits KV-cache flags and draft models.
    - SvelteKit routes can point EMBED_SERVER_URL=http://127.0.0.1:8081 and get
      llama.cpp GPU embeddings instead of Ollama, with lower latency at batch_size=512.

.PARAMETER Detached
  Launch as a hidden background process. Polls /health until ready.

.PARAMETER NoEvict
  Skip the Ollama keep_alive:0 pre-flight (use when Ollama is not running).

.ENV
  LLAMA_SERVER_PATH      default: resolves same as launch-turboquant.ps1
  EMBED_MODEL_PATH       default: repo-local EmbeddingGemma 2 Q8 GGUF
  EMBED_PORT             default: 8082 (isolated challenger endpoint)
  EMBED_NGL              default: 0   (CPU-only; set explicitly for GPU use)
  EMBED_BATCH_SIZE       default: 2048 (must equal EMBED_UBATCH_SIZE and be >= EMBED_CTX — see invariant below)
  EMBED_UBATCH_SIZE      default: 2048
  EMBED_CTX              default: 2048 (bounded executor profile; evaluate before raising)

.NOTES
  EMBED-SERVER-PHYSICAL-BATCH-01 (2026-09-02): for llama.cpp's non-causal/pooled
  embedding execution path, the PHYSICAL batch (-ub/--ubatch-size) — not the
  logical batch (-b/--batch-size) — is what actually caps admitted input length.
  A prior default (batch=512, ubatch=128) silently rejected any input over ~128
  tokens with "input (N tokens) is too large to process", even though the model's
  real declared context is 2048 tokens (SEM768-8081-CAPACITY-01 proved this live:
  255/2000 real codebase summaries failed at every concurrency level, root-caused
  to this exact ceiling, not to load). llama.cpp itself sets batch=ubatch for
  embedding models when they diverge, so an explicit mismatch here was silently
  giving up capacity, not adding safety.

  This script now derives batch/ubatch from ctx by default (both = EMBED_CTX) and
  fails closed — refuses to launch — if an operator explicitly sets
  EMBED_BATCH_SIZE != EMBED_UBATCH_SIZE, or sets a batch/ubatch below EMBED_CTX,
  for this isolated EmbeddingGemma 2 evaluation profile. This does not forbid a deliberately
  smaller admitted-context profile for some future non-canonical embedding model —
  it forbids exactly the silent ctx/batch mismatch that caused the incident.
#>
[CmdletBinding()]
param(
  [switch] $Detached,
  [switch] $NoEvict
)

$ErrorActionPreference = 'Stop'

function Test-LlamaFlag {
  param([string]$Exe, [string]$Pattern)
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $h1 = (& $Exe --help 2>&1 | Out-String)
    if ($h1 -match $Pattern) { return $true }
    $h2 = (& $Exe -h 2>&1 | Out-String)
    return $h2 -match $Pattern
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $oldPreference
  }
}

# -- Load .env ----------------------------------------------------------------
# Match scripts/atlas/connection-config.mjs semantics:
# .env primary, .env.local override, explicit process env wins.
$initialProcessEnv = [System.Environment]::GetEnvironmentVariables('Process')
foreach ($envPath in @(
  (Join-Path $PSScriptRoot "..\.env"),
  (Join-Path $PSScriptRoot "..\.env.local")
)) {
  if (Test-Path $envPath) {
    Get-Content $envPath | Where-Object { $_ -match '=' -and $_ -notmatch '^#' } | ForEach-Object {
      $name, $value = $_.Split('=', 2)
      if ($name -and $value) {
        $name  = $name.Trim()
        $value = $value.Trim().Trim('"').Trim("'")
        if (-not [string]::IsNullOrWhiteSpace($name) -and -not $initialProcessEnv.Contains($name)) {
          [System.Environment]::SetEnvironmentVariable($name, $value)
        }
      }
    }
  }
}

# -- Resolve llama-server.exe (same priority order as launch-turboquant.ps1) --
$llama = if ($env:LLAMA_SERVER_PATH) {
  $env:LLAMA_SERVER_PATH
} else {
  $localBin    = Join-Path $PSScriptRoot "..\bin\llama-server.exe"
  $localTools  = Join-Path $PSScriptRoot "..\tools\llama-server\llama-server.exe"
  $localVendor = Join-Path $PSScriptRoot "..\vendor\llama-server\llama-server.exe"
  if     (Test-Path $localBin)    { $localBin }
  elseif (Test-Path $localTools)  { $localTools }
  elseif (Test-Path $localVendor) { $localVendor }
  else                            { "llama-server.exe" }
}

if (-not (Test-Path $llama)) { throw "llama-server.exe not found at: $llama" }

# -- Resolve EmbeddingGemma 2 GGUF -------------------------------------------
# ONNX graphs are used by the in-process ONNX adapter; llama-server requires GGUF.
# Keep this model isolated from the existing semantic_768/EmbeddingGemma v1 lane.
$model = if ($env:EMBED_MODEL_PATH) {
  $env:EMBED_MODEL_PATH
} else {
  Join-Path $PSScriptRoot "..\models\embeddinggemma2\unsloth-q8\embeddinggemma-2-Q8_0.gguf"
}

if (-not $model) {
  throw "EmbeddingGemma 2 GGUF not found. Set EMBED_MODEL_PATH to a valid GGUF path."
}
if (-not (Test-Path -LiteralPath $model -PathType Leaf)) { throw "EmbeddingGemma 2 GGUF not found at: $model`nExpected repo-local path: $((Join-Path $PSScriptRoot '..\models\embeddinggemma2\unsloth-q8\embeddinggemma-2-Q8_0.gguf'))" }

# -- Config -------------------------------------------------------------------
$port       = if ($env:EMBED_PORT)       { $env:EMBED_PORT }       else { '8082' }
$ngl        = if ($env:EMBED_NGL)        { $env:EMBED_NGL }        else { '0'    }
$ctxLen     = if ($env:EMBED_CTX)        { $env:EMBED_CTX }        else { '2048' }
# batch/ubatch default to ctx (isolated EmbeddingGemma 2 profile — see
# EMBED-SERVER-PHYSICAL-BATCH-01 note above). Only override via env if you
# know what you're doing; a mismatch is refused below, not silently accepted.
$batchSize  = if ($env:EMBED_BATCH_SIZE) { $env:EMBED_BATCH_SIZE } else { $ctxLen }
$ubatchSize = if ($env:EMBED_UBATCH_SIZE){ $env:EMBED_UBATCH_SIZE} else { $ctxLen }
$threads    = [System.Environment]::ProcessorCount.ToString()
# The model receipt (EMB-PROV-01) records serverModelAlias. Without --alias llama-server reports the GGUF
# file name, so the runtime readback cannot match the requested model id. Identity is still decided by the loaded
# path + sha256, never by this alias.
$alias      = if ($env:EMBED_ALIAS) { $env:EMBED_ALIAS } else { 'embeddinggemma2' }

# -- Fail-closed invariant (EMBED-SERVER-PHYSICAL-BATCH-01) -------------------
# Refuses to launch with a config that would silently cap admitted input length
# below the advertised context — the exact defect that caused 255/2000 real
# embedding requests to fail with "input too large to process" while the model
# happily advertised a 2048-token EMBED_CTX.
if ([int]$batchSize -ne [int]$ubatchSize) {
  throw "EMBED_BATCH_SIZE ($batchSize) must equal EMBED_UBATCH_SIZE ($ubatchSize) for the EmbeddingGemma 2 embedding profile — llama.cpp's non-causal/pooled path is capped by the smaller of the two, so a mismatch silently truncates the admitted context. See EMBED-SERVER-PHYSICAL-BATCH-01 in this file's header."
}
if ([int]$batchSize -lt [int]$ctxLen) {
  throw "EmbeddingGemma 2 executor cannot advertise EMBED_CTX=$ctxLen with physical batch EMBED_BATCH_SIZE/EMBED_UBATCH_SIZE=$batchSize — requests near the advertised context would fail with 'input too large to process'. Raise EMBED_BATCH_SIZE/EMBED_UBATCH_SIZE to at least $ctxLen, or lower EMBED_CTX to match. See EMBED-SERVER-PHYSICAL-BATCH-01 in this file's header."
}

Write-Host "`nEmbed server config:" -ForegroundColor Gray
Write-Host "  URL:         http://127.0.0.1:$port/v1/embeddings"
Write-Host "  Model:       $model"
Write-Host "  GPU layers:  $ngl"
Write-Host "  Batch size:  $batchSize / $ubatchSize"
Write-Host "  Context:     $ctxLen"
Write-Host "  Pooling:     mean  (normalize if supported)"
Write-Host ""

# -- Already healthy? ---------------------------------------------------------
try {
  Invoke-RestMethod ("http://127.0.0.1:$port/health") -TimeoutSec 1 | Out-Null
  Write-Host ("Embed server already healthy on http://127.0.0.1:$port") -ForegroundColor Yellow
  exit 0
} catch { }

# -- Build args ---------------------------------------------------------------
# --embedding   enables /v1/embeddings and /embeddings endpoints
# --pooling mean  mean-pool token embeddings (768-dim output matching embeddinggemma)
# --embd-normalize 2  L2-normalize output vectors (cosine-search ready)
# --log-verbosity 0  quietest tier ("generic output") -- without this, no verbosity flag was ever
# set, so a long-running instance logs per-request slot-cache debug chatter
# (`srv update: - prompt ... checkpoints...`) at whatever this binary's unset default is, which
# silently grew one .err file to 671MB over 5 days of continuous runtime (found 2026-09-07). This
# is a dedicated, narrow embedding daemon -- no need for anything above the lowest tier.
# No KV-cache flags, no mmproj, no LoRA, no speculative decoding — embed only.
$args = @(
  '-m',             $model,
  '--host',         '127.0.0.1',
  '--port',         $port,
  '-ngl',           $ngl,
  '--alias',        $alias,
  '--embedding',
  '--pooling',      'mean',
  '-c',             $ctxLen,
  '-b',             $batchSize,
  '-ub',            $ubatchSize,
  '-t',             $threads,
  '--log-verbosity', '0'
)

if (Test-LlamaFlag $llama '--embd-normalize') {
  $args = $args + @('--embd-normalize', '2')
  Write-Host "Pooling normalize: --embd-normalize 2 enabled" -ForegroundColor Cyan
} else {
  Write-Host "Pooling normalize: --embd-normalize not supported by this binary - continuing without it" -ForegroundColor Yellow
}

# -- Foreground ---------------------------------------------------------------
if (-not $Detached) {
  & $llama @args
  exit $LASTEXITCODE
}

# -- Detached -----------------------------------------------------------------
$logDir  = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'logs\embed-server'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp   = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
$errPath = Join-Path $logDir "launch-$stamp.err"
$outPath = Join-Path $logDir "launch-$stamp.out"

$proc = Start-Process -FilePath $llama `
                      -ArgumentList $args `
                      -PassThru -WindowStyle Hidden `
                      -RedirectStandardError $errPath `
                      -RedirectStandardOutput $outPath

# Poll for up to 60s (embed model loads fast — 593MB)
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
  if ($proc.HasExited) { break }
  try {
    Invoke-RestMethod ("http://127.0.0.1:$port/health") -TimeoutSec 1 | Out-Null
    $ready = $true; break
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $ready) {
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  Write-Host '--- embed-server stderr ---' -ForegroundColor Red
  if (Test-Path $errPath) { Get-Content $errPath -Tail 20 | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow } }
  throw "Embed server failed to start on :$port — see $errPath"
}

Write-Host ("Embed server ready on http://127.0.0.1:$port (PID $($proc.Id))") -ForegroundColor Green
Write-Host ("  POST /v1/embeddings  — OpenAI-compatible")  -ForegroundColor DarkGray
Write-Host ("  POST /embeddings     — llama.cpp native")    -ForegroundColor DarkGray
Write-Host ("  stderr: $errPath") -ForegroundColor DarkGray
