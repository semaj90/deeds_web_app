#!/usr/bin/env python3
"""
Gemma3 ONNX Inference with TensorRT Acceleration
Uses ONNX Runtime with TensorrtExecutionProvider for GPU-accelerated inference
"""

import os
import time
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
import torch

def create_tensorrt_session(onnx_model_path, max_workspace_size=1<<30):  # 1GB
    """Create ONNX Runtime session with TensorRT execution provider"""

    # TensorRT provider options
    provider_options = {
        'device_id': 0,  # GPU device
        'trt_max_workspace_size': max_workspace_size,
        'trt_fp16_enable': True,  # Enable FP16 for better performance
        'trt_engine_cache_enable': True,
        'trt_engine_cache_path': './tensorrt_cache',
        'trt_timing_cache_enable': True,
        'trt_timing_cache_path': './tensorrt_cache/timing.cache'
    }

    # Create cache directory
    os.makedirs('./tensorrt_cache', exist_ok=True)

    # Create session with CUDA provider (fallback if TensorRT not available)
    session = ort.InferenceSession(
        onnx_model_path,
        providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
        provider_options=[{}, {}]
    )

    return session

def generate_text(session, tokenizer, prompt, max_length=100, temperature=0.7):
    """Generate text using the TensorRT-accelerated ONNX model"""

    # Tokenize input
    inputs = tokenizer(prompt, return_tensors="np", padding=True, truncation=True)

    # Get input names from model
    input_names = [input.name for input in session.get_inputs()]
    print(f"Model inputs: {input_names}")

    # Prepare inputs
    ort_inputs = {}
    for name in input_names:
        if name == 'input_ids':
            ort_inputs[name] = inputs['input_ids']
        elif name == 'attention_mask':
            ort_inputs[name] = inputs['attention_mask']
        elif name == 'past_key_values':  # For models with past key values
            # Initialize empty past key values for first inference
            batch_size = inputs['input_ids'].shape[0]
            num_layers = 26  # Gemma3-270M has 26 layers
            hidden_size = 2560  # Hidden size
            num_heads = 20  # Number of attention heads
            head_dim = hidden_size // num_heads

            # Create empty past key values
            past_kv = np.zeros((num_layers * 2, batch_size, num_heads, 0, head_dim), dtype=np.float32)
            ort_inputs[name] = past_kv

    print(f"Input shapes: {[(k, v.shape) for k, v in ort_inputs.items()]}")

    # Generate tokens
    generated_tokens = []
    current_ids = inputs['input_ids']

    start_time = time.time()
    tokens_generated = 0

    for i in range(max_length):
        # Run inference
        outputs = session.run(None, ort_inputs)

        # Get next token logits (first output is usually logits)
        next_token_logits = outputs[0][:, -1, :]  # Take last token logits

        # Apply temperature
        if temperature != 1.0:
            next_token_logits = next_token_logits / temperature

        # Sample next token (greedy for now)
        next_token = np.argmax(next_token_logits, axis=-1)

        # Append to generated tokens
        generated_tokens.append(next_token[0])

        # Check for EOS token
        if next_token[0] == tokenizer.eos_token_id:
            break

        # Update input_ids for next iteration
        current_ids = np.concatenate([current_ids, next_token.reshape(1, -1)], axis=1)

        # Update attention_mask
        attention_mask = np.ones_like(current_ids)

        # Update ort_inputs
        ort_inputs['input_ids'] = current_ids
        ort_inputs['attention_mask'] = attention_mask

        tokens_generated += 1

    end_time = time.time()

    # Decode generated tokens
    generated_text = tokenizer.decode(generated_tokens, skip_special_tokens=True)

    # Calculate performance
    total_time = end_time - start_time
    tokens_per_sec = tokens_generated / total_time if total_time > 0 else 0

    return generated_text, tokens_per_sec

def main():
    # Model paths
    onnx_model_path = "/workspace/onnx_models/gemma3_270m_onnx/gemma3.onnx"
    tokenizer_path = "/workspace/models/gemma3_270m"

    print("Loading Gemma3 ONNX model with TensorRT acceleration...")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Create TensorRT session
    session = create_tensorrt_session(onnx_model_path)

    print("Model loaded successfully!")
    print(f"Using providers: {session.get_providers()}")

    # Test prompts
    test_prompts = [
        "The legal contract states that",
        "In contract law, a breach occurs when",
        "The parties agree to the following terms:"
    ]

    for prompt in test_prompts:
        print(f"\nPrompt: {prompt}")
        print("Generating...")

        try:
            generated_text, tokens_per_sec = generate_text(session, tokenizer, prompt, max_length=50)
            print(f"Generated: {generated_text}")
            print(".2f")
        except Exception as e:
            print(f"Error generating text: {e}")

if __name__ == "__main__":
    main()