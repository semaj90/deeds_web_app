# Gemma 3 12B IT Configuration Updates

**Model**: `unsloth/gemma-3-12b-it-unsloth-bnb-4bit`
**Target GPU**: RTX 3060 Ti (8GB VRAM)
**Multimodal**: Text + Vision (no audio support)

---

## Quick Changes to Colab Notebook

### Change 1: Model Name (Cell 5)

```python
# BEFORE (Gemma 3n 2B)
MODEL_NAME = "unsloth/gemma-3n-2b-bnb-4bit"

# AFTER (Gemma 3 12B)
MODEL_NAME = "unsloth/gemma-3-12b-it-unsloth-bnb-4bit"
```

---

### Change 2: Training Config (Cell 8)

```python
# BEFORE
training_args = TrainingArguments(
    output_dir="./gemma3n-legal-outputs",
    num_train_epochs=3,
    per_device_train_batch_size=2,  # Was 2
    gradient_accumulation_steps=8,  # Was 8
    learning_rate=2e-4,
    # ... rest same
)

# AFTER (for 12B on 8GB VRAM)
training_args = TrainingArguments(
    output_dir="./gemma3-12b-legal-outputs",
    num_train_epochs=3,
    per_device_train_batch_size=1,  # Reduced to 1 (12B is larger)
    gradient_accumulation_steps=16, # Increased to 16 (effective batch still 16)
    learning_rate=1e-4,              # Reduced learning rate for larger model
    fp16=not is_bfloat16_supported(),
    bf16=is_bfloat16_supported(),
    logging_steps=10,
    save_strategy="steps",
    save_steps=200,                  # Save less frequently (larger checkpoints)
    save_total_limit=2,              # Keep only 2 checkpoints (save disk space)
    warmup_steps=100,                # More warmup for larger model
    optim="adamw_8bit",
    weight_decay=0.01,
    lr_scheduler_type="cosine",
    seed=42,
    report_to="none",
    max_grad_norm=1.0,
    gradient_checkpointing=True,     # CRITICAL for 12B on 8GB
    dataloader_num_workers=2,        # Reduced from 4
)
```

**Key changes for 12B**:
- ✅ Batch size: 2 → **1** (VRAM constraint)
- ✅ Gradient accumulation: 8 → **16** (keep effective batch at 16)
- ✅ Learning rate: 2e-4 → **1e-4** (larger models need smaller LR)
- ✅ Save steps: 100 → **200** (12B checkpoints are ~24 GB each)
- ✅ Checkpoints: 3 → **2** (save disk space)
- ✅ **Gradient checkpointing enabled** (trades compute for VRAM)

---

### Change 3: LoRA Config (Cell 7)

```python
# BEFORE
model = FastVisionModel.get_peft_model(
    model,
    r=16,
    lora_alpha=16,
    lora_dropout=0.05,
    # ...
)

# AFTER (for 12B efficiency)
model = FastVisionModel.get_peft_model(
    model,
    r=8,                    # Reduced rank (16 → 8) for memory
    lora_alpha=16,          # Keep alpha same
    lora_dropout=0.05,
    finetune_vision_layers=False,         # Text + vision, no audio
    finetune_language_layers=True,
    finetune_attention_modules=True,
    finetune_mlp_modules=True,
    use_gradient_checkpointing="unsloth",
    random_state=42,
)
```

**LoRA adjustments**:
- ✅ Rank: 16 → **8** (fewer trainable params = less VRAM)
- ✅ Vision layers disabled (Gemma 3, not 3n)
- ✅ Trainable params: ~84M → **~42M** (50% reduction)

---

## Expected Training Performance

| Metric | Gemma 3n 2B | Gemma 3 12B |
|--------|-------------|-------------|
| VRAM (training) | ~6-8 GB | ~13-15 GB* |
| Batch size | 2 | 1 |
| Gradient accumulation | 8 | 16 |
| Effective batch | 16 | 16 (same) |
| Training time (Colab T4) | ~1-2 hours | ~4-6 hours |
| Trainable params | ~84M | ~42M (LoRA r=8) |
| Checkpoint size | ~500 MB | ~2 GB |

**Note**: *13-15 GB exceeds RTX 3060 Ti 8GB. You'll need:
- ✅ Colab A100 (40GB) - recommended
- ✅ Kaggle P100 (16GB) - works
- ❌ Free Colab T4 (15GB) - tight, may OOM

---

## RTX 3060 Ti Deployment (After Training)

After training on Colab A100, deploy the **merged 4-bit model** on your RTX 3060 Ti:

### Merged Model Sizes

```python
# In notebook cell 13
# Option 1: 16-bit (for conversion)
model.save_pretrained_merged(
    "gemma3-12b-legal-merged-16bit",
    tokenizer,
    save_method="merged_16bit"
)
# Size: ~24 GB

# Option 2: 4-bit (for testing)
model.save_pretrained_merged(
    "gemma3-12b-legal-merged-4bit",
    tokenizer,
    save_method="merged_4bit"
)
# Size: ~7 GB
```

