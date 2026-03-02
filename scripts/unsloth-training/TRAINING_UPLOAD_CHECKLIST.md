# Gemma 3 12B Legal AI - Training Upload Checklist

**Date**: March 1, 2026
**Notebook**: Gemma3_12B_Legal_Production.ipynb
**Status**: ✅ READY TO UPLOAD

---

## 📦 Pre-Upload Verification

### ✅ **Files Ready**
- [x] Gemma3_12B_Legal_Production.ipynb (41KB, 32 cells)
- [x] training-datasets/ (26 JSONL files, 4.7MB, 6,245 examples)
- [x] Documentation (10 MD files for reference)
- [x] Extract script (extract-legal-patterns.sh)

### ✅ **Notebook Features**
- [x] Unsloth installation + PIL/google cleanup
- [x] wandb cloud backup (enabled by default)
- [x] 8 HuggingFace datasets (legal + **Svelte 5**)
- [x] Google Drive auto-mount + codebase loading
- [x] ShareGPT standardization
- [x] Instruction masking (train_on_responses_only)
- [x] Masking verification (row 100 with ✅/❌ labels)
- [x] Resume from checkpoint capability
- [x] Safetensor shards + merge script
- [x] Google Drive save + direct download

---

## 🚀 **Upload Steps (10 Minutes)**

### **Step 1: Create ZIP Package**

```bash
cd /c/Users/james/Videos/deeds-web-app/scripts/unsloth-training

# Create ZIP (skip old datasets)
zip -r COLAB_PACKAGE.zip COLAB_PACKAGE/ \
  -x "COLAB_PACKAGE/training-datasets-old/*"

# Verify size
du -sh COLAB_PACKAGE.zip
# Expected: ~5-8 MB
```

### **Step 2: Upload to Google Drive**

1. Open https://drive.google.com/
2. Navigate to **My Drive**
3. Click **New** → **Folder upload** OR drag-drop the ZIP
4. Upload `COLAB_PACKAGE.zip`
5. Wait for upload (5-8MB, ~1-2 minutes on fast internet)

### **Step 3: Unzip in Google Drive**

**Option A: Unzip in Colab (Recommended)**
```python
# In Colab Cell 1 (before notebook cells):
from google.colab import drive
drive.mount('/content/drive')

!unzip -q /content/drive/MyDrive/COLAB_PACKAGE.zip -d /content/
!ls -lh /content/COLAB_PACKAGE/
```

**Option B: Unzip locally, upload folder**
```bash
# Local machine
unzip COLAB_PACKAGE.zip
# Then upload entire COLAB_PACKAGE/ folder to Drive
# (slower: 26 files vs 1 ZIP)
```

### **Step 4: Open Notebook in Colab**

