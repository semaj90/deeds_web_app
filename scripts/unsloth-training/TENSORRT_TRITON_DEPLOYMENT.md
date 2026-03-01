# 🚀 TensorRT-LLM + Triton Deployment Roadmap - Gemma 3 12B VLM

**Target**: Deploy trained Gemma 3 12B VLM to Triton Inference Server with TensorRT-LLM backend

**Timeline**: Week's end (by March 7, 2026)

**GPU**: RTX 3060 Ti 8GB (Ampere, SM 8.6)

---

## 📋 **Prerequisites**

### **After VLM Training Completes** (Day 1-2)

- ✅ Gemma 3 12B model trained on Colab A100 (4-6 hours)
- ✅ Model downloaded from Google Drive (~24GB merged or sharded)
- ✅ Q4_K_M quantization completed (24GB → ~7.2GB)
- ✅ RTX 3060 Ti with 8GB VRAM available
- ✅ CUDA Toolkit 12.x installed
- ✅ TensorRT-LLM installed
- ✅ Docker with GPU support

---

## 🎯 **Week-End Deployment Timeline**

| Day | Task | Duration | Deliverable |
|-----|------|----------|-------------|
| **Day 1** (Mon) | VLM training on Colab | 4-6 hours | 24GB merged model |
| **Day 2** (Tue) | Download + Q4_K_M quantization | 2-3 hours | 7.2GB GGUF model |
| **Day 3** (Wed) | TRT-LLM checkpoint conversion | 1 hour | TRT checkpoint |
| **Day 4** (Thu) | Build .plan engine + .ptx | 2-3 hours | rank0.engine + kernels |
| **Day 5** (Fri) | Triton deployment + testing | 2-3 hours | Production server |
| **Weekend** | Integration with Go services | 4-6 hours | Full stack |

**Total**: 15-22 hours spread over 7 days

---

## 📦 **Phase 1: Download & Quantization** (Day 2 - After Training)

### **Step 1.1: Download from Google Drive**

```bash
# After VLM training completes on Colab
# Download gemma3_12b_legal_merged.zip from Google Drive

cd ~/Downloads
unzip gemma3_12b_legal_merged.zip
cd gemma3_12b_legal_merged

# Verify model structure
ls -lh
# Expected:
# config.json
# model-00001-of-00006.safetensors
# model-00002-of-00006.safetensors
# ...
# tokenizer.json
# tokenizer_config.json
```

### **Step 1.2: Convert to GGUF**

```bash
# Install llama.cpp
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make LLAMA_CUDA=1

# Convert HF to GGUF
python convert-hf-to-gguf.py ~/Downloads/gemma3_12b_legal_merged \
  --outfile gemma3_12b_legal.gguf \
  --outtype f16

# Output: gemma3_12b_legal.gguf (~24GB FP16)
```

### **Step 1.3: Quantize to Q4_K_M**

```bash
# Quantize to Q4_K_M (24GB → 7.2GB)
./quantize gemma3_12b_legal.gguf \
           gemma3_12b_legal_Q4_K_M.gguf \
           Q4_K_M

# Verify size
ls -lh gemma3_12b_legal_Q4_K_M.gguf
# Expected: ~7.2GB

# Test inference (optional)
./main -m gemma3_12b_legal_Q4_K_M.gguf \
       -p "Explain Svelte 5 runes and legal evidence types" \
       -n 100 \
       --temp 0.7

# Expected: 60-70 tokens/sec on RTX 3060 Ti
```

---

## ⚙️ **Phase 2: TensorRT-LLM Checkpoint Conversion** (Day 3)

### **Step 2.1: Install TensorRT-LLM**

```bash
# Clone TensorRT-LLM
git clone https://github.com/NVIDIA/TensorRT-LLM.git
cd TensorRT-LLM

# Install dependencies
pip install -r requirements.txt

# Build TensorRT-LLM
python3 scripts/build_wheel.py --clean --trt_root /usr/local/tensorrt
pip install ./build/tensorrt_llm*.whl

# Verify installation
python -c "import tensorrt_llm; print(tensorrt_llm.__version__)"
```

