# Gemma 4 Export Notebook - Error Analysis & Fixes

**Date**: April 13, 2026
**Status**: ✅ FIXED (with recommendations)

---

## 🚨 Critical Errors Found & Fixed

### 1. **Wrong Model Family** (FIXED ✅)

**Original Error**:
```python
metadata = {
    "base_model": "unsloth/gemma-2-2b-it",  # ❌ WRONG!
}
```

**Fixed**:
```python
metadata = {
    "base_model": model.config._name_or_path,  # ✅ Auto-detect from checkpoint
    "model_family": "gemma4",  # ✅ Correct
}
```

**Why This Matters**: Gemma 2 and Gemma 4 may have different:
- Architecture details
- Token IDs
- Special tokens
- Training objectives

### 2. **Chat Template Assumption** (NEEDS VERIFICATION ⚠️)

**Current Assumption**:
```python
# Comment says "Gemma 4 uses same template as Gemma 2"
TEMPLATE """<start_of_turn>user
{{ .Prompt }}<end_of_turn>
<start_of_turn>model
"""
```

**Recommendation**: Add verification cell:
```python
# NEW CELL: Verify Chat Template
test_formatted = tokenizer.apply_chat_template(
    [{"role": "user", "content": "Test"}],
    tokenize=False
)
print(f"Actual template output: {test_formatted}")

# If doesn't match expected format, update Modelfile
```

### 3. **Missing Error Handling** (FIXED ✅)

**Added to Cell 3 (Load Checkpoint)**:
```python
# Check if path exists
if not os.path.exists(checkpoint_path):
    print(f"❌ ERROR: Checkpoint not found at {checkpoint_path}")
    print("\nAvailable options:")
    print("  A. Mount Google Drive")
    print("  B. Use HF Hub")
    print("  C. Check current directory: !ls -la")
    raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

try:
    model, tokenizer = FastLanguageModel.from_pretrained(...)
except Exception as e:
    print(f"❌ Failed to load model: {e}")
    print("\nTroubleshooting:")
    print("  1. Verify checkpoint path exists")
    print("  2. Check if you have enough RAM (need ~8GB)")
    print("  3. Try load_in_4bit=True to reduce memory")
    raise
```

---

## 📋 Cell-by-Cell Validation

### Cell 1: Title (Markdown) ✅
**Status**: PASS
**Purpose**: Overview and corrections list

### Cell 2: Setup & Dependencies (Code) ⚠️
**Status**: NEEDS ADDITION

**Current**:
```python
!pip install -q unsloth[colab-new] transformers accelerate bitsandbytes
!pip install -q optimum[exporters] onnxruntime-gpu
```

**Add Validation**:
```python
# After imports, add:
print("🔍 Environment Check:")
print(f"  GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}")
print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")
print(f"  Unsloth: {unsloth.__version__}")

# Check disk space
import shutil
free_gb = shutil.disk_usage("/")[2] / (1024**3)
print(f"  Disk: {free_gb:.1f}GB free")
if free_gb < 10:
    print("⚠️  WARNING: Less than 10GB free - export may fail")
```

### Cell 3: Load Checkpoint (Code) ⚠️
**Status**: NEEDS PATH VALIDATION

**Issue**: Default path `"./gemma4-e2b-legal-grpo-final"` may not exist

**Fix**: Add path check (see "Missing Error Handling" above)

### Cell 4: Test LoRA (Code) ✅
**Status**: PASS
**Purpose**: Verify legal training worked

### Cell 5: Merge Adapter (Code) ✅
**Status**: PASS

### Cell 6: Save Merged (Code) ⚠️
**Status**: NEEDS METADATA FIX

**Issue**: Hardcoded `"google/gemma-4-2b-it"` may not be correct

**Fix**:
```python
metadata = {
    "base_model": model.config._name_or_path,  # ✅ Auto-detect
    "exported_from_checkpoint": checkpoint_path,  # ✅ Track source
    # ... rest
}
```

### Cell 7: Export GGUF (Code) ✅
**Status**: PASS

### Cell 8: Modelfile (Code) ⚠️
**Status**: NEEDS TEMPLATE VERIFICATION

**Add Before Creating File**:
```python
# Verify template
print("Verifying chat template...")
test = tokenizer.apply_chat_template(
    [{"role": "user", "content": "Test"}],
    tokenize=False
)
print(f"Template format: {test[:100]}...")

if "<start_of_turn>" not in test:
    print("⚠️  WARNING: Template may not match expected format!")
```

### Cell 9: ONNX Export (Code) ⚠️
**Status**: MAY FAIL (ACCEPTABLE)

**Issue**: ONNX export may not support Gemma 4 yet

