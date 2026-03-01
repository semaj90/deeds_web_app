# Optimal Training (A100) → Deployment (RTX 3060 Ti) Configuration

**Hardware Path**: Colab A100 (SM 8.0, 40GB) → Local RTX 3060 Ti (SM 8.6, 8GB)

---

## Part 1: A100 Training Optimizations (Colab)

### Hardware-Specific Features

**A100 Advantages**:
- **SM 8.0** architecture (Ampere generation)
- **BF16** native support (better numerical stability than FP16)
- **3rd Gen Tensor Cores** (sparsity support, FP64 tensor ops)
- **40 GB HBM2e** (high bandwidth memory)
- **FlashAttention-2** compatible (built into Unsloth)

### Optimal Training Config (Cell 9)

```python
from transformers import TrainingArguments
from unsloth import is_bfloat16_supported

training_args = TrainingArguments(
    output_dir="./gemma3-12b-legal-outputs",
    num_train_epochs=3,

    # Memory optimizations for 12B
    per_device_train_batch_size=1,        # Max for 12B on A100
    gradient_accumulation_steps=16,       # Effective batch = 16
    gradient_checkpointing=True,          # CRITICAL for 12B
    gradient_checkpointing_kwargs={"use_reentrant": False},  # PyTorch 2.0+ optimization

    # A100-specific: Use BF16 (better than FP16 on A100)
    fp16=False,                           # Disable FP16
    bf16=True,                            # Enable BF16 (A100 native)
    bf16_full_eval=True,                  # BF16 for evaluation too

    # Learning rate
    learning_rate=1e-4,                   # Conservative for 12B
    lr_scheduler_type="cosine",
    warmup_steps=100,

    # Optimizer (8-bit AdamW for memory efficiency)
    optim="adamw_8bit",
    weight_decay=0.01,
    max_grad_norm=1.0,

    # Logging and checkpointing
    logging_steps=10,
    save_strategy="steps",
    save_steps=200,                       # 12B checkpoints are ~24 GB
    save_total_limit=2,                   # Keep only 2 checkpoints

    # Performance
    dataloader_num_workers=4,             # A100 has PCIe Gen4
    dataloader_pin_memory=True,           # Faster CPU→GPU transfers
    group_by_length=True,                 # Pack similar-length samples

    # Misc
    seed=42,
    report_to="none",
    remove_unused_columns=False,          # Keep vision columns
)
```

**Key A100 optimizations**:
- ✅ **BF16 instead of FP16** - A100 has native BF16 Tensor Cores (better range than FP16, no overflow)
- ✅ **`use_reentrant=False`** - PyTorch 2.0+ gradient checkpointing optimization
- ✅ **`dataloader_pin_memory=True`** - A100 has fast PCIe Gen4
- ✅ **`group_by_length=True`** - Reduces padding waste (better GPU utilization)

### LoRA Config (Cell 7)

```python
from unsloth import FastVisionModel

model = FastVisionModel.get_peft_model(
    model,
    r=8,                                  # Reduced for 12B (memory)
    lora_alpha=16,                        # Keep 2x rank
    lora_dropout=0.05,

    # Layer selection (Gemma 3, not 3n)
    finetune_vision_layers=False,         # Text + vision, no audio
    finetune_language_layers=True,
    finetune_attention_modules=True,
    finetune_mlp_modules=True,

    # A100 optimization
    use_gradient_checkpointing="unsloth", # Unsloth's optimized checkpointing
    random_state=42,

    # Target modules (expand for better legal understanding)
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",  # Attention
        "gate_proj", "up_proj", "down_proj",     # MLP
    ],

    # Rank stabilization
    use_rslora=True,                      # Rank-stabilized LoRA (better convergence)
)
```

**New optimizations**:
- ✅ **`use_rslora=True`** - Rank-stabilized LoRA (prevents rank collapse in large models)
- ✅ **Expanded target_modules** - More comprehensive coverage

---

## Part 2: RTX 3060 Ti Deployment Optimizations

### Hardware-Specific Features

