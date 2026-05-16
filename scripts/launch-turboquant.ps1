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
  LLAMA_SERVER_PATH    default: C:\Users\james\Desktop\llama-server-cuda\llama-server.exe
  TURBO_MODEL_PATH     default: %USERPROFILE%\.ollama\blobs\sha256-a79de882...
  ROTORQUANT_MODEL_PATH  optional: path to a RotorQuant GGUF (e.g. gemma-4-E4B-RotorQuant-GGUF-IQ4_XS.gguf
                           from majentik/gemma-4-E4B-RotorQuant-GGUF-IQ4_XS on HuggingFace).
                           When set, overrides TURBO_MODEL_PATH. Weight-quantised; runs on the
                           stock llama-server.exe without any TurboQuant binary.
  TURBO_MMPROJ_PATH    default: %USERPROFILE%\Downloads\gemma4-mmproj\mmproj-BF16.gguf
  TURBO_PORT           default: 8090
  TURBO_PROFILE        default: stock
                         stock           K=q8_0  V=q8_0   (works on stock llama.cpp)
                         turboquant      K=q8_0  V=turbo3 (TurboQuant-enabled binary required)
                         turboquant-safe K=q8_0  V=q8_0   (parity-safe, keep large TURBO_CTX)
                         atomicbot       K=turbo3 V=turbo3 (AtomicBot binary + --mtp-head required;
                                          download AtomicBot-ai/atomic-llama-cpp-turboquant-binaries,
                                          set LLAMA_SERVER_PATH; +30-50% throughput on short prompts;
                                          requires MTP_HEAD_PATH sidecar .mtp file)
  TURBO_KV_K           overrides profile K (must be in the known KV allowlist)
  TURBO_KV_V           overrides profile V (must be in the known KV allowlist)
  TURBO_CTX            default: 4096
  TURBO_NGL            default: 99
  MTP_HEAD_PATH        optional: path to .mtp sidecar file for AtomicBot --mtp-head speculative decoding
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

# ── Load .env if present ──────────────────────────────────────────────────
$envPath = Join-Path $PSScriptRoot "..\" ".env"
if (Test-Path $envPath) {
    Get-Content $envPath | Where-Object { $_ -match '=' -and $_ -notmatch '^#' } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        if ($name -and $value) {
            $name = $name.Trim()
            $value = $value.Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrWhiteSpace($name)) {
                # Only set if not already present in the environment (allows shell overrides)
                if (-not (Test-Path "env:$name")) {
                    [System.Environment]::SetEnvironmentVariable($name, $value)
                }
            }
        }
    }
}

# ── Resolve paths and ports ──────────────────────────────────────────────
$llama   = if ($env:LLAMA_SERVER_PATH) { $env:LLAMA_SERVER_PATH } else { 'C:\Users\james\Desktop\llama-server-cuda\llama-server.exe' }
# ROTORQUANT_MODEL_PATH overrides TURBO_MODEL_PATH when set.
# Download majentik/gemma-4-E4B-RotorQuant-GGUF-IQ4_XS from HuggingFace, then:
#   $env:ROTORQUANT_MODEL_PATH = 'C:\path\to\gemma-4-E4B-RotorQuant-GGUF-IQ4_XS.gguf'
# Works on the stock llama-server.exe — no TurboQuant binary required.
$model   = if ($env:ROTORQUANT_MODEL_PATH) { $env:ROTORQUANT_MODEL_PATH } `
           elseif ($env:TURBO_MODEL_PATH)  { $env:TURBO_MODEL_PATH } `
           else { Join-Path $env:USERPROFILE '.ollama\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43' }