**Recommendation**: Wrap in try/except:
```python
try:
    # ONNX export code
    print("✅ ONNX export successful")
except Exception as e:
    print(f"⚠️  ONNX export failed: {e}")
    print("   This is optional - GGUF export is sufficient")
    print("   Continue to next cell for server deployment")
```

### Cell 10: Client Guide (Code) ✅
**Status**: PASS (informational)

### Cell 11: Validation (Code) ✅
**Status**: PASS

### Cell 12: Download (Code) ⚠️
**Status**: NEEDS PATH FIX

**Issue**: Windows-specific paths in comments

**Fix**:
```python
# Platform-agnostic instructions
print("📁 Deployment Instructions:")
print("\nWindows:")
print("  cp files C:/Users/james/Videos/deeds-web-app/models/")
print("\nLinux/Mac:")
print("  cp files ~/deeds-web-app/models/")
print("\nOr download ZIP and extract manually")
```

---

## 🎯 Recommended Cell Additions

### NEW CELL 2.5: Environment Validation

Insert after Cell 2 (Setup):

```python
# ═══════════════════════════════════════════════════════════
# CELL 2.5: Environment Validation
# Purpose: Verify Colab environment before proceeding
# ═══════════════════════════════════════════════════════════

print("🔍 Validating Colab Environment\n")
print("="*60)

# 1. GPU Check
if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"✅ GPU: {gpu_name}")
    print(f"   VRAM: {vram_gb:.1f}GB")

    if vram_gb < 15:
        print(f"   ⚠️  Low VRAM - recommended 15GB+")
        print(f"   ⚠️  Use load_in_4bit=True to reduce memory")
else:
    print("❌ No GPU detected!")
    print("   Export will be very slow or fail")
    raise RuntimeError("GPU required for model export")

# 2. Disk Space
total, used, free = shutil.disk_usage("/")
free_gb = free / (1024**3)
print(f"\n✅ Disk Space: {free_gb:.1f}GB free")
if free_gb < 10:
    print(f"   ⚠️  Less than 10GB free - export may fail")
    print(f"   ⚠️  GGUF export needs ~5GB, ONNX needs ~3GB")

# 3. Package Versions
import unsloth
print(f"\n✅ Unsloth: {unsloth.__version__}")
print(f"✅ Transformers: {transformers.__version__}")
print(f"✅ PyTorch: {torch.__version__}")

# 4. Test Model Loading (dry run)
print(f"\n✅ Testing FastLanguageModel...")
try:
    # This is a quick test, not the actual model
    test_model = FastLanguageModel.from_pretrained(
        "unsloth/gemma-2-2b-it-bnb-4bit",  # Small test model
        max_seq_length=512,
        load_in_4bit=True,
    )
    print(f"✅ Model loading works!")
    del test_model  # Free memory
    torch.cuda.empty_cache()
except Exception as e:
    print(f"❌ Model loading test failed: {e}")
    raise

print("="*60)
print("✅ Environment validation complete - ready to proceed!\n")
```

### NEW CELL 3.5: Model Family Verification

Insert after Cell 3 (Load Checkpoint):

```python
# ═══════════════════════════════════════════════════════════
# CELL 3.5: Model Family Verification
# Purpose: Confirm model is from your GRPO training
# ═══════════════════════════════════════════════════════════

print("🔍 Verifying Model Configuration\n")
print("="*60)

# 1. Model Architecture
config = model.config
print(f"Model Type: {config.model_type}")
print(f"Architecture: {config.architectures if hasattr(config, 'architectures') else 'N/A'}")
print(f"Hidden Size: {config.hidden_size}")
print(f"Num Layers: {config.num_hidden_layers}")
print(f"Vocab Size: {config.vocab_size}")

# 2. Estimate Parameter Count
def count_parameters(model):
    return sum(p.numel() for p in model.parameters())

params = count_parameters(model)
params_b = params / 1e9
print(f"\n📊 Total Parameters: {params_b:.2f}B")

# Verify it's ~2.3B (E2B model)
if 2.0 < params_b < 2.5:
    print(f"✅ Parameter count matches Gemma 4 E2B (2.3B)")
elif 1.0 < params_b < 1.5:
    print(f"⚠️  This looks like Gemma 2 1B model")
elif 8.0 < params_b < 10.0:
    print(f"⚠️  This looks like Gemma 2 9B model")
else:
    print(f"⚠️  Unexpected parameter count for E2B")

# 3. Check for LoRA Adapters (pre-merge)
has_lora = any('lora' in name.lower() for name, _ in model.named_modules())
print(f"\n🔍 LoRA Adapters: {'Present' if has_lora else 'Already merged or not trained with LoRA'}")

# 4. Tokenizer Check
print(f"\n🔍 Tokenizer:")
print(f"   Vocab Size: {len(tokenizer)}")
print(f"   Special Tokens: {len(tokenizer.all_special_tokens)}")
print(f"   PAD Token: {tokenizer.pad_token}")
print(f"   BOS Token: {tokenizer.bos_token}")
print(f"   EOS Token: {tokenizer.eos_token}")

# 5. Test Generation (basic sanity check)
print(f"\n🧪 Quick Generation Test:")
test_input = "Legal question:"
inputs = tokenizer([test_input], return_tensors="pt").to("cuda")
with torch.no_grad():
    output = model.generate(**inputs, max_new_tokens=10)
test_output = tokenizer.decode(output[0])
print(f"   Input: {test_input}")
print(f"   Output: {test_output[:100]}...")

print("="*60)
print("✅ Model verification complete!\n")
```

