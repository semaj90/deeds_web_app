# Manual Upload Instructions (Simplest Method)

If the batch scripts don't work, just do this manually:

---

## Step 1: Create ZIP File (30 seconds)

1. Open File Explorer
2. Navigate to:
   ```
   c:\Users\james\Videos\deeds-web-app\scripts\unsloth-training\
   ```

3. **Right-click** on the `COLAB_PACKAGE` folder

4. Select: **Send to** → **Compressed (zipped) folder**

5. You'll see `COLAB_PACKAGE.zip` appear (~5 MB)

**Done!** You now have the ZIP file.

---

## Step 2: Upload to Google Drive (2 minutes)

1. Go to: https://drive.google.com/

2. Click the **+ New** button (top left)

3. Select **File upload**

4. Navigate to:
   ```
   c:\Users\james\Videos\deeds-web-app\scripts\unsloth-training\
   ```

5. Select `COLAB_PACKAGE.zip`

6. Click **Open**

7. **Wait for upload** (5 MB = instant)

8. **Unzip in Google Drive**:
   - Right-click on `COLAB_PACKAGE.zip` in Drive
   - Select "Extract all" or "Open with → ZIP Extractor"

**Done!** You now have `COLAB_PACKAGE/` folder in Google Drive.

---

## Step 3: Open in Colab (3 minutes)

1. Go to: https://colab.research.google.com/

2. Click **File** → **Open notebook**

3. Click the **Google Drive** tab

4. Navigate to `COLAB_PACKAGE/`

5. Click on `Gemma3_12B_Legal_Production.ipynb`

6. The notebook opens!

---

## Step 4: Select A100 GPU (1 minute)

1. Click **Runtime** menu (top)

2. Select **Change runtime type**

3. In the popup:
   - **Hardware accelerator**: Select **GPU**
   - **GPU type**: Select **A100** (requires Colab Pro+)

4. Click **Save**

---

## Step 5: Update Cell 9 to Load from Drive

**Find Cell 9** (titled "Upload Local Codebase Datasets")

**Replace the entire cell** with this code:

```python
from google.colab import drive
drive.mount('/content/drive')

# Load training datasets from Google Drive
import json
from pathlib import Path

codebase_patterns = []
dataset_dir = Path('/content/drive/MyDrive/COLAB_PACKAGE/training-datasets')

print(f"Loading from: {dataset_dir}")
print()

for file in sorted(dataset_dir.glob('*.jsonl')):
    print(f"Loading {file.name}...")
    count = 0
    with open(file, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                try:
                    codebase_patterns.append(json.loads(line))
                    count += 1
                except json.JSONDecodeError as e:
                    print(f"  ⚠️  Skipping invalid JSON: {e}")
                    continue
    print(f"  → {count} examples")

print()
print(f"✅ Codebase patterns: {len(codebase_patterns):,} examples")
print(f"   Size: ~{len(str(codebase_patterns)) / 1024 / 1024:.1f} MB")
```

**Important**: When you run this cell, it will ask you to authorize Google Drive access. Click the link and allow it.

---

## Step 6: Run Training (4-6 hours)

1. Click **Runtime** → **Run all**

2. **OR** click the play button (▶) on each cell, one by one

3. When it asks to authorize Google Drive (Cell 9), click the link and approve

4. **Wait 4-6 hours** while it trains

5. ☕ Go do something else!

---

## Step 7: Download Trained Model (after training)

**After Cell 23 shows "TRAINING COMPLETE":**

1. **Run Cell 31** to create the ZIP file

2. **Download option A** - Direct download:
   - Look in the **Files** panel (left sidebar, folder icon)
   - Find `gemma3-12b-legal-merged-16bit.zip` (~24 GB)
   - Right-click → **Download**
   - This may take 30-60 minutes

3. **Download option B** - Save to Drive (EASIER):
   - **Add this to a new cell**:
     ```python
     !cp gemma3-12b-legal-merged-16bit.zip /content/drive/MyDrive/
     print("✅ Saved to Google Drive!")
     ```
   - Then download from Google Drive (more reliable for large files)

---

## That's It!

Once you have `gemma3-12b-legal-merged-16bit.zip` (~24 GB), you're ready for the next phase (Q4_K_M conversion).

See **DEPLOYMENT_ROADMAP.md** for what comes next.

---

## Verification Checklist

Before starting training:
- [ ] COLAB_PACKAGE.zip uploaded to Google Drive
- [ ] Unzipped in Google Drive (you can see the folder)
- [ ] Notebook opened in Colab
- [ ] A100 GPU selected (Runtime → Change runtime type)
- [ ] Cell 9 updated to load from Drive
- [ ] Drive mounted and authorized

Click **Runtime → Run all** and you're done!

---

## Total Time

| Step | Time |
|------|------|
| Create ZIP | 30 sec |
| Upload to Drive | 1 min |
| Open in Colab | 1 min |
| Select A100 | 1 min |
| Update Cell 9 | 2 min |
| **START TRAINING** | **4-6 hours** |
| Download model | 30-60 min |

**Total prep time**: ~5 minutes
**Total training**: 4-6 hours (you can leave it)

---

**Questions?** Everything you need is in this file!

**Ready?** Start with Step 1 above! 🚀
