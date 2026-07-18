<#
.SYNOPSIS
  Launch llama-server.exe with TurboQuant-style flags for the YorHA legal stack.

.DESCRIPTION
  Replaces the inline pwsh one-liners that lived under turbo:start* in package.json.
  Adds three things the inline version was missing:

    1. Pre-flight: free Ollama VRAM via keep_alive:0 if a model is resident
       (otherwise model load OOMs at ~5.8GB on an 8GB GPU).
    2. KV-cache type fallback: this build of llama-server does NOT support
       turbo3/turbo4 (Google ICLR 2026 PolarQuant). If TURBO_KV_K/V are
       unsupported by the binary, we fall back to q8_0/q8_0 (CLAUDE.md
       production-stable) and print a one-line note.
    3. stderr capture: the detached path used to swallow startup errors.
       We now tee stderr to logs/turboquant/launch-<stamp>.err so post-mortem
       on a failed launch is one `tail` away.

.PARAMETER Detached
  Start with -WindowStyle Hidden, poll /health, return after PID is stable.
  Without this switch, the script execs llama-server in the foreground.

.PARAMETER TextOnly
  Skip --mmproj. Use when you want the chat-only TurboQuant tier without
  vision tower memory overhead.

.PARAMETER NoEvict
  Skip the Ollama keep_alive:0 pre-flight. Use when you've already managed
  VRAM yourself or Ollama isn't running.

.ENV
  LLAMA_SERVER_PATH    default: bin\llama-server.exe, then vendor\llama-server\llama-server.exe, then system PATH
  TURBO_MODEL_PATH     default: %USERPROFILE%\.ollama\blobs\sha256-a79de882...
  ROTORQUANT_MODEL_PATH  optional: path to a RotorQuant GGUF (e.g. gemma-4-E4B-RotorQuant-GGUF-IQ4_XS.gguf
                           from majentik/gemma-4-E4B-RotorQuant-GGUF-IQ4_XS on HuggingFace).
                           When set, overrides TURBO_MODEL_PATH. Weight-quantised; runs on the
                           stock llama-server.exe without any TurboQuant binary.
  TURBO_MMPROJ_PATH    default: models\mmproj-BF16.gguf (repo-local; see models/model-manifest.json)
  TURBO_PORT           default: 8090
  TURBO_PROFILE        default: stock
                         stock           K=q8_0  V=q8_0   (works on stock llama.cpp)
                         turboquant      K=q8_0  V=turbo3 (TurboQuant-enabled binary required)
                         turboquant-safe K=q8_0  V=q8_0   (parity-safe, keep large TURBO_CTX)
                         atomicbot       K=turbo3 V=turbo3 (AtomicBot binary + Gemma4 assistant drafter;
                                          download AtomicBot-ai/atomic-llama-cpp-turboquant-binaries,
                                          set LLAMA_SERVER_PATH; speculative decode lane uses
                                          --spec-draft-model / --spec-type draft-mtp on current builds)
  TURBO_KV_K           overrides profile K (must be in the known KV allowlist)
  TURBO_KV_V           overrides profile V (must be in the known KV allowlist)
  TURBO_CTX            default: 65536
  TURBO_NGL            default: 99
  MTP_HEAD_PATH        legacy/optional: path to a .mtp sidecar file for older AtomicBot builds
  ENABLE_MTP_DRAFTER   optional: "true" enables speculative decoding benchmark lane when MTP_DRAFT_MODEL exists
  MTP_DRAFT_MODEL      optional: path to the Gemma4 assistant drafter GGUF used for speculative decoding
  LEGAL_LORA_PATH      optional: path to legal LoRA adapter GGUF (--lora injection for base-model GGUFs
                         like majentik/gemma-4-E4B-RotorQuant-GGUF-IQ4_XS that ship without the fine-tune)
  LEGAL_LORA_SCALE     optional: LoRA strength 0.0-1.0 (default 0.8; lower = more base, higher = more adapter)

  Failure semantics:
    - If TURBO_KV_K / TURBO_KV_V are set explicitly to an unknown name,
      the launcher throws BEFORE invoking llama-server.
    - If turbo* is requested explicitly but the binary lacks TurboQuant support,
      the launcher throws (so you notice you have the wrong llama-server.exe)
      rather than silently downgrading to q8_0/q8_0.
    - Profile-derived defaults still soft-fall-back if the binary is stock,
      because the user did not assert "I want turbo".
#>
[CmdletBinding()]
param(
  [switch] $Detached,
  [switch] $TextOnly,
  [switch] $NoEvict,
  [switch] $StatusOnly
)

$ErrorActionPreference = 'Stop'

# -- Probe helper: try --help then -h, return $true if flag is advertised -
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


# -- Load .env files if present --------------------------------------------
# Keep the same precedence convention as the app checkout:
#   .env primary, .env.local override, explicit process env wins
$initialProcessEnv = [System.Environment]::GetEnvironmentVariables('Process')
foreach ($envPath in @(
    (Join-Path $PSScriptRoot "..\.env"),
    (Join-Path $PSScriptRoot "..\.env.local")
)) {
    if (Test-Path $envPath) {
        Get-Content $envPath |
            Where-Object { $_ -match '=' -and $_ -notmatch '^#' } |
            ForEach-Object {
                $name, $value = $_.Split('=', 2)
                if ($name -and $value) {
                    $name = $name.Trim()
                    $value = $value.Trim().Trim('"').Trim("'")
                    if (-not [string]::IsNullOrWhiteSpace($name)) {
                        # Later files intentionally override earlier files, but
                        # caller-provided process env remains the final override.
                        if (-not $initialProcessEnv.Contains($name)) {
                            [System.Environment]::SetEnvironmentVariable($name, $value)
                        }
                    }
                }
            }
    }
}

