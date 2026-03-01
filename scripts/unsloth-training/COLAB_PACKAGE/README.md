# Gemma 3 12B Legal AI - Colab Training Package

**Complete training package** for Google Colab A100 → RTX 3060 Ti deployment

---

## 📦 Package Contents

### 1️⃣ **Main Notebook**
- `Gemma3_12B_Legal_Production.ipynb` - Production training notebook with A100 optimizations

### 2️⃣ **Training Data** (697 examples, ~97 KB)
```
training-datasets/
├── entity-patterns.jsonl      (3.6 KB)
├── evidence-patterns.jsonl    (10 KB)
├── forensic-patterns.jsonl    (1 KB)
├── legal-keywords.jsonl       (6.9 KB)
├── rag-context.jsonl          (11 KB)
├── schema-patterns.jsonl      (386 bytes)
└── svelte5-patterns.jsonl     (54 KB)
```

### 3️⃣ **Documentation**
- `INTEGRATION_GUIDE.md` - **START HERE** - Step-by-step integration
- `MEGA_DATASET_EXPANSION.md` - 27 additional datasets (224K examples)
- `ADDITIONAL_DATASETS.md` - 12 vision/tools/code datasets
- `STACK_OPTIMIZATIONS.md` - End-to-end pipeline optimizations
- `OPTIMAL_A100_TO_RTX3060TI.md` - Training + deployment guide
- `RTX_3060_TI_TRT_BUILD.md` - TensorRT-LLM build instructions
- `GEMMA3_12B_UPDATES.md` - 12B-specific config changes

### 4️⃣ **Utility Scripts**
- `extract-legal-patterns.sh` - Extract more datasets from your codebase
- `video-to-frames.py` - Video frame extraction for analysis

---

## 🚀 Quick Start (3 Steps)

### **Step 1: Upload to Google Drive**

1. Download this entire `COLAB_PACKAGE` folder as ZIP
2. Upload `COLAB_PACKAGE.zip` to your Google Drive
3. Unzip in Google Drive

**OR** upload files directly:
- Required: `Gemma3_12B_Legal_Production.ipynb`
- Required: `training-datasets/` folder (all 7 .jsonl files)
- Optional: Documentation (for reference)

---

### **Step 2: Open in Colab**

1. Go to https://colab.research.google.com/
2. File → Open notebook
3. Navigate to your Google Drive
4. Select `Gemma3_12B_Legal_Production.ipynb`

**OR** upload directly to Colab:
1. Go to https://colab.research.google.com/
2. File → Upload notebook
3. Select `Gemma3_12B_Legal_Production.ipynb` from your computer

---

### **Step 3: Run Training**

1. **Change Runtime**:
   - Runtime → Change runtime type
   - Hardware accelerator: **GPU**
   - GPU type: **A100** (requires Colab Pro+)
   - Click **Save**

2. **Run Cells 1-8**: Install + load HuggingFace datasets (auto-download)

3. **Upload Your Datasets at Cell 9**:
   - Run Cell 9
   - When file picker appears, select all 7 files from `training-datasets/`
   - OR mount Google Drive and load from there:
     ```python
     from google.colab import drive
     drive.mount('/content/drive')

     # Load from Drive
     import json
     codebase_patterns = []
     for file in Path('/content/drive/MyDrive/COLAB_PACKAGE/training-datasets').glob('*.jsonl'):
         with open(file) as f:
             for line in f:
                 codebase_patterns.append(json.loads(line))
     ```

4. **Run Cells 10-23**: Training starts (3.5-5 hours on A100)

5. **Download Model** (Cell 29-31):
   - 4-bit merged model: ~7 GB
   - 16-bit merged model: ~24 GB (optional, for TRT conversion)

---

## 📊 Training Configuration

**Model**: Gemma 3 12B IT (text + vision, no audio)

**Optimizations**:
- ✅ BF16 precision (A100 native)
- ✅ Rank-stabilized LoRA (r=8)
- ✅ Gradient checkpointing (PyTorch 2.0+)
- ✅ Group-by-length batching
- ✅ Pinned memory (PCIe Gen4)

**Dataset**:
- 60K HuggingFace legal datasets (auto-download)
- 697 codebase patterns (you upload)
- Total: ~60,697 examples

**Training Time**: 3.5-5 hours on A100

**Cost**: ~$10-15 (Colab Pro+ compute units)

**Output**: 7 GB merged model (INT4) for RTX 3060 Ti

---

## 🎯 After Training (Local Deployment)

### Download from Colab
```python
# Cell 31 - Download merged model
from google.colab import files
files.download('gemma3-12b-legal-merged-4bit.zip')
```

### Build TensorRT Engine (Local)
```bash
# See RTX_3060_TI_TRT_BUILD.md for full instructions

# 1. Unzip model
unzip gemma3-12b-legal-merged-4bit.zip

# 2. Convert to TRT checkpoint
export TORCH_CUDA_ARCH_LIST="8.6"
python TensorRT-LLM/examples/gemma/convert_checkpoint.py \
  --model_dir gemma3-12b-legal-merged-16bit \
  --output_dir trt_checkpoints/gemma3-12b-legal \
  --dtype float16

# 3. Build INT4 engine with optimizations
trtllm-build \
  --checkpoint_dir trt_checkpoints/gemma3-12b-legal \
  --output_dir trt_engines/gemma3-12b-rtx3060ti \
  --use_weight_only --weight_only_precision int4 \
  --int8_kv_cache \
  --gemm_swiglu_plugin float16 \
  --enable_xqa enable \
  --max_batch_size 1 --max_input_len 1024 \
  # ... (see RTX_3060_TI_TRT_BUILD.md for full command)

# 4. Deploy via Triton
docker run -d --gpus all -p 8099:8000 \
  -v $(pwd)/models:/models \
  nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3 \
  tritonserver --model-repository=/models
```