### **Step 2.2: Set Environment Variables**

```bash
# RTX 3060 Ti is Ampere architecture (SM 8.6)
export CUDA_VISIBLE_DEVICES=0
export TORCH_CUDA_ARCH_LIST="8.6"
export CUDA_LAUNCH_BLOCKING=0

# Verify GPU
nvidia-smi
# Expected: RTX 3060 Ti, Compute Capability 8.6
```

### **Step 2.3: Convert GGUF → HF Format** (TRT-LLM needs HF)

```bash
# TensorRT-LLM requires HuggingFace format, not GGUF
# Use the original merged model from Colab download

cd ~/Downloads/gemma3_12b_legal_merged

# Verify HF format
python -c "
from transformers import AutoModelForCausalLM, AutoTokenizer
model = AutoModelForCausalLM.from_pretrained('.', device_map='cpu')
tokenizer = AutoTokenizer.from_pretrained('.')
print(f'Model: {model.config.model_type}')
print(f'Vocab size: {tokenizer.vocab_size}')
"
```

### **Step 2.4: Convert to TensorRT-LLM Checkpoint**

```bash
cd TensorRT-LLM

# Convert Gemma 3 12B to TRT-LLM checkpoint
python examples/gemma/convert_checkpoint.py \
  --model_dir ~/Downloads/gemma3_12b_legal_merged \
  --output_dir ./trt_checkpoints/gemma3_12b_legal \
  --dtype float16 \
  --tp_size 1 \
  --pp_size 1 \
  --use_weight_only \
  --weight_only_precision int4

# Output: TensorRT-LLM checkpoint in trt_checkpoints/gemma3_12b_legal/
# Contains:
#   - config.json (TRT-LLM config)
#   - rank0.safetensors (INT4 quantized weights ~7GB)
#   - tokenizer files
```

**Expected Duration**: ~30-45 minutes

**Output Files**:
```
trt_checkpoints/gemma3_12b_legal/
├── config.json                    # TRT-LLM config
├── rank0.safetensors              # INT4 weights (~7GB)
├── tokenizer.json
└── tokenizer_config.json
```

---

## 🏗️ **Phase 3: Build TensorRT Engine (.plan) + PTX Kernels** (Day 4)

### **Step 3.1: Build TensorRT Engine with PTX Generation**

```bash
cd TensorRT-LLM

# Build engine optimized for RTX 3060 Ti (Ampere SM 8.6)
trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3_12b_legal \
  --output_dir ./trt_engines/gemma3_12b_legal_rtx3060ti \
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --use_weight_only \
  --weight_only_precision int4 \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_output_len 512 \
  --max_beam_width 1 \
  --builder_opt 4 \
  --strongly_typed \
  --context_fmha enable \
  --remove_input_padding enable \
  --paged_kv_cache enable \
  --enable_context_fmha_fp32_acc \
  --multi_block_mode enable \
  --use_paged_context_fmha enable \
  --use_fp8_context_fmha disable \
  --lora_plugin disable \
  --lora_dir "" \
  --max_lora_rank 0 \
  --max_num_tokens 2048 \
  --save_pretiming_cache_to_disk enable \
  --load_pretiming_cache_from_disk enable \
  --cuda_graph_mode enable

# IMPORTANT FLAGS FOR .plan + .ptx GENERATION:
# --save_pretiming_cache_to_disk enable  → Saves PTX kernels
# --builder_opt 4                        → Max optimization
# --cuda_graph_mode enable               → CUDA graph capture
```

**Expected Output**:
```
[TensorRT-LLM] Building engine for rank 0...
[TensorRT-LLM] Compiling CUDA kernels to PTX...
[TensorRT-LLM] Saving .ptx files to trt_engines/gemma3_12b_legal_rtx3060ti/ptx/
[TensorRT-LLM] Engine built successfully
[TensorRT-LLM] Serializing engine to rank0.engine
[TensorRT-LLM] Total build time: ~45-60 minutes
```

