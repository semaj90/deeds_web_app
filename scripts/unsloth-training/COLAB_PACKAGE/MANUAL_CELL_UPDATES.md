# Manual Cell Updates for Colab

Copy/paste these 3 cells into your notebook in Colab.

---

## Cell 2: Replace Entire Cell with This

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

# ========================================
# FIX: Install stable Unsloth version
# ========================================
print("Installing Unsloth (stable version)...\n")

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

print("\n✅ Unsloth stable version installed (2025.1 or 2024.12.5)")
print("   If you see KeyError, restart runtime and retry")
```

---

## NEW CELL: Insert BEFORE Current Cell 12

**Action**: Insert this as a NEW cell BEFORE the cell that has `shutil.copytree`

```python
# Find Google Drive training data path
from google.colab import drive
from pathlib import Path

drive.mount('/content/drive')

print("Searching for training-datasets in Google Drive...\n")

possible_paths = [
    Path('/content/drive/MyDrive/COLAB_PACKAGE/COLAB_PACKAGE/training-datasets'),
    Path('/content/drive/MyDrive/COLAB_PACKAGE/training-datasets'),
    Path('/content/drive/My Drive/COLAB_PACKAGE/training-datasets'),  # Space in "My Drive"
]

found_path = None
for path in possible_paths:
    print(f"Checking: {path}")
    if path.exists():
        found_path = path
        print(f"  ✅ FOUND!\n")
        break
    else:
        print(f"  ❌ Not found\n")

if found_path:
    jsonl_files = list(found_path.glob('*.jsonl'))
    print(f"✅ Training data location: {found_path}")
    print(f"   Files: {len(jsonl_files)} JSONL datasets\n")

    for f in jsonl_files[:5]:
        print(f"   - {f.name}")
    if len(jsonl_files) > 5:
        print(f"   ... and {len(jsonl_files) - 5} more")
else:
    print("❌ ERROR: Cannot find training-datasets folder!")
    print("\nPlease upload your training-datasets folder to Google Drive:")
    print("  Location: /MyDrive/COLAB_PACKAGE/training-datasets/")
    print("\nOr check the folder name (case-sensitive!)")
    raise FileNotFoundError("training-datasets not found in Google Drive")
```

---

## Cell 12: Replace the Cell with `shutil.copytree`

**Action**: Find the cell that has `shutil.copytree` and `local-datasets`, replace entire cell with this:

```python
from google.colab import drive
from pathlib import Path
import shutil

drive.mount('/content/drive')

# Find source directory (tries multiple possible paths)
possible_sources = [
    Path('/content/drive/MyDrive/COLAB_PACKAGE/COLAB_PACKAGE/training-datasets'),
    Path('/content/drive/MyDrive/COLAB_PACKAGE/training-datasets'),
    Path('/content/drive/My Drive/COLAB_PACKAGE/training-datasets'),  # Space in name
]

source_dir = None
for path in possible_sources:
    if path.exists():
        source_dir = path
        print(f"Found training data: {path}")
        break

if not source_dir:
    print("\n❌ ERROR: Cannot find training-datasets folder!")
    print("\nSearched:")
    for path in possible_sources:
        print(f"  - {path}")
    print("\nPlease verify:")
    print("  1. Folder exists in Google Drive")
    print("  2. Folder name is 'training-datasets' (case-sensitive)")
    print("  3. Location: /MyDrive/COLAB_PACKAGE/training-datasets/")
    raise FileNotFoundError("training-datasets not found in Google Drive")

# Copy to local disk (fast SSD)
local_dir = Path('/content/local-datasets')

if local_dir.exists():
    existing_files = list(local_dir.glob('*.jsonl'))
    print(f"\n✅ LOCAL DISK ALREADY EXISTS: {local_dir}")
    print(f"   Files: {len(existing_files)} JSONL datasets")
    print(f"\n   Skipping copy (data already on local disk)")
else:
    print(f"\nCopying training data to local SSD...")
    print(f"  From: {source_dir}")
    print(f"  To: {local_dir}")
    print(f"  This takes 30-60 seconds...\n")

    shutil.copytree(source_dir, local_dir)

    # Verify copy
    copied_files = list(local_dir.glob('*.jsonl'))
    total_size_mb = sum(f.stat().st_size for f in copied_files) / (1024**2)

    print(f"\n✅ COPY COMPLETE!")
    print(f"   Files: {len(copied_files)} JSONL datasets")
    print(f"   Size: {total_size_mb:.1f} MB")
    print(f"   Location: {local_dir}")

print()
print("="*70)
print("⚡ LOCAL DISK READY - 10x faster I/O than Google Drive!")
print("="*70)
print()
print("✅ Next step: Continue to Cell 10 (or next cell) to load datasets")
```

---

## Summary of Manual Changes

| Cell | Action | What It Fixes |
|------|--------|---------------|
| **Cell 2** | REPLACE | Unsloth KeyError: 'sanitize_logprob' |
| **NEW before Cell 12** | INSERT | Finds Google Drive path, shows you what was found |
| **Cell 12** | REPLACE | Handles "My Drive" vs "MyDrive", nested COLAB_PACKAGE folders |

---

## Steps to Apply

1. Open notebook in Colab
2. **Cell 2**: Click cell → Delete all code → Paste new code from above
3. **Before Cell 12**: Insert new cell → Paste "Find Google Drive" code
4. **Cell 12**: Click cell → Delete all code → Paste new "local disk copy" code
5. Run cells in order: 1-8 → NEW cell → Cell 12 → Cell 10 → 13+

Done! Your notebook is fixed.
