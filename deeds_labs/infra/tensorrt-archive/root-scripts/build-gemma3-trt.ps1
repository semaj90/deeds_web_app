param(
  [string]$Container = "phase66-tensorrt-llm"
)

# Paths inside the container
$checkpoint     = "/workspace/engines/gemma3-legal-production/checkpoint"
$checkpointTrt  = "/workspace/engines/gemma3-legal-production/checkpoint_trt"
$engineDir      = "/workspace/engines/gemma3_12b_int4_engine"
$buildConfig    = "$checkpointTrt/build_config_int4.json"

Write-Host "🔥 Building TensorRT-LLM Engine for Gemma3-Legal (INT4)" -ForegroundColor Yellow
Write-Host "Container: $Container" -ForegroundColor Cyan

# Step 1: Convert checkpoint
Write-Host "== STEP 1: Convert HF/Unsloth checkpoint -> TensorRT rank0.safetensors ==" -ForegroundColor Green

$convertCmd = "python3 /workspace/convert_unsloth_to_trt.py --src $checkpoint --dst $checkpointTrt"
docker exec $Container bash -c $convertCmd

if ($LASTEXITCODE -ne 0) {
  Write-Error "Checkpoint conversion failed"
  exit 1
}

# Step 2: Build engine
Write-Host "== STEP 2: Build INT4 TensorRT-LLM engine ==" -ForegroundColor Green

$buildCmd = "python3 -m tensorrt_llm.commands.build --checkpoint_dir $checkpointTrt --output_dir $engineDir --build_config $buildConfig"
docker exec $Container bash -c $buildCmd

if ($LASTEXITCODE -ne 0) {
  Write-Error "Engine build failed"
  exit 1
}

Write-Host "== DONE: Engine built at $engineDir ==" -ForegroundColor Green