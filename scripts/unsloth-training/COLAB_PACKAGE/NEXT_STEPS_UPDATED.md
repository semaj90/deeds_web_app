# Next Steps — Start Training RIGHT NOW

## ⚠️ CRITICAL: Unsloth Fix Required

Latest Unsloth has a breaking change. **You MUST update Cell 2 before running.**

---

## Step 1: Upload Notebook to Colab

**File**: `@3_2_26Gemma3_12B_Legal_Production.ipynb`

**Option A** (Recommended):
1. Upload to Google Drive
2. Right-click → Open with Google Colaboratory

**Option B**:
1. Go to https://colab.research.google.com
2. File → Upload notebook

---

## Step 2: Select A100 GPU

```
Runtime → Change runtime type → GPU → A100 → Save
```

**REQUIRED**: A100 (NOT T4, NOT V100)
- Training time: 4-6 hours (vs 20-30 on T4)
- VRAM: 40GB (T4 has only 16GB - would fail)

---

## Step 3: Fix Cell 2 (Unsloth KeyError)

### ⚠️ Replace Cell 2 Install Code

**Original Cell 2 has this:**
```python
!pip install --upgrade --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
```

**Change to this (version pinned):**
```python
# Logging config (KEEP existing wandb code)
import os
USE_WANDB = True
# ... (keep rest of wandb config)

# Prevent Colab restart loops
import sys
modules = list(sys.modules.keys())
for x in modules:
    if "PIL" in x or "google" in x:
        sys.modules.pop(x, None)
print("✅ Cleared PIL/google modules\n")

# ========================================
# FIX: Install stable Unsloth version
# ========================================
!pip uninstall unsloth unsloth-zoo -y

# Pin to stable version (avoid KeyError: 'sanitize_logprob')
!pip install --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git@2025.1" || \
  pip install --no-cache-dir "unsloth==2024.12.5"

!pip install --no-cache-dir \
  bitsandbytes>=0.43.0 \
  accelerate>=0.26.0 \
  peft>=0.8.0 \
  trl>=0.7.10 \
  transformers>=4.37.0 \
  datasets>=2.16.0 \
  huggingface_hub>=0.20.0 \
  pillow>=10.0.0

print("\n✅ Unsloth stable version installed")
```

**What this fixes:**
- Error: `KeyError: 'sanitize_logprob'`
- Pins to working version (2025.1 or fallback to 2024.12.5)

---

## Step 4: Run Cells in Correct Order

### ⚠️ CRITICAL ORDER

```
✅ Cells 1-8     → Setup + Config

🚨 Cell 9        → ⚠️ WARNING - Read, then SKIP TO CELL 12!

⏭️ SKIP Cell 10  → (Don't run yet!)

🚀 Cell 12       → LOCAL DISK COPY - RUN THIS FIRST!
                   (Copies data from Google Drive → local SSD)
                   Takes 30-60 seconds
                   Saves 5-10 hours!

✅ Cell 10       → NOW run this (loads from local disk)
                   Should see: "✅ Using LOCAL DISK (10x faster!)"

✅ Cells 13+     → Training (continue in order)
```

**Why this order?**
- Cell 12 CREATES `/content/local-datasets/`
- Cell 10 LOADS FROM `/content/local-datasets/`
- Wrong order → slow Google Drive I/O (10x slower!)

---

## Step 5: Monitor Training

### Cell 4: GPU Check
**Expected:**
```
✅ PERFECT: A100 detected!
   Expected training time: 4-6 hours
```

**If you see T4/V100:**
```
🚨 WARNING: Tesla T4 detected!
```
→ STOP! Go to Step 2 and select A100.

---

### Cell 12: Local Disk Copy
**Expected:**
```
✅ COPY COMPLETE!
   Files: 18 JSONL datasets
⚡ LOCAL DISK READY - 10x faster I/O!
```

---

### Cell 10: Dataset Loading
**Expected:**
```
Loading from: /content/local-datasets
✅ Using LOCAL DISK (10x faster I/O!)
```

**If you see Google Drive path:**
```
⚠️ Using GOOGLE DRIVE (slow)
```
→ STOP! Go back and run Cell 12.

---

### Training Speed (Cell ~27)
**Expected:**
```
[50/9020]  Loss: 0.987  Speed: 0.45 it/s  ETA: 5h 10m
```

**✅ Good:**
- Speed: **0.40-0.50 it/s**
- ETA: **4-6 hours**
- Loss: Decreasing

**❌ Bad:**
- Speed: **0.10 it/s** (too slow!)
- ETA: **20+ hours** (wrong GPU or slow I/O)

**If slow:**
1. Check Cell 4: Should be A100
2. Check Cell 10: Should say "LOCAL DISK"
3. Restart runtime and retry

---

## Step 6: After Training (4-6 hours)

**Expected:**
```
======================================================================
TRAINING COMPLETE
======================================================================
Time: 19,845s (5.5 hours)
Final loss: 0.487
```

Run export cells:
- Cell 33: Export merged model
- Cell 35: Package for download

**Download from Google Drive:**
- `gemma3-12b-legal-merged-16bit.zip` (24GB)

---

## Step 7: TensorRT Deployment (Local Machine)

**Follow**: `TENSORRT_INT4_DEPLOYMENT.md`

**Steps:**
1. Download model (24GB)
2. Convert to TensorRT checkpoint (5 min)
3. Build INT4 engine (20-40 min)
4. Deploy Triton on port 8099
5. Wire into SvelteKit

**Result**: 120-150 tok/s on RTX 3060 Ti! 🚀

---

## Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| KeyError: 'sanitize_logprob' | Update Cell 2 with version pinning (Step 3) |
| Slow training (0.10 it/s) | Check A100 GPU + local disk loading |
| CUDA out of memory | Verify A100 (not T4), MAX_SEQ_LENGTH=512 |
| Can't find training-datasets | Check Google Drive folder structure |

---

## Success Checklist

- [ ] A100 GPU selected
- [ ] Cell 2 updated (Unsloth fix)
- [ ] Cells run: 1-8 → 12 → 10 → 13+
- [ ] Cell 4: A100 ✅
- [ ] Cell 12: Local disk copy ✅
- [ ] Cell 10: LOCAL DISK ✅
- [ ] Training: 0.40-0.50 it/s ✅
- [ ] Training: 4-6 hours ✅
- [ ] Model exported ✅

---

## TL;DR

1. **Upload** notebook to Colab
2. **Select** A100 GPU
3. **Fix** Cell 2 (pin Unsloth version)
4. **Run** cells: 1-8 → 12 → 10 → 13+
5. **Monitor**: 0.40-0.50 it/s, 4-6 hours
6. **Download** merged model (24GB)
7. **Deploy** via TensorRT (TENSORRT_INT4_DEPLOYMENT.md)

**Ready to train!** 🚀
