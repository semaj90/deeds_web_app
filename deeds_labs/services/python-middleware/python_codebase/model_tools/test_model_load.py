print("🔍 DEBUG: Model loading test started")
import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_DIR = "/workspace/gemma3_270m"
print(f"Loading model from {MODEL_DIR}")

try:
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_DIR,
        torch_dtype=torch.float16,
    )
    print("Model loaded successfully")
    model.eval().cuda()
    print("Model moved to CUDA")
except Exception as e:
    print(f"Error loading model: {e}")
    import traceback
    traceback.print_exc()