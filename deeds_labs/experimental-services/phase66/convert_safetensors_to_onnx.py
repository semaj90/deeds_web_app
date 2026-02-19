#!/usr/bin/env python3
"""
Convert SafeTensors Gemma3 Model to ONNX Format
For TensorRT-LLM compatibility
"""

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from transformers.onnx import export
import onnxruntime as ort
import numpy as np
import os
import json
from pathlib import Path

def convert_safetensors_to_onnx(model_path: str, output_path: str):
    """Convert SafeTensors model to ONNX format"""

    print(f"🔄 Loading model from: {model_path}")

    # Load model and tokenizer
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.float16,  # Use FP16 for memory efficiency
        device_map="auto",
        trust_remote_code=True
    )

    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)

    # Set pad token if not present
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"✅ Model loaded. Parameters: {sum(p.numel() for p in model.parameters()):,}")

    # Prepare dummy inputs for ONNX export
    dummy_input = tokenizer(
        "Hello world, this is a test input for ONNX export.",
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512
    )

    # Move to same device as model
    dummy_input = {k: v.to(model.device) for k, v in dummy_input.items()}

    print("⚙️ Exporting to ONNX...")

    # Export to ONNX
    export(
        preprocessor=tokenizer,
        model=model,
        config=model.config,
        opset=17,  # ONNX opset version
        output=output_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size", 1: "sequence_length"}
        },
        verbose=True
    )

    print(f"✅ ONNX model exported to: {output_path}")

    # Verify the ONNX model
    print("🔍 Verifying ONNX model...")
    session = ort.InferenceSession(output_path, providers=["CPUExecutionProvider"])

    # Test inference
    ort_inputs = {
        "input_ids": dummy_input["input_ids"].cpu().numpy(),
        "attention_mask": dummy_input["attention_mask"].cpu().numpy()
    }

    outputs = session.run(None, ort_inputs)
    print(f"✅ ONNX inference successful. Output shape: {outputs[0].shape}")

    # Save model info
    model_info = {
        "model_type": "gemma3",
        "original_format": "safetensors",
        "parameters": sum(p.numel() for p in model.parameters()),
        "vocab_size": tokenizer.vocab_size,
        "max_position_embeddings": model.config.max_position_embeddings,
        "hidden_size": model.config.hidden_size,
        "num_attention_heads": model.config.num_attention_heads,
        "num_hidden_layers": model.config.num_hidden_layers,
        "torch_dtype": str(model.dtype),
        "onnx_opset": 17
    }

    info_path = output_path.replace(".onnx", "_info.json")
    with open(info_path, "w") as f:
        json.dump(model_info, f, indent=2)

    print(f"📋 Model info saved to: {info_path}")

    return True

def main():
    import sys

    if len(sys.argv) != 3:
        print("Usage: python convert_safetensors_to_onnx.py <model_path> <output_onnx>")
        print("Example: python convert_safetensors_to_onnx.py ./model_unsloth_hf_f16 model.onnx")
        sys.exit(1)

    model_path = sys.argv[1]
    output_path = sys.argv[2]

    try:
        convert_safetensors_to_onnx(model_path, output_path)
        print("🎉 SafeTensors to ONNX conversion completed successfully!")
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()