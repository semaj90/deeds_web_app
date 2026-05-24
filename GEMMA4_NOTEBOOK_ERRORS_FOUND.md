# Gemma 4 Export Notebook - Critical Errors Found ❌

**Date**: April 13, 2026
**Status**: ❌ **NEEDS FIXING** - Cell order issues + duplicates + missing cells

---

## 🚨 Critical Errors

### 1. **Cell Order Completely Scrambled** ❌

**Problem**: Validation cells inserted in wrong positions, causing notebook to be unrunnable.

**Current Structure** (WRONG):
```
Cell 0: Markdown (Title) ✅
Cell 1: Markdown (Setup heading) ✅
Cell 2: Code (Install dependencies) ✅
Cell 3: Code (Environment validation) ⚠️ Missing markdown header
Cell 4: MARKDOWN with code comments ❌ Should be CODE
Cell 5: Code (Model verification) ⚠️ Missing markdown header
Cell 6: Markdown (Model verification header) ❌ Should be BEFORE cell 5
Cell 7: Markdown (Load checkpoint heading) ✅
Cell 8: Code (Load checkpoint) ❌ DUPLICATE of cell 4
Cell 9: Markdown (Test LoRA heading) ✅
Cell 10: Code (Test LoRA) ✅
Cell 11: Markdown (Merge heading) ✅
Cell 12: Code (Merge) ✅
Cell 13: Markdown (Save merged heading) ✅
Cell 14: Code (Template verification + Modelfile) ❌ Should be split
Cell 15: Markdown (GGUF heading) ✅
Cell 16: Code (ONNX export) ❌ Wrong position + duplicate
Cell 17: Markdown (Modelfile heading) ❌ Duplicate
Cell 18: Code (Modelfile creation) ❌ Duplicate
...
```

**Root Cause**: NotebookEdit insert operations created cells AFTER the specified cell_id, but the order got confused.

---

### 2. **Missing Critical Cell: GGUF Export** ❌

**Problem**: The actual GGUF export code cell is MISSING entirely!

**Expected Cell** (between Cell 13 "Save Merged" and Cell 15 "GGUF heading"):
```python
quantization_methods = [
    "q4_k_m",   # ⭐ RECOMMENDED
    "q8_0",
    "q2_k",
]

gguf_outputs = []

for quant_method in quantization_methods:
    output_file = model.save_pretrained_gguf(
        "gemma4-rotorquant:latest-2b",
        tokenizer,
        quantization_method=quant_method,
    )
    # ... store outputs
```

**Impact**: Cell 14 references `gguf_outputs` variable that's never defined → Runtime Error

---

### 3. **Duplicate Cells** ❌

**Duplicates Found**:

| Cell IDs | Type | Content | Issue |
|----------|------|---------|-------|
| 4, 8 | Code | Checkpoint loading | Cell 8 is exact duplicate |
| 14, 18 | Code | Modelfile creation | Different versions, both reference undefined `gguf_outputs` |
| 16, 20 | Code | ONNX export | Both have enhanced error handling |

**Impact**: Confusing execution order, variables defined multiple times

---

### 4. **Cell 4 Type Error** ❌

**Problem**: Cell 4 is marked as `markdown` but contains Python code

**Current** (WRONG):
```
<cell id="cell-4"><cell_type>markdown</cell_type>
# ⚠️ CRITICAL: Update this path to YOUR checkpoint location
# Option A: Google Drive
# from google.colab import drive
...
checkpoint_path = "./gemma4-e2b-legal-grpo-final"  # Adjust this!
```

**Should Be**: `<cell_type>code</cell_type>`

**Impact**: Code won't execute, will render as markdown text

---

### 5. **Missing Markdown Headers** ⚠️

**Cell 3 (Environment Validation)**: Has code but no markdown header before it
**Cell 5 (Model Verification)**: Has code but no markdown header before it

**Expected**:
```
Cell X: Markdown ## 🔍 Environment Validation (Pre-Flight Check)
Cell X+1: Code (environment validation)

Cell Y: Markdown ## 🔍 Model Family Verification
Cell Y+1: Code (model verification)
```