if ($env:ROTORQUANT_MODEL_PATH) {
  Write-Host 'Model: RotorQuant GGUF (weight-quantised, stock binary OK)' -ForegroundColor Cyan
}
$mmproj  = if ($env:TURBO_MMPROJ_PATH) { $env:TURBO_MMPROJ_PATH } else { Join-Path $env:USERPROFILE 'Downloads\gemma4-mmproj\mmproj-BF16.gguf' }
$port    = if ($env:TURBO_PORT)        { $env:TURBO_PORT }        else { '8090' }
$ctxLen  = if ($env:TURBO_CTX)         { $env:TURBO_CTX }         else { '4096' }

# ── GPU Offload (NGL) ────────────────────────────────────────────────────
$ngl = if ($env:TURBO_NGL) { $env:TURBO_NGL } else { "35" }

# Handle negative values — warn and normalize
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

# ── Profile shortcut: TURBO_PROFILE expands to (kvK, kvV) defaults. ──────
# Explicit TURBO_KV_K / TURBO_KV_V env vars override the profile.
$kvProfile = if ($env:TURBO_PROFILE) { $env:TURBO_PROFILE.ToLower() } else { 'stock' }
$validProfiles = @('stock', 'turboquant', 'turboquant-safe', 'atomicbot')
if ($validProfiles -notcontains $kvProfile) {
  throw "Invalid TURBO_PROFILE '$kvProfile' — choose one of: $($validProfiles -join ', ')"
}
switch ($kvProfile) {
  'stock'           { $kvProfileK = 'q8_0';   $kvProfileV = 'q8_0' }
  'turboquant'      { $kvProfileK = 'q8_0';   $kvProfileV = 'turbo3' }
  'turboquant-safe' { $kvProfileK = 'q8_0';   $kvProfileV = 'q8_0' }
  'atomicbot'       { $kvProfileK = 'q8_0'; $kvProfileV = 'q8_0' }
}

$explicitK = [bool]$env:TURBO_KV_K
$explicitV = [bool]$env:TURBO_KV_V
$kvK       = if ($explicitK) { $env:TURBO_KV_K } else { $kvProfileK }
$kvV       = if ($explicitV) { $env:TURBO_KV_V } else { $kvProfileV }

# ── KV allowlist (early — runs before "already healthy" short-circuit so
#    a typo in TURBO_KV_V always fails fast, not just on cold launches). ──
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
if (-not (Test-Path $model)) { throw "TurboQuant model blob not found at $model" }


# ── Pre-flight: evict Ollama-resident model so VRAM is free ──────────────
if (-not $NoEvict) {
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
    # Ollama not running — fine, nothing to evict
  }
}

# ── Probe binary for TurboQuant support ──────────────────────────────────
# Stock llama.cpp accepts: f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1
# TurboQuant forks add:    turbo2, turbo3, turbo4, tbq3_0, tbq4_0
#   - TheTom/llama-cpp-turboquant releases tqp-v0.1.1 (Win+CUDA12.4 prebuilt,
#     D=128 only — UNUSABLE on Gemma 4 head_dim 256/512; suits Llama-3 / Qwen)
#   - test1111…/llama-cpp-turboquant-gemma4 (D=256/512 kernels, source build,
#     the only working path for Gemma 4 today)
#   - PR #21089 to ggml-org/llama.cpp (still under review as of May 2026)
# Recommended TurboQuant config per upstream docs: -ctk q8_0 -ctv turbo3
# (asymmetric — quantize V aggressively, keep K at q8_0). CUDA mixed
# q8_0 × turbo parity is documented as "not yet verified" — if quality
# regresses on your model, fall back to symmetric q8_0/q8_0 with larger ctx.
# Allowlist itself was validated above (line ~91), early enough to fail
# fast on TURBO_KV_* typos even when a server is already healthy.

