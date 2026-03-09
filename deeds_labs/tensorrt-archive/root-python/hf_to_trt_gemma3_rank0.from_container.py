#!/usr/bin/env python3
"""HF Gemma3 (language_model.*) -> TRT-LLM Gemma (transformer.*) rank converter."""

import argparse
import re
from collections import OrderedDict

import torch
from safetensors.torch import load_file, save_file

LAYER_RE = re.compile(r"^language_model\.model\.layers\.(\d+)\.(.+)$")


def add_alias(dest, src_tensors, src_key, alias):
    tensor = src_tensors.get(src_key)
    if tensor is not None:
        dest[alias] = tensor


def main():
    parser = argparse.ArgumentParser(description="Convert HF Gemma3 rank to TRT-LLM rank")
    parser.add_argument("--src", required=True, help="Source dir containing rank0_hf.safetensors")
    parser.add_argument("--dst", required=True, help="Destination dir for rank0.safetensors")
    parser.add_argument("--src_name", default="rank0_hf.safetensors", help="Input safetensors name")
    parser.add_argument("--dst_name", default="rank0.safetensors", help="Output safetensors name")
    args = parser.parse_args()

    src_rank = f"{args.src}/{args.src_name}"
    dst_rank = f"{args.dst}/{args.dst_name}"

    print("Loading HF rank:", src_rank)
    hf_tensors = load_file(src_rank, device="cpu")

    new_tensors = OrderedDict()

    # Embeddings + lm head.
    embed = hf_tensors.get("language_model.model.embed_tokens.weight")
    if embed is not None:
        new_tensors["transformer.vocab_embedding.weight"] = embed
        # Clone to avoid shared storage error during save.
        new_tensors["transformer.token_embedding.weight"] = embed.clone()
    add_alias(new_tensors, hf_tensors, "language_model.lm_head.weight", "lm_head.weight")
    add_alias(new_tensors, hf_tensors, "language_model.model.norm.weight", "transformer.ln_f.weight")

    max_layer = 0
    for key in hf_tensors.keys():
        match = LAYER_RE.match(key)
        if match:
            max_layer = max(max_layer, int(match.group(1)))

    for layer_idx in range(max_layer + 1):
        prefix = f"language_model.model.layers.{layer_idx}"

        # Layer norms
        add_alias(new_tensors, hf_tensors, f"{prefix}.input_layernorm.weight", f"transformer.layers.{layer_idx}.input_layernorm.weight")
        add_alias(new_tensors, hf_tensors, f"{prefix}.post_attention_layernorm.weight", f"transformer.layers.{layer_idx}.post_layernorm.weight")
        add_alias(new_tensors, hf_tensors, f"{prefix}.post_feedforward_layernorm.weight", f"transformer.layers.{layer_idx}.post_feedforward_layernorm.weight")
        add_alias(new_tensors, hf_tensors, f"{prefix}.pre_feedforward_layernorm.weight", f"transformer.layers.{layer_idx}.pre_feedforward_layernorm.weight")

        # MLP weights
        add_alias(new_tensors, hf_tensors, f"{prefix}.mlp.gate_proj.weight", f"transformer.layers.{layer_idx}.mlp.gate.weight")
        add_alias(new_tensors, hf_tensors, f"{prefix}.mlp.up_proj.weight", f"transformer.layers.{layer_idx}.mlp.fc.weight")
        add_alias(new_tensors, hf_tensors, f"{prefix}.mlp.down_proj.weight", f"transformer.layers.{layer_idx}.mlp.proj.weight")

        # Attention dense (o_proj)
        add_alias(new_tensors, hf_tensors, f"{prefix}.self_attn.o_proj.weight", f"transformer.layers.{layer_idx}.attention.dense.weight")

        # Q/K norm
        add_alias(new_tensors, hf_tensors, f"{prefix}.self_attn.q_norm.weight", f"transformer.layers.{layer_idx}.attention.q_layernorm.weight")
        add_alias(new_tensors, hf_tensors, f"{prefix}.self_attn.k_norm.weight", f"transformer.layers.{layer_idx}.attention.k_layernorm.weight")

        # Fuse QKV
        q_key = f"{prefix}.self_attn.q_proj.weight"
        k_key = f"{prefix}.self_attn.k_proj.weight"
        v_key = f"{prefix}.self_attn.v_proj.weight"
        if all(key in hf_tensors for key in (q_key, k_key, v_key)):
            q = hf_tensors[q_key]
            k = hf_tensors[k_key]
            v = hf_tensors[v_key]
            qkv = torch.cat([q, k, v], dim=0)
            alias = f"transformer.layers.{layer_idx}.attention.qkv.weight"
            new_tensors[alias] = qkv
            print(f"[Layer {layer_idx}] fused QKV -> {qkv.shape}")

    print("Writing TRT-LLM rank:", dst_rank)
    save_file(new_tensors, dst_rank)
    print("Done. wrote", len(new_tensors), "tensors.")


if __name__ == "__main__":
    main()
