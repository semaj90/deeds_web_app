# Phase 70: TensorRT Engine Builder
# Builds optimized engines for Gemma3-Legal without downloading base images
# Uses cached NVIDIA TensorRT container

#!/usr/bin/env python3

import os
import sys
import json
import logging
import argparse
from pathlib import Path

# TensorRT-LLM imports (available in NVIDIA container)
try:
    from tensorrt_llm.commands.build import build
    from tensorrt_llm import logger as trt_logger
    TENSORRT_AVAILABLE = True
except ImportError:
    TENSORRT_AVAILABLE = False

def setup_logging():
    """Setup logging configuration"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger(__name__)
    return logger

def load_config(config_path: str) -> dict:
    """Load engine build configuration"""
    with open(config_path, 'r') as f:
        config = json.load(f)
    return config

def build_engine(model_path: str, engine_path: str, config: dict, logger):
    """Build TensorRT engine using the NVIDIA container's pre-installed tools"""

    if not TENSORRT_AVAILABLE:
        logger.error("TensorRT-LLM not available in this environment")
        return False

    try:
        logger.info(f"Building engine for model: {model_path}")
        logger.info(f"Output path: {engine_path}")
        logger.info(f"Config: {config}")

        # Use TensorRT-LLM build command
        build_args = [
            "--checkpoint_dir", model_path,
            "--output_dir", engine_path,
            "--max_batch_size", str(config.get("max_batch_size", 2)),
            "--max_input_len", str(config.get("max_input_len", 1024)),
            "--max_seq_len", str(config.get("max_seq_len", 2048)),
            "--max_beam_width", str(config.get("max_beam_width", 1)),
            "--use_gemm_plugin", config.get("use_gemm_plugin", "auto"),
            "--use_gpt_attention_plugin", config.get("use_gpt_attention_plugin", "float16"),
            "--paged_kv_cache",
            "--dtype", config.get("dtype", "float16"),
            "--use_weight_only",
            "--weight_only_precision", config.get("weight_only_precision", "int4_awq"),
            "--per_group",
            "--group_size", str(config.get("group_size", 128)),
            "--int8_kv_cache"
        ]

        logger.info(f"Build command: tensorrt_llm.commands.build {' '.join(build_args)}")

        # Execute build
        build(build_args)

        # Check if engine was created
        engine_file = os.path.join(engine_path, "gemma3_legal.plan")
        if os.path.exists(engine_file):
            engine_size = os.path.getsize(engine_file) / (1024 * 1024)  # MB
            logger.info(".1f"            return True
        else:
            logger.error(f"Engine file not found: {engine_file}")
            return False

    except Exception as e:
        logger.error(f"Engine build failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Phase 70 TensorRT Engine Builder")
    parser.add_argument("--model-path", required=True, help="Path to model checkpoint")
    parser.add_argument("--engine-path", required=True, help="Output path for engine")
    parser.add_argument("--config", default="config_gemma3.json", help="Build configuration file")
    parser.add_argument("--force", action="store_true", help="Force rebuild even if engine exists")

    args = parser.parse_args()

    logger = setup_logging()

    logger.info("🚀 Phase 70 TensorRT Engine Builder")
    logger.info("===================================")

    # Check if engine already exists
    engine_file = os.path.join(args.engine_path, "gemma3_legal.plan")
    if os.path.exists(engine_file) and not args.force:
        logger.info(f"Engine already exists: {engine_file}")
        logger.info("Use --force to rebuild")
        return 0

    # Load configuration
    config_path = args.config
    if not os.path.exists(config_path):
        logger.error(f"Config file not found: {config_path}")
        return 1

    try:
        config = load_config(config_path)
        logger.info(f"Loaded config: {config}")
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return 1

    # Create output directory
    os.makedirs(args.engine_path, exist_ok=True)

    # Build engine
    success = build_engine(args.model_path, args.engine_path, config, logger)

    if success:
        logger.info("✅ Engine build completed successfully")
        return 0
    else:
        logger.error("❌ Engine build failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())