# Probe binary support for turbo*. When the user explicitly asked for a
# turbo* type (TURBO_KV_K/V or TURBO_PROFILE=turboquant), throw if the
# binary doesn't expose it — silent downgrade is exactly the failure mode
# we want to avoid (it's why -ctk turbo3 -ctv turbo4 looked like it worked
# for months). When defaults came from a non-turbo profile and somehow
# resolved to turbo (impossible today, but kept symmetric for future
# profiles), soft-fallback is acceptable.
$turboRequested = ($turboKv -contains $kvK) -or ($turboKv -contains $kvV)
$turboExplicit  = $turboRequested -and ($explicitK -or $explicitV -or $kvProfile -eq 'turboquant' -or $kvProfile -eq 'atomicbot')
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
      throw "llama-server at '$llama' does not advertise turbo*/tbq*_0 KV cache support but TURBO_KV_V='$kvV' / TURBO_KV_K='$kvK' was explicitly requested. $hint"
    }
    Write-Host ("TurboQuant KV '$kvK/$kvV' requested by profile but binary is stock — falling back to q8_0/q8_0. $hint") -ForegroundColor Yellow
    $kvK = 'q8_0'
    $kvV = 'q8_0'
  }
}

# ── Config Printout ──────────────────────────────────────────────────────
$TurboDraftModel = $env:DRAFT_MODEL_PATH
$TurboSpeculative = [bool]$TurboDraftModel
$TurboFlashAttn = 'on' # Current script hardcodes -fa on

Write-Host "`nTurboQuant resolved config:" -ForegroundColor Gray
Write-Host "  URL:              http://127.0.0.1:$port"
Write-Host "  Model:            $model"
Write-Host "  Context:          $ctxLen"
Write-Host "  GPU layers:       $ngl"
Write-Host "  Flash attention:  $TurboFlashAttn"
Write-Host "  KV cache K:       $kvK"
Write-Host "  KV cache V:       $kvV"
Write-Host "  Speculative:      $TurboSpeculative"
if ($TurboSpeculative) {
    Write-Host "  Draft model:      $TurboDraftModel"
}

# Diagnostic Warnings
if ([string]::IsNullOrWhiteSpace($ngl) -or $ngl -eq "0") {
    Write-Warning "GPU offload is not configured or set to 0. TurboQuant may run CPU-only."
}
if ($ngl -match "^-") {
    # This block shouldn't be reached if normalized above, but kept for logic safety
    Write-Warning "TURBO_NGL is negative ($ngl). llama.cpp-style --n-gpu-layers usually expects a positive layer count."
}
if (-not $TurboSpeculative) {
    Write-Warning "No draft model configured. Speculative decoding is disabled."
}
Write-Host ""