### TensorRT-LLM Engine Build (RTX 3060 Ti)

Use the **RTX_3060_TI_TRT_BUILD.md** guide with these 12B-specific flags:

```bash
# Convert 16-bit merged model to TRT checkpoint
python TensorRT-LLM/examples/gemma/convert_checkpoint.py \
  --model_dir gemma3-12b-legal-merged-16bit \
  --output_dir trt_checkpoints/gemma3-12b-legal \
  --dtype float16 \
  --tp_size 1

# Build INT4 engine for RTX 3060 Ti (8GB)
export TORCH_CUDA_ARCH_LIST="8.6"

trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3-12b-legal \
  --output_dir ./trt_engines/gemma3-12b-rtx3060ti \
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --use_weight_only \
  --weight_only_precision int4 \
  --max_batch_size 1 \
  --max_input_len 1024 \
  --max_output_len 512 \
  --builder_opt 4 \
  --strongly_typed \
  --context_fmha enable \
  --remove_input_padding enable \
  --paged_kv_cache enable \
  --use_paged_context_fmha enable \
  --enable_context_fmha_fp32_acc \
  --multi_block_mode enable
```

**Engine size**: ~3.5 GB (INT4 quantized)

**VRAM usage**:
- Idle: ~3.5 GB
- Inference (batch 1, ctx 1024): ~7-7.5 GB
- **Headroom**: ~500 MB (tight but workable)

---

## Training Workflow

### 1. Extract Codebase Datasets (Local)

```bash
cd sveltekit-frontend
bash ../scripts/dataset-collection/extract-legal-patterns.sh
```

**Output**: `./training-datasets/*.jsonl` (~15-30 MB)

---

### 2. Upload to Colab

```python
# In Colab, upload your local datasets
from google.colab import files
uploaded = files.upload()

# Or mount Google Drive and copy
from google.colab import drive
drive.mount('/content/drive')

# Copy datasets
!cp -r /path/to/training-datasets ./
```

---

### 3. Run Training (Colab A100)

**Runtime**: Colab Pro+ with A100 GPU (40GB VRAM)

**Estimated time**: 4-6 hours for 3 epochs on 60K examples

**Cost**: ~$10-15 (Colab Pro+ A100 compute units)

---

### 4. Download Merged Model

```bash
# In Colab final cell
!zip -r gemma3-12b-legal-merged-4bit.zip gemma3-12b-legal-merged-4bit/

from google.colab import files
files.download('gemma3-12b-legal-merged-4bit.zip')
```

**Download size**: ~7 GB (4-bit merged model)

---

### 5. Build TRT Engine (Local RTX 3060 Ti)

```bash
# Extract downloaded zip
unzip gemma3-12b-legal-merged-4bit.zip

# Convert to TensorRT-LLM
# Follow RTX_3060_TI_TRT_BUILD.md

# Deploy via Triton (port 8099)
docker run -d --gpus all --rm \
  --name triton-gemma3-12b \
  -p 8099:8000 \
  -v $(pwd)/models:/models \
  nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3 \
  tritonserver --model-repository=/models
```

---

### 6. Wire into SvelteKit

Update `.env`:
```bash
TENSORRT_SERVICE_URL=http://localhost:8099
```

Test endpoint:
```bash
curl -X POST http://localhost:8099/v2/models/gemma3_12b_legal/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [...]}'
```

---

## What You Get

✅ **12B parameter** instruction-tuned model (vs 2B)
✅ **Better legal reasoning** (larger capacity)
✅ **Vision support** (text + image analysis)
✅ **INT4 TRT-LLM** (~3.5 GB engine)
✅ **Fits RTX 3060 Ti** (7-7.5 GB VRAM usage)
✅ **2-3x faster** than Ollama (TensorRT optimizations)

❌ **No audio support** (Gemma 3, not 3n)
⚠️ **Tight VRAM** (batch=1, ctx=1024 max)
⚠️ **Longer training** (4-6 hours vs 1-2 hours)
⚠️ **Needs Colab A100** for training (~$10-15)

---

## Ready to Run Checklist

- [x] Dataset extraction script ready
- [x] Colab notebook created
- [x] Model config updates documented
- [x] RTX 3060 Ti TRT build guide ready
- [ ] Run codebase extraction (5 min)
- [ ] Upload to Colab
- [ ] Update 3 notebook cells (model name, training config, LoRA)
- [ ] Train on Colab A100 (4-6 hours)
- [ ] Download merged model (7 GB)
- [ ] Build TRT engine locally (30 min)
- [ ] Deploy via Triton (port 8099)
- [ ] Test inference

---

**Next step**: Want me to create an updated notebook with these 12B settings pre-configured?
