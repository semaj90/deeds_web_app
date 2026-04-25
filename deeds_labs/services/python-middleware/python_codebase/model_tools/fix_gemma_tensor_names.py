#!/usr/bin/env python3
"""
Fix Gemma tensor names to match TensorRT-LLM exact requirements
Based on the HfParser.rename_to_trt_llm mapping function
"""

import os
import re
import json
import shutil
from pathlib import Path
import safetensors
from safetensors.torch import load_file, save_file
import torch

class GemmaTensorNameFixer:
    def __init__(self):
        # Exact tensor name mapping from TensorRT-LLM HfParser
        # Handle both regular and language_model prefixed models
        self.name_mapping = [
            # Regular HuggingFace Gemma format
            (r"model\.embed_tokens\.weight", r"transformer.vocab_embedding.weight"),
            (r"model\.layers\.(\d+)\.input_layernorm\.weight", r"transformer.layers.\1.input_layernorm.weight"),
            (r"model\.layers\.(\d+)\.self_attn\.q_proj\.weight", r"transformer.layers.\1.attention.qkv.weight"),
            (r"model\.layers\.(\d+)\.self_attn\.k_proj\.weight", None),  # merged with q_proj
            (r"model\.layers\.(\d+)\.self_attn\.v_proj\.weight", None),  # merged with q_proj
            (r"model\.layers\.(\d+)\.self_attn\.o_proj\.weight", r"transformer.layers.\1.attention.dense.weight"),
            (r"model\.layers\.(\d+)\.self_attn\.q_norm\.weight", r"transformer.layers.\1.attention.q_layernorm.weight"),
            (r"model\.layers\.(\d+)\.self_attn\.k_norm\.weight", r"transformer.layers.\1.attention.k_layernorm.weight"),
            (r"model\.layers\.(\d+)\.mlp\.gate_proj\.weight", r"transformer.layers.\1.mlp.fc.weight"),
            (r"model\.layers\.(\d+)\.mlp\.up_proj\.weight", None),  # merged with gate_proj
            (r"model\.layers\.(\d+)\.mlp\.down_proj\.weight", r"transformer.layers.\1.mlp.proj.weight"),
            (r"model\.layers\.(\d+)\.post_attention_layernorm\.weight", r"transformer.layers.\1.post_layernorm.weight"),
            (r"model\.layers\.(\d+)\.pre_feedforward_layernorm\.weight", r"transformer.layers.\1.pre_feedforward_layernorm.weight"),
            (r"model\.layers\.(\d+)\.post_feedforward_layernorm\.weight", r"transformer.layers.\1.post_feedforward_layernorm.weight"),
            (r"model\.norm\.weight", r"transformer.ln_f.weight"),

            # Language model prefixed format (like your model)
            (r"language_model\.model\.embed_tokens\.weight", r"transformer.vocab_embedding.weight"),
            (r"language_model\.model\.layers\.(\d+)\.input_layernorm\.weight", r"transformer.layers.\1.input_layernorm.weight"),
            (r"language_model\.model\.layers\.(\d+)\.self_attn\.q_proj\.weight", r"transformer.layers.\1.attention.qkv.weight"),
            (r"language_model\.model\.layers\.(\d+)\.self_attn\.k_proj\.weight", None),  # merged with q_proj
            (r"language_model\.model\.layers\.(\d+)\.self_attn\.v_proj\.weight", None),  # merged with q_proj
            (r"language_model\.model\.layers\.(\d+)\.self_attn\.o_proj\.weight", r"transformer.layers.\1.attention.dense.weight"),
            (r"language_model\.model\.layers\.(\d+)\.self_attn\.q_norm\.weight", r"transformer.layers.\1.attention.q_layernorm.weight"),
            (r"language_model\.model\.layers\.(\d+)\.self_attn\.k_norm\.weight", r"transformer.layers.\1.attention.k_layernorm.weight"),
            (r"language_model\.model\.layers\.(\d+)\.mlp\.gate_proj\.weight", r"transformer.layers.\1.mlp.fc.weight"),
            (r"language_model\.model\.layers\.(\d+)\.mlp\.up_proj\.weight", None),  # merged with gate_proj
            (r"language_model\.model\.layers\.(\d+)\.mlp\.down_proj\.weight", r"transformer.layers.\1.mlp.proj.weight"),
            (r"language_model\.model\.layers\.(\d+)\.post_attention_layernorm\.weight", r"transformer.layers.\1.post_layernorm.weight"),
            (r"language_model\.model\.layers\.(\d+)\.pre_feedforward_layernorm\.weight", r"transformer.layers.\1.pre_feedforward_layernorm.weight"),
            (r"language_model\.model\.layers\.(\d+)\.post_feedforward_layernorm\.weight", r"transformer.layers.\1.post_feedforward_layernorm.weight"),
            (r"language_model\.model\.norm\.weight", r"transformer.ln_f.weight"),
        ]

    def rename_tensor(self, name: str):
        """Rename tensor according to TensorRT-LLM requirements"""
        for source_pattern, target_pattern in self.name_mapping:
            if re.match(source_pattern, name):
                if target_pattern is None:
                    return None  # This tensor gets merged with another
                else:
                    return re.sub(source_pattern, target_pattern, name)

        # Handle special cases
        if "lm_head.weight" in name:
            return "lm_head.weight"  # Keep as-is

        # Skip vision and multimodal components
        if any(skip_pattern in name.lower() for skip_pattern in [
            "vision_", "visual_", "image_", "patch_embed", "cls_token", "pos_embed",
            "vision_tower", "mm_projector", "multi_modal_projector"
        ]):
            return None  # Skip vision components

        print(f"⚠️  Unknown tensor name pattern: {name}")
        return None  # Skip unknown patterns instead of keeping them

    def merge_qkv_tensors(self, state_dict, layer_idx):
        """Merge Q, K, V tensors into single QKV tensor as required by TensorRT-LLM"""
        # Try both regular and language_model prefixed formats
        q_key = f"language_model.model.layers.{layer_idx}.self_attn.q_proj.weight"
        k_key = f"language_model.model.layers.{layer_idx}.self_attn.k_proj.weight"
        v_key = f"language_model.model.layers.{layer_idx}.self_attn.v_proj.weight"

        # If not found, try regular format
        if not all(key in state_dict for key in [q_key, k_key, v_key]):
            q_key = f"model.layers.{layer_idx}.self_attn.q_proj.weight"
            k_key = f"model.layers.{layer_idx}.self_attn.k_proj.weight"
            v_key = f"model.layers.{layer_idx}.self_attn.v_proj.weight"

        if all(key in state_dict for key in [q_key, k_key, v_key]):
            q_tensor = state_dict[q_key]
            k_tensor = state_dict[k_key]
            v_tensor = state_dict[v_key]

            # Concatenate Q, K, V tensors
            qkv_tensor = torch.cat([q_tensor, k_tensor, v_tensor], dim=0)

            # Store with the Q tensor's new name
            new_qkv_name = f"transformer.layers.{layer_idx}.attention.qkv.weight"
            return new_qkv_name, qkv_tensor

        return None, None

    def merge_mlp_tensors(self, state_dict, layer_idx):
        """Merge gate_proj and up_proj tensors as required by TensorRT-LLM"""
        gate_key = f"model.layers.{layer_idx}.mlp.gate_proj.weight"
        up_key = f"model.layers.{layer_idx}.mlp.up_proj.weight"

        if gate_key in state_dict and up_key in state_dict:
            gate_tensor = state_dict[gate_key]
            up_tensor = state_dict[up_key]

            # For TensorRT-LLM, we need both gate and up tensors
            # gate_proj -> mlp.fc.weight (handled in rename)
            # up_proj gets merged but we need both for the conversion function
            return {
                f"transformer.layers.{layer_idx}.mlp.fc.weight": gate_tensor,
                f"transformer.layers.{layer_idx}.mlp.gate.weight": up_tensor  # This will be handled by converter
            }

        return {}

    def fix_checkpoint(self, source_checkpoint: str, output_checkpoint: str):
        """Fix tensor names in checkpoint to match TensorRT-LLM requirements"""

        print(f"🔧 Fixing tensor names: {source_checkpoint} -> {output_checkpoint}")

        # Load the source checkpoint
        print("📥 Loading source checkpoint...")
        if source_checkpoint.endswith('.safetensors'):
            state_dict = load_file(source_checkpoint)
        else:
            state_dict = torch.load(source_checkpoint, map_location='cpu')

        print(f"📊 Original checkpoint has {len(state_dict)} tensors")

        # Create new state dict with correct names
        new_state_dict = {}
        merged_tensors = set()

        # Find all layer indices
        layer_indices = set()
        for key in state_dict.keys():
            match = re.search(r'layers\.(\d+)\.', key)
            if match:
                layer_indices.add(int(match.group(1)))

        print(f"🔍 Found {len(layer_indices)} transformer layers")

        # Handle QKV and MLP merging for each layer
        for layer_idx in sorted(layer_indices):
            # Merge QKV tensors
            qkv_name, qkv_tensor = self.merge_qkv_tensors(state_dict, layer_idx)
            if qkv_name and qkv_tensor is not None:
                new_state_dict[qkv_name] = qkv_tensor
                merged_tensors.update([
                    f"model.layers.{layer_idx}.self_attn.q_proj.weight",
                    f"model.layers.{layer_idx}.self_attn.k_proj.weight",
                    f"model.layers.{layer_idx}.self_attn.v_proj.weight"
                ])
                print(f"✅ Merged QKV tensors for layer {layer_idx}")

        # Process all other tensors
        for original_name, tensor in state_dict.items():
            if original_name in merged_tensors:
                continue  # Skip tensors that were already merged

            new_name = self.rename_tensor(original_name)
            if new_name is None:
                continue  # Skip tensors that should be merged

            new_state_dict[new_name] = tensor

        print(f"📊 Fixed checkpoint has {len(new_state_dict)} tensors")

        # Verify we have all required tensors
        self.verify_required_tensors(new_state_dict)

        # Save the fixed checkpoint
        output_path = Path(output_checkpoint)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        print(f"💾 Saving fixed checkpoint...")
        if output_checkpoint.endswith('.safetensors'):
            save_file(new_state_dict, output_checkpoint)
        else:
            torch.save(new_state_dict, output_checkpoint)

        # Calculate size reduction
        orig_size = Path(source_checkpoint).stat().st_size / (1024**3)
        new_size = Path(output_checkpoint).stat().st_size / (1024**3)

        print(f"✅ Fixed checkpoint saved!")
        print(f"📊 Original size: {orig_size:.2f} GB")
        print(f"📊 Fixed size: {new_size:.2f} GB")

        return output_checkpoint

    def verify_required_tensors(self, state_dict):
        """Verify that all required tensors are present"""
        required_patterns = [
            r"transformer\.vocab_embedding\.weight",
            r"transformer\.layers\.\d+\.attention\.qkv\.weight",
            r"transformer\.layers\.\d+\.attention\.dense\.weight",
            r"transformer\.layers\.\d+\.mlp\.fc\.weight",
            r"transformer\.layers\.\d+\.mlp\.proj\.weight",
            r"transformer\.layers\.\d+\.input_layernorm\.weight",
            r"transformer\.layers\.\d+\.post_layernorm\.weight",
            r"transformer\.ln_f\.weight"
        ]

        missing_patterns = []
        for pattern in required_patterns:
            found = any(re.match(pattern, name) for name in state_dict.keys())
            if not found:
                missing_patterns.append(pattern)

        if missing_patterns:
            print("⚠️  Missing required tensor patterns:")
            for pattern in missing_patterns:
                print(f"   - {pattern}")
        else:
            print("✅ All required tensor patterns found")

def main():
    """Main function"""

    # Configuration
    source_checkpoint = "/home/james/gemma3_complete/rank0.safetensors"
    output_checkpoint = "/home/james/gemma3_fixed_names/rank0.safetensors"

    print("🚀 Gemma Tensor Name Fixer for TensorRT-LLM")
    print("=" * 60)

    # Check if source exists
    if not Path(source_checkpoint).exists():
        print(f"❌ Source checkpoint not found: {source_checkpoint}")
        return 1

    # Create fixer and fix the checkpoint
    fixer = GemmaTensorNameFixer()

    try:
        fixed_checkpoint = fixer.fix_checkpoint(source_checkpoint, output_checkpoint)

        # Copy config file
        source_dir = Path(source_checkpoint).parent
        output_dir = Path(output_checkpoint).parent

        config_file = source_dir / "config.json"
        if config_file.exists():
            shutil.copy2(config_file, output_dir / "config.json")
            print("✅ Copied config.json")

        print("\n🎉 Tensor name fixing complete!")
        print(f"📁 Fixed checkpoint: {fixed_checkpoint}")
        print("🚀 Ready for TensorRT-LLM engine building!")

        return 0

    except Exception as e:
        print(f"❌ Error fixing tensor names: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())