# -- Resolve paths and ports ----------------------------------------------
$llama = if ($env:LLAMA_SERVER_PATH) {
    $env:LLAMA_SERVER_PATH
} else {
    # Fallback order: 1. bin/ in workspace, 2. tools/ in workspace,
    # 3. vendor/ in workspace, 4. system path
    $localBin = Join-Path $PSScriptRoot "..\bin\llama-server.exe"
    $localTools = Join-Path $PSScriptRoot "..\tools\llama-server\llama-server.exe"
    $localVendor = Join-Path $PSScriptRoot "..\vendor\llama-server\llama-server.exe"
    if (Test-Path $localBin) { $localBin }
    elseif (Test-Path $localTools) { $localTools }
    elseif (Test-Path $localVendor) { $localVendor }
    else { "llama-server.exe" }
}

# Embedding note: --embeddings is intentionally NOT passed to llama-server.
# Embeddings are handled by the ONNX DirectML pipeline (embeddinggemma_300m_onnx)
# via compute-glyph-rewards.mjs and gpu-full-pipeline.mjs. Adding --embeddings
# here would OOM the 8GB GPU (5.3GB model + KV cache already fills ~7.5GB).

# Model resolution: ROTORQUANT_MODEL_PATH > TURBO_MODEL_PATH > local GGUF search
# > Ollama blob auto-discovery (scans manifests for gemma4/rotorquant GGUFs).
# Ollama blobs are raw GGUF files — llama-server reads them directly without Ollama.
$model = if ($env:ROTORQUANT_MODEL_PATH) {
    $env:ROTORQUANT_MODEL_PATH
} elseif ($env:TURBO_MODEL_PATH) {
    $env:TURBO_MODEL_PATH
} else {
    $vendorModel  = Join-Path $PSScriptRoot "..\vendor\models\gemma4-legal.gguf"
    $vendorDirect = Join-Path $PSScriptRoot "..\vendor\models\gemma4-rotorquant.gguf"
    $localModel   = Join-Path $PSScriptRoot "..\models\gemma4-legal-iq4xs-direct.gguf"
    $localLegacy  = Join-Path $PSScriptRoot "..\models\gemma4-turboquant-rotorquant.gguf"

    # Auto-discover RotorQuant/Gemma4 GGUF from Ollama blob store.
    # Scans manifests for model layers matching known legal/gemma4 tags,
    # then resolves the sha256 blob path. Works without Ollama running.
    $ollamaBlob = $null
    $manifestRoot = Join-Path $env:USERPROFILE '.ollama\models\manifests\registry.ollama.ai\library'
    $blobRoot     = Join-Path $env:USERPROFILE '.ollama\models\blobs'
    $preferredTags = @('gemma4-legal', 'gemma4-rotorquant')
    foreach ($tag in $preferredTags) {
        $mf = Join-Path $manifestRoot "$tag\latest"
        if (-not (Test-Path $mf)) { continue }
        try {
            $mfData = Get-Content $mf -Raw | ConvertFrom-Json
            $modelLayer = $mfData.layers | Where-Object { $_.mediaType -eq 'application/vnd.ollama.image.model' } | Select-Object -First 1
            if ($modelLayer -and $modelLayer.digest) {
                $blobName = $modelLayer.digest -replace ':', '-'
                $blobPath = Join-Path $blobRoot $blobName
                if (Test-Path $blobPath) {
                    Write-Host ("Auto-discovered model: $tag → $blobPath") -ForegroundColor DarkCyan
                    $ollamaBlob = $blobPath
                    break
                }
            }
        } catch {
            # malformed manifest — skip
        }
    }

    if (Test-Path $vendorModel) { $vendorModel }
    elseif (Test-Path $vendorDirect) { $vendorDirect }
    elseif (Test-Path $localModel) { $localModel }
    elseif (Test-Path $localLegacy) { $localLegacy }
    elseif ($ollamaBlob) { $ollamaBlob }
    else { $null }
}
$mmproj = if ($env:TURBO_MMPROJ_PATH) {
    $env:TURBO_MMPROJ_PATH
} else {
    $localMmproj = Join-Path $PSScriptRoot "..\models\mmproj-F16.gguf"
    $vendorMmproj = Join-Path $PSScriptRoot "..\vendor\models\mmproj-gemma4.gguf"
    $legacyMmproj = Join-Path $PSScriptRoot "..\models\mmproj-BF16.gguf"
    if (Test-Path $localMmproj) { $localMmproj }
    elseif (Test-Path $vendorMmproj) { $vendorMmproj }
    elseif (Test-Path $legacyMmproj) { $legacyMmproj }
    else { $null }  # no fallback - set TURBO_MMPROJ_PATH or place a mmproj file in one of the known locations
}
$port    = if ($env:TURBO_PORT)        { $env:TURBO_PORT }        else { '8090' }
$ctxLenRequested = if ($env:LLM_CONTEXT_SIZE)  { $env:LLM_CONTEXT_SIZE }
                   elseif ($env:TURBO_CTX)     { $env:TURBO_CTX }
                   elseif ($env:LLAMA_SERVER_CTX) { $env:LLAMA_SERVER_CTX }
                   elseif ($env:OLLAMA_CONTEXT_LENGTH) { $env:OLLAMA_CONTEXT_LENGTH }
                   else { '65536' }
