#!/usr/bin/env python3
"""
Phase 66: Convert Gemma3-Legal SafeTensors to TensorRT-LLM Engine
Converts SafeTensors model to ONNX, then to TensorRT engine for GPU inference
"""

import os
import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    logger.info("🚀 Starting Phase 66 TensorRT-LLM Server...")

    # Check if model files exist
    model_dir = Path("/workspace/models/gemma3-safetensors")
    if not model_dir.exists():
        logger.error(f"❌ Model directory not found: {model_dir}")
        sys.exit(1)

    # Check for SafeTensors files
    safetensors_files = list(model_dir.glob("*.safetensors"))
    if not safetensors_files:
        logger.error(f"❌ No SafeTensors files found in {model_dir}")
        sys.exit(1)

    logger.info(f"✅ Found {len(safetensors_files)} SafeTensors files")

    # Convert SafeTensors to ONNX
    logger.info("⚠️  Converting gemma3-legal:latest to TensorRT-LLM...")

    try:
        # Import conversion script
        sys.path.append('/workspace/phase66')
        from convert_safetensors_to_onnx import convert_safetensors_to_onnx

        # Run conversion
        onnx_path = convert_safetensors_to_onnx(
            model_path=str(model_dir),
            output_path="/workspace/models/gemma3/model.onnx"
        )

        logger.info(f"✅ ONNX conversion complete: {onnx_path}")

        # Export FP16 ONNX
        logger.info("⚙️ Exporting FP16 ONNX...")
        from export_fp16 import export_fp16_onnx

        fp16_path = export_fp16_onnx(
            onnx_path=onnx_path,
            output_path="/workspace/models/gemma3/model_fp16.onnx"
        )

        logger.info(f"✅ FP16 export complete: {fp16_path}")

        # Build TensorRT engine
        logger.info("🛠 Building TensorRT FP16 Engine...")
        import subprocess

        result = subprocess.run([
            "bash", "/workspace/phase66/build_trt_fp16.sh"
        ], capture_output=True, text=True)

        if result.returncode == 0:
            logger.info("✅ TensorRT engine build complete")
        else:
            logger.error(f"❌ TensorRT build failed: {result.stderr}")
            sys.exit(1)

        # Start embedding server
        logger.info("🔥 Starting QUIC-ready EmbeddingGemma server...")
        subprocess.run([
            "bash", "/workspace/phase66/run_embedding_server.sh"
        ])

    except Exception as e:
        logger.error(f"❌ Conversion failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()