1. In Google Drive, navigate to `COLAB_PACKAGE/`
2. Right-click `Gemma3_12B_Legal_Production.ipynb`
3. **Open with** → **Google Colaboratory**
4. (If "Google Colaboratory" isn't listed, install it from Workspace Marketplace)

### **Step 5: Select A100 GPU**

1. In Colab: **Runtime** → **Change runtime type**
2. **Hardware accelerator**: GPU
3. **GPU type**: **A100** (requires Colab Pro+)
4. Click **Save**

**Verify GPU:**
```python
# Run in Colab cell:
!nvidia-smi

# Expected output:
# | NVIDIA A100-SXM4-40GB | ... | 40GB |
```

---

## ▶️ **Training Execution (4-6 Hours)**

### **Step 6: Run All Cells**

**Method A: Run All (Recommended)**
- **Runtime** → **Run all**
- Notebook will execute all 32 cells sequentially
- Progress shown in left sidebar

**Method B: Run Manually (Debugging)**
- Click each cell, press **Shift+Enter**
- Review output before proceeding
- Useful if you want to verify each step

### **Step 7: Monitor Progress**

**Key Checkpoints:**

| Cell | Checkpoint | Time | What to Verify |
|------|-----------|------|----------------|
| 2 | Install packages | ~5 min | "✅ Unsloth installed" |
| 7 | Load datasets | ~10 min | "✅ 62,847 examples" |
| 9 | Mount Drive | ~1 min | "Drive already mounted" |
| 13 | Format data | ~3 min | "✅ ShareGPT format standardized" |
| 15 | Load model | ~2 min | "✅ Chat template configured: Gemma 3" |
| 17 | Add LoRA | ~1 min | "Trainable params: ~90M" |
| 21 | Init trainer | ~1 min | "✅ Instruction masking: ENABLED" |
| 22 | Verify masking | ~30 sec | Shows ✅/❌ labels for row 100 |
| **23** | **TRAIN** | **~4-6 hours** | "TRAINING START" |
| 29 | Export models | ~10 min | "EXPORT COMPLETE" |
| 31 | Package ZIPs | ~15 min | "PACKAGING COMPLETE" |

**wandb Dashboard** (if enabled):
- Login prompt appears in Cell 23
- Go to https://wandb.ai/
- See real-time training metrics
- Loss, learning rate, samples/sec

### **Step 8: Handle Interruptions**

**If Colab Crashes During Training:**

1. Reopen notebook
2. Run cells 1-21 (setup, don't retrain)
3. **In Cell 23, set:**
   ```python
   resume_training = True  # ← Change from False
   ```
4. Run Cell 23 again
5. Training resumes from last checkpoint (every 200 steps)

**Checkpoints saved to:**
```
/content/gemma3-12b-legal-outputs/checkpoint-200/
/content/gemma3-12b-legal-outputs/checkpoint-400/
# ... (keeps 2 latest)
```

---

## 📥 **Download Trained Model (After 4-6 Hours)**

### **Step 9: Download from Google Drive**

**After Cell 31 completes:**

Two ZIP files saved to Google Drive:
1. `gemma3-12b-legal-16bit-shards.zip` (~24GB)
   - Safetensor shards (easier to download)
   - Includes merge_shards.py script
2. `gemma3-12b-legal-merged-16bit.zip` (~24GB)
   - Single merged model
   - Ready for TensorRT conversion

**Download Options:**

**Option A: Google Drive (Recommended)**
```
1. Go to https://drive.google.com/
2. Navigate to My Drive
3. Find the ZIP files
4. Right-click → Download
5. Wait for download (~24GB, 10-30 min on fast internet)
```

**Option B: Direct Download from Colab**
```python
# In Colab (may timeout for 24GB):
from google.colab import files
files.download('/content/gemma3-12b-legal-merged-16bit.zip')
```

**Option C: Use rclone (Advanced)**
```bash
# Local machine with rclone configured:
rclone copy gdrive:gemma3-12b-legal-merged-16bit.zip ./
```

### **Step 10: Extract and Verify**

```bash
# Local machine
cd ~/Downloads
unzip gemma3-12b-legal-merged-16bit.zip

# Verify files
ls -lh gemma3-12b-legal-merged-16bit/
# Expected:
# - config.json
# - tokenizer.json
# - model.safetensors (or model-00001-of-00003.safetensors, etc.)
# - special_tokens_map.json
# - tokenizer_config.json

# Check size
du -sh gemma3-12b-legal-merged-16bit/
# Expected: ~24GB
```

---

## 🔧 **TensorRT Deployment (After Download)**

### **Step 11: Convert to Q4_K_M (Local RTX 3060 Ti)**

See: `RTX_3060_TI_TRT_BUILD.md` for full guide

**Quick conversion:**
```bash
# Convert to TensorRT checkpoint
python TensorRT-LLM/examples/gemma/convert_checkpoint.py \
  --model_dir gemma3-12b-legal-merged-16bit \
  --output_dir trt_checkpoints/gemma3-12b-legal \
  --dtype float16

# Build INT4 engine
trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3-12b-legal \
  --output_dir ./trt_engines/gemma3-12b-rtx3060ti \
  --use_weight_only \
  --weight_only_precision int4 \
  --max_batch_size 1 \
  --max_input_len 1024 \
  --max_output_len 512
  # ... (see RTX guide for full flags)
```

**Expected output:**
- Engine size: ~3.5GB (INT4 quantized)
- VRAM usage: ~7-7.5GB during inference
- Speed: 60-70 tokens/sec on RTX 3060 Ti

---

## ✅ **Success Checklist**

### **Before Training:**
- [ ] COLAB_PACKAGE.zip uploaded to Google Drive
- [ ] Notebook opens in Colab
- [ ] A100 GPU selected
- [ ] `nvidia-smi` shows "A100-SXM4-40GB"

### **During Training:**
- [ ] Cell 2: Packages installed (~5 min)
- [ ] Cell 7: 62,847 examples loaded (~10 min)
- [ ] Cell 9: Google Drive mounted
- [ ] Cell 13: ShareGPT standardized
- [ ] Cell 22: Masking verification shows ✅/❌
- [ ] Cell 23: Training started (~4-6 hours)
- [ ] wandb dashboard shows metrics (if enabled)

### **After Training:**
- [ ] Cell 29: Models exported (shards + merged)
- [ ] Cell 31: ZIPs created and saved to Drive
- [ ] Both ZIPs downloaded from Google Drive
- [ ] Extracted locally (24GB model files)
- [ ] Ready for TensorRT conversion

---

## 🆘 **Common Issues & Fixes**

### **Issue 1: "RuntimeError: CUDA out of memory"**
**Fix:** A100 not selected. Go to Runtime → Change runtime type → Select A100

### **Issue 2: "FileNotFoundError: training-datasets not found"**
**Fix:** Google Drive path incorrect. Cell 9 handles nested paths automatically.
Check: `/content/drive/MyDrive/COLAB_PACKAGE/COLAB_PACKAGE/training-datasets`
vs `/content/drive/MyDrive/COLAB_PACKAGE/training-datasets`

### **Issue 3: "Colab disconnected during training"**
**Fix:** Resume from checkpoint. Set `resume_training = True` in Cell 23, rerun.

### **Issue 4: "wandb login prompt won't go away"**
**Fix:** Set `USE_WANDB = False` in Cell 2, rerun all cells.

### **Issue 5: "Download timeout (24GB too large)"**
**Fix:** Use Google Drive download (Option A). Direct Colab download often fails >10GB.

### **Issue 6: "Column 'text' not found in dataset"**
**Check Cell 7 output:** Should show "Columns: [...]" for each dataset.
The notebook auto-detects and renames columns. If it fails, check dataset name spelling.

---

## 📊 **Expected Training Metrics**

After Cell 23 completes:

```
Training Loss: ~1.2-1.8 (final)
Samples/sec: ~1.5-2.5 (on A100)
Total steps: ~1,200 (for 60K examples, 3 epochs, batch 16)
Checkpoints: 2 saved (checkpoint-1000, checkpoint-1200)
Time: 4-6 hours
```

**Good signs:**
- Loss decreases from ~3.5 → ~1.5
- Samples/sec stays consistent (1.5-2.5)
- No "CUDA OOM" errors
- Checkpoints saved every 200 steps

**Bad signs:**
- Loss stuck at >3.0 (learning rate too low)
- Loss oscillates wildly (learning rate too high)
- "CUDA out of memory" (wrong GPU or batch size)
- "Colab disconnected" repeatedly (use Colab Pro+)

---

## 🎯 **What You'll Get**

**After successful training:**

1. **Legal + Svelte 5 Expert Model**
   - Understands legal concepts (60K examples)
   - Knows Svelte 5 runes (not outdated Svelte 4!)
   - Codes in your style (6,245 codebase examples)

2. **Vision Capability (Unchanged from Base)**
   - Can process scanned documents
   - Can analyze evidence photos
   - Can understand diagrams/charts
   - (Vision encoder frozen, not trained)

3. **Two Export Formats**
   - Safetensor shards (~24GB, 3 files)
   - Merged 16-bit (~24GB, single model)
   - Both ready for Q4_K_M conversion

4. **Deployment Ready**
   - Convert to INT4 TensorRT engine (~3.5GB)
   - Deploy to RTX 3060 Ti (7-7.5GB VRAM)
   - 60-70 tokens/sec inference speed

---

## 📅 **Timeline Summary**

| Phase | Time | What |
|-------|------|------|
| Upload | 10 min | ZIP + upload to Drive |
| Setup | 15 min | Open notebook + select A100 |
| **Training** | **4-6 hours** | Run all cells |
| Export | 25 min | Save models + create ZIPs |
| Download | 20-30 min | Download 24GB from Drive |
| Convert | 30 min | TensorRT INT4 engine build |
| **TOTAL** | **6-8 hours** | End-to-end (mostly unattended) |

---

## 🚀 **Ready to Start?**

**Next command:**
```bash
cd /c/Users/james/Videos/deeds-web-app/scripts/unsloth-training
zip -r COLAB_PACKAGE.zip COLAB_PACKAGE/ -x "COLAB_PACKAGE/training-datasets-old/*"
```

**Then:**
1. Upload COLAB_PACKAGE.zip to Google Drive
2. Open notebook in Colab
3. Select A100
4. Run all cells
5. Wait 4-6 hours ☕
6. Download your custom-trained model!

**Your Gemma 3 12B Legal + Svelte 5 expert model awaits!** 🎯
