# TensorRT-LLM Google Colab Conversion Guide

## Quick Setup (Minimal Tokens)

### 1. Colab Environment
```bash
# Install TensorRT-LLM
!pip install tensorrt-llm==1.1.0rc5 --extra-index-url https://pypi.nvidia.com
!pip install safetensors transformers torch
```

### 2. Upload Model Files
**Option A: Unsloth Sharded Model (Recommended)**
Upload to Colab via Drive mount:
- `model_unsloth_hf_f16/model-00001-of-00005.safetensors` (4.6GB)
- `model_unsloth_hf_f16/model-00002-of-00005.safetensors` (4.6GB)
- `model_unsloth_hf_f16/model-00003-of-00005.safetensors` (4.6GB)
- `model_unsloth_hf_f16/model-00004-of-00005.safetensors` (4.6GB)
- `model_unsloth_hf_f16/model-00005-of-00005.safetensors` (4.3GB)
- `model_unsloth_hf_f16/config.json` + tokenizer files

**Option B: Complete Merged Model**
- `gemma3_complete/rank0.safetensors` (19GB single file)

### 3. Conversion Script
**Option A: Load Sharded Model**
```python
from safetensors.torch import load_file, save_file
import torch, json, os
from collections import OrderedDict

# Load all shards
all_data = OrderedDict()
shards = [
    "/content/drive/MyDrive/model_unsloth_hf_f16/model-00001-of-00005.safetensors",
    "/content/drive/MyDrive/model_unsloth_hf_f16/model-00002-of-00005.safetensors",
    "/content/drive/MyDrive/model_unsloth_hf_f16/model-00003-of-00005.safetensors",
    "/content/drive/MyDrive/model_unsloth_hf_f16/model-00004-of-00005.safetensors",
    "/content/drive/MyDrive/model_unsloth_hf_f16/model-00005-of-00005.safetensors"
]

for shard in shards:
    shard_data = load_file(shard)
    all_data.update(shard_data)
    print(f"Loaded {len(shard_data)} tensors from {shard.split('/')[-1]}")

data = all_data
print(f"Total tensors loaded: {len(data)}")
```

**Option B: Load Single File**
```python
from safetensors.torch import load_file, save_file
import torch, json, os

# Load complete model
data = load_file("/content/drive/MyDrive/gemma3_complete/rank0.safetensors")

# Convert tensors (HF → TensorRT)
trt_weights = {}

# Embeddings
trt_weights["transformer.vocab_embedding.weight"] = data["language_model.model.embed_tokens.weight"]
trt_weights["transformer.ln_f.weight"] = data["language_model.model.norm.weight"]

# Convert 48 layers
for i in range(48):
    hf_prefix = f"language_model.model.layers.{i}"
    trt_prefix = f"transformer.layers.{i}"

    # Layer norms
    trt_weights[f"{trt_prefix}.input_layernorm.weight"] = data[f"{hf_prefix}.input_layernorm.weight"]
    trt_weights[f"{trt_prefix}.post_layernorm.weight"] = data[f"{hf_prefix}.post_attention_layernorm.weight"]

    # MLP
    trt_weights[f"{trt_prefix}.mlp.gate.weight"] = data[f"{hf_prefix}.mlp.gate_proj.weight"]
    trt_weights[f"{trt_prefix}.mlp.fc.weight"] = data[f"{hf_prefix}.mlp.up_proj.weight"]
    trt_weights[f"{trt_prefix}.mlp.proj.weight"] = data[f"{hf_prefix}.mlp.down_proj.weight"]

    # Attention (combine q,k,v)
    q = data[f"{hf_prefix}.self_attn.q_proj.weight"]
    k = data[f"{hf_prefix}.self_attn.k_proj.weight"]
    v = data[f"{hf_prefix}.self_attn.v_proj.weight"]
    trt_weights[f"{trt_prefix}.attention.qkv.weight"] = torch.cat([q,k,v], dim=0)
    trt_weights[f"{trt_prefix}.attention.dense.weight"] = data[f"{hf_prefix}.self_attn.o_proj.weight"]

# Save checkpoint
os.makedirs("/content/gemma3_tensorrt", exist_ok=True)
save_file(trt_weights, "/content/gemma3_tensorrt/rank0.safetensors")

# Config
config = {
    "architecture": "GemmaForCausalLM",
    "dtype": "float16",
    "hidden_size": 3840,
    "num_hidden_layers": 48,
    "num_attention_heads": 16,
    "num_key_value_heads": 8,
    "vocab_size": 262208
}
with open("/content/gemma3_tensorrt/config.json", "w") as f:
    json.dump(config, f)
```

### 4. Build Engine
```bash
# Build INT4 engine
!trtllm-build \
  --checkpoint_dir /content/gemma3_tensorrt \
  --output_dir /content/gemma3_engine \
  --max_batch_size 2 \
  --max_input_len 2048 \
  --max_seq_len 8192 \
  --gpt_attention_plugin float16 \
  --gemm_plugin float16 \
  --context_fmha enable \
  --weight_only_precision int4
```

### 5. Download Engine
```python
# Zip and download
!zip -r gemma3_engine.zip /content/gemma3_engine
from google.colab import files
files.download("gemma3_engine.zip")
```

## To-Do List

1. **☐ Mount Google Drive** - For model storage (24GB shards OR 19GB single)
2. **☐ Upload model files** - Complete model or shards
3. **☐ Run conversion script** - HF → TensorRT tensor mapping
4. **☐ Build INT4 engine** - trtllm-build command
5. **☐ Download engine** - Zip and transfer to local
6. **☐ Test on RTX 3060 Ti** - Local inference validation

## Expected Results
- **Input**: 19GB HF model
- **Output**: ~2-3GB INT4 TensorRT engine
- **Target**: RTX 3060 Ti deployment
- **Context**: 8k optimized (expandable to 32k)

## Backup Plan
If Colab conversion fails → Continue with **Ollama Q4_K_M** (already working, 2.8GB, 32k context ready)