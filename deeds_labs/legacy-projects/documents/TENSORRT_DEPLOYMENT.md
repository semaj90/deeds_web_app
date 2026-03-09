# TensorRT-LLM Deployment Guide
## LegalBERT + EmbeddingGemma for Legal AI Platform

This guide covers the complete deployment of LegalBERT and EmbeddingGemma as TensorRT engines under Triton Inference Server.

## 🏗️ Architecture Overview

```
[SvelteKit 2 Frontend :5173]
     │  HTTP/QUIC WebTransport
     ▼
[Python FastAPI Synthesizer :8003]
     │  gRPC (tritonclient)
     ▼
[Triton Inference Server :8001]
  ├─ legalbert_trt/
  │   ├─ 1/model.plan (TensorRT engine)
  │   └─ config.pbtxt
  └─ embeddinggemma_trt/
      ├─ 1/model.plan (TensorRT engine)
      └─ config.pbtxt
     ↓
[Gemma3-Legal Ollama GPU :11434]
```

## 📊 Model Specifications

| Model | Type | Dimensions | Size | Purpose |
|-------|------|-----------|------|---------|
| **LegalBERT** | BERT Encoder | 768-dim | ~400MB | Legal text classification, contextual embeddings |
| **EmbeddingGemma** | Embedding LLM | 384-dim | 621MB | Language detection, semantic embeddings |
| **Gemma3-Legal** | Generative LLM | Variable | 7.3GB | Legal summarization, document analysis |

## 🚀 Quick Start

### Prerequisites

```bash
# Check GPU availability
nvidia-smi

# Verify Docker
docker --version

# Install Python dependencies
pip install transformers torch onnx onnxruntime tritonclient[all]
```

### Step 1: Run Automated Conversion

```bash
cd scripts
node phase28-onnx-to-triton.mjs
```

This script will:
1. ✅ Export LegalBERT from Hugging Face → ONNX
2. ✅ Convert ONNX → TensorRT `.plan` engine
3. ✅ Generate Triton `config.pbtxt` files
4. ✅ Launch Triton Inference Server (Docker)
5. ✅ Verify health endpoints
6. ✅ Generate Python FastAPI synthesizer

### Step 2: Verify Triton Deployment

```bash
# Check Triton health
curl http://localhost:8000/v2/health/ready

# List available models
curl http://localhost:8000/v2/models

# Check specific model
curl http://localhost:8000/v2/models/legalbert_trt/ready
```

Expected response:
```json
{
  "name": "legalbert_trt",
  "ready": true
}
```

### Step 3: Start Python Synthesizer

```bash
cd python-synthesizer
pip install -r requirements.txt
python3 main.py
```

The synthesizer will start on `http://localhost:8003`

### Step 4: Test End-to-End

```bash
# Test language extraction
curl -X POST http://localhost:5173/api/ai/extract-languages \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a legal contract entre deux parties"}'

# Test summarization
curl -X POST http://localhost:5173/api/ai/summarize-simple \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Long legal document...",
    "model": "gemma3-legal:latest",
    "maxLength": 500,
    "format": "bullets"
  }'
```

## 🔧 Manual Conversion Steps

If you prefer manual control over the conversion process:

### 1. Export LegalBERT to ONNX

```python
from transformers import AutoTokenizer, AutoModel
import torch

model_name = "nlpaueb/legal-bert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)
model.eval()

# Dummy input
dummy_input = tokenizer(
    "Sample legal text",
    return_tensors="pt",
    padding=True,
    truncation=True,
    max_length=512
)

# Export
torch.onnx.export(
    model,
    (dummy_input['input_ids'], dummy_input['attention_mask']),
    "onnx-exports/legalbert/model.onnx",
    input_names=['input_ids', 'attention_mask'],
    output_names=['last_hidden_state', 'pooler_output'],
    dynamic_axes={
        'input_ids': {0: 'batch_size', 1: 'sequence'},
        'attention_mask': {0: 'batch_size', 1: 'sequence'},
        'last_hidden_state': {0: 'batch_size', 1: 'sequence'},
        'pooler_output': {0: 'batch_size'}
    },
    opset_version=14
)
```

### 2. Convert ONNX to TensorRT

```bash
trtexec \
    --onnx=onnx-exports/legalbert/model.onnx \
    --saveEngine=triton-models/legalbert_trt/1/model.plan \
    --fp16 \
    --workspace=4096 \
    --minShapes=input_ids:1x1,attention_mask:1x1 \
    --optShapes=input_ids:8x512,attention_mask:8x512 \
    --maxShapes=input_ids:32x512,attention_mask:32x512 \
    --verbose
```

### 3. Create Triton Config

Create `triton-models/legalbert_trt/config.pbtxt`:

```protobuf
name: "legalbert_trt"
platform: "tensorrt_plan"
max_batch_size: 32

input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  },
  {
    name: "attention_mask"
    data_type: TYPE_INT32
    dims: [ -1 ]
  }
]

output [
  {
    name: "last_hidden_state"
    data_type: TYPE_FP16
    dims: [ -1, 768 ]
  },
  {
    name: "pooler_output"
    data_type: TYPE_FP16
    dims: [ 768 ]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
  }
]

dynamic_batching {
  preferred_batch_size: [ 4, 8, 16 ]
  max_queue_delay_microseconds: 100
}
```

### 4. Launch Triton Server

```bash
docker run -d \
    --name legal-ai-triton \
    --gpus all \
    --shm-size=1g \
    --ulimit memlock=-1 \
    --ulimit stack=67108864 \
    -p 8001:8001 \
    -p 8000:8000 \
    -p 8002:8002 \
    -v $(pwd)/triton-models:/models \
    nvcr.io/nvidia/tritonserver:23.10-py3 \
    tritonserver --model-repository=/models --log-verbose=1
```

