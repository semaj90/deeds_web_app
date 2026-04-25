# start-ollama-gpu.ps1
# This script launches Ollama with specified GPU layers and CPU threads.
#
# IMPORTANT: Ollama model discovery on Windows
# By default, Ollama might not find custom models like 'gemma3-legal:latest'
# unless they are registered with the Ollama local model registry or the path is overridden.
# Ensure your model is available to Ollama by:
# 1. Running `ollama create gemma3-legal -f ./Modelfile` from your model's directory.
# 2. Placing the model in Ollama's default model directory (%USERPROFILE%/.ollama/models).
# 3. Setting the OLLAMA_MODELS environment variable to point to your model directory
#    (though `ollama serve` typically uses its own registry).
# This script assumes 'gemma3-legal:latest' (or any other model) is already
# correctly installed/registered with your Ollama instance.

param (
    [int]$GpuLayers = 0,
    [int]$NumThreads = 0,
    [int]$WaitSeconds = 15
)

Write-Host "🚀 Launching Ollama (Gemma3-Legal optimized)..."

# Check if Ollama is already running and stop it
$ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if ($ollamaProcess) {
    Write-Host "Stopping existing Ollama process..."
    Stop-Process -InputObject $ollamaProcess -Force
    Start-Sleep -Seconds 2 # Give it a moment to shut down
}

# Construct Ollama arguments
$ollamaArgs = "serve"
if ($GpuLayers -gt 0) {
    $ollamaArgs += " --gpu-layers $GpuLayers"
}
if ($NumThreads -gt 0) {
    $ollamaArgs += " --num-threads $NumThreads"
}

Write-Host "Starting Ollama with arguments: $ollamaArgs"

# Start Ollama
Start-Process -FilePath "ollama" -ArgumentList $ollamaArgs -NoNewWindow -PassThru

Write-Host "Waiting for Ollama to start ($WaitSeconds seconds)..."
Start-Sleep -Seconds $WaitSeconds

# Basic check if Ollama is responsive (optional, but good for robustness)
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 5
    if ($response) {
        Write-Host "✅ Ollama GPU service started successfully. Version: $($response.version)"
    } else {
        Write-Warning "⚠️ Ollama started, but did not respond to API call."
    }
} catch {
    Write-Warning "⚠️ Could not connect to Ollama API after launch. It might still be starting or failed."
}
