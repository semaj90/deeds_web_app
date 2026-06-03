# convert-embeddinggemma-to-gguf.ps1
#
# Converts the local EmbeddingGemma 300M sentence-transformers model to GGUF
# using the llama-cpp-turboquant-gemma4 converter (which has --sentence-transformers-dense-modules).
#
# Usage:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/convert-embeddinggemma-to-gguf.ps1
#   pwsh ... -OutType q8_0          # quantize to Q8_0 (smaller, nearly lossless for embedding)
#   pwsh ... -Verify                # run ML smoke test after conversion
#
# Output: models/embeddinggemma-300m-f16.gguf  (or q8_0 variant)

param(
    [string]$OutType    = "f16",
    [switch]$Verify     = $false,
    [switch]$DryRun     = $false,
    [string]$ConverterDir = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$ModelsDir   = Join-Path $RepoRoot "models"
$ModelSrc    = Join-Path $ModelsDir "embeddinggemma_300m"
$OutFile     = Join-Path $ModelsDir "embeddinggemma-300m-$OutType.gguf"

# Locate the converter — turboquant-gemma4 version required for --sentence-transformers-dense-modules
$ConverterCandidates = @(
    $ConverterDir,
    "C:\Users\james\Downloads\llama-cpp-turboquant-gemma4-feature-turboquant-kv-cache\llama-cpp-turboquant-gemma4-feature-turboquant-kv-cache",
    "C:\Users\james\Downloads\llama\llama.cpp",
    "C:\Users\james\Documents\llama.cpp",
    "C:\Users\james\Desktop\llama.cpp"
) | Where-Object { $_ -and (Test-Path (Join-Path $_ "convert_hf_to_gguf.py")) }

if (-not $ConverterCandidates) {
    Write-Error "convert_hf_to_gguf.py not found. Set -ConverterDir or clone llama.cpp."
    exit 1
}
$ConverterDir = $ConverterCandidates[0]
$ConverterPy  = Join-Path $ConverterDir "convert_hf_to_gguf.py"

# Verify the converter supports --sentence-transformers-dense-modules
$hasFlag = Select-String -Path $ConverterPy -Pattern "sentence-transformers-dense-modules" -Quiet
if (-not $hasFlag) {
    Write-Warning "Converter at $ConverterDir does NOT have --sentence-transformers-dense-modules."
    Write-Warning "Dense projection layers (2_Dense, 3_Dense) will be OMITTED — vectors will be wrong."
    Write-Warning "Use the turboquant-gemma4 converter:"
    Write-Warning "  https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4"
    $reply = Read-Host "Continue anyway? (y/N)"
    if ($reply -notmatch "^[Yy]$") { exit 1 }
}

# Locate Python
$PythonCandidates = @(
    "C:\Python313\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    "C:\Users\james\AppData\Local\Programs\Python\Python313\python.exe",
    "C:\Users\james\AppData\Local\Programs\Python\Python312\python.exe",
    "C:\Users\james\AppData\Local\Programs\Python\Python311\python.exe",
    (Join-Path $RepoRoot "sveltekit-frontend\.venv\Scripts\python.exe"),
    (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
    "python"
) | Where-Object { $_ }

$PythonExe = $null
foreach ($p in $PythonCandidates) {
    if ($p -eq "python") {
        $PythonExe = "python"; break
    }
    if (Test-Path $p) {
        # Skip broken venvs that can't even run -c
        & $p -c "import sys" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $PythonExe = $p; break }
    }
}
if (-not $PythonExe) {
    Write-Error "Python not found. Install Python 3.11+ from python.org."
    exit 1
}

# Validate source model
if (-not (Test-Path $ModelSrc)) {
    Write-Error "Source model not found: $ModelSrc"
    Write-Error "Expected the sentence-transformers folder with model.safetensors + modules.json"
    exit 1
}
if (-not (Test-Path (Join-Path $ModelSrc "modules.json"))) {
    Write-Error "modules.json missing in $ModelSrc — not a sentence-transformers model directory"
    exit 1
}

Write-Host ""
Write-Host "[convert-embeddinggemma] ================================================"
Write-Host "[convert-embeddinggemma] Source:    $ModelSrc"
Write-Host "[convert-embeddinggemma] Output:    $OutFile"
Write-Host "[convert-embeddinggemma] OutType:   $OutType"
Write-Host "[convert-embeddinggemma] Converter: $ConverterPy"
Write-Host "[convert-embeddinggemma] Python:    $PythonExe"
Write-Host "[convert-embeddinggemma] ================================================"
Write-Host ""

if ($DryRun) {
    Write-Host "[convert-embeddinggemma] --dry-run mode, skipping conversion."
    exit 0
}

$OutFileExistsAndNotReconverted = $false
if (Test-Path $OutFile) {
    $size = (Get-Item $OutFile).Length / 1MB
    Write-Host "[convert-embeddinggemma] Output already exists ($([math]::Round($size,1)) MB): $OutFile"
    $reply = "n"
    if (-not $Verify) {
        $reply = Read-Host "Reconvert? (y/N)"
    }
    if ($reply -notmatch "^[Yy]$") {
        Write-Host "[convert-embeddinggemma] Using existing GGUF."
        $OutFileExistsAndNotReconverted = $true
    }
}

if ($OutFileExistsAndNotReconverted -ne $true) {
    # Run conversion
    Write-Host "[convert-embeddinggemma] Running conversion..."
    $convertArgs = @(
        $ConverterPy,
        $ModelSrc,
        "--outfile", $OutFile,
        "--outtype", $OutType,
        "--sentence-transformers-dense-modules"
    )

    & $PythonExe @convertArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Conversion failed (exit $LASTEXITCODE)"
        exit 1
    }

    $sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
    Write-Host ""
    Write-Host "[convert-embeddinggemma] SUCCESS: $OutFile ($sizeMB MB)"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Start embed server:   npm run embed:start   (from sveltekit-frontend/)"
    Write-Host "  2. Run ML smoke test:    npm run smoke:llama:embed:ml"
    Write-Host ""
}
if ($Verify) {
    Write-Host "[convert-embeddinggemma] Starting embed server for verification..."
    $LlamaExe = "C:\Users\james\Desktop\llama-server-cuda\llama-server.exe"
    if (-not (Test-Path $LlamaExe)) {
        Write-Warning "llama-server.exe not found at $LlamaExe — skipping verification"
        exit 0
    }
    $serverProc = Start-Process -FilePath $LlamaExe -ArgumentList @(
        "-m", $OutFile,
        "--host", "127.0.0.1",
        "--port", "8081",
        "--embedding",
        "--pooling", "mean",
        "-ngl", "99",
        "-c", "2048",
        "-b", "512",
        "-ub", "512",
        "--metrics"
    ) -PassThru -WindowStyle Hidden

    Write-Host "[convert-embeddinggemma] Waiting for embed server to become healthy..."
    $healthy = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:8081/health" -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
    }

    if (-not $healthy) {
        Write-Error "Embed server did not become healthy in 20s"
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Host "[convert-embeddinggemma] Embed server healthy — running ML smoke test..."
    Push-Location (Join-Path $RepoRoot "sveltekit-frontend")
    $env:OLLAMA_EMBED_BASE_URL = "http://127.0.0.1:8081"
    $env:EXPECTED_EMBED_DIM    = "768"
    & node "scripts/smoke/smoke-llama-embed-ml.mjs"
    $smokeExit = $LASTEXITCODE
    Pop-Location

    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    if ($smokeExit -ne 0) {
        Write-Error "ML smoke test FAILED"
        exit 1
    }
    Write-Host "[convert-embeddinggemma] ML smoke test passed."
}
