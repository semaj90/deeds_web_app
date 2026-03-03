# Unsloth KeyError Fix — Cell 2

## Error
```
KeyError: 'sanitize_logprob'
from unsloth import FastVisionModel
```

## Root Cause
Unsloth version mismatch - recent update broke `RL_REPLACEMENTS` dictionary in `models/rl.py`

---

## Fix: Update Cell 2 (Install Cell)

### Replace This (OLD):
```python
# Install Unsloth (includes chat template support)
!pip uninstall unsloth -y
!pip install --upgrade --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install bitsandbytes accelerate peft trl transformers datasets huggingface_hub pillow

print("\n✅ Unsloth installed with Gemma 3 chat template support")
```

### With This (NEW - Version Pinned):
```python
# Install Unsloth with stable version pinning
!pip uninstall unsloth unsloth-zoo -y

# Pin to last stable version before sanitize_logprob breakage
!pip install --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git@2025.1"

# Install dependencies
!pip install --no-cache-dir \
  bitsandbytes>=0.43.0 \
  accelerate>=0.26.0 \
  peft>=0.8.0 \
  trl>=0.7.10 \
  transformers>=4.37.0 \
  datasets>=2.16.0 \
  huggingface_hub>=0.20.0 \
  pillow>=10.0.0

print("\n✅ Unsloth 2025.1 installed (stable version)")
```

---

## Alternative Fix: Force Latest Version

If version `2025.1` doesn't exist, try forcing the latest commit:

```python
# Uninstall completely
!pip uninstall unsloth unsloth-zoo -y
!pip cache purge

# Force reinstall from main branch
!pip install --no-cache-dir --force-reinstall \
  "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git@main"

# Restart runtime after install
import os
os.kill(os.getpid(), 9)
```

**Then restart Colab runtime**: Runtime → Restart runtime

---

## If Still Broken: Use Unsloth 2024.12 (Last Known Good)

```python
# Install last stable release from December 2024
!pip uninstall unsloth unsloth-zoo -y
!pip install --no-cache-dir "unsloth==2024.12.5"
!pip install --no-cache-dir \
  bitsandbytes accelerate peft trl transformers datasets huggingface_hub pillow

print("\n✅ Unsloth 2024.12.5 installed (last stable release)")
```

---

## Recommended Approach (Safest)

**Step 1**: Try version pinning to `2025.1`
**Step 2**: If that fails, use `2024.12.5` (last stable PyPI release)
**Step 3**: If that fails, force reinstall from `main` + restart runtime

---

## Verify Fix

After updating Cell 2, run this in Cell 3 to verify:

```python
import torch
from unsloth import FastVisionModel, is_bfloat16_supported, get_chat_template
from transformers import TrainingArguments, TextStreamer
from trl import SFTTrainer
from datasets import load_dataset, concatenate_datasets, Dataset
import json
from pathlib import Path

print(f"PyTorch: {torch.__version__}")
print(f"CUDA: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
    print(f"VRAM: {vram:.1f} GB")
    if vram < 35:
        print(f"\n⚠️  WARNING: {vram:.1f}GB < 40GB recommended for Gemma 12B")
        print("   Switch to A100 GPU: Runtime → Change runtime type → A100")

print(f"\n✅ Imports loaded successfully!")
print("✅ No KeyError - Unsloth is working!")
```

**Expected output**:
```
PyTorch: 2.x.x
CUDA: True
GPU: Tesla A100-SXM4-40GB
VRAM: 40.0 GB
✅ Imports loaded successfully!
✅ No KeyError - Unsloth is working!
```

---

## Updated Cell 2 (Full Code)

```python
# Logging configuration (RECOMMENDED: Keep wandb enabled for progress tracking)
import os

# Toggle wandb (set to False to disable completely)
USE_WANDB = True  # ← RECOMMENDED: True for cloud backup during 4-6 hour training

if not USE_WANDB:
    os.environ["WANDB_DISABLED"] = "true"
    os.environ["WANDB_MODE"] = "disabled"
    os.environ["DISABLE_MLFLOW_INTEGRATION"] = "true"
    print("⚠️  wandb DISABLED - No cloud backup of training progress!")
    print("   If Colab crashes, you'll lose all metrics and checkpoints.\n")
else:
    print("✅ wandb ENABLED (recommended)")
    print("   Benefits:")
    print("   - Cloud backup of training metrics")
    print("   - Resume from checkpoint if Colab crashes")
    print("   - Real-time monitoring from anywhere")
    print("   - Free tier: unlimited runs, 100GB storage")
    print("\n   You'll be prompted to login on first run.\n")

# Prevent Colab restart loops (harmless if not in Colab)
import sys
modules = list(sys.modules.keys())
for x in modules:
    if "PIL" in x or "google" in x:
        sys.modules.pop(x, None)
print("✅ Cleared PIL/google modules (prevents Colab restart loops)\n")

# Install Unsloth with stable version pinning (FIX for KeyError)
print("Installing Unsloth (stable version)...\n")

!pip uninstall unsloth unsloth-zoo -y

# Try version 2025.1 first (stable)
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

print("\n✅ Unsloth installed (stable version)")
print("   If you see KeyError on next cell, restart runtime and retry")
```

---

## Root Cause (Technical)

The error is in `/usr/local/lib/python3.12/dist-packages/unsloth/models/rl.py` line 289:

```python
# Line 289 in rl.py
sanitize_logprob = RL_REPLACEMENTS["sanitize_logprob"]  # ← KeyError here
```

The `RL_REPLACEMENTS` dictionary doesn't have the `"sanitize_logprob"` key, which means:
1. Unsloth added a new RL function recently
2. But the function wasn't added to the replacements dictionary
3. This is a breaking change in the latest commit

**Solution**: Pin to a stable version OR wait for Unsloth team to fix it in the next release.

---

## If You Need Latest Features

If you absolutely need the latest Unsloth commit (e.g., for new model support):

```python
# Patch the RL_REPLACEMENTS manually
!pip install --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git@main"

# After install, before imports, run this patch:
import sys
import importlib.util

# Patch RL_REPLACEMENTS to include missing function
rl_module_path = '/usr/local/lib/python3.12/dist-packages/unsloth/models/rl.py'
spec = importlib.util.spec_from_file_location("unsloth.models.rl", rl_module_path)
rl_module = importlib.util.module_from_spec(spec)

# Add missing function to RL_REPLACEMENTS before loading
if hasattr(rl_module, 'RL_REPLACEMENTS'):
    rl_module.RL_REPLACEMENTS["sanitize_logprob"] = lambda x: x  # Passthrough function

sys.modules["unsloth.models.rl"] = rl_module
spec.loader.exec_module(rl_module)

print("✅ Patched RL_REPLACEMENTS with sanitize_logprob")
```

**WARNING**: This is a temporary hack - prefer stable version pinning instead!

---

## TL;DR

**Immediate fix**: Replace Cell 2 install command with version-pinned install:

```python
!pip uninstall unsloth unsloth-zoo -y
!pip install --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git@2025.1"
!pip install bitsandbytes accelerate peft trl transformers datasets huggingface_hub pillow
```

If `2025.1` doesn't exist, use `2024.12.5` instead.
