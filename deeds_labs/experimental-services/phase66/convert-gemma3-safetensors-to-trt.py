#!/usr/bin/env python3
"""
Merge Gemma3 Safetensors and Convert to TensorRT-LLM Engine
Handles chunked safetensors from model_unsloth_hf_f16
"""

import os
import sys
import torch
from safetensors.torch import load_file, save_file
from transformers import AutoTokenizer, AutoModelForCausalLM
import onnxruntime as ort
from onnxconverter_common import float16
import onnx
import subprocess
import shutil

def merge_safetensors_chunks(input_dir: str, output_path: str):
    """Merge chunked safetensors files into single file"""
    print(f"🔄 Merging safetensors from {input_dir}...")

    # Find all safetensors files
    safetensors_files = [f for f in os.listdir(input_dir) if f.endswith('.safetensors')]
    safetensors_files.sort()  # Ensure consistent ordering

    if not safetensors_files:
        raise FileNotFoundError(f"No safetensors files found in {input_dir}")

    print(f"📁 Found {len(safetensors_files)} chunks: {safetensors_files}")

    # Load and merge tensors
    merged_state_dict = {}
    for chunk_file in safetensors_files:
        chunk_path = os.path.join(input_dir, chunk_file)
        print(f"  Loading {chunk_file}...")
        chunk_tensors = load_file(chunk_path)
        merged_state_dict.update(chunk_tensors)

    # Save merged state dict
    print(f"💾 Saving merged model to {output_path}...")
    save_file(merged_state_dict, output_path)
    print("✅ Safetensors merge complete"
    return output_path

def convert_safetensors_to_hf(input_dir: str, output_dir: str):
    """Convert merged safetensors to HuggingFace format"""
    print(f"🔄 Converting to HuggingFace format...")

    # Copy config and tokenizer files
    config_files = ['config.json', 'tokenizer.json', 'tokenizer.model', 'tokenizer_config.json',
                   'special_tokens_map.json', 'generation_config.json', 'preprocessor_config.json']

    for config_file in config_files:
        src = os.path.join(input_dir, config_file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(output_dir, config_file))

    # Load merged safetensors
    merged_path = os.path.join(output_dir, 'pytorch_model.bin')
    if not os.path.exists(merged_path):
        merge_safetensors_chunks(input_dir, merged_path.replace('.bin', '.safetensors'))

    print("✅ HuggingFace conversion complete"
    return output_dir

def export_to_onnx(model_path: str, onnx_path: str):
    """Export HuggingFace model to ONNX"""
    print(f"🔄 Exporting to ONNX: {model_path} -> {onnx_path}")

    # Load model and tokenizer
    print("  Loading model and tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForCausalLM.from_pretrained(model_path, torch_dtype=torch.float16)

    # Set pad token if missing
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # ONNX export configuration
    onnx_config = {
        "input_ids": torch.randint(0, tokenizer.vocab_size, (1, 128)),
        "attention_mask": torch.ones(1, 128, dtype=torch.int64),
    }

    # Export to ONNX
    print("  Exporting model to ONNX...")
    torch.onnx.export(
        model,
        (onnx_config["input_ids"], onnx_config["attention_mask"]),
        onnx_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size", 1: "sequence_length"}
        },
        opset_version=17,
        verbose=False
    )

    print("✅ ONNX export complete"
    return onnx_path

def convert_to_fp16(onnx_path: str, fp16_path: str):
    """Convert ONNX model to FP16"""
    print(f"⚙️ Converting {onnx_path} to FP16...")

    model = onnx.load(onnx_path)
    fp16_model = float16.convert_float_to_float16(model, keep_io_types=True)
    onnx.save(fp16_model, fp16_path)

    # Verify
    sess = ort.InferenceSession(fp16_path, providers=["CPUExecutionProvider"])
    print("✅ FP16 conversion verified"
    return fp16_path

def build_tensorrt_engine(fp16_onnx: str, engine_path: str):
    """Build TensorRT engine from FP16 ONNX"""
    print(f"🚀 Building TensorRT engine: {fp16_onnx} -> {engine_path}")

    cmd = [
        "trtexec",
        f"--onnx={fp16_onnx}",
        f"--saveEngine={engine_path}",
        "--minShapes=input_ids:1x1",
        "--optShapes=input_ids:1x128",
        "--maxShapes=input_ids:1x512",
        "--fp16",
        "--verbose"
    ]

    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("❌ TensorRT build failed:")
        print(result.stderr)
        sys.exit(1)

    print("✅ TensorRT engine built successfully"
    return engine_path

def main():
    # Paths
    input_dir = "/workspace/models/model_unsloth_hf_f16"
    workspace_dir = "/workspace"
    hf_model_dir = os.path.join(workspace_dir, "models", "gemma3_hf")
    onnx_path = os.path.join(workspace_dir, "models", "gemma3.onnx")
    fp16_onnx_path = os.path.join(workspace_dir, "models", "gemma3_fp16.onnx")
    engine_path = os.path.join(workspace_dir, "engines", "gemma3_fp16.plan")

    # Create directories
    os.makedirs(os.path.dirname(hf_model_dir), exist_ok=True)
    os.makedirs(os.path.dirname(engine_path), exist_ok=True)

    try:
        # Step 1: Convert to HuggingFace format
        print("=== Step 1: Convert to HuggingFace ===")
        convert_safetensors_to_hf(input_dir, hf_model_dir)

        # Step 2: Export to ONNX
        print("\n=== Step 2: Export to ONNX ===")
        export_to_onnx(hf_model_dir, onnx_path)

        # Step 3: Convert to FP16
        print("\n=== Step 3: Convert to FP16 ===")
        convert_to_fp16(onnx_path, fp16_onnx_path)

        # Step 4: Build TensorRT engine
        print("\n=== Step 4: Build TensorRT Engine ===")
        build_tensorrt_engine(fp16_onnx_path, engine_path)

        print("
🎉 Complete pipeline successful!"        print(f"📁 Engine saved to: {engine_path}")

    except Exception as e:
        print(f"❌ Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()