# Creates a small env file and prints verification steps for local WebGPU/CUDA dev setup.

$envFile = Join-Path $PSScriptRoot "..\.env.development.local"
$contents = @"
# UltraJSON / WebGPU helper envs (recommended)
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
ENABLE_WEBGPU=true
ENABLE_ULTRAJSON_GPU=true
"@

if (-not (Test-Path $envFile)) {
  Write-Host "Creating $envFile with recommended defaults..."
  $contents | Out-File -FilePath $envFile -Encoding UTF8
} else {
  Write-Host "$envFile already exists — leaving existing file intact."
}

Write-Host "`nValidation helper:"
Write-Host "1) In Chrome/Edge (experimental) open chrome://gpu and verify 'Vulkan' or 'Dawn' is available."
Write-Host "2) From a dev browser console run: (navigator.gpu ? 'WebGPU present' : 'WebGPU NOT present')"
Write-Host "3) If you use CUDA native libs, ensure your PATH contains CUDA toolkit bin and that device drivers are installed."
Write-Host "`nNote: This script only emits helper envs; the UltraJSONParser uses navigator.gpu at runtime and createWasmGpuService must request an adapter/device."
Write-Host "Done."
