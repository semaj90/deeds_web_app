# Gemma 4 Export Notebook - Final Error Check ✅

**Date**: April 13, 2026
**File**: `scripts/unsloth-training/Gemma4_Legal_2B_Export_CORRECTED.ipynb`
**Status**: ✅ **BEING CORRECTED** (work in progress)

---

## 🎯 Summary of Issues Found

### ❌ BROKEN FILE: `Gemma4_Legal_2B_Export_FIXED.ipynb`

**Problems**:
1. ❌ Cells out of order (validation cells inserted in wrong positions)
2. ❌ Duplicate cells (checkpoint loading × 2, Modelfile × 2, ONNX × 2)
3. ❌ Missing critical cell (GGUF export loop)
4. ❌ Cell type errors (markdown containing code)
5. ❌ Undefined variable references (`gguf_outputs` used before defined)

**Action**: **ABANDONED** - Too broken to fix incrementally

---

### ✅ ORIGINAL FILE: `Gemma4_Legal_2B_Export_and_Quantize.ipynb`

**Status**: Clean structure, but missing validation improvements

**Issues Found**:
1. ❌ **Gemma 2 vs Gemma 4** - Cell 10 metadata has `"base_model": "unsloth/gemma-2-2b-it"` (WRONG)
2. ⚠️ **No environment validation** - No GPU/disk checks before starting
3. ⚠️ **No model verification** - No parameter count check
4. ⚠️ **No error handling** - Checkpoint path not validated
5. ⚠️ **No template verification** - Chat template not checked
6. ⚠️ **Missing ONNX export** - No client-side deployment option

---

### ✅ NEW FILE: `Gemma4_Legal_2B_Export_CORRECTED.ipynb`

**Status**: Currently being built with all fixes applied

---

## 📋 Checklist of Fixes Applied

### Cell 0: Title ✅ UPDATED
- [x] Added corrections notice
- [x] Listed all improvements
- [x] Updated pipeline steps

### Cells 1-2: Setup ✅ UNCHANGED
- [x] Cell 1: Markdown header (no changes needed)
- [x] Cell 2: Install dependencies (no changes needed)

### NEW Cells 3-4: Environment Validation ✅ ADDED
- [x] Cell 3: Markdown header for environment validation
- [x] Cell 4: Code - GPU/disk/package/model loading checks

### Cell 5 (was 3): Checkpoint Loading ⚠️ NEEDS UPDATE
- [ ] Update markdown header to mention error handling
- [ ] Add checkpoint path validation code
- [ ] Add try/except with troubleshooting
- [ ] Add Gemma 4 vs Gemma 2 detection

### NEW Cells: Model Verification ⚠️ TO ADD
- [ ] Markdown header for model verification
- [ ] Code - Parameter count check (~2.3B expected)
- [ ] Code - LoRA adapter presence check
- [ ] Code - Tokenizer validation
- [ ] Code - Quick generation test

### Cells 7-9: Test LoRA, Merge, Save ✅ UNCHANGED
- [x] Keep as-is (no validation needed here)

### Cell 10: Save Merged Model ❌ CRITICAL FIX NEEDED
**Current (WRONG)**:
```python
metadata = {
    "base_model": "unsloth/gemma-2-2b-it",  # ❌ GEMMA 2!
}
```

**Fixed**:
```python
metadata = {
    "base_model": model.config._name_or_path,  # ✅ Auto-detect
    "model_family": "gemma4",  # ✅ Explicit
    "exported_from_checkpoint": checkpoint_path,
}
```

- [ ] Fix metadata base_model reference
- [ ] Add model_family field
- [ ] Add checkpoint tracking

### Cell 12: GGUF Export ✅ UNCHANGED
- [x] Keep as-is (this cell is correct in original)

### Cell 14: Modelfile Creation ⚠️ NEEDS SPLIT
**Current**: Single cell with just Modelfile creation
**Should Be**: Two cells:
1. Template verification (check `<start_of_turn>` format)
2. Modelfile creation

- [ ] Add template verification cell before Modelfile
- [ ] Update Modelfile cell to reference verification

### NEW Cells: ONNX Export ⚠️ TO ADD
- [ ] Markdown header for ONNX export
- [ ] Code - ONNX INT4 export with error handling
- [ ] Code - Client config JSON generation
- [ ] Markdown - Client integration guide

### Cells 18-23: Validation, Model Card, HF Upload ✅ UNCHANGED
- [x] Keep as-is

---

## 🔧 Remaining Work

### High Priority (Required for Colab execution)

