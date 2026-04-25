<#
.SYNOPSIS
    Pulls an Ollama embedding model (embeddinggemma by default), snapshots its Modelfile
    and backing GGUF, then invokes the conversion helper that prepares a TensorRT-friendly
    HuggingFace-style directory.

.PARAMETER ModelName
    Ollama model identifier, e.g. embeddinggemma:latest.

.PARAMETER OutputRoot
    Base directory where converted assets will be stored (default: docker/tensorrt-llm/models).

.PARAMETER ConverterScript
    Python script used to post-process the GGUF blob (default: scripts/convert-embeddinggemma-to-hf.py).

.PARAMETER PythonPath
    Python interpreter to run the converter. If omitted, falls back to $env:PYTHON311_PYTHON, then "python".

.PARAMETER EmbeddingDim
    Dimensionality of the embedding vectors (embeddinggemma emits 768-dim vectors).
#>
param(
    [string]$ModelName = "embeddinggemma:latest",
    [string]$OutputRoot = "docker/tensorrt-llm/models",
    [string]$ConverterScript = "scripts/convert-embeddinggemma-to-hf.py",
    [string]$PythonPath = $env:PYTHON311_PYTHON,
    [int]$EmbeddingDim = 768
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-OllamaBinaryPath {
    param(
        [string]$SourceToken
    )

    $candidatePaths = @()

    if ([IO.Path]::IsPathRooted($SourceToken)) {
        $candidatePaths += $SourceToken
    } else {
        $candidatePaths += (Join-Path (Join-Path $env:USERPROFILE ".ollama\models") $SourceToken)
        $candidatePaths += (Join-Path (Join-Path $env:LOCALAPPDATA "Ollama\models") $SourceToken)
    }

    foreach ($path in $candidatePaths) {
        if (Test-Path -LiteralPath $path) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }

    throw "Unable to locate Ollama backing file for token '$SourceToken'. Checked: $($candidatePaths -join ', ')"
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Ollama CLI is not available on PATH. Install Ollama or add it to PATH before running this script."
}

if (-not $PythonPath) {
    $PythonPath = "python"
}

if (-not (Get-Command $PythonPath -ErrorAction SilentlyContinue)) {
    throw "Python interpreter '$PythonPath' not found. Provide --PythonPath or set PYTHON311_PYTHON."
}

Write-Host "📦 Pulling $ModelName via Ollama..." -ForegroundColor Cyan
& ollama pull $ModelName | Write-Output

Write-Host "📝 Exporting Modelfile..." -ForegroundColor Cyan
$modelfile = & ollama show $ModelName --modelfile
if (-not $modelfile) {
    throw "Failed to fetch Modelfile for $ModelName."
}

$safeName = $ModelName.Replace(":", "__").Replace("/", "_")
$modelRoot = Join-Path $OutputRoot $safeName
$rawDir = Join-Path $modelRoot "raw"
$hfDir = Join-Path $modelRoot "hf"

New-Item -ItemType Directory -Force -Path $rawDir | Out-Null
New-Item -ItemType Directory -Force -Path $hfDir | Out-Null

$modelfilePath = Join-Path $modelRoot "$safeName.modelfile"
$modelfile | Set-Content -LiteralPath $modelfilePath

$fromLine = $modelfile | Where-Object { $_ -match '^\s*from\s+' } | Select-Object -First 1
if (-not $fromLine) {
    throw "Modelfile does not contain a 'from' directive pointing to the backing model blob."
}
$sourceToken = ($fromLine -replace '^\s*from\s+', '').Trim()
Write-Host "🔎 Resolving Ollama blob referenced as '$sourceToken'..." -ForegroundColor Cyan
$sourcePath = Resolve-OllamaBinaryPath -SourceToken $sourceToken

$rawDestination = Join-Path $rawDir (Split-Path -Leaf $sourcePath)
Write-Host "📁 Copying $sourcePath -> $rawDestination" -ForegroundColor Cyan
Copy-Item -LiteralPath $sourcePath -Destination $rawDestination -Force

Write-Host "🛠️  Running converter ($ConverterScript)..." -ForegroundColor Cyan
$converterArgs = @(
    $ConverterScript,
    "--input-gguf", $rawDestination,
    "--output-dir", $hfDir,
    "--model-name", $safeName,
    "--dim", $EmbeddingDim
)

& $PythonPath @converterArgs
if ($LASTEXITCODE -ne 0) {
    throw "Converter script exited with $LASTEXITCODE."
}

Write-Host ""
Write-Host "✅ Export complete!" -ForegroundColor Green
Write-Host "   Raw GGUF  : $rawDestination"
Write-Host "   HF bundle : $hfDir"
Write-Host "   Modelfile : $modelfilePath"
Write-Host ""
Write-Host "Next: mount $hfDir into TensorRT-LLM (MODEL_DIR) and run the build_engine helper inside the container/WSL." -ForegroundColor Yellow
