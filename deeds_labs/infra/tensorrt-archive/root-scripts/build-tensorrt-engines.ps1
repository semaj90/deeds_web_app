#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build TensorRT engines for Gemma3 model with FP16/FP8/INT8 precision modes
.DESCRIPTION
    This script builds optimized TensorRT engines for the Gemma3 model using the
    NVIDIA TensorRT-LLM container. It supports multiple precision modes and
    configurable batch sizes for high-throughput inference.
.PARAMETER ContainerName
    Name of the TensorRT-LLM Docker container (default: legal-ai-tensorrt-llm)
.PARAMETER ModelPath
    Path to the Gemma3 model inside the container (default: /workspace/models/gemma3-4b-it)
.PARAMETER OutputDir
    Directory to save built engines (default: /workspace/engines)
.PARAMETER BuildFP16
    Whether to build FP16 engine (default: true)
.PARAMETER BuildFP8
    Whether to build FP8 engine (default: true)
.PARAMETER BuildINT8
    Whether to build INT8 engine (default: true)
.PARAMETER MaxBatchSize
    Maximum batch size for inference (default: 8)
.PARAMETER MaxInputLen
    Maximum input sequence length (default: 2048)
.PARAMETER MaxOutputLen
    Maximum output sequence length (default: 512)
.EXAMPLE
    .\build-tensorrt-engines.ps1 -BuildFP16 $true -BuildFP8 $true -BuildINT8 $false
#>

param(
    [string]$ContainerName = $env:TENSORRT_CONTAINER,
    [string]$ModelPath = $env:MODEL_PATH,
    [string]$OutputDir = $env:OUTPUT_DIR,
    [bool]$BuildFP16 = [bool]::Parse($env:BUILD_FP16),
    [bool]$BuildFP8 = [bool]::Parse($env:BUILD_FP8),
    [bool]$BuildINT8 = [bool]::Parse($env:BUILD_INT8),
    [int]$MaxBatchSize = [int]::Parse($env:MAX_BATCH_SIZE),
    [int]$MaxInputLen = [int]::Parse($env:MAX_INPUT_LEN),
    [int]$MaxOutputLen = [int]::Parse($env:MAX_OUTPUT_LEN)
)

# Set defaults if not provided via environment
if (-not $ContainerName) { $ContainerName = "legal-ai-tensorrt-llm" }
if (-not $ModelPath) { $ModelPath = "/workspace/models/gemma3-4b-it" }
if (-not $OutputDir) { $OutputDir = "/workspace/engines" }
if (-not $MaxBatchSize) { $MaxBatchSize = 8 }
if (-not $MaxInputLen) { $MaxInputLen = 2048 }
if (-not $MaxOutputLen) { $MaxOutputLen = 512 }

Write-Host "🔥 Building TensorRT Engines for Gemma3" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "Container: $ContainerName" -ForegroundColor Cyan
Write-Host "Model Path: $ModelPath" -ForegroundColor Cyan
Write-Host "Output Dir: $OutputDir" -ForegroundColor Cyan
Write-Host "Max Batch Size: $MaxBatchSize" -ForegroundColor Cyan
Write-Host "Max Input Length: $MaxInputLen" -ForegroundColor Cyan
Write-Host "Max Output Length: $MaxOutputLen" -ForegroundColor Cyan
Write-Host ""

# Check if container is running
$containerRunning = docker ps --format "{{.Names}}" | Select-String -Pattern $ContainerName -Quiet
if (-not $containerRunning) {
    Write-Host "❌ Container '$ContainerName' is not running. Please start it first." -ForegroundColor Red
    exit 1
}

# Create output directory
docker exec $ContainerName mkdir -p $OutputDir

