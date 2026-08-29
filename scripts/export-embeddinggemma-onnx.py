#!/usr/bin/env python3
"""
EmbeddingGemma ONNX Export Script for Browser Inference
Exports quantized ONNX model for client-side embedding generation
"""

import os
import json
import torch
import numpy as np
from transformers import AutoTokenizer, AutoModel
from pathlib import Path
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType
import shutil

def export_embeddinggemma_onnx(max_sequence_length: int = 2048, quantize: bool = False):
    """Export EmbeddingGemma model to quantized ONNX format"""

    # Create output directory
    output_dir = Path('/workspace/models/embeddinggemma_300m_onnx')
    output_dir.mkdir(parents=True, exist_ok=True)

    print('Loading EmbeddingGemma model...')
    model_path = Path('/workspace/models/embeddinggemma_300m')
    tokenizer = AutoTokenizer.from_pretrained(model_path)

    # Load model
    model = AutoModel.from_pretrained(model_path)
    model.eval()

    # Disable caching for ONNX export
    if hasattr(model.config, 'use_cache'):
        model.config.use_cache = False

    print('Preparing dummy input...')
    dummy_text = 'This is a sample legal document for embedding.'
    inputs = tokenizer(dummy_text, return_tensors='pt', padding=True, truncation=True, max_length=max_sequence_length)

    print('Exporting to ONNX...')
    onnx_path = output_dir / 'model.onnx'

    # Export to ONNX with proper input handling
    torch.onnx.export(
        model,
        (inputs['input_ids'], inputs['attention_mask']),
        onnx_path,
        input_names=['input_ids', 'attention_mask'],
        output_names=['last_hidden_state'],
        opset_version=17,
        verbose=False,
        export_params=True,
        do_constant_folding=True,
        dynamic_axes={
            'input_ids': {0: 'batch_size', 1: 'sequence_length'},
            'attention_mask': {0: 'batch_size', 1: 'sequence_length'},
            'last_hidden_state': {0: 'batch_size', 1: 'sequence_length'}
        }
    )

    print('Applying quantization...')
    # Use correct quantization parameters
    if quantize:
        quantized_path = output_dir / 'model_quantized.onnx'
        quantize_dynamic(str(onnx_path), str(quantized_path), weight_type=QuantType.QInt8)
        quantized_path.replace(onnx_path)

    print('Copying tokenizer files...')
    tokenizer_files = ['tokenizer.json', 'tokenizer.model', 'special_tokens_map.json', 'tokenizer_config.json']
    for file_name in tokenizer_files:
        src_path = model_path / file_name
        if src_path.exists():
            shutil.copy2(src_path, output_dir / file_name)
            print(f'Copied {file_name}')

    # Copy config
    shutil.copy2(model_path / 'config.json', output_dir / 'config.json')

    # Create model info
    model_info = {
        'model_type': 'embedding',
        'model_name': 'EmbeddingGemma',
        'embedding_dimension': 768,
        'tokenizer_type': 'Gemma3Tokenizer',
        'onnx_model': 'model.onnx',
        'max_sequence_length': max_sequence_length,
        'quantized': quantize,
        'quantization_type': 'QInt8'
    }

    with open(output_dir / 'model_info.json', 'w') as f:
        json.dump(model_info, f, indent=2)

    print('Testing ONNX model...')
    session = ort.InferenceSession(str(onnx_path))
    test_inputs = tokenizer('Legal contract test.', return_tensors='np', padding=True, truncation=True, max_length=max_sequence_length)
    ort_inputs = {
        'input_ids': test_inputs['input_ids'].astype(np.int64),
        'attention_mask': test_inputs['attention_mask'].astype(np.int64)
    }
    outputs = session.run(None, ort_inputs)
    print(f'ONNX test successful! Output shape: {outputs[0].shape}')

    # Get file sizes
    onnx_size = os.path.getsize(onnx_path) / (1024 * 1024)  # MB
    print(f'ONNX model size: {onnx_size:.2f} MB')

    print('EmbeddingGemma ONNX export completed!')
    return str(output_dir)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-sequence-length', type=int, default=2048)
    parser.add_argument('--quantize', action='store_true')
    args = parser.parse_args()
    export_embeddinggemma_onnx(max_sequence_length=args.max_sequence_length, quantize=args.quantize)
