# quantize-legal.ps1 — Re-quantize merged legal model to RotorQuant (IQ4_XS) format.
#
# Usage:
#   .\scripts\turboquant\quantize-legal.ps1 -SourcePath "C:\path\to\model.gguf" -OutputPath "C:\path\to\legal-iq4xs.gguf"
#   .\scripts\turboquant\quantize-legal.ps1 -OllamaBlob    # uses the default legal-merged blob from .env

[CmdletBinding()]
param(
    [string] $SourcePath,
    [string] $OutputPath = "gemma4-legal-iq4xs.gguf",
    [switch] $OllamaBlob,
    [string] $LlamaQuantizePath
)

$ErrorActionPreference = 'Stop'

# 1. Resolve LlamaQuantizePath
if (-not $LlamaQuantizePath) {
    # Try to find it next to LLAMA_SERVER_PATH if set, otherwise assume Desktop location
    $serverPath = if ($env:LLAMA_SERVER_PATH) { $env:LLAMA_SERVER_PATH } else { 'C:\Users\james\Desktop\llama-server-cuda\llama-server.exe' }
    $LlamaQuantizePath = Join-Path (Split-Path $serverPath) "llama-quantize.exe"
}

if (-not (Test-Path $LlamaQuantizePath)) {
    throw "llama-quantize.exe not found at $LlamaQuantizePath. Please set LLAMA_SERVER_PATH or pass -LlamaQuantizePath."
}

# 2. Resolve SourcePath
if ($OllamaBlob) {
    $SourcePath = Join-Path $env:USERPROFILE ".ollama\models\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43"
    Write-Host "Using Ollama legal-merged blob as source." -ForegroundColor Cyan
}

if (-not $SourcePath -or -not (Test-Path $SourcePath)) {
    throw "Source path '$SourcePath' not found. Use -SourcePath or -OllamaBlob."
}

$workDir = $PSScriptRoot
$f16Path = Join-Path $workDir "temp-f16-conversion.gguf"

Write-Host "--- Starting RotorQuant Conversion ---" -ForegroundColor Yellow
Write-Host "Source: $SourcePath"
Write-Host "Target: $OutputPath"
Write-Host "Tool:   $LlamaQuantizePath"
Write-Host ""

try {
    # Step 1: Dequantize to F16 (necessary for clean IQ quantization)
    Write-Host "[1/2] Dequantizing to F16 (this may take 5-10 mins)..." -ForegroundColor DarkCyan
    & $LlamaQuantizePath $SourcePath $f16Path F16
    
    if (-not (Test-Path $f16Path)) { throw "F16 conversion failed." }

    # Step 2: Quantize to IQ4_XS (RotorQuant)
    # Note: IQ4_XS is highly optimized for Gemma 4 architecture.
    Write-Host "[2/2] Re-quantizing to IQ4_XS (RotorQuant format)..." -ForegroundColor DarkCyan
    & $LlamaQuantizePath $f16Path $OutputPath IQ4_XS

    Write-Host ""
    Write-Host "Success! Model saved to: $OutputPath" -ForegroundColor Green
    Write-Host "To use this model, update ROTORQUANT_MODEL_PATH in your .env" -ForegroundColor Cyan
}
finally {
    if (Test-Path $f16Path) {
        Write-Host "Cleaning up temporary F16 file..." -ForegroundColor DarkGray
        Remove-Item $f16Path -ErrorAction SilentlyContinue
    }
}
