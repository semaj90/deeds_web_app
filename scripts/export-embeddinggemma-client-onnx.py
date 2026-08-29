#!/usr/bin/env python3
"""
Export EmbeddingGemma model to ONNX format for browser inference.

This script exports the EmbeddingGemma model to ONNX format with quantization
for efficient browser-based inference with ONNX Runtime Web.
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

def export_embedding_gemma_to_onnx(
    model_path: str = "models/embeddinggemma_300m",
    output_dir: str = "models/embeddinggemma_300m_onnx",
    quantize: bool = False,
    max_sequence_length: int = 2048,
    opset_version: int = 17
):
    """
    Export EmbeddingGemma model to ONNX format.

    Args:
        model_path: Path to the HuggingFace model directory
        output_dir: Directory to save ONNX model and tokenizer files
        quantize: Whether to apply dynamic quantization. Disabled by default
            because the canonical export proof starts with FP32.
        max_sequence_length: Maximum exported/tokenized sequence length.
        opset_version: ONNX opset version
    """

    print(f"Loading EmbeddingGemma model from {model_path}")
    model_path = Path(model_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModel.from_pretrained(model_path)

    # Prepare dummy input for ONNX export
    # EmbeddingGemma uses the same tokenizer as Gemma3
    dummy_text = "This is a sample legal document for embedding."
    inputs = tokenizer(
        dummy_text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=max_sequence_length
    )

    # For embedding models, disable cache and past_key_values
    model.config.use_cache = False

    # Create dynamic axes for variable length inputs
    dynamic_axes = {
        'input_ids': {0: 'batch_size', 1: 'sequence_length'},
        'attention_mask': {0: 'batch_size', 1: 'sequence_length'},
        'last_hidden_state': {0: 'batch_size', 1: 'sequence_length', 2: 'hidden_size'}
    }

    # Export to ONNX
    onnx_path = output_dir / "model.onnx"
    print(f"Exporting model to ONNX: {onnx_path}")

    # For embedding models, we need to call the model differently
    with torch.no_grad():
        torch.onnx.export(
            model,
            (inputs['input_ids'], inputs['attention_mask']),
            onnx_path,
            input_names=['input_ids', 'attention_mask'],
            output_names=['last_hidden_state'],
            dynamic_axes=dynamic_axes,
            opset_version=opset_version,
            verbose=False,
            export_params=True,
            do_constant_folding=True
        )

    print("ONNX export completed")

    # Apply quantization if requested
    if quantize:
        quantized_path = output_dir / "model_quantized.onnx"
        print(f"Applying dynamic quantization: {quantized_path}")

        quantize_dynamic(
            onnx_path,
            quantized_path,
            weight_type=QuantType.QInt8,
            optimize_model=True
        )

        # Replace original with quantized version
        quantized_path.replace(onnx_path)
        print("Quantization completed")

    # Copy tokenizer files for browser compatibility
    tokenizer_files = [
        'tokenizer.json',
        'tokenizer.model',
        'special_tokens_map.json',
        'tokenizer_config.json',
        'vocab.json'
    ]

    print("Copying tokenizer files for browser compatibility...")
    for file_name in tokenizer_files:
        src_path = model_path / file_name
        if src_path.exists():
            shutil.copy2(src_path, output_dir / file_name)
            print(f"Copied {file_name}")
        else:
            print(f"Warning: {file_name} not found")

    # Copy model configuration
    config_files = ['config.json', 'sentence_bert_config.json']
    for config_file in config_files:
        src_path = model_path / config_file
        if src_path.exists():
            shutil.copy2(src_path, output_dir / config_file)
            print(f"Copied {config_file}")

    # Create model info JSON for browser usage
    model_info = {
        "model_type": "embedding",
        "model_name": "EmbeddingGemma",
        "model_size": "300m",
        "max_sequence_length": max_sequence_length,
        "embedding_dimension": 768,
        "tokenizer_type": "Gemma3Tokenizer",
        "onnx_model": "model.onnx",
        "quantized": quantize,
        "opset_version": opset_version,
        "input_names": ["input_ids", "attention_mask"],
        "output_names": ["last_hidden_state"],
        "dynamic_axes": dynamic_axes
    }

    with open(output_dir / "model_info.json", 'w') as f:
        json.dump(model_info, f, indent=2)

    print(f"Model exported successfully to {output_dir}")
    print(f"Model info: {model_info}")

    # Test the exported model
    print("Testing exported ONNX model...")
    test_onnx_model(output_dir / "model.onnx", tokenizer, max_sequence_length)

    return output_dir

def test_onnx_model(onnx_path: Path, tokenizer, max_sequence_length: int):
    """Test the exported ONNX model with a sample input."""
    try:
        # Create ONNX Runtime session
        session = ort.InferenceSession(str(onnx_path))

        # Prepare test input
        # Exercise the declared export boundary, not only a short happy-path input.
        test_text = "Legal contract analysis test document. " * max_sequence_length
        inputs = tokenizer(
            test_text,
            return_tensors="np",
            padding="max_length",
            truncation=True,
            max_length=max_sequence_length
        )

        # Convert to the expected format
        ort_inputs = {
            'input_ids': inputs['input_ids'].astype(np.int64),
            'attention_mask': inputs['attention_mask'].astype(np.int64)
        }

        if ort_inputs['input_ids'].shape != (1, max_sequence_length):
            raise ValueError(
                f"Export boundary test produced {ort_inputs['input_ids'].shape}; "
                f"expected (1, {max_sequence_length})"
            )

        # Run inference
        outputs = session.run(None, ort_inputs)
        embeddings = outputs[0]  # last_hidden_state

        print("ONNX model test successful!")
        print(f"Input shape: {ort_inputs['input_ids'].shape}")
        print(f"Output shape: {embeddings.shape}")
        print(f"Embedding dimension: {embeddings.shape[-1]}")

        # Test mean pooling (common for sentence embeddings)
        attention_mask = ort_inputs['attention_mask']
        masked_embeddings = embeddings * attention_mask[:, :, np.newaxis]
        sentence_embedding = masked_embeddings.sum(axis=1) / attention_mask.sum(axis=1, keepdims=True)
        print(f"Sentence embedding shape: {sentence_embedding.shape}")
        if embeddings.shape[0] != 1 or embeddings.shape[1] != max_sequence_length or embeddings.shape[2] != 768:
            raise ValueError(f"Unexpected output shape at export boundary: {embeddings.shape}")

    except Exception as e:
        print(f"ONNX model test failed: {e}")
        raise

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Export EmbeddingGemma to ONNX")
    parser.add_argument("--model-path", default="models/embeddinggemma_300m",
                       help="Path to EmbeddingGemma model")
    parser.add_argument("--output-dir", default="models/embeddinggemma_300m_onnx",
                       help="Output directory for ONNX model")
    parser.add_argument("--quantize", action="store_true",
                       help="Apply optional dynamic QInt8 quantization")
    parser.add_argument("--max-sequence-length", type=int, default=2048,
                       help="Maximum exported sequence length (default: 2048)")
    parser.add_argument("--opset-version", type=int, default=17,
                       help="ONNX opset version")

    args = parser.parse_args()

    export_embedding_gemma_to_onnx(
        model_path=args.model_path,
        output_dir=args.output_dir,
        quantize=args.quantize,
        max_sequence_length=args.max_sequence_length,
        opset_version=args.opset_version
    )

if __name__ == "__main__":
    main()