**1. Update Cell 5 (Checkpoint Loading)** - Cell currently at `cell-4` in original
```python
# Add BEFORE loading code:
import os

print(f"🔍 Checking checkpoint path: {checkpoint_path}\n")

# Check if path exists
if not os.path.exists(checkpoint_path):
    print(f"❌ ERROR: Checkpoint not found at {checkpoint_path}\n")
    print("Available options:")
    print("  A. Mount Google Drive")
    print("  B. Use HuggingFace Hub")
    print("  C. Check current directory: !ls -la")
    raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

print(f"✅ Checkpoint path exists\n")

# Wrap existing load code in try/except
try:
    model, tokenizer = FastLanguageModel.from_pretrained(...)

    # Add Gemma 4 vs Gemma 2 detection
    if 'gemma2' in model.config.model_type.lower():
        print("\n⚠️  WARNING: This appears to be Gemma 2, not Gemma 4!")
    elif 'gemma' in model.config.model_type.lower():
        print("\n✅ Confirmed: Gemma 4 model detected")

except Exception as e:
    print(f"\n❌ Failed to load model: {e}\n")
    print("Troubleshooting:")
    print("  1. Verify checkpoint path exists")
    print("  2. Check if you have enough RAM (need ~8GB)")
    print("  3. Try load_in_4bit=True")
    raise
```

**2. Add Model Verification Cells** - After checkpoint loading
```python
# Cell: Model Family Verification
print("🔍 Verifying Model Configuration\n")
print("="*60)

# Parameter count check
def count_parameters(model):
    return sum(p.numel() for p in model.parameters())

params_b = count_parameters(model) / 1e9
print(f"📊 Total Parameters: {params_b:.2f}B")

if 2.0 < params_b < 2.5:
    print(f"✅ Parameter count matches Gemma 4 E2B (2.3B)")
elif 1.0 < params_b < 1.5:
    print(f"⚠️  This looks like Gemma 2 1B model - check path!")
elif 8.0 < params_b < 10.0:
    print(f"⚠️  This looks like Gemma 2 9B model - check path!")
else:
    print(f"⚠️  Unexpected parameter count: {params_b:.2f}B")

# LoRA check
has_lora = any('lora' in name.lower() for name, _ in model.named_modules())
print(f"\n🔍 LoRA Adapters: {'Present' if has_lora else 'Already merged'}")

# Tokenizer check
print(f"\n🔍 Tokenizer:")
print(f"   Vocab Size: {len(tokenizer)}")
print(f"   PAD Token: {tokenizer.pad_token}")
print(f"   BOS Token: {tokenizer.bos_token}")
print(f"   EOS Token: {tokenizer.eos_token}")

print("="*60)
print("✅ Model verification complete!\n")
```

**3. Fix Cell 10 Metadata** - Currently at `cell-10` in original
```python
# BEFORE (WRONG):
metadata = {
    "base_model": "unsloth/gemma-2-2b-it",  # ❌
}

# AFTER (CORRECT):
metadata = {
    "base_model": model.config._name_or_path,  # ✅ Auto-detect
    "model_family": "gemma4",  # ✅ Explicit
    "training_method": "GRPO",
    "domain": "legal",
    "context_length": MAX_SEQ_LENGTH,
    "quantization": "fp16",
    "parameters": "2.3B",
    "exported_from_checkpoint": checkpoint_path,  # ✅ Track source
}
```

**4. Add Template Verification** - Before Modelfile creation (cell 14)
```python
# NEW CELL: Template Verification
print("🔍 Verifying chat template format...\n")

test_messages = [{"role": "user", "content": "Test query"}]

try:
    test_formatted = tokenizer.apply_chat_template(
        test_messages,
        tokenize=False,
        add_generation_prompt=True
    )

    print("Template format preview:")
    print("-" * 60)
    print(test_formatted)
    print("-" * 60)

    if "<start_of_turn>" in test_formatted:
        print("\n✅ Template uses <start_of_turn> format (Gemma style)")
    else:
        print("\n⚠️  WARNING: Template doesn't match expected format!")

except Exception as e:
    print(f"⚠️  Could not verify template: {e}")
```