$ctxLen = [int]$ctxLenRequested
$_allowShortCtxVal = if ($env:TURBO_CTX_ALLOW_SHORT_CONTEXT) { $env:TURBO_CTX_ALLOW_SHORT_CONTEXT } else { '' }; $allowShortCtx = @('1','true','yes','on') -contains $_allowShortCtxVal.ToLower()
if ($ctxLen -lt 65536 -and -not $allowShortCtx) {
    Write-Warning "Requested TurboQuant context $ctxLen is below the repo default of 65536. Clamping to 65536. Set TURBO_CTX_ALLOW_SHORT_CONTEXT=true to opt in to a shorter context."
    $ctxLen = 65536
}
$threads = if ($env:TURBO_THREADS)     { $env:TURBO_THREADS }     else { [System.Environment]::ProcessorCount.ToString() }
$batchSize = if ($env:TURBO_BATCH_SIZE) { $env:TURBO_BATCH_SIZE } else { $null }
$ubatchSize = if ($env:TURBO_UBATCH_SIZE) { $env:TURBO_UBATCH_SIZE } else { $null }

# -- GPU Offload (NGL) ----------------------------------------------------
$ngl = if ($env:TURBO_NGL) { $env:TURBO_NGL } else { "99" }

# Handle negative values - warn and normalize
if ($ngl -match "^-") {
    $requestedNgl = $ngl
    $normalizedNgl = $ngl.Replace('-', '')
    Write-Warning "TURBO_NGL is negative ($requestedNgl). llama.cpp-style --n-gpu-layers usually expects a positive layer count (e.g. 35, 99)."
    Write-Host "  Requested NGL:  $requestedNgl" -ForegroundColor DarkGray
    Write-Host "  Normalized NGL: $normalizedNgl" -ForegroundColor Gray
    $ngl = $normalizedNgl
}

if ($ngl -eq "0") {
    Write-Warning "GPU offload (TURBO_NGL) is 0. TurboQuant will run on CPU only."
}

# -- Profile shortcut: TURBO_PROFILE expands to (kvK, kvV) defaults. ------
# Explicit TURBO_KV_K / TURBO_KV_V env vars override the profile.
$kvProfile = if ($env:TURBO_PROFILE) { $env:TURBO_PROFILE.ToLower() } else { 'stock' }
$validProfiles = @('stock', 'turboquant', 'turboquant-safe', 'atomicbot', 'turbo3', 'turbo4')
if ($validProfiles -notcontains $kvProfile) {
  throw "Invalid TURBO_PROFILE '$kvProfile' - choose one of: $($validProfiles -join ', ')"
}
switch ($kvProfile) {
  'stock'           { $kvProfileK = 'q8_0';   $kvProfileV = 'q8_0' }
  'turboquant'      { $kvProfileK = 'q8_0';   $kvProfileV = 'turbo3' }
  'turboquant-safe' { $kvProfileK = 'q8_0';   $kvProfileV = 'q8_0' }
  'atomicbot'       { $kvProfileK = 'turbo3';  $kvProfileV = 'turbo3' }
  'turbo3'          { $kvProfileK = 'q8_0';   $kvProfileV = 'turbo3' }
  'turbo4'          { $kvProfileK = 'q8_0';   $kvProfileV = 'turbo4' }
}

$explicitK = [bool]$env:TURBO_KV_K
$explicitV = [bool]$env:TURBO_KV_V
$kvK       = if ($explicitK) { $env:TURBO_KV_K } else { $kvProfileK }
$kvV       = if ($explicitV) { $env:TURBO_KV_V } else { $kvProfileV }

# -- KV allowlist (early - runs before "already healthy" short-circuit so
#    a typo in TURBO_KV_V always fails fast, not just on cold launches). --
$stockKv      = @('f32','f16','bf16','q8_0','q4_0','q4_1','iq4_nl','q5_0','q5_1')
$turboKv      = @('turbo2','turbo3','turbo4','tbq3_0','tbq4_0')
$supportedKv  = $stockKv + $turboKv
if ($supportedKv -notcontains $kvK) {
  $msg = "Unsupported TURBO_KV_K / cache type: '$kvK'. Allowed: $($supportedKv -join ', ')"
  if ($explicitK) { throw $msg } else { Write-Host ("$msg - falling back to q8_0") -ForegroundColor Yellow; $kvK = 'q8_0' }
}
if ($supportedKv -notcontains $kvV) {
  $msg = "Unsupported TURBO_KV_V / cache type: '$kvV'. Allowed: $($supportedKv -join ', ')"
  if ($explicitV) { throw $msg } else { Write-Host ("$msg - falling back to q8_0") -ForegroundColor Yellow; $kvV = 'q8_0' }
}

if (-not (Test-Path $llama)) { throw "llama-server.exe not found at $llama" }
if (-not $model) {
  throw "No model GGUF found. Set ROTORQUANT_MODEL_PATH=<path to GGUF>, or place gemma4-legal.gguf in vendor/models/, or ensure gemma4-rotorquant is pulled in Ollama (~/.ollama/models/)."
}
if (-not (Test-Path $model)) { throw "TurboQuant model GGUF not found at: $model" }