---

### 6. **Cell 14: Merged Two Separate Steps** ❌

**Problem**: Cell 14 combines template verification AND modelfile creation in one cell

**Current** (WRONG):
```python
# Chat template verification code
...
print("Creating Ollama Modelfile...")
# Modelfile creation code
...
```

**Should Be**: Split into two cells:
- Cell 14a: Template verification only
- Cell 14b: Modelfile creation (references `gguf_outputs`)

---

### 7. **Variable Dependencies Out of Order** ❌

**Undefined Variables**:

| Cell | Variable Used | Where Defined | Status |
|------|---------------|---------------|--------|
| 14 | `gguf_outputs` | Missing GGUF export cell | ❌ Not defined |
| 14 | `output_dir` | Cell 14 (Save Merged) | ⚠️ Should be defined in earlier cell |
| 16 | `output_dir` | Cell 14 (Save Merged) | ⚠️ May not be defined yet |
| 18 | `gguf_outputs` | Missing GGUF export cell | ❌ Not defined |
| 26 | `recommended_file` | Cell 18 | ⚠️ Depends on undefined `gguf_outputs` |
| 26 | `total_size_mb` | Cell 16 or 20 | ⚠️ May not be defined |

---

## ✅ Correct Cell Order (Should Be)

**Proper Sequence**:

```
1.  Cell 0: Markdown - Title
2.  Cell 1: Markdown - Setup heading
3.  Cell 2: Code - Install dependencies

4.  Cell 3: Markdown - ## 🔍 Environment Validation (Pre-Flight Check) [NEW]
5.  Cell 4: Code - Environment validation [NEW]

6.  Cell 5: Markdown - ## 1. Load GRPO Checkpoint
7.  Cell 6: Code - Load checkpoint with error handling [ENHANCED]

8.  Cell 7: Markdown - ## 🔍 Model Family Verification [NEW]
9.  Cell 8: Code - Model family verification [NEW]

10. Cell 9: Markdown - ## 2. Test LoRA Adapter
11. Cell 10: Code - Test LoRA

12. Cell 11: Markdown - ## 3. Merge LoRA Adapter
13. Cell 12: Code - Merge adapter

14. Cell 13: Markdown - ## 4. Save Merged Model (HF Format)
15. Cell 14: Code - Save merged model + define output_dir

16. Cell 15: Markdown - ## 5. Export to GGUF (Ollama Server Deployment)
17. Cell 16: Code - GGUF export loop (CREATES gguf_outputs variable) [MISSING NOW]

18. Cell 17: Markdown - ## 6. Create Ollama Modelfile
19. Cell 18: Code - Template verification [NEW]
20. Cell 19: Code - Modelfile creation (USES gguf_outputs)

21. Cell 20: Markdown - ## 7. Export to ONNX (Client-Side Deployment)
22. Cell 21: Code - ONNX export with error handling [ENHANCED]

23. Cell 22: Markdown - ## 8. Client-Side Integration Guide
24. Cell 23: Code - Write integration guide

25. Cell 24: Markdown - ## 9. Validation Test Suite
26. Cell 25: Code - Validation queries

27. Cell 26: Markdown - ## 10. Download All Outputs
28. Cell 27: Code - Package and download

29. Cell 28: Markdown - ## Summary
```

---

## 🔧 Required Fixes

### Fix 1: Restore Original Notebook Structure

**Action**: Revert to `Gemma4_Legal_2B_Export_FIXED.ipynb` BEFORE validation cells were added

**Why**: The NotebookEdit insertions corrupted the cell order

### Fix 2: Manually Insert Validation Cells in Correct Positions

**Instead of using NotebookEdit `insert` mode**, manually create a new notebook with:

