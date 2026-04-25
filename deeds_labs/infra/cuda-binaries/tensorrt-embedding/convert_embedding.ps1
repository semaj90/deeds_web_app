# TensorRT Embedding Conversion Script for embeddinggemma (Windows)
# Assumes TensorRT-LLM container or local Python

param(
    [string]$WorkspaceDir = $PWD.Path,
    [string]$ModelName = "google/embeddinggemma-001",
    [string]$ModelDir = "$WorkspaceDir\models\$ModelName",
    [string]$EngineDir = "$WorkspaceDir\engines"
)

# Check if Docker is available and container exists
$containerId = docker ps -a | Select-String "tensorrt-llm-gpu" | ForEach-Object { $_.Line.Split()[0] } | Select-Object -First 1

if ($containerId) {
    Write-Host "Using existing TensorRT-LLM container: $containerId"
    docker start $containerId
    docker exec $containerId bash -c "
cd /workspace &&
if [ ! -d models/google/embeddinggemma-001 ]; then
    echo 'Cloning model...' &&
    pip install transformers huggingface_hub &&
    git lfs install &&
    git clone https://huggingface.co/$ModelName models/$ModelName
else
    echo 'Model already exists'
fi &&
python -c 'import tensorrt_llm; print(\"TensorRT-LLM OK\")' &&
echo 'Building TensorRT engine...' &&
python -m tensorrt_llm.commands.build \
    --checkpoint_dir models/$ModelName \
    --output_dir engines/embeddinggemma \
    --dtype float16 \
    --max_batch_size 1 \
    --max_input_len 512 \
    --max_seq_len 512 \
    --use_gemm_plugin float16 \
    --use_gpt_attention_plugin float16 \
    --paged_kv_cache \
    --remove_input_padding
"
} else {
    Write-Host "No TensorRT-LLM container found. Using local Python..."
    try {
        python -c "import tensorrt_llm; print('TensorRT-LLM OK')"
        Write-Host "Building TensorRT engine locally..."
        python -m tensorrt_llm.commands.build `
            --checkpoint_dir $ModelDir `
            --output_dir "$EngineDir\embeddinggemma" `
            --dtype float16 `
            --max_batch_size 1 `
            --max_input_len 512 `
            --max_seq_len 512 `
            --use_gemm_plugin float16 `
            --use_gpt_attention_plugin float16 `
            --paged_kv_cache `
            --remove_input_padding
    } catch {
        Write-Host "TensorRT-LLM not available locally. Please install or use Docker."
        exit 1
    }
}

Write-Host "TensorRT engine built successfully at $EngineDir\embeddinggemma"