# -- Pre-flight: evict Ollama-resident model so VRAM is free --------------
if (-not $NoEvict -and -not $StatusOnly) {
  try {
    $ps = Invoke-RestMethod 'http://127.0.0.1:11434/api/ps' -TimeoutSec 2
    if ($ps.models -and $ps.models.Count -gt 0) {
      $top = $ps.models[0].name
      Write-Host ('Pre-flight: evicting Ollama model ' + $top + ' (keep_alive:0)') -ForegroundColor DarkCyan
      Invoke-RestMethod 'http://127.0.0.1:11434/api/generate' `
        -Method Post `
        -ContentType 'application/json' `
        -Body (@{ model = $top; keep_alive = 0; prompt = ''; stream = $false } | ConvertTo-Json -Compress) `
        -TimeoutSec 10 | Out-Null
      Start-Sleep -Seconds 2
    }
  } catch {
    # Ollama not running - fine, nothing to evict
  }
}

# -- Probe binary for TurboQuant support ----------------------------------
# Stock llama.cpp accepts: f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1
# TurboQuant forks add:    turbo2, turbo3, turbo4, tbq3_0, tbq4_0
#   - TheTom/llama-cpp-turboquant releases tqp-v0.1.1 (Win+CUDA12.4 prebuilt,
#     D=128 only - UNUSABLE on Gemma 4 head_dim 256/512; suits Llama-3 / Qwen)
#   - test1111/llama-cpp-turboquant-gemma4 (D=256/512 kernels, source build,
#     the only working path for Gemma 4 today)
#   - PR #21089 to ggml-org/llama.cpp (still under review as of May 2026)
# Recommended TurboQuant config per upstream docs: -ctk q8_0 -ctv turbo3
# (asymmetric - quantize V aggressively, keep K at q8_0). CUDA mixed
# q8_0  turbo parity is documented as "not yet verified" - if quality
# regresses on your model, fall back to symmetric q8_0/q8_0 with larger ctx.
# Allowlist itself was validated above (line ~91), early enough to fail
# fast on TURBO_KV_* typos even when a server is already healthy.

# Probe binary support for turbo*. When the user explicitly asked for a
# turbo* type (TURBO_KV_K/V or TURBO_PROFILE=turboquant), throw if the
# binary doesn't expose it - silent downgrade is exactly the failure mode
# we want to avoid (it's why -ctk turbo3 -ctv turbo4 looked like it worked
# for months). When defaults came from a non-turbo profile and somehow
# resolved to turbo (impossible today, but kept symmetric for future
# profiles), soft-fallback is acceptable.
$turboRequested = ($turboKv -contains $kvK) -or ($turboKv -contains $kvV)
$turboExplicit  = $turboRequested -and ($explicitK -or $explicitV -or $kvProfile -eq 'turboquant' -or $kvProfile -eq 'atomicbot' -or $kvProfile -eq 'turbo3' -or $kvProfile -eq 'turbo4')
if ($turboRequested) {
  $help = & $llama -h 2>&1 | Out-String
  $binaryAcceptsTurbo = $help -match 'turbo[234]|tbq[34]_0'
  if (-not $binaryAcceptsTurbo) {
    # NOTE: TheTom's tqp-v0.1.1 prebuilt is D=128 only and CRASHES on Gemma 4
    # (head_dim 256/512). For Gemma 4 the only working binary today is the
    # source-built test1111 fork. The hint points at both so the operator
    # picks the right one for their model.
    $hint = "For Gemma 4 (head_dim 256/512): source-build https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4 (cmake -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86). For D=128 models: prebuilt at https://github.com/TheTom/llama-cpp-turboquant/releases. Then set LLAMA_SERVER_PATH to the new exe."
    if ($turboExplicit) {
      Write-Warning "llama-server at '$llama' does not advertise turbo*/tbq*_0 KV cache support but TURBO_KV_V='$kvV' / TURBO_KV_K='$kvK' was explicitly requested. Falling back to q8_0/q8_0. $hint"
      $kvK = 'q8_0'
      $kvV = 'q8_0'
    } else {
      Write-Host ("TurboQuant KV '$kvK/$kvV' requested by profile but binary is stock - falling back to q8_0/q8_0. $hint") -ForegroundColor Yellow
      $kvK = 'q8_0'
      $kvV = 'q8_0'
    }
  }
}

# -- Speculative Draft Model Policy ---------------------------------------
$TurboDraftModel = $null
$TurboSpeculative = $false

if ($env:ENABLE_MTP_DRAFTER -and $env:ENABLE_MTP_DRAFTER.ToLower() -eq 'true') {
  if ($env:MTP_DRAFT_MODEL) {
    if (Test-Path $env:MTP_DRAFT_MODEL) {
      $TurboDraftModel = $env:MTP_DRAFT_MODEL
      $TurboSpeculative = $true
    } else {
      Write-Host ("Speculative decoding requested but MTP_DRAFT_MODEL not found at $($env:MTP_DRAFT_MODEL) - skipping") -ForegroundColor Yellow
    }
  } else {
    Write-Host 'Speculative decoding requested but MTP_DRAFT_MODEL is not set - skipping' -ForegroundColor Yellow
  }
}

if ($env:DRAFT_MODEL_PATH) {
  Write-Host 'Deprecated DRAFT_MODEL_PATH is ignored by this launcher. Use ENABLE_MTP_DRAFTER=true and MTP_DRAFT_MODEL=<path> instead.' -ForegroundColor Yellow
}

$TurboFlashAttn = 'on' # Current script hardcodes -fa on
$TurboDraftModelDisplay = if ($TurboDraftModel) { $TurboDraftModel } else { 'none' }
$MeasuredTokensPerSecDisplay = if ($env:MEASURED_TOKENS_PER_SEC) { $env:MEASURED_TOKENS_PER_SEC } else { 'not measured' }
$MeasuredVramDisplay = if ($env:MEASURED_VRAM) { $env:MEASURED_VRAM } else { 'not measured' }

