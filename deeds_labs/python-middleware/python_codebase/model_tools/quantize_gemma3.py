import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
import tensorrt_llm
from tensorrt_llm.quantization import quantize_model
from tensorrt_llm.models.gemma import GemmaForCausalLM
import os

print('🚀 Starting Gemma3 int4 quantization with TensorRT Model Optimizer...')

# Model paths
model_dir = 'model_unsloth_hf_f16'
output_dir = 'engines/gemma3-legal-production'

# Load model for quantization
print(f'Loading model from {model_dir}...')
model = AutoModelForCausalLM.from_pretrained(model_dir, torch_dtype=torch.float16, device_map='auto')
tokenizer = AutoTokenizer.from_pretrained(model_dir)

print('Model loaded successfully')
print(f'Model size: {sum(p.numel() for p in model.parameters()):,} parameters')

# Quantize to int4 using TensorRT Model Optimizer
print('Quantizing to int4...')
quantized_model = quantize_model(model, quant_mode='int4_gptq')

print(f'✅ Quantization complete! Saving to {output_dir}')
os.makedirs(output_dir, exist_ok=True)

# Save quantized model
quantized_model.save_pretrained(output_dir)
tokenizer.save_pretrained(output_dir)

print('✅ Gemma3 int4 quantized model ready!')
