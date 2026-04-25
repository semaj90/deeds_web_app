# TRT-LLM Conversion Guide for Gemma 3 Legal Svelte5

After completing the Unsloth fine-tuning in Google Colab, follow these steps to convert the model to TensorRT-LLM for Triton Inference Server deployment.

## Step 1: Download Fine-Tuned Model

From Google Colab, you should have:
- `gemma3-legal-svelte5-unsloth.Q4_K_M.gguf` (for Ollama testing)
- `gemma3-legal-svelte5-hf.zip` (HuggingFace format for TRT-LLM)

## Step 2: Install TensorRT-LLM

```bash
# Clone TensorRT-LLM repo
git clone https://github.com/NVIDIA/TensorRT-LLM.git
cd TensorRT-LLM

# Install dependencies (requires CUDA 12.x)
pip install -r requirements.txt
pip install tensorrt_llm -U --pre --extra-index-url https://pypi.nvidia.com
```

## Step 3: Convert HuggingFace to TRT-LLM

```bash
# Extract the HF model
unzip gemma3-legal-svelte5-hf.zip

# Convert to TRT-LLM checkpoint
python examples/gemma/convert_checkpoint.py \
    --model_dir gemma3-legal-svelte5-hf \
    --output_dir gemma3-legal-svelte5-trt \
    --dtype float16 \
    --tp_size 1

# Build TRT-LLM engine
trtllm-build \
    --checkpoint_dir gemma3-legal-svelte5-trt \
    --output_dir gemma3-legal-svelte5-engine \
    --gemini_plugin float16 \
    --max_batch_size 8 \
    --max_input_len 2048 \
    --max_output_len 1024
```

## Step 4: Deploy to Triton Inference Server

```bash
# Create Triton model repository structure
mkdir -p triton-models/gemma3-legal-svelte5/1

# Copy TRT-LLM engine
cp -r gemma3-legal-svelte5-engine/* triton-models/gemma3-legal-svelte5/1/

# Create config.pbtxt
cat > triton-models/gemma3-legal-svelte5/config.pbtxt << EOF
name: "gemma3-legal-svelte5"
backend: "tensorrtllm"
max_batch_size: 8

input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  },
  {
    name: "input_lengths"
    data_type: TYPE_INT32
    dims: [ 1 ]
    reshape: { shape: [ ] }
  }
]

output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
  }
]
EOF

# Start Triton Server
docker run --gpus all --rm -p 8000:8000 -p 8001:8001 -p 8002:8002 \
    -v $(pwd)/triton-models:/models \
    nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3 \
    tritonserver --model-repository=/models
```

## Step 5: Test Triton Inference

```python
import tritonclient.http as httpclient
import numpy as np

client = httpclient.InferenceServerClient(url="localhost:8000")

# Prepare input
prompt = "Convert this Svelte 4 component to Svelte 5: <script>let count = 0;</script>"
input_ids = tokenizer.encode(prompt)

# Create input tensors
inputs = [
    httpclient.InferInput("input_ids", input_ids.shape, "INT32"),
    httpclient.InferInput("input_lengths", [1], "INT32")
]
inputs[0].set_data_from_numpy(np.array(input_ids, dtype=np.int32))
inputs[1].set_data_from_numpy(np.array([len(input_ids)], dtype=np.int32))

# Run inference
response = client.infer("gemma3-legal-svelte5", inputs)
output_ids = response.as_numpy("output_ids")

# Decode output
generated_text = tokenizer.decode(output_ids[0])
print(generated_text)
```

## Performance Optimization

### 1. Enable FP8 Quantization (for A100/H100)
```bash
trtllm-build \
    --checkpoint_dir gemma3-legal-svelte5-trt \
    --output_dir gemma3-legal-svelte5-engine-fp8 \
    --gemini_plugin fp8 \
    --max_batch_size 16
```

### 2. Multi-GPU Deployment
```bash
# Tensor Parallelism (2 GPUs)
python convert_checkpoint.py \
    --model_dir gemma3-legal-svelte5-hf \
    --output_dir gemma3-legal-svelte5-trt-tp2 \
    --dtype float16 \
    --tp_size 2

trtllm-build \
    --checkpoint_dir gemma3-legal-svelte5-trt-tp2 \
    --output_dir gemma3-legal-svelte5-engine-tp2 \
    --workers 2
```

### 3. Benchmarking
```bash
# Test throughput
python benchmarks/python/benchmark.py \
    --engine_dir gemma3-legal-svelte5-engine \
    --batch_size 8 \
    --input_len 512 \
    --output_len 256
```

## Integration with SvelteKit

Update your `sveltekit-frontend/.env`:

```env
# Option 1: Use Triton via HTTP
TRITON_URL=http://localhost:8000
TRITON_MODEL=gemma3-legal-svelte5

# Option 2: Use Ollama (for development)
OLLAMA_MODEL=gemma3-legal-svelte5
OLLAMA_URL=http://localhost:11434
```

Create API route handler:

```typescript
// src/routes/api/ai/triton/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const { prompt } = await request.json();

    const response = await fetch(`${process.env.TRITON_URL}/v2/models/${process.env.TRITON_MODEL}/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            inputs: [
                { name: 'input_ids', shape: [1, -1], datatype: 'INT32', data: [/* tokenized prompt */] }
            ]
        })
    });

    const result = await response.json();
    return new Response(JSON.stringify(result), { status: 200 });
};
```

## Expected Performance

| Metric | Ollama (GGUF Q4) | TRT-LLM (FP16) | TRT-LLM (FP8) |
|--------|------------------|----------------|---------------|
| Throughput | ~20 tok/s | ~150 tok/s | ~300 tok/s |
| Latency (p50) | ~50ms | ~6ms | ~3ms |
| Memory | 16GB | 48GB | 24GB |
| GPU | Any | A100 | A100/H100 |

## Troubleshooting

1. **CUDA Out of Memory**: Reduce `max_batch_size` or use FP8 quantization
2. **Slow Inference**: Enable `--use_gpt_attention_plugin`
3. **Model Load Error**: Verify `config.pbtxt` paths and data types

## Resources

- [TensorRT-LLM Documentation](https://github.com/NVIDIA/TensorRT-LLM)
- [Triton Inference Server](https://github.com/triton-inference-server/server)
- [Gemma TRT-LLM Example](https://github.com/NVIDIA/TensorRT-LLM/tree/main/examples/gemma)