1. Copy cells 0-2 (Title, Setup heading, Install deps)
2. **INSERT** Cell 3-4: Environment validation (markdown + code)
3. **INSERT** Cell 5: Markdown header for checkpoint loading
4. **INSERT** Cell 6: Enhanced checkpoint loading code
5. **INSERT** Cell 7-8: Model verification (markdown + code)
6. Copy cells 9-13 (Test LoRA, Merge, Save Merged)
7. **INSERT** Cell 16: GGUF export code (MISSING - need to add)
8. **SPLIT** Cell 14 into two: Template verification + Modelfile creation
9. **INSERT** Cell 20-21: ONNX export (enhanced)
10. Copy remaining cells (Client guide, Validation, Download, Summary)

### Fix 3: Add Missing GGUF Export Cell

**Location**: After "Save Merged Model" cell, before "Modelfile creation"

**Code**:
```python
quantization_methods = [
    "q4_k_m",   # ⭐ RECOMMENDED: 1.2GB, balanced quality/speed
    "q8_0",     # Higher quality: 2.3GB
    "q2_k",     # Super small: 600MB (experimental)
]

gguf_outputs = []

for quant_method in quantization_methods:
    print(f"\n{'='*80}")
    print(f"Exporting GGUF: {quant_method.upper()}")
    print(f"{'='*80}")

    try:
        output_file = model.save_pretrained_gguf(
            "gemma4-rotorquant:latest-2b",
            tokenizer,
            quantization_method=quant_method,
        )

        file_size_mb = os.path.getsize(output_file) / (1024 * 1024)
        gguf_outputs.append({
            "method": quant_method,
            "file": output_file,
            "size_mb": file_size_mb,
        })

        print(f"✅ {output_file} ({file_size_mb:.1f} MB)")

    except Exception as e:
        print(f"❌ Failed: {e}")

print("\n" + "="*80)
print("GGUF Export Summary:")
for o in gguf_outputs:
    print(f"  {o['method']:8} | {o['size_mb']:6.1f} MB | {o['file']}")
print("="*80)
```

### Fix 4: Correct Cell 4 Type

**Change**: `<cell_type>markdown</cell_type>` → `<cell_type>code</cell_type>`

### Fix 5: Remove Duplicate Cells

**Delete**:
- Cell 8 (duplicate checkpoint loading)
- Cell 17 (duplicate Modelfile heading)
- Cell 18 (duplicate Modelfile code - keep the enhanced version in cell 14)
- Either cell 16 or 20 (duplicate ONNX - keep the enhanced version)

---

## 🎯 Recommended Action

**Option A: Start Fresh** (RECOMMENDED)
1. Read the ORIGINAL `Gemma4_Legal_2B_Export_and_Quantize.ipynb` (before fixes)
2. Manually create corrected version with proper cell order
3. Insert validation cells in correct positions
4. Add missing GGUF export cell

**Option B: Fix Current Notebook**
1. Delete duplicate cells (8, 17, 18, one of 16/20)
2. Add missing GGUF export cell after "Save Merged Model"
3. Fix cell 4 type (markdown → code)
4. Add missing markdown headers before cells 3 and 5
5. Split cell 14 into template verification + modelfile creation
6. Reorder cells to match correct sequence

---

## 📋 Validation Checklist

After fixing, verify:
- [ ] All cells in correct order (compare to "Correct Cell Order" section above)
- [ ] No duplicate cells
- [ ] All code cells have `cell_type>code`
- [ ] All markdown cells have `cell_type>markdown`
- [ ] `gguf_outputs` defined BEFORE being used in Modelfile cell
- [ ] `output_dir` defined in "Save Merged Model" cell
- [ ] Environment validation runs BEFORE checkpoint loading
- [ ] Model verification runs AFTER checkpoint loading
- [ ] Template verification runs BEFORE Modelfile creation
- [ ] ONNX export appears only once (with error handling)

---

**Status**: ❌ **NOTEBOOK BROKEN** - Needs complete restructure
**Cause**: NotebookEdit insert operations created cells in wrong order
**Fix Time**: ~15 minutes to manually restructure

**Recommendation**: Create new corrected notebook from scratch instead of trying to fix current broken structure.
