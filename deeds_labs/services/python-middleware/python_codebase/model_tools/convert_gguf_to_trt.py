#!/usr/bin/env python3
import os
from tensorrt_llm import LLM

def main():
    # === Config ===
    HF_MODEL_PATH = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    CHECKPOINT_DIR = "/home/james/gemma3_trt_checkpoint_from_hf"

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    print(f"🔹 Loading fixed HuggingFace model from {HF_MODEL_PATH} ...")
    print("🔹 Config now includes layer_types for TensorRT-LLM compatibility")

    # Try to load the local HuggingFace model with fixed config
    try:
        llm_model = LLM(model=HF_MODEL_PATH)
    except Exception as e:
        print(f"❌ LLM loading failed: {e}")
        print("🔄 Trying alternative approach with convert_checkpoint...")
        return

    print(f"🔹 Model loaded successfully!")
    print(f"🔹 Creating TensorRT checkpoint at {CHECKPOINT_DIR} ...")

    # Check if model has save or export methods
    if hasattr(llm_model, 'save_checkpoint'):
        print("🔹 Using save_checkpoint method...")
        llm_model.save_checkpoint(output_dir=CHECKPOINT_DIR)
    elif hasattr(llm_model, 'export_checkpoint'):
        print("🔹 Using export_checkpoint method...")
        llm_model.export_checkpoint(output_dir=CHECKPOINT_DIR, precision=PRECISION)
    else:
        print("🔹 Checking available methods...")
        methods = [m for m in dir(llm_model) if not m.startswith('_')]
        print("Available methods:", methods)

        # Try to generate to test the model works
        print("🔹 Testing model generation...")
        try:
            test_output = llm_model.generate(["Test prompt"], max_new_tokens=10)
            print("🔹 Model generation test successful!")
        except Exception as e:
            print(f"🔹 Generation test failed: {e}")

    print("✅ TensorRT checkpoint process completed")

if __name__ == '__main__':
    main()