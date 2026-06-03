<#
.SYNOPSIS
  Launch a dedicated llama-server.exe embedding server for the embeddinggemma model.

.DESCRIPTION
  Runs a second llama-server instance on port 8081 (separate from the chat server on
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
  EMBED_MODEL_PATH       default: auto-discovers embeddinggemma blob from Ollama store
  EMBED_PORT             default: 8081
  EMBED_NGL              default: 99  (full GPU offload)
  EMBED_BATCH_SIZE       default: 512 (optimal throughput for embed requests)
  EMBED_UBATCH_SIZE      default: 128
  EMBED_CTX              default: 4096 (embedding context; no generation needed)
#>
[CmdletBinding()]
param(
  [switch] $Detached,
  [switch] $NoEvict
)

$ErrorActionPreference = 'Stop'

# -- Load .env ----------------------------------------------------------------
$envPath = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envPath) {
  Get-Content $envPath | Where-Object { $_ -match '=' -and $_ -notmatch '^#' } | ForEach-Object {
    $name, $value = $_.Split('=', 2)
    if ($name -and $value) {
      $name  = $name.Trim()
      $value = $value.Trim().Trim('"').Trim("'")
      if (-not [string]::IsNullOrWhiteSpace($name)) {
        [System.Environment]::SetEnvironmentVariable($name, $value)
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

# -- Resolve embedding model GGUF --------------------------------------------
# Priority: EMBED_MODEL_PATH > embeddinggemma Ollama blob > nomic-embed-text blob
$model = if ($env:EMBED_MODEL_PATH) {
  $env:EMBED_MODEL_PATH
} else {
  $vendorEmbed = Join-Path $PSScriptRoot "..\vendor\models\embeddinggemma.gguf"
  $localEmbed  = Join-Path $PSScriptRoot "..\models\embeddinggemma.gguf"

  $ollamaBlob  = $null
  $manifestRoot = Join-Path $env:USERPROFILE '.ollama\models\manifests\registry.ollama.ai\library'
  $blobRoot     = Join-Path $env:USERPROFILE '.ollama\models\blobs'
  foreach ($tag in @('embeddinggemma', 'nomic-embed-text', 'all-minilm')) {
    $mf = Join-Path $manifestRoot "$tag\latest"
    if (-not (Test-Path $mf)) { continue }
    try {
      $mfData     = Get-Content $mf -Raw | ConvertFrom-Json
      $modelLayer = $mfData.layers | Where-Object { $_.mediaType -eq 'application/vnd.ollama.image.model' } | Select-Object -First 1
      if ($modelLayer -and $modelLayer.digest) {
        $blobName = $modelLayer.digest -replace ':', '-'
        $blobPath = Join-Path $blobRoot $blobName
        if (Test-Path $blobPath) {
          Write-Host ("Embed model: $tag → $blobPath") -ForegroundColor DarkCyan
          $ollamaBlob = $blobPath
          break
        }
      }
    } catch { }
  }

  if     (Test-Path $vendorEmbed) { $vendorEmbed }
  elseif (Test-Path $localEmbed)  { $localEmbed }
  elseif ($ollamaBlob)            { $ollamaBlob }
  else                            { $null }
}

if (-not $model) {
  throw "No embedding model GGUF found. Set EMBED_MODEL_PATH=<path>, or ensure embeddinggemma is pulled in Ollama (~/.ollama/models/)."
}
if (-not (Test-Path $model)) { throw "Embed model GGUF not found at: $model" }

# -- Config -------------------------------------------------------------------
$port       = if ($env:EMBED_PORT)       { $env:EMBED_PORT }       else { '8081' }
$ngl        = if ($env:EMBED_NGL)        { $env:EMBED_NGL }        else { '99'   }
$batchSize  = if ($env:EMBED_BATCH_SIZE) { $env:EMBED_BATCH_SIZE } else { '512'  }
$ubatchSize = if ($env:EMBED_UBATCH_SIZE){ $env:EMBED_UBATCH_SIZE} else { '128'  }
$ctxLen     = if ($env:EMBED_CTX)        { $env:EMBED_CTX }        else { '4096' }
$threads    = [System.Environment]::ProcessorCount.ToString()

Write-Host "`nEmbed server config:" -ForegroundColor Gray
Write-Host "  URL:         http://127.0.0.1:$port/v1/embeddings"
Write-Host "  Model:       $model"
Write-Host "  GPU layers:  $ngl"
Write-Host "  Batch size:  $batchSize / $ubatchSize"
Write-Host "  Context:     $ctxLen"
Write-Host "  Pooling:     mean  (--embd-normalize 2)"
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
# No KV-cache flags, no mmproj, no LoRA, no speculative decoding — embed only.
$args = @(
  '-m',             $model,
  '--host',         '127.0.0.1',
  '--port',         $port,
  '-ngl',           $ngl,
  '--embedding',
  '--pooling',      'mean',
  '--embd-normalize', '2',
  '-c',             $ctxLen,
  '-b',             $batchSize,
  '-ub',            $ubatchSize,
  '-t',             $threads
)

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