**RTX 3060 Ti Advantages**:
- **SM 8.6** architecture (Ampere, newer than A100's SM 8.0)
- **2nd Gen RT Cores** (ray tracing, not used for LLM)
- **3rd Gen Tensor Cores** (INT8/INT4/binary precision)
- **8 GB GDDR6** (tight but workable with INT4)
- **PCIe 4.0** (fast host transfers)

### TensorRT-LLM Build (Modular PTX Approach)

**Step 1: Convert to TRT Checkpoint**

```bash
cd /path/to/TensorRT-LLM

# Use FP16 for conversion (best compatibility)
python examples/gemma/convert_checkpoint.py \
  --model_dir gemma3-12b-legal-merged-16bit \
  --output_dir trt_checkpoints/gemma3-12b-legal \
  --dtype float16 \
  --tp_size 1 \
  --pp_size 1
```

**Step 2: Modular PTX Build (SM 8.6)**

```bash
# Critical: Set exact compute capability
export TORCH_CUDA_ARCH_LIST="8.6"
export CUDA_VISIBLE_DEVICES=0

# PTX flags for modular compilation
export NVCC_APPEND_FLAGS="-gencode=arch=compute_86,code=[sm_86,compute_86]"
export TRT_LLM_EXTRA_BUILD_FLAGS="--use_fused_mlp --use_gemm_woq_plugin"

trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3-12b-legal \
  --output_dir ./trt_engines/gemma3-12b-rtx3060ti-ptx \
  \
  # Precision (INT4 for 8GB VRAM)
  --use_weight_only \
  --weight_only_precision int4 \
  --int8_kv_cache \
  \
  # Plugins (FP16 on Ampere Tensor Cores)
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --gemm_swiglu_plugin float16 \
  \
  # Context limits (conservative for 8GB)
  --max_batch_size 1 \
  --max_input_len 1024 \
  --max_output_len 512 \
  --max_beam_width 1 \
  \
  # Attention optimizations (Ampere-specific)
  --context_fmha enable \
  --context_fmha_fp32_acc enable \
  --enable_context_fmha_fp32_acc \
  --paged_kv_cache enable \
  --use_paged_context_fmha enable \
  --remove_input_padding enable \
  \
  # Multi-block mode (Ampere SM 8.6)
  --multi_block_mode enable \
  --enable_xqa enable \
  \
  # PTX/SASS optimizations
  --builder_opt 4 \
  --strongly_typed \
  --max_num_tokens 2048 \
  \
  # Profiling and tuning
  --use_custom_all_reduce disable \
  --gather_all_token_logits \
  --workers 1
```

**New PTX/Ampere flags**:
- ✅ **`--int8_kv_cache`** - INT8 KV cache (saves ~30% VRAM)
- ✅ **`--gemm_swiglu_plugin`** - Fused SwiGLU activation (Gemma uses SwiGLU)
- ✅ **`--enable_xqa`** - Multi-query attention optimization (Ampere)
- ✅ **`--max_num_tokens 2048`** - Token budget for paged attention
- ✅ **`NVCC_APPEND_FLAGS`** - Force PTX compilation for SM 8.6
- ✅ **`TRT_LLM_EXTRA_BUILD_FLAGS`** - Fused MLP + GEMM plugins

**Step 3: Verify Engine**

```bash
# Check engine metadata
python -c "
from tensorrt_llm._utils import trt_dtype_to_str
import tensorrt as trt
logger = trt.Logger(trt.Logger.INFO)
with open('./trt_engines/gemma3-12b-rtx3060ti-ptx/rank0.engine', 'rb') as f:
    engine = trt.Runtime(logger).deserialize_cuda_engine(f.read())
    print(f'Engine device memory: {engine.device_memory_size / (1024**3):.2f} GB')
"

# Run test inference
python examples/run.py \
  --engine_dir ./trt_engines/gemma3-12b-rtx3060ti-ptx \
  --max_output_len 256 \
  --input_text "Analyze this legal evidence for admissibility under Federal Rules of Evidence 401-403"
```

---

## Part 3: Performance Comparison

| Metric | A100 Training | RTX 3060 Ti Inference | Notes |
|--------|---------------|----------------------|-------|
| **Architecture** | SM 8.0 (Ampere) | SM 8.6 (Ampere refresh) | RTX has newer SM |
| **VRAM** | 40 GB HBM2e | 8 GB GDDR6 | 5x difference |
| **Precision** | BF16 (training) | INT4 (inference) | Quantization post-training |
| **Tensor Cores** | 3rd Gen | 3rd Gen | Same generation |
| **Throughput** | ~500 samples/hour | ~40-60 tokens/sec | Different workloads |
| **VRAM Usage** | ~15-18 GB | ~7-7.5 GB | Gradient checkpointing vs INT4 |
| **Power** | 400W TDP | 200W TDP | RTX more efficient |

---

## Part 4: Expected VRAM Breakdown (RTX 3060 Ti)

```
Model weights (INT4):        ~3.5 GB
KV cache (INT8, ctx=1024):   ~1.2 GB
Activation buffers:          ~0.8 GB
CUDA context + TRT runtime:  ~0.5 GB
Paged attention overhead:    ~0.3 GB
System reserve:              ~1.2 GB
--------------------------------
Total:                       ~7.5 GB (fits in 8GB)
```

**Headroom**: ~500 MB (tight but safe)

---

## Part 5: Validation Checklist

### A100 Training Validation

```bash
# Check BF16 is enabled (in Colab)
python -c "import torch; print('BF16 supported:', torch.cuda.is_bf16_supported())"
# Expected: True on A100

# Check Tensor Core usage
nvidia-smi dmon -s u
# Expected: >80% GPU utilization during training
```

### RTX 3060 Ti Deployment Validation

```bash
# Verify SM 8.6 compilation
strings trt_engines/gemma3-12b-rtx3060ti-ptx/rank0.engine | grep "sm_86"
# Should see PTX code for SM 8.6

# Check VRAM usage during inference
nvidia-smi --query-gpu=memory.used --format=csv --loop=1
# Expected: ~7.5 GB peak

# Benchmark throughput
python examples/benchmark.py \
  --engine_dir ./trt_engines/gemma3-12b-rtx3060ti-ptx \
  --batch_size 1 \
  --input_len 512 \
  --output_len 256
# Expected: 40-60 tokens/sec
```

---

## Part 6: What You Get

### Training Benefits (A100)
✅ **BF16 native** - Better numerical stability than FP16
✅ **Gradient checkpointing** - Fits 12B in 40GB
✅ **Rank-stabilized LoRA** - Better convergence
✅ **Group-by-length** - Less padding waste
✅ **4-6 hours** - Faster than T4 (10-15 hours)

### Deployment Benefits (RTX 3060 Ti)
✅ **INT4 + INT8 KV cache** - Fits in 8GB VRAM
✅ **PTX-optimized for SM 8.6** - Max performance
✅ **Fused kernels** - SwiGLU, multi-block attention
✅ **40-60 tokens/sec** - 2-3x faster than Ollama
✅ **Local inference** - No cloud costs

### Trade-offs
⚠️ **Tight VRAM** (batch=1, ctx=1024 max)
⚠️ **Needs Colab A100** (~$10-15 for training)
⚠️ **Local build time** (~30 min TRT compilation)

---

## Part 7: Updated Workflow

```bash
# 1. Train on Colab A100 (use BF16, rank-stabilized LoRA)
# 2. Download 16-bit merged model (~24 GB)
# 3. Convert to TRT checkpoint (FP16 intermediate)
# 4. Build PTX-optimized INT4 engine for SM 8.6
# 5. Deploy on RTX 3060 Ti with INT8 KV cache
# 6. Wire into SvelteKit via port 8099
```

**Total cost**: ~$10-15 (one-time Colab training)
**Local performance**: 40-60 tokens/sec, 7.5 GB VRAM

---

## Summary of New Optimizations

### Training (A100)
1. **BF16 instead of FP16** - Native A100 support
2. **`use_reentrant=False`** - PyTorch 2.0+ optimization
3. **Rank-stabilized LoRA** - Better convergence
4. **Group-by-length** - Less padding
5. **Pinned memory** - Faster data loading

### Deployment (RTX 3060 Ti)
6. **INT8 KV cache** - Save ~1 GB VRAM
7. **Fused SwiGLU plugin** - Faster activations
8. **XQA (multi-query attention)** - Ampere optimization
9. **PTX flags for SM 8.6** - Exact architecture targeting
10. **Multi-block mode** - Better parallelism

These optimizations should give you **~10-15% better training speed** on A100 and **~20-30% better inference throughput** on RTX 3060 Ti compared to baseline.
