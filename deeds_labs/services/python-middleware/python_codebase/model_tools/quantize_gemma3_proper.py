import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
import tensorrt_llm
from tensorrt_llm.quantization import quantize_and_export, QuantAlgo
import os

print('🚀 Starting Gemma3 quantization with quantize_and_export...')

# Configuration
model_dir = 'model_unsloth_hf_f16'
output_dir = 'engines/gemma3-legal-production'

print(f'Model dir: {model_dir}')
print(f'Output dir: {output_dir}')

# Create output directory
os.makedirs(output_dir, exist_ok=True)

# Use the quantize_and_export function with int4 settings
print('Starting quantization...')

try:
    quantize_and_export(
        model_dir=model_dir,
        output_dir=output_dir,
        dtype='float16',
        qformat='int4_gptq',
        calib_size=32,
        tp_size=1,
        pp_size=1
    )
    print('✅ Quantization completed successfully!')
except Exception as e:
    print(f'❌ Quantization failed: {e}')
    print('Trying simpler quantization...')
    
    # Fallback to basic quantization
    from tensorrt_llm.models.gemma.convert import convert_to_trt_llm
    try:
        convert_to_trt_llm(model_dir, output_dir, dtype='float16')
        print('✅ Basic conversion completed!')
    except Exception as e2:
        print(f'❌ Basic conversion also failed: {e2}')

print('Process complete!')