# Build FP16 engine
if ($BuildFP16) {
    Write-Host "🏗️ Building FP16 Engine..." -ForegroundColor Yellow
    $fp16Command = @"
python3 -m tensorrt_llm.commands.build ^
    --checkpoint_dir=$ModelPath ^
    --output_dir=${OutputDir}/fp16 ^
    --max_batch_size=$MaxBatchSize ^
    --max_input_len=$MaxInputLen ^
    --max_seq_len=$($MaxInputLen + $MaxOutputLen) ^
    --max_beam_width=1 ^
    --use_gemm_plugin=float16 ^
    --use_gpt_attention_plugin=float16 ^
    --paged_kv_cache ^
    --dtype=float16 ^
    --remove_input_padding ^
    --enable_context_fmha ^
    --multiple_profiles
"@

    try {
        docker exec $ContainerName powershell -Command $fp16Command
        Write-Host "✅ FP16 Engine built successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ FP16 Engine build failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Build FP8 engine
if ($BuildFP8) {
    Write-Host "🏗️ Building FP8 Engine..." -ForegroundColor Yellow

    # First, quantize to FP8
    $quantizeCommand = @"
python3 -c "
import torch
from optimum.quanto import quantize, QuantizedModel
from transformers import AutoModelForCausalLM, AutoTokenizer

print('Loading model for FP8 quantization...')
model = AutoModelForCausalLM.from_pretrained('$ModelPath', torch_dtype=torch.float16, device_map='auto')
tokenizer = AutoTokenizer.from_pretrained('$ModelPath')

print('Quantizing to FP8...')
quantized_model = quantize(model, weights=torch.float8_e4m3fn)
quantized_model.save_pretrained('${OutputDir}/fp8_model')
tokenizer.save_pretrained('${OutputDir}/fp8_model')
print('FP8 quantization complete')
"
"@

    try {
        docker exec $ContainerName python3 -c $quantizeCommand.Replace("`n", "; ").Replace("`r", "")
        Write-Host "✅ FP8 Quantization completed" -ForegroundColor Green
    } catch {
        Write-Host "❌ FP8 Quantization failed: $($_.Exception.Message)" -ForegroundColor Red
        continue
    }

    # Build TensorRT engine from FP8 model
    $fp8BuildCommand = @"
python3 -m tensorrt_llm.commands.build ^
    --checkpoint_dir=${OutputDir}/fp8_model ^
    --output_dir=${OutputDir}/fp8 ^
    --max_batch_size=$MaxBatchSize ^
    --max_input_len=$MaxInputLen ^
    --max_seq_len=$($MaxInputLen + $MaxOutputLen) ^
    --max_beam_width=1 ^
    --use_gemm_plugin=float16 ^
    --use_gpt_attention_plugin=float16 ^
    --paged_kv_cache ^
    --dtype=float16 ^
    --remove_input_padding ^
    --enable_context_fmha ^
    --multiple_profiles ^
    --quantization=fp8
"@

    try {
        docker exec $ContainerName powershell -Command $fp8BuildCommand
        Write-Host "✅ FP8 Engine built successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ FP8 Engine build failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Build INT8 engine
if ($BuildINT8) {
    Write-Host "🏗️ Building INT8 Engine..." -ForegroundColor Yellow

    # First, create calibration dataset and quantize to INT8
    $int8QuantizeCommand = @"
python3 -c "
import torch
from optimum.intel.neural_compressor import INCQuantizer, IncQuantizedModelForCausalLM
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import load_dataset

print('Loading model for INT8 quantization...')
model = AutoModelForCausalLM.from_pretrained('$ModelPath', torch_dtype=torch.float16)
tokenizer = AutoTokenizer.from_pretrained('$ModelPath')

print('Creating calibration dataset...')
# Use a small subset for calibration
calibration_dataset = load_dataset('wikitext', 'wikitext-2-raw-v1', split='train[:100]')

def tokenize_function(examples):
    return tokenizer(examples['text'], truncation=True, padding=False, max_length=512)

calibration_dataset = calibration_dataset.map(tokenize_function, batched=True, remove_columns=['text'])

print('Quantizing to INT8 with SmoothQuant...')
quantizer = INCQuantizer.from_pretrained(model)
quantized_model = quantizer.quantize(calibration_dataset=calibration_dataset, quantization_config={'smoothquant': True})
quantized_model.save_pretrained('${OutputDir}/int8_model')
tokenizer.save_pretrained('${OutputDir}/int8_model')
print('INT8 quantization complete')
"
"@

    try {
        docker exec $ContainerName python3 -c $int8QuantizeCommand.Replace("`n", "; ").Replace("`r", "")
        Write-Host "✅ INT8 Quantization completed" -ForegroundColor Green
    } catch {
        Write-Host "❌ INT8 Quantization failed: $($_.Exception.Message)" -ForegroundColor Red
        continue
    }

    # Build TensorRT engine from INT8 model
    $int8BuildCommand = @"
python3 -m tensorrt_llm.commands.build ^
    --checkpoint_dir=${OutputDir}/int8_model ^
    --output_dir=${OutputDir}/int8 ^
    --max_batch_size=$MaxBatchSize ^
    --max_input_len=$MaxInputLen ^
    --max_seq_len=$($MaxInputLen + $MaxOutputLen) ^
    --max_beam_width=1 ^
    --use_gemm_plugin=float16 ^
    --use_gpt_attention_plugin=float16 ^
    --paged_kv_cache ^
    --dtype=float16 ^
    --remove_input_padding ^
    --enable_context_fmha ^
    --multiple_profiles ^
    --quantization=int8 ^
    --smoothquant
"@

    try {
        docker exec $ContainerName powershell -Command $int8BuildCommand
        Write-Host "✅ INT8 Engine built successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ INT8 Engine build failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 TensorRT Engine Building Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# List built engines
Write-Host "Built Engines:" -ForegroundColor Cyan
try {
    $engines = docker exec $ContainerName find $OutputDir -name "*.engine" -type f
    if ($engines) {
        $engines | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    } else {
        Write-Host "  No engines found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Could not list engines" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "💡 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Start the Go TensorRT runner: go run go-tensorrt-runner/main.go" -ForegroundColor White
Write-Host "  2. Test inference: curl -X POST http://localhost:8099/generate -d '{\"prompt\":\"Hello\",\"precision\":\"fp16\"}'" -ForegroundColor White
Write-Host "  3. Monitor performance with the GPU metrics exporter" -ForegroundColor White