Write-Host "`nTurboQuant resolved config:" -ForegroundColor Gray
Write-Host "  URL:              http://127.0.0.1:$port"
Write-Host "  Model:            $model"
Write-Host "  Draft model:      $TurboDraftModelDisplay"
Write-Host "  Speculative:      $TurboSpeculative"
Write-Host "  Context:          $ctxLen"
Write-Host "  GPU layers:       $ngl"
Write-Host "  Flash attention:  $TurboFlashAttn"
Write-Host "  KV cache K:       $kvK"
Write-Host "  KV cache V:       $kvV"
Write-Host "  CPU threads:      $threads"
Write-Host "  Batch size:       $(if ($batchSize) { $batchSize } else { 'default' })"
Write-Host "  UBatch size:      $(if ($ubatchSize) { $ubatchSize } else { 'default' })"
Write-Host "  Tokens/sec:       $MeasuredTokensPerSecDisplay"
Write-Host "  VRAM:             $MeasuredVramDisplay"

# Diagnostic Warnings
if ([string]::IsNullOrWhiteSpace($ngl) -or $ngl -eq "0") {
    Write-Warning "GPU offload is not configured or set to 0. TurboQuant may run CPU-only."
}
if ($ngl -match "^-") {
    # This block shouldn't be reached if normalized above, but kept for logic safety
    Write-Warning "TURBO_NGL is negative ($ngl). llama.cpp-style --n-gpu-layers usually expects a positive layer count."
}
if (-not $TurboSpeculative) {
    Write-Host "  Speculative decoding: disabled (set ENABLE_MTP_DRAFTER=true + MTP_DRAFT_MODEL to enable)" -ForegroundColor DarkGray
}
Write-Host ""

# -- Already healthy? ---------------------------------------------------------
# Accept the running server only if context AND jinja/system-role are correct.
# A stale server launched with --chat-template gemma (or without --jinja) will
# have supports_system_role:false and silently drop system prompts — that is the
# exact failure mode that caused the duplicate-process VRAM blowout (Jun 9 2026).
# Kill and restart whenever: ctx mismatch OR props check fails OR /props unavailable.
if (-not $StatusOnly) {
    try {
        $slotsInfo = Invoke-RestMethod ("http://127.0.0.1:$port/slots") -TimeoutSec 2 -ErrorAction Stop
        if ($slotsInfo -and $slotsInfo.Count -gt 0) {
            $runningCtx = $slotsInfo[0].n_ctx
            $ctxOk = ($runningCtx -eq [int]$ctxLen)

            # Verify supports_system_role via /props (requires --jinja on this binary)
            $jinjaOk = $false
            try {
                $props = Invoke-RestMethod ("http://127.0.0.1:$port/props") -TimeoutSec 2 -ErrorAction Stop
                $jinjaOk = ($props.chat_template_caps.supports_system_role -eq $true) -or ($props.system_prompt.supports_system_role -eq $true) -or ($props.supports_system_role -eq $true)
            } catch {
                # /props unavailable on old builds — treat as unknown, require restart
                $jinjaOk = $false
            }

            if ($ctxOk -and $jinjaOk) {
                Write-Host "TurboQuant already healthy on http://127.0.0.1:$port (ctx=$ctxLen, system_role=OK)" -ForegroundColor Yellow
                exit 0
            } else {
                $reason = @()
                if (-not $ctxOk)   { $reason += "ctx mismatch: running=$runningCtx target=$ctxLen" }
                if (-not $jinjaOk) { $reason += "supports_system_role:false (stale --chat-template or missing --jinja)" }
                Write-Host ("TurboQuant on :$port needs restart — $($reason -join '; ')") -ForegroundColor Cyan
                $runningPids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
                if ($runningPids) {
                    Write-Host "Stopping process(es) using port ${port}: $($runningPids -join ', ')" -ForegroundColor Cyan
                    $runningPids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
                    Start-Sleep -Seconds 2
                }
            }
        } else {
            # /slots returned empty — fall back to /props check before accepting
            try {
                $props = Invoke-RestMethod ("http://127.0.0.1:$port/props") -TimeoutSec 2 -ErrorAction Stop
                $jinjaOk = ($props.chat_template_caps.supports_system_role -eq $true) -or ($props.system_prompt.supports_system_role -eq $true) -or ($props.supports_system_role -eq $true)
                if ($jinjaOk) {
                    Write-Host "TurboQuant already healthy on http://127.0.0.1:$port (system_role=OK)" -ForegroundColor Yellow
                    exit 0
                } else {
                    Write-Host "TurboQuant on :$port has supports_system_role:false — killing stale server" -ForegroundColor Cyan
                    $runningPids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
                    if ($runningPids) {
                        $runningPids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
                        Start-Sleep -Seconds 2
                    }
                }
            } catch {
                # /props also unavailable — kill anything on the port and restart clean
                Write-Host "TurboQuant on :$port did not respond to /props — forcing restart" -ForegroundColor Yellow
                $runningPids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
                if ($runningPids) {
                    $runningPids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
                    Start-Sleep -Seconds 2
                }
            }
        }
    } catch {
        # Server down or endpoint not supporting /slots, proceed with start
    }
}

if ($StatusOnly) {
    Write-Host "--- Status Check ---" -ForegroundColor Gray
    try {
        $health = Invoke-RestMethod ('http://127.0.0.1:' + $port + '/health') -TimeoutSec 2
        Write-Host "Health: OK (status: $($health.status))" -ForegroundColor Green
    } catch {
        Write-Host "Health: FAILED (server likely down on port $port)" -ForegroundColor Red
    }
    exit 0
}