**Output Structure**:
```
trt_engines/gemma3_12b_legal_rtx3060ti/
├── rank0.engine                  # TensorRT .plan file (~2-3GB)
├── config.json                   # Engine config
├── model.cache                   # Pretiming cache
└── ptx/                          # PTX kernel files ⭐ NEW!
    ├── gemm_sm86.ptx            # GEMM kernels for Ampere
    ├── attention_sm86.ptx       # Attention kernels
    ├── activation_sm86.ptx      # Activation kernels
    └── layernorm_sm86.ptx       # LayerNorm kernels
```

**Expected Duration**: 45-90 minutes (first build is slow)

**Expected Sizes**:
- `rank0.engine` (.plan): ~2-3 GB
- PTX kernels: ~50-100 MB total
- Total: ~2.5-3.5 GB

---

### **Step 3.2: Verify Engine Build**

```bash
# Check files
ls -lh ./trt_engines/gemma3_12b_legal_rtx3060ti/

# Verify .plan file
file ./trt_engines/gemma3_12b_legal_rtx3060ti/rank0.engine
# Expected: data

# Verify PTX directory
ls -lh ./trt_engines/gemma3_12b_legal_rtx3060ti/ptx/
# Expected: Multiple .ptx files

# Test engine with trtllm-run
trtllm-run \
  --engine_dir ./trt_engines/gemma3_12b_legal_rtx3060ti \
  --max_output_len 256 \
  --input_text "Explain Svelte 5 $state runes and legal evidence classification" \
  --tokenizer_dir ~/Downloads/gemma3_12b_legal_merged

# Expected: Generated text in ~2-3 seconds (faster than Ollama!)
```

---

## 🐳 **Phase 4: Triton Inference Server Deployment** (Day 5)

### **Step 4.1: Create Triton Model Repository**

```bash
# Create model repository structure
mkdir -p ~/triton-models/gemma3_12b_legal/1

# Copy engine to model directory
cp -r ./trt_engines/gemma3_12b_legal_rtx3060ti/* \
      ~/triton-models/gemma3_12b_legal/1/

# Verify structure
tree ~/triton-models/gemma3_12b_legal/
# Expected:
# gemma3_12b_legal/
# ├── config.pbtxt           ← We'll create this
# └── 1/
#     ├── rank0.engine
#     ├── config.json
#     ├── model.cache
#     └── ptx/
#         ├── gemm_sm86.ptx
#         └── ...
```

### **Step 4.2: Create Triton Config (config.pbtxt)**

```bash
cat > ~/triton-models/gemma3_12b_legal/config.pbtxt <<'EOF'
name: "gemma3_12b_legal"
backend: "tensorrtllm"
max_batch_size: 4

model_transaction_policy {
  decoupled: True
}

dynamic_batching {
  preferred_batch_size: [1, 2, 4]
  max_queue_delay_microseconds: 100
  preserve_ordering: false
  priority_levels: 2
  default_priority_level: 1
  priority_queue_policy {
    key: 1
    value: {
      allow_timeout_override: true
      timeout_action: DELAY
      default_timeout_microseconds: 5000
      max_queue_size: 8
    }
  }
}

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [0]  # RTX 3060 Ti
  }
]

# TensorRT-LLM specific parameters
parameters: {
  key: "max_beam_width"
  value: { string_value: "1" }
}

parameters: {
  key: "FORCE_CPU_ONLY_INPUT_TENSORS"
  value: { string_value: "no" }
}

parameters: {
  key: "gpt_model_type"
  value: { string_value: "gemma" }
}

parameters: {
  key: "gpt_model_path"
  value: { string_value: "/models/gemma3_12b_legal/1" }
}

parameters: {
  key: "encoder_model_path"
  value: { string_value: "/models/gemma3_12b_legal/1" }
}

parameters: {
  key: "max_tokens_in_paged_kv_cache"
  value: { string_value: "2560" }
}

parameters: {
  key: "batch_scheduler_policy"
  value: { string_value: "max_utilization" }
}

parameters: {
  key: "kv_cache_free_gpu_mem_fraction"
  value: { string_value: "0.85" }
}

parameters: {
  key: "exclude_input_in_output"
  value: { string_value: "true" }
}

parameters: {
  key: "enable_kv_cache_reuse"
  value: { string_value: "false" }
}

parameters: {
  key: "normalize_log_probs"
  value: { string_value: "true" }
}

parameters: {
  key: "enable_chunked_context"
  value: { string_value: "false" }
}

parameters: {
  key: "gpu_device_ids"
  value: { string_value: "0" }
}

parameters: {
  key: "executor_worker_path"
  value: { string_value: "/opt/tritonserver/backends/tensorrtllm/trtllmExecutorWorker" }
}
EOF
```

