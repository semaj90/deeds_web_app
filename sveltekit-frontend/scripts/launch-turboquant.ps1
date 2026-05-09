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
  TURBO_MMPROJ_PATH    default: %USERPROFILE%\Downloads\gemma4-mmproj\mmproj-BF16.gguf
  TURBO_PORT           default: 8090
  TURBO_PROFILE        default: stock
                         stock           K=q8_0  V=q8_0   (works on stock llama.cpp)
                         turboquant      K=q8_0  V=turbo3 (TurboQuant-enabled binary required)
                         turboquant-safe K=q8_0  V=q8_0   (parity-safe, keep large TURBO_CTX)
  TURBO_KV_K           overrides profile K (must be in the known KV allowlist)
  TURBO_KV_V           overrides profile V (must be in the known KV allowlist)
  TURBO_CTX            default: 4096
  TURBO_NGL            default: 99

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
  [switch] $NoEvict
)

$ErrorActionPreference = 'Stop'

# ── Resolve paths and ports ──────────────────────────────────────────────
$llama   = if ($env:LLAMA_SERVER_PATH) { $env:LLAMA_SERVER_PATH } else { 'C:\Users\james\Desktop\llama-server-cuda\llama-server.exe' }
$model   = if ($env:TURBO_MODEL_PATH)  { $env:TURBO_MODEL_PATH }  else { Join-Path $env:USERPROFILE '.ollama\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43' }
$mmproj  = if ($env:TURBO_MMPROJ_PATH) { $env:TURBO_MMPROJ_PATH } else { Join-Path $env:USERPROFILE 'Downloads\gemma4-mmproj\mmproj-BF16.gguf' }
$port    = if ($env:TURBO_PORT)        { $env:TURBO_PORT }        else { '8090' }
$ctxLen  = if ($env:TURBO_CTX)         { $env:TURBO_CTX }         else { '4096' }
$ngl     = if ($env:TURBO_NGL)         { $env:TURBO_NGL }         else { '99' }

# ── Profile shortcut: TURBO_PROFILE expands to (kvK, kvV) defaults. ──────
# Explicit TURBO_KV_K / TURBO_KV_V env vars override the profile.
$kvProfile = if ($env:TURBO_PROFILE) { $env:TURBO_PROFILE.ToLower() } else { 'stock' }
$validProfiles = @('stock', 'turboquant', 'turboquant-safe')
if ($validProfiles -notcontains $kvProfile) {
  throw "Invalid TURBO_PROFILE '$kvProfile' — choose one of: $($validProfiles -join ', ')"
}
switch ($kvProfile) {
  'stock'           { $kvProfileK = 'q8_0';  $kvProfileV = 'q8_0' }
  'turboquant'      { $kvProfileK = 'q8_0';  $kvProfileV = 'turbo3' }
  'turboquant-safe' { $kvProfileK = 'q8_0';  $kvProfileV = 'q8_0' }
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

# ── Already healthy? ─────────────────────────────────────────────────────
try {
  Invoke-RestMethod ('http://127.0.0.1:' + $port + '/health') -TimeoutSec 1 | Out-Null
  Write-Host ('TurboQuant already healthy on http://127.0.0.1:' + $port) -ForegroundColor Yellow
  exit 0
} catch { }

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
$turboExplicit  = $turboRequested -and ($explicitK -or $explicitV -or $kvProfile -eq 'turboquant')
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
if (-not $TextOnly -and (Test-Path $mmproj)) {
  $baseArgs = @('-m', $model, '--mmproj', $mmproj) + $baseArgs[2..($baseArgs.Length - 1)]
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
$detachedArgs = $baseArgs + @('--log-disable')

$proc = Start-Process -FilePath $llama `
                      -ArgumentList $detachedArgs `
                      -PassThru -WindowStyle Hidden `
                      -RedirectStandardError $errPath `
                      -RedirectStandardOutput $outPath

# Poll /health for up to 60s (model load + GPU warm)
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
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