# -- Build argument list --------------------------------------------------
$baseArgs = @(
  '-m',      $model,
  '--host',  '127.0.0.1',
  '--port',  $port,
  '-ngl',    $ngl,
  '-fa',     'on',
  '-ctk',    $kvK,
  '-ctv',    $kvV,
  '-c',      $ctxLen,
  '-t',      $threads
)

# -- Parallel slots check (Multi-core / Concurrent processing) -------------
$slots = if ($env:TURBO_PARALLEL) { $env:TURBO_PARALLEL } else { '4' }
if (Test-LlamaFlag $llama '--parallel') {
    $baseArgs = $baseArgs + @('--parallel', $slots)
    Write-Host "Parallel slots: --parallel $slots enabled" -ForegroundColor Cyan
} elseif (Test-LlamaFlag $llama '-np') {
    $baseArgs = $baseArgs + @('-np', $slots)
    Write-Host "Parallel slots: -np $slots enabled" -ForegroundColor Cyan
}

if ($kvProfile -eq 'atomicbot') {
    # Enable triattention only if the binary actually advertises it.
    # Some Atomic builds ship speculative decode but not this extra kernel path.
    if (Test-LlamaFlag $llama '--triattention-budget') {
      $baseArgs = $baseArgs + @(
        '--triattention-budget', '4096',
        '--triattention-window', '128',
        '--triattention-mode', 'per-kv-head',
        '--triattention-normalize'
      )
    } else {
      Write-Host "AtomicBot: triattention flags not advertised by this binary - skipping" -ForegroundColor Yellow
    }
}
# -- Speculative Decoding: inject Atomic/spec-draft flags for accelerated throughput --
if ($TurboDraftModel) {
  $specDraftFlagsSupported = Test-LlamaFlag $llama '--spec-draft-n-max'
  Write-Host ("Speculative Decoding: draft model enabled ($TurboDraftModel)") -ForegroundColor Cyan
  Write-Host ("Speculative Decoding automatically disables vision/multimodal (--mmproj)") -ForegroundColor Yellow
  $TextOnly = $true
  if ($specDraftFlagsSupported) {
    $baseArgs = $baseArgs + @(
      '--spec-draft-model', $TurboDraftModel,
      '--spec-type', 'draft-mtp',
      '--spec-draft-n-max', '3',
      '--spec-draft-n-min', '0',
      '--spec-draft-ngl', '99',
      '-ctkd', 'turbo3',
      '-ctvd', 'turbo3'
    )
  } else {
    $baseArgs = $baseArgs + @(
      '--model-draft', $TurboDraftModel,
      '--draft-max', '8',
      '--draft-min', '1',
      '--draft-p-min', '0.6',
      '--n-gpu-layers-draft', '99'
    )
  }
}

if (-not $TextOnly -and (Test-Path $mmproj)) {
  $baseArgs = @('-m', $model, '--mmproj', $mmproj) + $baseArgs[2..($baseArgs.Length - 1)]
}

# -- Legal LoRA adapter injection (Path A - runtime LoRA over base-model GGUFs) --
# Use when ROTORQUANT_MODEL_PATH points at a base-model GGUF (e.g. majentik IQ4_XS)
# that lacks the legal fine-tune. The merged Ollama blob already has the LoRA baked
# in, so set LEGAL_LORA_PATH only when running a non-merged GGUF.
# Path B (re-quantize merged model) produces better quality - see memory card.
if ($env:LEGAL_LORA_PATH) {
  if (Test-Path $env:LEGAL_LORA_PATH) {
    $loraExt = [System.IO.Path]::GetExtension($env:LEGAL_LORA_PATH)
    if ($loraExt -ieq '.safetensors') {
      Write-Host ("Legal LoRA: skipping $($env:LEGAL_LORA_PATH) (safetensors adapters are not supported by llama-server --lora; use a GGUF LoRA adapter or unset LEGAL_LORA_PATH)") -ForegroundColor Yellow
    }
    else {
    $loraScale = if ($env:LEGAL_LORA_SCALE) { $env:LEGAL_LORA_SCALE } else { '0.8' }
    $loraHelp = (& $llama -h 2>&1 | Out-String)
    if ($loraHelp -match '--lora-scaled') {
      $loraPathForScaled = $env:LEGAL_LORA_PATH
      if ([System.IO.Path]::IsPathRooted($loraPathForScaled)) {
        try {
          $loraPathForScaled = [System.IO.Path]::GetRelativePath((Get-Location).Path, $loraPathForScaled)
        }
        catch {
          # If relative conversion fails, keep original path and let llama-server validate it.
        }
      }
      Write-Host ("Legal LoRA: --lora-scaled ${loraPathForScaled}:$loraScale") -ForegroundColor Cyan
      $baseArgs = $baseArgs + @('--lora-scaled', "${loraPathForScaled}:$loraScale")
    }
    elseif ($loraHelp -match '--lora-scale') {
      Write-Host ("Legal LoRA: --lora $($env:LEGAL_LORA_PATH) --lora-scale $loraScale") -ForegroundColor Cyan
      $baseArgs = $baseArgs + @('--lora', $env:LEGAL_LORA_PATH, '--lora-scale', $loraScale)
    }
    else {
      Write-Host ("Legal LoRA: --lora $($env:LEGAL_LORA_PATH) (scale unsupported by this llama-server build)") -ForegroundColor Yellow
      $baseArgs = $baseArgs + @('--lora', $env:LEGAL_LORA_PATH)
    }
    }
  } else {
    Write-Host ("Legal LoRA: LEGAL_LORA_PATH set but file not found at $($env:LEGAL_LORA_PATH) - skipping") -ForegroundColor Yellow
  }
}

