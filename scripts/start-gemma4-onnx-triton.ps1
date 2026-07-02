param(
  [switch]$Detached,
  [switch]$StatusOnly,
  [string]$Image = $(if ($env:TRITON_ONNX_IMAGE) { $env:TRITON_ONNX_IMAGE } else { "nvcr.io/nvidia/tritonserver:24.11-py3" }),
  [string]$ContainerName = $(if ($env:TRITON_ONNX_CONTAINER) { $env:TRITON_ONNX_CONTAINER } else { "legal-ai-triton-onnx" }),
  [int]$HttpPort = $(if ($env:TRITON_HTTP_PORT) { [int]$env:TRITON_HTTP_PORT } else { 8000 }),
  [int]$GrpcPort = $(if ($env:TRITON_GRPC_PORT) { [int]$env:TRITON_GRPC_PORT } else { 8001 }),
  [int]$MetricsPort = $(if ($env:TRITON_METRICS_PORT) { [int]$env:TRITON_METRICS_PORT } else { 8002 })
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ModelRepo = Join-Path $RepoRoot "triton-model-repository"
Set-Location $RepoRoot

function Test-HttpReady {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$HttpPort/v2/health/ready" | Out-Null
    return $true
  } catch {
    return $false
  }
}

if ($StatusOnly) {
  Write-Host "Gemma4 ONNX Triton status:"
  Write-Host "  URL: http://127.0.0.1:$HttpPort"
  Write-Host "  Model repo: $ModelRepo"
  Write-Host "  Ready: $(if (Test-HttpReady) { 'yes' } else { 'no' })"
  try {
    docker ps --filter "name=$ContainerName" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  } catch {
    Write-Warning "docker ps failed: $($_.Exception.Message)"
  }
  exit 0
}

if (!(Test-Path $ModelRepo)) {
  Write-Host "Materializing Triton model repository..."
  node (Join-Path $RepoRoot "scripts\atlas\materialize-gemma4-onnx-triton-repo.mjs") --apply
}

if (!(Test-Path (Join-Path $ModelRepo "gemma4_e2b_q4f16_decoder\1\model.onnx"))) {
  throw "Missing Gemma4 decoder ONNX model. Run npm run atlas:gemma4:onnx:triton:repo first."
}

if (Test-HttpReady) {
  Write-Host "Gemma4 ONNX Triton is already ready on http://127.0.0.1:$HttpPort"
  exit 0
}

$Mount = "$($ModelRepo -replace '\\','/'):/models"
$args = @(
  "run",
  "--rm",
  "--gpus", "all",
  "--name", $ContainerName,
  "-p", "$HttpPort`:8000",
  "-p", "$GrpcPort`:8001",
  "-p", "$MetricsPort`:8002",
  "-v", $Mount,
  $Image,
  "tritonserver",
  "--model-repository=/models",
  "--strict-model-config=false"
)

if ($Detached) {
  $args = @("run", "-d") + $args[1..($args.Count - 1)]
}

Write-Host "Starting Gemma4 ONNX Triton:"
Write-Host "  Image: $Image"
Write-Host "  Model repo: $ModelRepo"
Write-Host "  HTTP: http://127.0.0.1:$HttpPort"
Write-Host "  gRPC: 127.0.0.1:$GrpcPort"
Write-Host "  Note: this serves ONNX tensors only; use llama-server :8090 for production summaries until an adapter is proven."

& docker @args