### **Step 4.3: Pull Triton Docker Image**

```bash
# Pull latest Triton with TensorRT-LLM backend
docker pull nvcr.io/nvidia/tritonserver:24.02-trtllm-python-py3

# Verify image
docker images | grep tritonserver
# Expected: nvcr.io/nvidia/tritonserver   24.02-trtllm-python-py3
```

### **Step 4.4: Deploy Triton Server**

```bash
# Stop any existing Triton containers
docker stop triton-gemma3-12b 2>/dev/null || true
docker rm triton-gemma3-12b 2>/dev/null || true

# Run Triton with TensorRT-LLM backend
docker run -d --gpus all --rm \
  --name triton-gemma3-12b \
  --shm-size=4g \
  --ulimit memlock=-1 \
  --ulimit stack=67108864 \
  -p 8099:8000 \
  -p 8100:8001 \
  -p 8101:8002 \
  -v ~/triton-models:/models \
  nvcr.io/nvidia/tritonserver:24.02-trtllm-python-py3 \
  tritonserver \
    --model-repository=/models \
    --backend-config=tensorrtllm,max_beam_width=1 \
    --backend-config=tensorrtllm,batch_scheduler_policy=max_utilization \
    --backend-config=tensorrtllm,max_queue_delay_microseconds=100 \
    --log-verbose=1 \
    --log-info=1 \
    --log-warning=1 \
    --log-error=1

# Watch logs
docker logs -f triton-gemma3-12b
```

**Expected Output**:
```
I0307 00:00:00.000000 1 server.cc:619] Started GRPCInferenceService at 0.0.0.0:8001
I0307 00:00:00.000000 1 server.cc:642] Started HTTPService at 0.0.0.0:8000
I0307 00:00:00.000000 1 server.cc:664] Started Metrics Service at 0.0.0.0:8002
I0307 00:00:00.000000 1 model_lifecycle.cc:461] loading: gemma3_12b_legal:1
I0307 00:00:00.000000 1 tensorrtllm.cc:1234] TRITONBACKEND_Initialize: tensorrtllm
I0307 00:00:00.000000 1 tensorrtllm.cc:1244] Triton TRITONBACKEND API version: 1.15
I0307 00:00:00.000000 1 tensorrtllm.cc:1250] 'tensorrtllm' TRITONBACKEND API version: 1.15
I0307 00:00:00.000000 1 model_lifecycle.cc:818] successfully loaded 'gemma3_12b_legal' version 1
```

### **Step 4.5: Verify Server Health**

```bash
# Check HTTP endpoint
curl http://localhost:8099/v2/health/ready

# Expected: HTTP 200
# Response: {"ready":true}

# Check model status
curl http://localhost:8099/v2/models/gemma3_12b_legal/ready

# Expected: HTTP 200
# Response: {"ready":true}

# Get model metadata
curl http://localhost:8099/v2/models/gemma3_12b_legal

# Expected: JSON with model config
```

---

## 🧪 **Phase 5: Testing & Benchmarking** (Day 5 - After Deployment)

### **Step 5.1: Simple Inference Test**

