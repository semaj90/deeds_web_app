#!/usr/bin/env python3
"""
TensorRT-LLM Conversion Script for Legal AI Models
Converts Unsloth/safetensors models to TensorRT-LLM engines optimized for RTX 3060 Ti
Supports evidence processing and legal document analysis
"""

import os
import sys
import json
import shutil
import argparse
from pathlib import Path
from typing import Dict, Any, Optional

try:
    import torch
    import tensorrt_llm
    from tensorrt_llm import Mapping
    from tensorrt_llm.models import LLaMAForCausalLM, GemmaForCausalLM
    from tensorrt_llm.quantization import QuantMode
    from transformers import AutoTokenizer, AutoConfig
    import safetensors.torch
except ImportError as e:
    print(f"Missing required packages: {e}")
    print("Install with: pip install tensorrt-llm transformers safetensors torch")
    print("Note: TensorRT-LLM requires Python 3.10 and should be run in WSL/Ubuntu environment")
    sys.exit(1)

class LegalModelConverter:
    """Convert legal AI models to TensorRT-LLM with RTX 3060 Ti optimization"""

    def __init__(self):
        self.rtx_3060_config = {
            'max_batch_size': 2,
            'max_input_len': 2048,
            'max_seq_len': 4096,
            'dtype': 'float16',
            'use_gpt_attention_plugin': 'float16',
            'use_gemm_plugin': 'float16',
            'use_paged_kv_cache': True,
            'enable_context_fmha': True,
            'enable_fp16_qdq': True,
            'remove_input_padding': True,
            'memory_pool_limit': '4096MiB'
        }

    def detect_model_type(self, model_path: str) -> str:
        """Detect if model is Gemma, LLaMA, or other architecture"""
        try:
            config_path = os.path.join(model_path, 'config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)

                model_type = config.get('model_type', '').lower()
                arch = config.get('architectures', [''])[0].lower()

                if 'gemma' in model_type or 'gemma' in arch:
                    return 'gemma'
                elif 'llama' in model_type or 'llama' in arch:
                    return 'llama'
                else:
                    print(f"⚠️  Unknown model type: {model_type}, defaulting to llama")
                    return 'llama'
            else:
                print("⚠️  No config.json found, defaulting to llama")
                return 'llama'
        except Exception as e:
            print(f"⚠️  Error detecting model type: {e}, defaulting to llama")
            return 'llama'

    def merge_safetensor_shards(self, model_dir: str, output_path: str) -> bool:
        """Merge multiple safetensor shards into single file"""
        print(f"🔗 Merging safetensor shards from {model_dir}")

        shard_files = []
        for file in os.listdir(model_dir):
            if file.endswith('.safetensors') and 'shard' in file:
                shard_files.append(os.path.join(model_dir, file))

        if not shard_files:
            # Check for single safetensors file
            single_files = [f for f in os.listdir(model_dir) if f.endswith('.safetensors')]
            if single_files:
                print(f"📁 Found single safetensor file: {single_files[0]}")
                shutil.copy(os.path.join(model_dir, single_files[0]), output_path)
                return True
            else:
                print("❌ No safetensor files found")
                return False

        print(f"📦 Found {len(shard_files)} shards to merge")
        merged_state_dict = {}

        for shard_file in sorted(shard_files):
            print(f"   Loading {os.path.basename(shard_file)}")
            with safetensors.torch.safe_open(shard_file, framework="pt") as f:
                for key in f.keys():
                    merged_state_dict[key] = f.get_tensor(key)

        print(f"💾 Saving merged model to {output_path}")
        safetensors.torch.save_file(merged_state_dict, output_path)

        # Verify the merged file
        file_size = os.path.getsize(output_path) / (1024**3)  # GB
        print(f"✅ Merged model saved: {file_size:.1f}GB")
        return True

    def convert_to_tensorrt(self, model_path: str, output_dir: str, model_type: str = 'auto') -> bool:
        """Convert model to TensorRT-LLM engine"""
        print(f"🚀 Converting {model_path} to TensorRT-LLM")

        if model_type == 'auto':
            model_type = self.detect_model_type(os.path.dirname(model_path))

        try:
            # Create output directory
            os.makedirs(output_dir, exist_ok=True)

            # Load model configuration
            config = AutoConfig.from_pretrained(os.path.dirname(model_path))

            # Set up TensorRT-LLM mapping
            mapping = Mapping(world_size=1, rank=0)

            # Choose model class based on type
            if model_type == 'gemma':
                print("🔧 Using Gemma architecture")
                model_cls = GemmaForCausalLM
            else:
                print("🔧 Using LLaMA architecture")
                model_cls = LLaMAForCausalLM

            # Configure quantization for RTX 3060 Ti
            quant_mode = QuantMode(0)  # No quantization initially
            if self.rtx_3060_config.get('use_int4_weight_only'):
                quant_mode = quant_mode.set_int4_weight_only()

            # Initialize TensorRT-LLM model
            tensorrt_llm_model = model_cls(
                num_layers=config.num_hidden_layers,
                num_heads=config.num_attention_heads,
                hidden_size=config.hidden_size,
                vocab_size=config.vocab_size,
                hidden_act=config.hidden_act,
                max_position_embeddings=getattr(config, 'max_position_embeddings', 4096),
                dtype=torch.float16,
                mapping=mapping,
                quant_mode=quant_mode
            )

            # Load weights from safetensors
            print("📥 Loading model weights")
            state_dict = {}
            with safetensors.torch.safe_open(model_path, framework="pt") as f:
                for key in f.keys():
                    state_dict[key] = f.get_tensor(key)

            # Convert and load weights
            tensorrt_llm_model.load(state_dict)

            # Build TensorRT engine with RTX 3060 Ti optimization
            print("🔨 Building TensorRT engine with RTX 3060 Ti optimization")

            builder_config = {
                'max_batch_size': self.rtx_3060_config['max_batch_size'],
                'max_input_len': self.rtx_3060_config['max_input_len'],
                'max_seq_len': self.rtx_3060_config['max_seq_len'],
                'max_num_tokens': self.rtx_3060_config['max_batch_size'] * self.rtx_3060_config['max_input_len'],
                'opt_num_tokens': self.rtx_3060_config['max_batch_size'] * self.rtx_3060_config['max_input_len'] // 2,
                'strongly_typed': True,
                'builder_opt': {
                    'memory_pool_limit': self.rtx_3060_config['memory_pool_limit']
                }
            }

            # Add plugin configurations
            for key, value in self.rtx_3060_config.items():
                if key.startswith('use_') or key.startswith('enable_'):
                    builder_config[key] = value

            # Build the engine
            engine = tensorrt_llm.build(
                tensorrt_llm_model,
                builder_config
            )

            # Save the engine
            engine_path = os.path.join(output_dir, 'legal_ai_engine.trt')
            engine.save(engine_path)

            # Save configuration
            config_path = os.path.join(output_dir, 'config.json')
            with open(config_path, 'w') as f:
                json.dump({
                    'model_type': model_type,
                    'builder_config': builder_config,
                    'rtx_3060_optimized': True,
                    'legal_ai_specialized': True,
                    'evidence_processing_enabled': True
                }, f, indent=2)

            print(f"✅ TensorRT engine saved to {engine_path}")
            return True

        except Exception as e:
            print(f"❌ Conversion failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def create_legal_ai_config(self, output_dir: str) -> None:
        """Create specialized configuration for legal AI evidence processing"""
        legal_config = {
            'legal_ai_config': {
                'evidence_processing': {
                    'max_evidence_tokens': 1024,
                    'chain_of_custody_tracking': True,
                    'integrity_verification': True,
                    'batch_evidence_analysis': True
                },
                'specialized_prompts': {
                    'evidence_analysis': "You are a specialized legal AI analyzing evidence. Focus on admissibility, relevance, and chain of custody.",
                    'case_research': "You are a legal research assistant specializing in case law, statutes, and legal precedent analysis.",
                    'document_review': "You are a legal document reviewer focused on contract analysis, compliance, and risk assessment."
                },
                'performance_optimization': {
                    'cache_legal_terms': True,
                    'preload_common_queries': True,
                    'evidence_embedding_cache': True
                }
            },
            'tensorrt_optimizations': {
                'target_gpu': 'RTX_3060_Ti',
                'memory_optimization': 'aggressive',
                'inference_optimization': 'latency_focused',
                'batch_processing': 'evidence_aware'
            }
        }

        config_path = os.path.join(output_dir, 'legal_ai_config.json')
        with open(config_path, 'w') as f:
            json.dump(legal_config, f, indent=2)

        print(f"📋 Legal AI configuration saved to {config_path}")

def main():
    parser = argparse.ArgumentParser(description='Convert legal AI models to TensorRT-LLM')
    parser.add_argument('--model_path', required=True, help='Path to model directory or safetensors file')
    parser.add_argument('--output_dir', required=True, help='Output directory for TensorRT engine')
    parser.add_argument('--model_type', default='auto', choices=['auto', 'gemma', 'llama'], help='Model architecture type')
    parser.add_argument('--merge_shards', action='store_true', help='Merge safetensor shards first')

    args = parser.parse_args()

    converter = LegalModelConverter()

    print("🏛️  Legal AI TensorRT-LLM Converter")
    print("=" * 50)

    model_path = args.model_path

    # Handle shard merging if needed
    if args.merge_shards or os.path.isdir(model_path):
        merged_path = os.path.join(args.output_dir, 'merged_model.safetensors')
        if converter.merge_safetensor_shards(model_path, merged_path):
            model_path = merged_path
        else:
            print("❌ Failed to merge shards")
            return 1

    # Convert to TensorRT
    if converter.convert_to_tensorrt(model_path, args.output_dir, args.model_type):
        # Create legal AI specific configuration
        converter.create_legal_ai_config(args.output_dir)

        print("\n✨ Conversion completed successfully!")
        print(f"📁 Engine location: {args.output_dir}")
        print("\n🚀 Next steps:")
        print("1. Test the engine with your legal AI inference service")
        print("2. Configure evidence processing parameters")
        print("3. Run performance benchmarks on RTX 3060 Ti")
        return 0
    else:
        print("\n❌ Conversion failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())