# -- AtomicBot: inject draft-model + MTP speculative decode for Gemma4 assistant --
# Current Atomic binary exposes --spec-draft-model / --spec-type draft-mtp.
# This lane is benchmark-only; keep the canonical 8090 summary server separate.
if ($kvProfile -eq 'atomicbot') {
  if ($TurboDraftModel -and (Test-Path $TurboDraftModel)) {
    Write-Host ("AtomicBot: draft assistant active ($TurboDraftModel)") -ForegroundColor Cyan
  } else {
    Write-Host ("AtomicBot: no draft assistant path found - running as target-only benchmark") -ForegroundColor Yellow
  }
}



# -- Reasoning format: template-based reasoning for tool calling + analysis --
# Reasoning is ENABLED via template + sanitizer combo (NOT via --reasoning-format flag).
# Template instructs model to wrap reasoning in <reasoning>...</reasoning> tags.
# Sanitizer preserves these tags while removing contamination markers.
# Using 'none' here because Gemma4 doesn't support deepseek/think formats.
# Reasoning happens in-template via the <reasoning> protocol.
$reasoningFormat = if ($env:TURBO_REASONING_FORMAT) { $env:TURBO_REASONING_FORMAT } else { 'none' }
if (Test-LlamaFlag $llama '--reasoning-format') {
    $baseArgs = $baseArgs + @('--reasoning-format', $reasoningFormat)
    Write-Host "Reasoning format: --reasoning-format $reasoningFormat (enabled via template)" -ForegroundColor Cyan
} else {
    Write-Host "Reasoning format: --reasoning-format not supported by this binary (template-based reasoning active)" -ForegroundColor DarkYellow
}
# Suppress <|channel>thought leak (Gemma4 internal markers)
# Reasoning happens via template protocol, not via reasoning-format flag
if (Test-LlamaFlag $llama '--reasoning-budget') {
    $baseArgs = $baseArgs + @('--reasoning-budget', '0')
    Write-Host "Reasoning budget: --reasoning-budget 0 (suppress internal markers, use template)" -ForegroundColor Cyan
}

# -- Chat template: use gemma4-tools.jinja to enable tool calling + suppress thinking markers --
# DEFAULT: gemma4-tools.jinja — handles system role, tool injection, tool_call parsing,
# and strips <|channel>thought markers. The GGUF has <|tool_response> baked in so the
# embedded template supports tools; gemma4-summary-clean.jinja clobbered that support.
# HARD RULE: always pass --chat-template-file. Never use --chat-template <name>.
# To use summary-only mode (no tools): set TURBO_CHAT_TEMPLATE_FILE=<path to summary-clean.jinja>
$defaultTemplate = Join-Path $PSScriptRoot "..\configs\templates\gemma4-tools.jinja"
$chatTemplateFile = if ($env:TURBO_CHAT_TEMPLATE_FILE -and $env:TURBO_CHAT_TEMPLATE_FILE -ne 'none') {
    $env:TURBO_CHAT_TEMPLATE_FILE
} elseif (Test-Path $defaultTemplate) {
    $defaultTemplate
} else {
    $null
}

if ($chatTemplateFile -and (Test-Path $chatTemplateFile)) {
    $baseArgs = $baseArgs + @('--chat-template-file', $chatTemplateFile)
    Write-Host "Chat template: --chat-template-file $chatTemplateFile" -ForegroundColor Cyan
} elseif ($env:TURBO_CHAT_TEMPLATE_FILE) {
    Write-Host "Chat template: TURBO_CHAT_TEMPLATE_FILE set but not found - will use GGUF built-in" -ForegroundColor Yellow
} else {
    Write-Host "Chat template: $defaultTemplate not found - will use GGUF built-in (supports_tools may be false)" -ForegroundColor Yellow
}

# -- Stop sequences: prevent the model from emitting turn markers into the output.
# The model/template stack is chat-format aware, but this model still tends to
# echo `<end_of_turn>` / `<start_of_turn>` after short answers unless we stop on
# the chat boundary itself.
if (Test-LlamaFlag $llama '--stop') {
    $baseArgs = $baseArgs + @('--stop', '<|mask_end|>', '--stop', '<end_of_turn>', '--stop', '<start_of_turn>')
    Write-Host "Stop sequences: --stop <|mask_end|> / <end_of_turn> / <start_of_turn> enabled" -ForegroundColor Cyan
} else {
    Write-Host "Stop sequences: --stop not supported by this binary - leaving template boundary unguarded" -ForegroundColor DarkYellow
}

# -- Tool-calling: --jinja for OpenAI function-call format ----------------
if (Test-LlamaFlag $llama '--jinja') {
    Write-Host "Tool calling: --jinja enabled (OpenCode/TRACE MCP loop)" -ForegroundColor Cyan
    $baseArgs = $baseArgs + @('--jinja')
} else {
    Write-Host "Tool calling: --jinja not in this binary - Gemma4 uses generic tool-call path" -ForegroundColor DarkYellow
}

