#!/usr/bin/env python3
"""
Export Gemma3:270m to ONNX for client-side inference
"""

import os
from transformers import AutoTokenizer, AutoModelForCausalLM
from optimum.onnxruntime import ORTModelForCausalLM
import torch

def export_gemma3_onnx():
    model_name = "google/gemma-3-270m"  # Adjust if different
    output_dir = "public/models/gemma3-270m-onnx"

    print(f"Loading {model_name}...")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Load model
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto"
    )

    print("Converting to ONNX...")

    # Export to ONNX using Optimum
    ort_model = ORTModelForCausalLM.from_pretrained(
        model_name,
        export=True,
        provider="CUDAExecutionProvider" if torch.cuda.is_available() else "CPUExecutionProvider"
    )

    # Save
    os.makedirs(output_dir, exist_ok=True)
    ort_model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)

    print(f"✅ Exported to {output_dir}")

    # Create a simple test
    print("Testing ONNX model...")
    inputs = tokenizer("Hello, legal AI!", return_tensors="pt")
    with torch.no_grad():
        outputs = ort_model(**inputs)
        print(f"Output shape: {outputs.logits.shape}")

if __name__ == "__main__":
    export_gemma3_onnx()