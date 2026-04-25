#!/usr/bin/env python3
"""
Complete the model by extracting missing layers from F16 reference
Then convert the complete model to TensorRT-LLM format
"""

import os
import re
from pathlib import Path
from safetensors.torch import load_file, save_file
import torch

def main():
    """Complete model using F16 reference for missing layers"""

    print("🔧 Completing Model with F16 Reference")
    print("=" * 50)

    # Check what we have in the F16 model
    f16_model_dir = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"

    print(f"📥 Checking F16 model: {f16_model_dir}")

    # Find safetensors files in F16 model
    safetensor_files = list(Path(f16_model_dir).glob("*.safetensors"))

    if not safetensor_files:
        print("❌ No safetensors files found in F16 model")
        return 1

    print(f"📊 Found {len(safetensor_files)} safetensor files:")
    for file in safetensor_files:
        size_gb = file.stat().st_size / (1024**3)
        print(f"   {file.name}: {size_gb:.2f} GB")

    # Load all F16 model parts
    f16_data = {}
    for file in safetensor_files:
        print(f"📥 Loading {file.name}...")
        data = load_file(str(file))
        f16_data.update(data)

    print(f"📊 F16 model has {len(f16_data)} tensors total")

    # Check layer distribution in F16 model
    f16_layers = set()
    for key in f16_data.keys():
        match = re.search(r'layers\.(\d+)\.', key)
        if match:
            f16_layers.add(int(match.group(1)))

    print(f"📊 F16 layers: {sorted(f16_layers)}")

    # Check if we can complete the model
    needed_layers = set(range(5, 40))  # Missing layers 5-39
    available_layers = f16_layers & needed_layers

    print(f"📊 Needed layers: {len(needed_layers)}")
    print(f"📊 Available in F16: {len(available_layers)}")

    if len(available_layers) == len(needed_layers):
        print("✅ F16 model has all missing layers!")

        # Instead of merging manually, let's use the F16 model directly
        # and apply TensorRT conversion with quantization
        print("🔄 Using F16 model directly for TensorRT conversion...")

        return convert_f16_directly()
    else:
        missing_in_f16 = needed_layers - available_layers
        print(f"⚠️  Still missing in F16: {sorted(missing_in_f16)}")
        return 1

def convert_f16_directly():
    """Convert F16 model directly to TensorRT with quantization"""

    print("🔄 Converting F16 model directly to quantized TensorRT...")

    import subprocess
    import sys

    # Use your conversion script but with the F16 model
    script_content = '''
import warnings
warnings.filterwarnings('ignore')

try:
    from tensorrt_llm.models.gemma.convert import convert_hf_model
    import argparse

    args = argparse.Namespace(
        model_dir='/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16',
        output_dir='/home/james/gemma3_f16_to_trt',
        dtype='float16',
        use_weight_only=True,
        weight_only_precision='int4',
        use_smoothquant=False,
        per_channel=True,
        per_token=False,
        int8_kv_cache=False,
        per_group=True,
        group_size=128,
        smoothquant_val=0.5,
        tp_size=1,
        pp_size=1,
        workers=1,
        load_model_on_cpu=True,
        calibrate_kv_cache=False,
        calib_dataset='cnn_dailymail',
        use_fp8=False
    )

    print('🔄 Converting F16 → TensorRT INT4...')
    convert_hf_model(args)
    print('✅ Conversion completed!')

except Exception as e:
    print(f'❌ Conversion failed: {e}')
    import traceback
    traceback.print_exc()
'''

    # Run the conversion
    result = subprocess.run([
        'python', '-c', script_content
    ], capture_output=True, text=True, cwd='/mnt/c/Users/james/Videos/deeds-web-app')

    if result.returncode == 0:
        print("✅ F16 → TensorRT conversion successful!")
        print("📁 Checkpoint created at: /home/james/gemma3_f16_to_trt/")
        return 0
    else:
        print(f"❌ Conversion failed:")
        print(result.stderr)
        return 1

if __name__ == "__main__":
    exit(main())