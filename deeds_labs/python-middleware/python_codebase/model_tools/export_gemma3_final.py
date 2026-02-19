import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

import sys

# Redirect stdout and stderr to a log file
log_file = open("/tmp/gemma3_onnx_export.log", "w")
sys.stdout = log_file
sys.stderr = log_file

print("DEBUG: Script started")

MODEL_DIR = "/workspace/gemma3_270m"
OUT_DIR = "/tmp/gemma3_270m_onnx"

os.makedirs(OUT_DIR, exist_ok=True)

print("Exporting Gemma3 270M to ONNX")

# Load model
print("DEBUG: loading model...")
model = AutoModelForCausalLM.from_pretrained(
    MODEL_DIR,
    torch_dtype=torch.float16,
)
model.eval().cuda()
print("Model loaded")

# Patch forward() to remove past_key_values
orig_forward = model.forward
def patched_forward(input_ids, attention_mask=None):
    out = orig_forward(
        input_ids=input_ids,
        attention_mask=attention_mask,
        use_cache=False,
        return_dict=False,
    )
    return out[0]  # logits only

model.forward = patched_forward
print("Forward patched")

# Dummy input
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
dummy = tokenizer("hello world", return_tensors="pt")
dummy = {k: v.cuda() for k, v in dummy.items()}

onnx_path = f"{OUT_DIR}/gemma3_270m_fp16.onnx"
print("Writing ONNX ->", onnx_path)

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
        verbose=True, # Added verbose for more detailed output
    )
    print("SUCCESS: ONNX export completed")
    # Check file size
    file_size = os.path.getsize(onnx_path)
    print(f"ONNX file size: {file_size} bytes")

except Exception as e:
    print("FAILED: ONNX export error")
    print(str(e))
    import traceback
    traceback.print_exc()

print("Script completed.")