```bash
# Install Triton client
pip install tritonclient[http]

# Create test script
cat > test_triton.py <<'EOF'
import tritonclient.http as httpclient
import numpy as np

# Connect to Triton
client = httpclient.InferenceServerClient(url="localhost:8099")

# Check server health
print("Server ready:", client.is_server_ready())
print("Model ready:", client.is_model_ready("gemma3_12b_legal"))

# Prepare input
prompt = "Explain Svelte 5 $state runes and legal evidence classification"
# Tokenize (use real tokenizer - this is simplified)
input_ids = np.array([[1, 2, 3, 4, 5]], dtype=np.int32)

# Create input tensors
inputs = [
    httpclient.InferInput("input_ids", input_ids.shape, "INT32"),
    httpclient.InferInput("input_lengths", [1], "INT32"),
    httpclient.InferInput("request_output_len", [1], "INT32"),
]

inputs[0].set_data_from_numpy(input_ids)
inputs[1].set_data_from_numpy(np.array([input_ids.shape[1]], dtype=np.int32))
inputs[2].set_data_from_numpy(np.array([256], dtype=np.int32))

# Create output
outputs = [
    httpclient.InferRequestedOutput("output_ids"),
]

# Run inference
import time
start = time.time()
response = client.infer("gemma3_12b_legal", inputs, outputs=outputs)
elapsed = time.time() - start

print(f"Inference time: {elapsed:.3f}s")

# Get output
output_ids = response.as_numpy("output_ids")
print("Output shape:", output_ids.shape)
EOF

# Run test
python test_triton.py
```

### **Step 5.2: Performance Benchmark**

```bash
# Install perf_analyzer
apt-get install -y perf-analyzer

# Benchmark throughput
perf_analyzer \
  -m gemma3_12b_legal \
  -u localhost:8099 \
  --protocol http \
  --concurrency-range 1:4 \
  --measurement-mode time_windows \
  --measurement-interval 5000 \
  --latency-threshold 1000

# Expected results:
# Concurrency: 1, Throughput: ~40-60 infer/sec
# Concurrency: 2, Throughput: ~70-100 infer/sec
# Concurrency: 4, Throughput: ~120-150 infer/sec
# Latency (p50): ~50-80 ms
# Latency (p99): ~150-250 ms
```

---

## 🔗 **Phase 6: SvelteKit Integration** (Weekend)

### **Step 6.1: Update TRT-LLM Client**

**File**: `src/lib/server/trt-llm/client.ts`

```typescript
import type { InferenceRequest, InferenceResponse } from './types';

const TRITON_URL = process.env.TENSORRT_SERVICE_URL || 'http://localhost:8099';
const MODEL_NAME = 'gemma3_12b_legal';

export async function generateWithTriton(
  prompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  } = {}
): Promise<string> {
  const { maxTokens = 256, temperature = 0.7, topP = 0.9 } = options;

  // Tokenize prompt (use @xenova/transformers or real tokenizer)
  const inputIds = await tokenizePrompt(prompt);

  const payload = {
    inputs: [
      {
        name: 'input_ids',
        shape: [1, inputIds.length],
        datatype: 'INT32',
        data: inputIds
      },
      {
        name: 'input_lengths',
        shape: [1],
        datatype: 'INT32',
        data: [inputIds.length]
      },
      {
        name: 'request_output_len',
        shape: [1],
        datatype: 'INT32',
        data: [maxTokens]
      },
      {
        name: 'beam_width',
        shape: [1],
        datatype: 'INT32',
        data: [1]
      },
      {
        name: 'temperature',
        shape: [1],
        datatype: 'FP32',
        data: [temperature]
      },
      {
        name: 'top_p',
        shape: [1],
        datatype: 'FP32',
        data: [topP]
      }
    ],
    outputs: [
      { name: 'output_ids' },
      { name: 'sequence_length' }
    ]
  };

  const response = await fetch(
    `${TRITON_URL}/v2/models/${MODEL_NAME}/infer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    throw new Error(`Triton inference failed: ${response.statusText}`);
  }

  const result = await response.json();
  const outputIds = result.outputs.find((o: any) => o.name === 'output_ids').data;

  // Detokenize
  return await detokenizeOutput(outputIds);
}

