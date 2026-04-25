import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

print("🔍 DEBUG: Script started")

MODEL_DIR = "/workspace/gemma3_270m"
OUT_DIR = "/workspace/gemma3_270m_onnx"

print(f"🔧 MODEL_DIR = {MODEL_DIR}")
print(f"🔧 OUT_DIR   = {OUT_DIR}")

os.makedirs(OUT_DIR, exist_ok=True)

print("🚀 Exporting Gemma3 270M → ONNX")

# -------------------------------------------------------------
# Load model (FP16, no remote code)
# -------------------------------------------------------------
print("🔍 DEBUG: Loading model...")
model = AutoModelForCausalLM.from_pretrained(
    MODEL_DIR,
    torch_dtype=torch.float16,
)
model.eval().cuda()
print("✅ Model loaded")

# -------------------------------------------------------------
# PATCH model.forward to return ONLY logits
# -------------------------------------------------------------
print("🔍 DEBUG: Patching forward()")

orig_forward = model.forward

def patched_forward(input_ids, attention_mask=None):
    out = orig_forward(
        input_ids=input_ids,
        attention_mask=attention_mask,
        use_cache=False,
        return_dict=False,
    )
    logits = out[0]   # first element = logits
    return logits

model.forward = patched_forward
print("✅ Patch applied")

# -------------------------------------------------------------
# Tokenizer + dummy input
# -------------------------------------------------------------
print("🔍 DEBUG: Loading tokenizer")
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)

dummy = tokenizer("hello world", return_tensors="pt")
dummy = {k: v.cuda() for k, v in dummy.items()}

print("🔍 Dummy input ready")

# -------------------------------------------------------------
# Export to ONNX
# -------------------------------------------------------------
onnx_path = f"{OUT_DIR}/gemma3_270m_fp16.onnx"
print(f"📦 Writing ONNX → {onnx_path}")

try:
    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        onnx_path,
        opset_version=17,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"},
        },
        do_constant_folding=True,
    )
    print("🎉 SUCCESS — ONNX export finished!")
except Exception as e:
    print("❌ ONNX EXPORT FAILED")
    print(str(e))

print("🔚 Script completed.")