# ── Already healthy? ─────────────────────────────────────────────────────
if (-not $StatusOnly) {
    try {
        Invoke-RestMethod ('http://127.0.0.1:' + $port + '/health') -TimeoutSec 1 | Out-Null
        Write-Host ('TurboQuant already healthy on http://127.0.0.1:' + $port) -ForegroundColor Yellow
        exit 0
    } catch { }
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

# ── Build argument list ──────────────────────────────────────────────────
$baseArgs = @(
  '-m',    $model,
  '--port', $port,
  '-ngl',   $ngl,
  '-fa',    'on',
  '-ctk',   $kvK,
  '-ctv',   $kvV,
  '-c',     $ctxLen
)

if ($kvProfile -eq 'atomicbot') {
    # Enable TriAttention v2 (2026) for Gemma 4
    $baseArgs = $baseArgs + @(
      '--triattention-budget', '4096',
      '--triattention-window', '128',
      '--triattention-mode', 'per-kv-head',
      '--triattention-normalize'
    )
}
# ── Speculative Decoding: inject --model-draft for accelerated throughput ──
if ($env:DRAFT_MODEL_PATH) {
  if (Test-Path $env:DRAFT_MODEL_PATH) {
    $draftN = if ($env:DRAFT_N) { $env:DRAFT_N } else { '5' }
    Write-Host ("Speculative Decoding: --model-draft enabled ($($env:DRAFT_MODEL_PATH))") -ForegroundColor Cyan
    Write-Host ("Speculative Decoding automatically disables vision/multimodal (--mmproj)") -ForegroundColor Yellow
    $TextOnly = $true
    $baseArgs = $baseArgs + @('--model-draft', $env:DRAFT_MODEL_PATH, '--draft', $draftN, '--n-gpu-layers-draft', '99')
  } else {
    Write-Host ("Speculative Decoding: DRAFT_MODEL_PATH set but file not found at $($env:DRAFT_MODEL_PATH) — skipping") -ForegroundColor Yellow
  }
}

if (-not $TextOnly -and (Test-Path $mmproj)) {
  $baseArgs = @('-m', $model, '--mmproj', $mmproj) + $baseArgs[2..($baseArgs.Length - 1)]
}

# ── Legal LoRA adapter injection (Path A — runtime LoRA over base-model GGUFs) ──
# Use when ROTORQUANT_MODEL_PATH points at a base-model GGUF (e.g. majentik IQ4_XS)
# that lacks the legal fine-tune. The merged Ollama blob already has the LoRA baked
# in, so set LEGAL_LORA_PATH only when running a non-merged GGUF.
# Path B (re-quantize merged model) produces better quality — see memory card.
if ($env:LEGAL_LORA_PATH) {
  if (Test-Path $env:LEGAL_LORA_PATH) {
    $loraScale = if ($env:LEGAL_LORA_SCALE) { $env:LEGAL_LORA_SCALE } else { '0.8' }
    Write-Host ("Legal LoRA: --lora $($env:LEGAL_LORA_PATH) --lora-scale $loraScale") -ForegroundColor Cyan
    $baseArgs = $baseArgs + @('--lora', $env:LEGAL_LORA_PATH, '--lora-scale', $loraScale)
  } else {
    Write-Host ("Legal LoRA: LEGAL_LORA_PATH set but file not found at $($env:LEGAL_LORA_PATH) — skipping") -ForegroundColor Yellow
  }
}

# ── AtomicBot: inject --mtp-head for Multi-Token Prediction speculative decode ──
# AtomicBot-ai/atomic-llama-cpp-turboquant-binaries ships Gemma 4 D=256/512 support
# + MTP (multi-token prediction) for +30-50% throughput on short-prompt workloads.
# Requires a .mtp sidecar file alongside the main GGUF (usually same basename + .mtp).
# Set MTP_HEAD_PATH to override; defaults to model path with .mtp extension.
if ($kvProfile -eq 'atomicbot') {
  $mtpPath = if ($env:MTP_HEAD_PATH) { $env:MTP_HEAD_PATH } else { [System.IO.Path]::ChangeExtension($model, '.mtp') }
  if (Test-Path $mtpPath) {
    Write-Host ("AtomicBot: --mtp-head enabled ($mtpPath)") -ForegroundColor Cyan
    $baseArgs = $baseArgs + @('--mtp-head', $mtpPath)
  } else {
    Write-Host ("AtomicBot: MTP sidecar not found at $mtpPath — running without --mtp-head (set MTP_HEAD_PATH to fix)") -ForegroundColor Yellow
  }
}



# ── Foreground branch ────────────────────────────────────────────────────
if (-not $Detached) {
  & $llama @baseArgs
  exit $LASTEXITCODE
}

# ── Detached branch — capture stderr for post-mortem ─────────────────────
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
  Write-Host '─── llama-server stderr (tail) ───' -ForegroundColor Red
  if (Test-Path $errPath) { Get-Content $errPath -Tail 25 | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow } }
  throw ("TurboQuant failed to become healthy on :$port — see $errPath")
}

$variant = if ($TextOnly) { 'text-only' } else { 'with VLM' }
Write-Host ("TurboQuant ready ($variant, kv=$kvK/$kvV) on http://127.0.0.1:$port (PID $($proc.Id))") -ForegroundColor Green
Write-Host ("  stderr: $errPath") -ForegroundColor DarkGray