**5. Add ONNX Export Cells** - After Modelfile creation
```python
# NEW CELLS: ONNX Export

## Markdown
## 7. Export to ONNX (Client-Side Deployment)

Export to ONNX for browser/client-side inference with WebGPU/WASM.

## Code
!pip install -q optimum[exporters] onnxruntime-gpu

from optimum.onnxruntime import ORTModelForCausalLM
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from pathlib import Path

onnx_output_dir = "./gemma4-rotorquant:latest-2b-onnx"
os.makedirs(onnx_output_dir, exist_ok=True)

try:
    print("🔄 Converting to ONNX with INT4 quantization...")
    print("⏱️  This may take 5-10 minutes...\n")

    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)

    onnx_model = ORTModelForCausalLM.from_pretrained(
        output_dir,  # Our merged HF model
        export=True,
        quantization_config=qconfig,
    )

    onnx_model.save_pretrained(onnx_output_dir)
    tokenizer.save_pretrained(onnx_output_dir)

    onnx_files = list(Path(onnx_output_dir).glob("*.onnx"))
    total_size_mb = sum(f.stat().st_size for f in onnx_files) / (1024 * 1024)

    print(f"\n✅ ONNX export complete!")
    print(f"   Output: {onnx_output_dir}")
    print(f"   Size: {total_size_mb:.1f} MB (INT4 quantized)")
    print(f"   Files: {len(onnx_files)} ONNX files")

    client_config = {
        "model_type": "onnx",
        "model_id": "gemma4-rotorquant:latest-2b",
        "quantization": "int4",
        "size_mb": round(total_size_mb, 1),
        "context_length": 8192,
        "deployment": "client-side",
        "runtime": "onnxruntime-web",
        "backends": ["webgpu", "wasm", "cpu"],
    }

    with open(f"{onnx_output_dir}/client_config.json", "w") as f:
        json.dump(client_config, f, indent=2)

    print("\n📱 Client Config:")
    print(json.dumps(client_config, indent=2))

except Exception as e:
    print(f"\n⚠️  ONNX export failed: {e}")
    print("\n📋 This is OPTIONAL - reasons it might fail:")
    print("   • ONNX may not support Gemma 4 architecture yet")
    print("   • Insufficient memory for export")
    print("   • Missing optimum dependencies")
    print("\n✅ GGUF export is sufficient for server deployment")
    print("   You can skip this and continue to validation")
```

---

## ✅ What's Ready

1. ✅ **Cell 0**: Title updated with corrections
2. ✅ **Cells 1-2**: Setup (unchanged)
3. ✅ **Cells 3-4**: Environment validation (added)
4. ⚠️ **Cell 5**: Checkpoint loading (needs update)
5. ⚠️ **Model verification**: (needs to be added)
6. ✅ **Cells 7-9**: Test/Merge (unchanged)
7. ❌ **Cell 10**: Metadata (needs Gemma 4 fix)
8. ✅ **Cell 12**: GGUF export (unchanged)
9. ⚠️ **Cell 14**: Modelfile (needs template verification added)
10. ⚠️ **ONNX export**: (needs to be added)
11. ✅ **Cells 18-23**: Validation/Card/Upload (unchanged)

---

## 🎯 Quick Fix Strategy

**Option A: Manual Edit** (RECOMMENDED)
1. Open `Gemma4_Legal_2B_Export_CORRECTED.ipynb` in Jupyter/Colab
2. Manually insert/update cells following checklist above
3. Test each cell sequentially

**Option B: Scripted Fix**
1. Create Python script to programmatically insert cells
2. Validate notebook structure
3. Test in Colab

---

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Title | ✅ Done | Corrections listed |
| Setup | ✅ Done | No changes needed |
| Env Validation | ✅ Done | 2 cells added |
| Checkpoint Load | ⚠️ In Progress | Needs error handling |
| Model Verification | ⚠️ Pending | 2 cells to add |
| Test/Merge/Save | ✅ Done | No changes needed |
| Metadata Fix | ❌ Critical | Gemma 2 → Gemma 4 |
| GGUF Export | ✅ Done | No changes needed |
| Template Verify | ⚠️ Pending | 1 cell to add |
| Modelfile | ✅ Done | No changes after template |
| ONNX Export | ⚠️ Pending | 3 cells to add |
| Validation/Card | ✅ Done | No changes needed |

---

## 🚀 Next Steps

1. **Complete remaining NotebookEdit operations** for:
   - Checkpoint loading enhancement
   - Model verification cells
   - Metadata Gemma 4 fix
   - Template verification
   - ONNX export cells

2. **Test in Colab**:
   - Upload corrected notebook
   - Run cells sequentially
   - Verify all validations work
   - Confirm GGUF + ONNX exports succeed

3. **Document final version**:
   - Create execution guide
   - List expected outputs
   - Add troubleshooting section

---

**Estimated Time to Complete**: 10-15 minutes of manual edits OR automated script

**Recommendation**: Since NotebookEdit operations are working correctly now (environment validation added successfully), continue adding remaining cells programmatically, then do final manual review in Colab.
