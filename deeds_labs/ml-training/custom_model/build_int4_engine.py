#!/usr/bin/env python3
"""
Build INT4 AWQ Engine for Custom Gemma3 Architecture
Creates TensorRT engine with custom attention configuration for 30/17 heads
"""

import os
import sys
import json
import argparse
import torch
from pathlib import Path
from transformers import AutoTokenizer

# TensorRT-LLM imports
try:
    from tensorrt_llm import LLM, BuildConfig
    from tensorrt_llm.models import Gemma3ForCausalLM
    from tensorrt_llm.quantization import QuantConfig
    from tensorrt_llm.plugin import PluginConfig
    TENSORRT_LLM_AVAILABLE = True
except ImportError:
    TENSORRT_LLM_AVAILABLE = False
    print("⚠️ TensorRT-LLM not available, using command-line fallback")

def build_engine_with_api(args):
    """Build engine using TensorRT-LLM Python API"""

    print("🔧 Building with TensorRT-LLM Python API")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint_dir)

    # Custom attention config for 30/17 heads
    attention_config = None
    if args.custom_attention_config and Path(args.custom_attention_config).exists():
        with open(args.custom_attention_config, 'r') as f:
            attention_config = json.load(f)

    # Quantization config for INT4 AWQ
    quant_config = QuantConfig()
    quant_config.quant_mode = "int4_awq"
    quant_config.calibration_dataset = args.checkpoint_dir / "calibration_data.json"

    # Plugin config for RTX 3060 Ti optimization
    plugin_config = PluginConfig()
    plugin_config.gemm_plugin = args.gemm_plugin
    plugin_config.remove_input_padding = True
    plugin_config.paged_kv_cache = True

    # Build config with memory constraints
    build_config = BuildConfig()
    build_config.max_batch_size = args.max_batch_size
    build_config.max_input_len = args.max_input_len
    build_config.max_output_len = args.max_output_len
    build_config.max_num_tokens = args.max_num_tokens
    build_config.plugin_config = plugin_config
    build_config.quant_config = quant_config

    # Custom model config for Gemma3 with 30/17 heads
    model_config = {
        "architecture": "Gemma3ForCausalLM",
        "dtype": "bfloat16",
        "vocab_size": tokenizer.vocab_size,
        "max_position_embeddings": args.max_input_len,
        "hidden_size": 3840,  # Custom hidden size
        "num_attention_heads": 30,  # Custom Q heads
        "num_key_value_heads": 17,  # Custom KV heads
        "intermediate_size": 15360,
        "num_hidden_layers": 34,
        "rms_norm_eps": 1e-6,
        "rope_theta": 10000.0,
        "attention_bias": False,
        "mlp_bias": False,
        "head_dim": 128,
        "vocab_size": 256000
    }

    # Save model config
    config_file = Path(args.output_dir) / "config.json"
    with open(config_file, 'w') as f:
        json.dump(model_config, f, indent=2)

    # Build the model
    model = Gemma3ForCausalLM.from_hugging_face(
        args.checkpoint_dir,
        dtype="bfloat16",
        mapping=None,  # Will be set by build
    )

    # Build TensorRT engine
    engine_dir = Path(args.output_dir)
    engine_dir.mkdir(parents=True, exist_ok=True)

    llm = LLM(
        model=model,
        build_config=build_config,
        tokenizer=tokenizer
    )

    # Save engine
    llm.save(str(engine_dir))

    return True

def build_engine_with_cli(args):
    """Fallback: Build engine using trtllm-build command"""

    print("🔧 Building with trtllm-build command (fallback)")

    # Prepare command
    cmd = [
        "trtllm-build",
        "--checkpoint_dir", args.checkpoint_dir,
        "--output_dir", args.output_dir,
        "--gemm_plugin", args.gemm_plugin,
        "--max_batch_size", str(args.max_batch_size),
        "--max_input_len", str(args.max_input_len),
        "--max_output_len", str(args.max_output_len),
        "--max_num_tokens", str(args.max_num_tokens),
        "--remove_input_padding", args.remove_input_padding,
        "--paged_kv_cache", args.paged_kv_cache,
        "--dtype", "bfloat16",
        "--use_weight_only",
        "--weight_only_precision", "int4_awq",
        "--per_group",
        "--enable_multimodal",
        "--model_config", args.custom_attention_config or "custom_model_config.json"
    ]

    print(f"Running: {' '.join(cmd)}")

    # Execute command
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        print("✅ trtllm-build completed successfully")
        return True
    else:
        print("❌ trtllm-build failed")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="Build INT4 AWQ engine")
    parser.add_argument("--checkpoint_dir", required=True, help="Checkpoint directory")
    parser.add_argument("--output_dir", required=True, help="Output directory")
    parser.add_argument("--gemm_plugin", default="bfloat16", help="GEMM plugin")
    parser.add_argument("--max_batch_size", type=int, default=1, help="Max batch size")
    parser.add_argument("--max_input_len", type=int, default=2048, help="Max input length")
    parser.add_argument("--max_output_len", type=int, default=512, help="Max output length")
    parser.add_argument("--max_num_tokens", type=int, default=2560, help="Max num tokens")
    parser.add_argument("--remove_input_padding", default="enable", help="Remove input padding")
    parser.add_argument("--paged_kv_cache", default="enable", help="Paged KV cache")
    parser.add_argument("--custom_attention_config", help="Custom attention config")

    args = parser.parse_args()

    print("🏗️ Building INT4 AWQ Engine")
    print(f"Checkpoint: {args.checkpoint_dir}")
    print(f"Output: {args.output_dir}")
    print(f"Max Batch Size: {args.max_batch_size}")
    print(f"Max Input Length: {args.max_input_len}")

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # For RTX 3060 Ti 8GB, we need very constrained settings
    print("🎯 RTX 3060 Ti 8GB Optimization Settings:")
    print(f"  - Max batch size: {args.max_batch_size}")
    print(f"  - Max input length: {args.max_input_len}")
    print(f"  - Max output length: {args.max_output_len}")
    print(f"  - Max num tokens: {args.max_num_tokens}")

    success = False

    # Try Python API first
    if TENSORRT_LLM_AVAILABLE:
        try:
            success = build_engine_with_api(args)
        except Exception as e:
            print(f"⚠️ Python API failed: {e}")
            print("Falling back to CLI...")

    # Fallback to CLI
    if not success:
        success = build_engine_with_cli(args)

    if success:
        # Verify engine was created
        engine_files = list(Path(args.output_dir).glob("*.engine"))
        if engine_files:
            print("✅ INT4 AWQ Engine built successfully")
            print(f"📄 Engine saved to {engine_files[0]}")
        else:
            print("⚠️ Engine build completed but no .engine file found")
    else:
        print("❌ Engine build failed")
        sys.exit(1)

if __name__ == "__main__":
    main()