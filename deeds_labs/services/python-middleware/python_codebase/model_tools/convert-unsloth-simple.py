#!/usr/bin/env python3
"""
Simple Unsloth to TensorRT Engine Converter
"""

import os
import sys
import json
import subprocess
import shutil
from pathlib import Path

# Configuration
SOURCE_MODEL = "model_unsloth_hf_f16"
TARGET_ENGINE_DIR = "tensorrt_models/unsloth_legal_engine"
WORKSPACE = "tensorrt_workspace/unsloth_conversion"

def setup_conversion():
    """Setup directories and validate model"""
    print("Setting up Unsloth -> TensorRT conversion")
    print("=" * 50)

    # Create directories
    Path(TARGET_ENGINE_DIR).mkdir(parents=True, exist_ok=True)
    Path(WORKSPACE).mkdir(parents=True, exist_ok=True)

    # Validate source model
    source_path = Path(SOURCE_MODEL)
    if not source_path.exists():
        print(f"ERROR: Source model not found: {SOURCE_MODEL}")
        return False

    required_files = ["config.json", "tokenizer.json", "model.safetensors.index.json"]
    missing_files = [f for f in required_files if not (source_path / f).exists()]

    if missing_files:
        print(f"ERROR: Missing required files: {missing_files}")
        return False

    print(f"SUCCESS: Source model validated: {SOURCE_MODEL}")
    print(f"SUCCESS: Target directory: {TARGET_ENGINE_DIR}")

    return True

def check_model_architecture():
    """Check and report model architecture"""
    config_path = Path(SOURCE_MODEL) / "config.json"

    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"\nModel Information:")
    print(f"   Architecture: {config.get('architectures', ['Unknown'])[0]}")
    print(f"   Model Type: {config.get('model_type', 'Unknown')}")
    print(f"   Hidden Size: {config.get('hidden_size', 'Unknown')}")
    print(f"   Layers: {config.get('num_hidden_layers', 'Unknown')}")
    print(f"   Heads: {config.get('num_attention_heads', 'Unknown')}")
    print(f"   Vocab Size: {config.get('vocab_size', 'Unknown')}")

    return config

def run_wsl_conversion():
    """Run conversion in WSL2"""
    print("\nAttempting WSL2 conversion...")

    wsl_script = f"""
    cd /mnt/c/Users/james/Videos/deeds-web-app

    # Check if TensorRT-LLM is available
    if ! python3 -c "import tensorrt_llm" 2>/dev/null; then
        echo "Installing TensorRT-LLM in WSL2..."
        pip3 install tensorrt-llm --extra-index-url https://pypi.nvidia.com --timeout 300
    fi

    # Convert model
    python3 -m tensorrt_llm.commands.convert_checkpoint \\
        --model_dir {SOURCE_MODEL} \\
        --output_dir {WORKSPACE}/checkpoint \\
        --dtype float16 \\
        --tp_size 1

    python3 -m tensorrt_llm.commands.build \\
        --checkpoint_dir {WORKSPACE}/checkpoint \\
        --output_dir {TARGET_ENGINE_DIR} \\
        --gemm_plugin float16 \\
        --gpt_attention_plugin float16 \\
        --max_batch_size 2 \\
        --max_input_len 2048 \\
        --max_output_len 1024
    """

    try:
        print("Running WSL2 conversion command...")
        result = subprocess.run(["wsl", "bash", "-c", wsl_script],
                              capture_output=True, text=True, timeout=1800)

        if result.returncode == 0:
            print("SUCCESS: WSL2 conversion completed")
            return True
        else:
            print(f"ERROR: WSL2 conversion failed")
            print(f"STDERR: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("ERROR: WSL2 conversion timed out")
        return False
    except Exception as e:
        print(f"ERROR: WSL2 error: {e}")
        return False

def copy_tokenizer_files():
    """Copy tokenizer and config files to engine directory"""
    print("\nCopying tokenizer files...")

    tokenizer_files = [
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "tokenizer.model",
        "chat_template.json",
        "added_tokens.json",
        "config.json",
        "generation_config.json"
    ]

    source_dir = Path(SOURCE_MODEL)
    target_dir = Path(TARGET_ENGINE_DIR)

    copied_files = []
    for file_name in tokenizer_files:
        source_file = source_dir / file_name
        if source_file.exists():
            target_file = target_dir / file_name
            shutil.copy2(source_file, target_file)
            copied_files.append(file_name)

    print(f"SUCCESS: Copied: {', '.join(copied_files)}")

def validate_conversion():
    """Validate the converted engine"""
    print("\nValidating conversion...")

    engine_dir = Path(TARGET_ENGINE_DIR)

    # Check for engine files
    engine_files = list(engine_dir.glob("*.plan")) + list(engine_dir.glob("*.engine"))
    if not engine_files:
        print("ERROR: No engine files found")
        return False

    for engine_file in engine_files:
        size_mb = engine_file.stat().st_size / (1024 * 1024)
        print(f"SUCCESS: Engine: {engine_file.name} ({size_mb:.1f} MB)")

    # Check for config files
    config_files = ["config.json", "tokenizer.json"]
    for config_file in config_files:
        if (engine_dir / config_file).exists():
            print(f"SUCCESS: Found: {config_file}")
        else:
            print(f"WARNING: Missing: {config_file}")

    return True

def show_docker_alternative():
    """Show Docker command for manual conversion"""
    print("\nAlternative: Manual Docker Conversion")
    print("=" * 40)

    docker_cmd = f"""docker run --rm --gpus all \\
    -v {os.getcwd()}:/workspace \\
    -w /workspace \\
    nvcr.io/nvidia/tensorrt:24.02-py3 \\
    bash -c "
        pip install tensorrt-llm --extra-index-url https://pypi.nvidia.com && \\
        python -m tensorrt_llm.commands.convert_checkpoint \\
            --model_dir {SOURCE_MODEL} \\
            --output_dir {WORKSPACE}/checkpoint \\
            --dtype float16 \\
            --tp_size 1 && \\
        python -m tensorrt_llm.commands.build \\
            --checkpoint_dir {WORKSPACE}/checkpoint \\
            --output_dir {TARGET_ENGINE_DIR} \\
            --gemm_plugin float16 \\
            --gpt_attention_plugin float16 \\
            --max_batch_size 2 \\
            --max_input_len 2048 \\
            --max_output_len 1024
    "
"""

    print("Run this command manually:")
    print(docker_cmd)

def main():
    """Main conversion process"""
    print("Converting Unsloth Model to TensorRT Engine")

    try:
        # Step 1: Setup
        if not setup_conversion():
            return False

        # Step 2: Check model
        config = check_model_architecture()

        # Step 3: Try WSL2 conversion
        print("\nStarting conversion process...")

        if run_wsl_conversion():
            print("SUCCESS: WSL2 conversion successful")

            # Step 4: Copy supporting files
            copy_tokenizer_files()

            # Step 5: Validate
            if validate_conversion():
                print("\nConversion completed!")
                print(f"Engine location: {TARGET_ENGINE_DIR}")
                print(f"Ready for legal AI inference")
            else:
                print("ERROR: Validation failed")
        else:
            print("WSL2 conversion failed")
            show_docker_alternative()

    except Exception as e:
        print(f"ERROR: Conversion error: {e}")
        return False

    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)