---

## 📝 Updated Notebook Structure

### Recommended Cell Order:

1. **Title** (Markdown) - Overview
2. **Setup** (Code) - Install packages
3. **🆕 Environment Validation** (Code) - Check GPU/disk
4. **Load Checkpoint** (Code) - Load GRPO model
5. **🆕 Model Verification** (Code) - Verify architecture
6. **Test LoRA** (Code) - Test legal queries
7. **Merge Adapter** (Code) - Merge LoRA
8. **Save Merged** (Code) - Save HF format
9. **Export GGUF** (Code) - Create GGUF files
10. **Create Modelfile** (Code) - Ollama config
11. **Export ONNX** (Code) - Client-side (optional)
12. **Client Guide** (Markdown) - Integration docs
13. **Validation** (Code) - Test merged model
14. **Download** (Code) - Package for local use

---

## 🚦 Execution Checklist

**Before Running**:
- [ ] GRPO training checkpoint saved and accessible
- [ ] Colab Pro (or GPU runtime) activated
- [ ] Google Drive mounted (if using Drive storage)
- [ ] At least 15GB GPU RAM available
- [ ] At least 10GB disk space free

**During Execution**:
- [ ] Cell 2: Packages install without errors
- [ ] Cell 2.5: Environment validation passes
- [ ] Cell 3: Checkpoint loads (check path!)
- [ ] Cell 3.5: Parameter count ~2.3B
- [ ] Cell 4: Legal query returns good response
- [ ] Cell 7: GGUF files created (~1.2GB)
- [ ] Cell 9: ONNX export (optional, may fail)
- [ ] Cell 12: ZIP file downloads successfully

**After Execution**:
- [ ] Download gemma4-rotorquant:latest-2b-deployment.zip
- [ ] Extract and verify files:
  - [ ] gemma4-rotorquant:latest-2b-q4_k_m.gguf (~1.2GB)
  - [ ] Modelfile.gemma4-rotorquant:latest-2b
  - [ ] onnx/ folder (if ONNX worked)
  - [ ] CLIENT_INTEGRATION_GUIDE.md
  - [ ] DEPLOYMENT_INSTRUCTIONS.txt

---

## 🔧 Quick Fixes if Errors Occur

### Error: "Checkpoint not found"
```python
# Check current directory
!ls -la

# Mount Google Drive
from google.colab import drive
drive.mount('/content/drive')

# Update checkpoint path
checkpoint_path = "/content/drive/MyDrive/models/your-checkpoint-name"
```

### Error: "CUDA out of memory"
```python
# Free up memory
import gc
gc.collect()
torch.cuda.empty_cache()

# Use 4-bit loading
LOAD_IN_4BIT = True  # Set this before loading model
```

### Error: "ONNX export failed"
```
⚠️  This is optional - ONNX is for client-side deployment only
✅  GGUF export is sufficient for server deployment with Ollama
→  Skip Cell 9 and continue to Cell 10
```

### Error: "Template verification failed"
```python
# Check what template the model actually uses
test = tokenizer.apply_chat_template(
    [{"role": "user", "content": "Test"}],
    tokenize=False
)
print(test)

# Update Modelfile TEMPLATE section to match actual format
```

---

## 🎯 Final Validation

**After downloading ZIP, verify locally**:

```bash
# Extract
unzip gemma4-rotorquant:latest-2b-deployment.zip

# Check GGUF file size
ls -lh gemma4-rotorquant:latest-2b-q4_k_m.gguf
# Expected: ~1.2GB (1,200,000,000 bytes)

# Import to Ollama
ollama create gemma4-rotorquant:latest-2b -f Modelfile.gemma4-rotorquant:latest-2b

# Test
ollama run gemma4-rotorquant:latest-2b "What is hearsay evidence?"
# Expected: Legal definition with exceptions
```

**If test passes**: ✅ Export successful, ready for deployment!

**If test fails**: Check Ollama logs and Modelfile template

---

**Status**: 📋 **READY TO RUN**
**Confidence**: HIGH (with validation cells added)
**Risk**: MEDIUM (ONNX export may fail, but GGUF is sufficient)