## 🌐 Transport Protocols

### Layer Communication

| Layer | Protocol | Why |
|-------|----------|-----|
| Triton ⇄ Synthesizer | gRPC | Binary tensors, low-latency, official SDK |
| Synthesizer ⇄ Frontend | HTTP/2 QUIC | Streamed tokens, browser-safe |
| Frontend ⇄ Browser Fallback | WebGPU ANGLE | Offline/demo inference |

### QUIC/WebTransport Support

The Python synthesizer can be configured for QUIC:

```python
# In main.py
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8003,
        http="h3",  # Enable HTTP/3 QUIC
        log_level="info"
    )
```

## 🧪 VS Code Task Integration

### Run svelte-check with AI Summarization

1. Open Command Palette (`Ctrl+Shift+P`)
2. Select "Tasks: Run Task"
3. Choose "📝 Svelte-Check with Log (gemma3-legal summarization)"

This task will:
- Run `svelte-check` and capture output
- Extract languages using `embeddinggemma:latest`
- Summarize errors using `gemma3-legal:latest`
- Save results to `logs/svelte-check-summary-{timestamp}.md`

### Output Format

```markdown
# Svelte-Check Summary
**Generated:** 2025-11-01 14:30:45
**Model:** gemma3-legal:latest
**Languages:** English, TypeScript

## Summary

- Main issue: 247 type errors across 162 files
- Pattern: Missing type annotations in server routes
- Severity: Medium (build succeeds with skipLibCheck)
- Recommendation: Add explicit return types to RequestHandler functions

## Metadata

- **Input Tokens:** 5234
- **Output Tokens:** 342
- **Total Tokens:** 5576
- **Processing Time:** 2341ms
- **Format:** bullets
```

## 🔍 Monitoring & Metrics

### Triton Metrics

```bash
# Prometheus-compatible metrics
curl http://localhost:8002/metrics

# Model statistics
curl http://localhost:8000/v2/models/legalbert_trt/stats
```

### Key Metrics to Watch

- **Inference Latency**: Should be <50ms for LegalBERT
- **Throughput**: Aim for >100 req/sec with dynamic batching
- **GPU Utilization**: Target 70-90% for optimal performance
- **Cache Hit Rate**: Monitor in Redis for repeated queries

## 🐛 Troubleshooting

### Triton Won't Start

```bash
# Check GPU availability
nvidia-smi

# Check Docker logs
docker logs legal-ai-triton

# Verify model files exist
ls -R triton-models/
```

### Model Not Loading

```bash
# Check Triton logs for specific errors
docker logs legal-ai-triton | grep ERROR

# Verify .plan file integrity
ls -lh triton-models/legalbert_trt/1/model.plan

# Test ONNX model first
python -m onnxruntime.tools.verify_onnx onnx-exports/legalbert/model.onnx
```

### Performance Issues

1. **Enable FP16**: Ensure `--fp16` flag in trtexec
2. **Increase Batch Size**: Adjust `max_batch_size` in config.pbtxt
3. **Tune Dynamic Batching**: Modify `preferred_batch_size` array
4. **Check GPU Memory**: Use `nvidia-smi` to monitor VRAM usage

### Ollama Connection Errors

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Check if gemma3-legal is installed
ollama list | grep gemma3-legal

# Pull model if missing
ollama pull gemma3-legal:latest
```

## 📈 Performance Benchmarks

Expected performance on RTX 3060 Ti:

| Operation | Latency | Throughput |
|-----------|---------|------------|
| LegalBERT Inference | 15-30ms | 150 req/sec |
| EmbeddingGemma | 10-20ms | 200 req/sec |
| Gemma3-Legal Summary | 2-5s | 2 req/sec |
| End-to-End Pipeline | 3-6s | 1.5 req/sec |

## 🔐 Security Considerations

1. **API Authentication**: Add JWT/OAuth to synthesizer endpoints
2. **Rate Limiting**: Implement per-user request limits
3. **Input Validation**: Sanitize all text inputs
4. **Model Isolation**: Run Triton in isolated network namespace
5. **Log Redaction**: Remove sensitive data from logs

## 🚦 Production Deployment

### Docker Compose Setup

```yaml
version: '3.8'
services:
  triton:
    image: nvcr.io/nvidia/tritonserver:23.10-py3
    runtime: nvidia
    ports:
      - "8000:8000"
      - "8001:8001"
      - "8002:8002"
    volumes:
      - ./triton-models:/models
    command: tritonserver --model-repository=/models

  synthesizer:
    build: ./python-synthesizer
    ports:
      - "8003:8003"
    depends_on:
      - triton
    environment:
      - TRITON_URL=triton:8001
      - OLLAMA_URL=http://ollama:11434

  ollama:
    image: ollama/ollama:latest
    runtime: nvidia
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

volumes:
  ollama-data:
```

### Kubernetes Deployment

See `k8s/` directory for Helm charts and deployment manifests.

## 📚 Additional Resources

- [Triton Inference Server Docs](https://docs.nvidia.com/deeplearning/triton-inference-server/)
- [TensorRT Documentation](https://docs.nvidia.com/deeplearning/tensorrt/)
- [LegalBERT Paper](https://arxiv.org/abs/2010.02559)
- [Gemma Model Card](https://ai.google.dev/gemma)

## 🤝 Contributing

See `CONTRIBUTING.md` for guidelines on submitting improvements.

## 📄 License

See `LICENSE` file for details.