# -- Skip chat template parsing to avoid Jinja2 filter compatibility issues --
# --skip-chat-parsing bypasses common_chat_verify_template so custom jinja templates
# (like gemma4-tools.jinja) don't need to survive the C++ Jinja2 output validator.
# The model still receives the rendered template; it just won't be parsed for tool-call
# extraction by llama-server's built-in parser (Gemma4 emits tool calls inline anyway).
if (Test-LlamaFlag $llama '--skip-chat-parsing') {
    Write-Host "Chat parsing: --skip-chat-parsing enabled (bypasses template validator)" -ForegroundColor Cyan
    $baseArgs = $baseArgs + @('--skip-chat-parsing')
} else {
    Write-Host "Chat parsing: --skip-chat-parsing not supported - using default template validator" -ForegroundColor DarkYellow
}

# -- KV prefix reuse: reduce prefill cost on repeated system prompts -------
if (Test-LlamaFlag $llama '--cache-prompt') {
    $baseArgs = $baseArgs + @('--cache-prompt')
    Write-Host "KV cache: --cache-prompt enabled" -ForegroundColor Cyan
} else {
    Write-Host "KV cache: --cache-prompt not supported by this binary - skipping" -ForegroundColor DarkYellow
}
if (Test-LlamaFlag $llama '--cache-reuse') {
    $baseArgs = $baseArgs + @('--cache-reuse', '256')
    Write-Host "KV cache: --cache-reuse 256 enabled" -ForegroundColor Cyan
} else {
    Write-Host "KV cache: --cache-reuse not supported by this binary - skipping" -ForegroundColor DarkYellow
}

# -- Telemetry: Prometheus metrics + per-request performance timing --------
# --metrics exposes /metrics (llamacpp:prompt_tokens_total, predicted_tokens, etc.)
# --perf adds timings.cache_n / prompt_n / predicted_per_second to each response
# Both are read-only; no effect on model behavior or memory.
if (Test-LlamaFlag $llama '--metrics') {
    $baseArgs = $baseArgs + @('--metrics')
    Write-Host "Telemetry: --metrics enabled (/metrics endpoint active)" -ForegroundColor Cyan
} else {
    Write-Host "Telemetry: --metrics not supported by this binary - skipping" -ForegroundColor DarkYellow
}
if (Test-LlamaFlag $llama '--perf') {
    $baseArgs = $baseArgs + @('--perf')
    Write-Host "Telemetry: --perf enabled (timings.cache_n / prompt_n in responses)" -ForegroundColor Cyan
} else {
    Write-Host "Telemetry: --perf not supported by this binary - skipping" -ForegroundColor DarkYellow
}

if ($batchSize) {
    if (Test-LlamaFlag $llama '--batch-size') {
        $baseArgs = $baseArgs + @('--batch-size', $batchSize)
        Write-Host "Batch size: --batch-size $batchSize enabled" -ForegroundColor Cyan
    } elseif (Test-LlamaFlag $llama '-b') {
        $baseArgs = $baseArgs + @('-b', $batchSize)
        Write-Host "Batch size: -b $batchSize enabled" -ForegroundColor Cyan
    } else {
        Write-Host "Batch size: binary does not advertise batch-size support - skipping" -ForegroundColor Yellow
    }
}

if ($ubatchSize) {
    if (Test-LlamaFlag $llama '--ubatch-size') {
        $baseArgs = $baseArgs + @('--ubatch-size', $ubatchSize)
        Write-Host "UBatch size: --ubatch-size $ubatchSize enabled" -ForegroundColor Cyan
    } elseif (Test-LlamaFlag $llama '-ub') {
        $baseArgs = $baseArgs + @('-ub', $ubatchSize)
        Write-Host "UBatch size: -ub $ubatchSize enabled" -ForegroundColor Cyan
    } else {
        Write-Host "UBatch size: binary does not advertise ubatch-size support - skipping" -ForegroundColor Yellow
    }
}

# -- Batch threads check ---------------------------------------------------
if (Test-LlamaFlag $llama '--threads-batch') {
    $baseArgs = $baseArgs + @('--threads-batch', $threads)
    Write-Host "Batch threads: --threads-batch $threads enabled" -ForegroundColor Cyan
}

# -- Foreground branch ----------------------------------------------------
if (-not $Detached) {
  & $llama @baseArgs
  exit $LASTEXITCODE
}

# -- Detached branch - capture stderr for post-mortem ---------------------
$logDir   = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'logs/turboquant'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp    = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
$errPath  = Join-Path $logDir ("launch-$stamp.err")
$outPath  = Join-Path $logDir ("launch-$stamp.out")
$detachedArgs = $baseArgs

$proc = Start-Process -FilePath $llama `
                      -ArgumentList $detachedArgs `
                      -PassThru -WindowStyle Hidden `
                      -RedirectStandardError $errPath `
                      -RedirectStandardOutput $outPath

# Poll /health for up to 120s (model load + GPU warm)
$ready = $false
for ($i = 0; $i -lt 240; $i++) {
  if ($proc.HasExited) { break }
  try {
    Invoke-RestMethod ('http://127.0.0.1:' + $port + '/health') -TimeoutSec 1 | Out-Null
    $ready = $true; break
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $ready) {
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  Write-Host '--- llama-server stderr (tail) ---' -ForegroundColor Red
  if (Test-Path $errPath) { Get-Content $errPath -Tail 25 | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow } }
  throw ("TurboQuant failed to become healthy on :$port - see $errPath")
}

$variant = if ($TextOnly) { 'text-only' } else { 'with VLM' }
Write-Host ("TurboQuant ready ($variant, kv=$kvK/$kvV) on http://127.0.0.1:$port (PID $($proc.Id))") -ForegroundColor Green
Write-Host ("  stderr: $errPath") -ForegroundColor DarkGray