// Streaming support
export async function* streamGenerateWithTriton(
  prompt: string,
  options = {}
): AsyncGenerator<string, void, unknown> {
  // Similar to above but use streaming endpoint
  const payload = { /* ... */ };

  const response = await fetch(
    `${TRITON_URL}/v2/models/${MODEL_NAME}/generate_stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(l => l.trim());

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.token) {
          yield data.token;
        }
      }
    }
  }
}
```

### **Step 6.2: Update LLM Router**

**File**: `src/lib/server/llm/router.ts`

```typescript
import { generateWithTriton } from '../trt-llm/client';
import { generateWithOllama } from '../ollama/client';
import { generateWithGemini } from '../gemini/client';

export type LLMProvider = 'triton' | 'tensorrt' | 'ollama' | 'gemini';

export async function routeLLM(
  prompt: string,
  options: {
    provider?: LLMProvider;
    maxTokens?: number;
  } = {}
): Promise<{ text: string; provider: LLMProvider; latency: number }> {
  const start = Date.now();
  let text: string;
  let provider: LLMProvider = options.provider || 'triton';

  try {
    // Try Triton first (fastest)
    if (provider === 'triton' || provider === 'tensorrt') {
      text = await generateWithTriton(prompt, options);
      provider = 'triton';
    }
  } catch (error) {
    console.warn('Triton failed, falling back to Ollama:', error);
    try {
      // Fallback to Ollama (native GPU)
      text = await generateWithOllama(prompt, options);
      provider = 'ollama';
    } catch (ollamaError) {
      console.warn('Ollama failed, falling back to Gemini:', ollamaError);
      // Final fallback to Gemini (cloud)
      text = await generateWithGemini(prompt, options);
      provider = 'gemini';
    }
  }

  const latency = Date.now() - start;
  return { text, provider, latency };
}
```

### **Step 6.3: Update Health Endpoint**

**File**: `src/routes/api/health/capabilities/+server.ts`

Add Triton check:

```typescript
// Check Triton availability
let triton = false;
try {
  const tritonResponse = await Promise.race([
    fetch('http://localhost:8099/v2/health/ready'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
  ]);
  triton = tritonResponse.ok;
} catch {}

return json({
  // ...existing checks...
  triton,
  tensorrtLLM: triton, // Alias
  preferredProvider: triton ? 'triton' : (ollama ? 'ollama' : 'gemini')
});
```

---

## 📊 **Expected Performance (RTX 3060 Ti)**

### **Gemma 3 12B INT4 on Triton**

| Metric | Value | vs Ollama | vs Gemini |
|--------|-------|-----------|-----------|
| **Throughput** | 40-60 tokens/sec | 2-3x faster | 10x faster |
| **Latency (first token)** | 50-100 ms | 2x faster | 50x faster |
| **Latency (subsequent)** | 15-25 ms | 2x faster | 100x faster |
| **VRAM Usage** | 6-7 GB | 50% less | N/A |
| **Batch Size** | 4 | 2x larger | N/A |
| **Max Context** | 2048 tokens | Same | Same |

### **Vision Analysis Performance**

| Task | Triton + CUDA | Ollama | Speedup |
|------|---------------|--------|---------|
| **PDF OCR** | 100-200 ms/page | 1-2 sec/page | 10x |
| **YOLO Detection** | 30-50 ms/image | 200-300 ms | 5x |
| **Evidence Classification** | 50-80 ms | 300-500 ms | 5x |

---

## 🔌 **Phase 7: Wire to Go Microservices** (Weekend)

### **Step 7.1: Update Agentic Gemma3 Service**

**File**: `go-microservice/agentic-gemma3-main.go`

Add Triton backend:

```go
// Add Triton client
type TritonClient struct {
    baseURL string
}

func (t *TritonClient) Generate(prompt string, maxTokens int) (string, error) {
    payload := map[string]interface{}{
        "inputs": []map[string]interface{}{
            {"name": "input_ids", /* ... */},
        },
        "outputs": []map[string]interface{}{
            {"name": "output_ids"},
        },
    }

    resp, err := http.Post(
        fmt.Sprintf("%s/v2/models/gemma3_12b_legal/infer", t.baseURL),
        "application/json",
        bytes.NewBuffer(jsonPayload),
    )
    // ... parse response
}

// Update tool handlers to use Triton
func (s *AgenticService) executeLegalAnalysis(task Task) (string, error) {
    triton := &TritonClient{baseURL: "http://localhost:8099"}
    return triton.Generate(task.Payload.Message, 512)
}
```

### **Step 7.2: Update Legal AI Orchestrator**

**File**: `go-microservice/legal-ai-orchestrator.go`

Add Triton inference:

```go
func (o *Orchestrator) analyzeCase(caseID string) (*CaseAnalysis, error) {
    // Use Triton for legal reasoning
    prompt := o.buildLegalPrompt(caseID)
    response, err := o.tritonClient.Generate(prompt, 1024)
    if err != nil {
        return nil, err
    }

    // Parse structured output
    return parseCaseAnalysis(response), nil
}
```

---

## ✅ **Success Criteria**

### **Phase Completion Checklist**

- [ ] **Day 1-2**: VLM trained + downloaded (24GB model)
- [ ] **Day 2**: Q4_K_M quantization complete (7.2GB)
- [ ] **Day 3**: TRT-LLM checkpoint converted
- [ ] **Day 4**: .plan engine + .ptx kernels built (~2.5GB total)
- [ ] **Day 5**: Triton server deployed + healthy
- [ ] **Day 5**: Inference test passes (<100ms latency)
- [ ] **Weekend**: SvelteKit integration complete
- [ ] **Weekend**: Go services wired to Triton
- [ ] **Weekend**: Performance benchmarks meet targets

### **Production Readiness**

- [ ] Triton server auto-starts on boot
- [ ] Health checks integrated in `/api/health/capabilities`
- [ ] LLM router prefers Triton (falls back to Ollama → Gemini)
- [ ] GPU arbiter manages VRAM between Ollama and Triton
- [ ] Monitoring via Prometheus metrics (port 8101)
- [ ] E2E tests pass (Playwright 22/22)

---

## 🚨 **Troubleshooting**

### **"CUDA out of memory" during engine build**

**Solution**: Reduce max_input_len or max_batch_size

```bash
trtllm-build ... --max_batch_size 2 --max_input_len 1024
```

### **"PTX kernels not found"**

**Solution**: Ensure `--save_pretiming_cache_to_disk enable` flag is set

```bash
trtllm-build ... --save_pretiming_cache_to_disk enable
```

### **"Triton server won't start"**

**Solution**: Check Docker GPU access

```bash
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### **"Model loading timeout"**

**Solution**: Increase Triton timeout

```bash
tritonserver ... --model-load-timeout-s 600
```

---

## 📚 **Reference Documentation**

- **TensorRT-LLM**: https://github.com/NVIDIA/TensorRT-LLM
- **Triton Inference Server**: https://github.com/triton-inference-server/server
- **Gemma Models**: https://huggingface.co/google/gemma-3-12b
- **RTX 3060 Ti Specs**: Ampere, SM 8.6, 8GB VRAM

---

## 🎯 **End Goal**

By week's end, you'll have:

1. ✅ **Gemma 3 12B VLM** trained on your data (Svelte 5 + legal + codebase)
2. ✅ **TensorRT .plan engine** optimized for RTX 3060 Ti (~2.5GB)
3. ✅ **.ptx kernels** for maximum performance (~50MB)
4. ✅ **Triton Inference Server** deployed (ports 8099-8101)
5. ✅ **2-3x faster** inference vs Ollama
6. ✅ **Vision analysis** (YOLO + SAM + OCR) at 10x speed
7. ✅ **Full stack integration** (SvelteKit + Go services)

**Ready to build the fastest legal AI on RTX 3060 Ti!** 🚀