### Update SvelteKit
```bash
# .env
TENSORRT_SERVICE_URL=http://localhost:8099
```

**Expected**:
- VRAM: 6.8 GB (fits RTX 3060 Ti 8GB)
- Throughput: 50-75 tokens/sec
- Latency: ~50ms first token

---

## 📚 Documentation Roadmap

**START HERE**:
1. `README.md` (this file) - Package overview
2. `INTEGRATION_GUIDE.md` - Step-by-step integration

**EXPAND TRAINING**:
3. `ADDITIONAL_DATASETS.md` - 12 datasets (vision, tools, code)
4. `MEGA_DATASET_EXPANSION.md` - 27 datasets (full tech stack)

**OPTIMIZE INFERENCE**:
5. `STACK_OPTIMIZATIONS.md` - End-to-end pipeline optimizations
6. `OPTIMAL_A100_TO_RTX3060TI.md` - Training + deployment optimizations

**DEPLOYMENT**:
7. `RTX_3060_TI_TRT_BUILD.md` - TensorRT build instructions
8. `GEMMA3_12B_UPDATES.md` - 12B-specific changes

---

## 🎁 Bonus: Add More Datasets

### Option 1: Re-extract from your codebase
```bash
# Run locally (not in Colab)
cd sveltekit-frontend
bash ../COLAB_PACKAGE/extract-legal-patterns.sh

# Upload new .jsonl files to Colab at Cell 9
```

### Option 2: Add HuggingFace datasets
```python
# Add Cell 7.5 in notebook (see MEGA_DATASET_EXPANSION.md)
# Example: Add vision + tools + code
m3it = load_dataset("MMInstruction/M3IT", split="train[:20000]")
hermes = load_dataset("NousResearch/hermes-function-calling-v1", split="train[:5000]")
code = load_dataset("HuggingFaceH4/CodeAlpaca_20K", split="train")

# Combine with existing
legal_dataset = concatenate_datasets([legal_dataset, m3it, hermes, code])
```

**See**: `MEGA_DATASET_EXPANSION.md` for 27 curated datasets

---

## 🆘 Troubleshooting

### Issue: "Not enough VRAM"
**Solution**: You're not on A100. Switch runtime:
- Runtime → Change runtime type → A100 GPU

### Issue: "Can't upload files"
**Solution**: Mount Google Drive instead:
```python
from google.colab import drive
drive.mount('/content/drive')

# Load from Drive path
```

### Issue: "Training too slow"
**Check**:
```python
# Verify A100
!nvidia-smi
# Should show: NVIDIA A100-SXM4-40GB

# Check BF16
print(f"BF16 supported: {is_bfloat16_supported()}")
# Should be: True
```

### Issue: "Download failed"
**Solution**: Use Google Drive sync instead of direct download:
```python
# Cell 31 - Copy to Drive instead of download
!cp gemma3-12b-legal-merged-4bit.zip /content/drive/MyDrive/
```

---

## 📊 Expected Results

**Training Metrics**:
- Loss: Should decrease from ~2.5 to ~0.8-1.2
- Perplexity: Should drop consistently
- Samples/sec: ~10-15 on A100
- VRAM usage: ~15-18 GB (A100 40GB has headroom)

**Post-Training (RTX 3060 Ti)**:
- Engine size: ~3.5 GB (INT4)
- VRAM usage: ~6.8 GB (with INT8 KV cache)
- Inference speed: 50-75 tokens/sec
- Quality: Should match or exceed Ollama gemma3-legal

---

## 🎓 Learning Resources

**Gemma 3 Documentation**:
- [Official Gemma 3 Docs](https://ai.google.dev/gemma/docs/core)
- [Unsloth Training Guide](https://github.com/unslothai/unsloth)
- [HuggingFace Transformers](https://huggingface.co/docs/transformers)

**TensorRT-LLM**:
- [TensorRT-LLM GitHub](https://github.com/NVIDIA/TensorRT-LLM)
- [Triton Inference Server](https://github.com/triton-inference-server)

**Legal AI**:
- [Pile of Law Dataset](https://huggingface.co/datasets/pile-of-law/pile-of-law)
- [LexGLUE Benchmark](https://huggingface.co/datasets/lex_glue)

---

## Summary

✅ **Complete Colab package** - everything in one place
✅ **Production notebook** - A100 optimized, ready to run
✅ **697 training examples** - your codebase patterns
✅ **8 documentation files** - comprehensive guides
✅ **2 utility scripts** - dataset extraction + video analysis
✅ **RTX 3060 Ti deployment** - full build instructions

**Total package size**: ~100 KB (training data) + ~500 KB (docs) = **~600 KB**

**Easy to zip, upload to Google Drive, and use in Colab!**

---

## Next Steps

1. ✅ Zip this `COLAB_PACKAGE` folder
2. ✅ Upload to Google Drive
3. ✅ Open notebook in Colab
4. ✅ Switch to A100 GPU
5. ✅ Run training (3.5-5 hours)
6. ✅ Download merged model
7. ✅ Build TRT engine locally
8. ✅ Deploy via Triton (port 8099)

**Happy Training!** 🚀
