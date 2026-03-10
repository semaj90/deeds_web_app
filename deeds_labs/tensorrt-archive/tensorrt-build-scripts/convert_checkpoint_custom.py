#!/usr/bin/env python3
import argparse
import json
import os
from collections import OrderedDict
from time import perf_counter

import torch
from safetensors import safe_open


def convert_checkpoint(src, cfg_path, out_dir):
    cfg = json.load(open(cfg_path))
    mapping = cfg["weights_mapping"]
    blocks = mapping["blocks"]
    num_layers = cfg["num_layers"]

    chunks_dir = os.path.join(out_dir, "chunks")
    os.makedirs(chunks_dir, exist_ok=True)

    print(f"Reading checkpoint: {src}")
    with safe_open(src, framework="pt", device="cpu") as ckpt:
        keys = set(ckpt.keys())

        # Globals chunk
        globals_path = os.path.join(chunks_dir, "globals.pt")
        if os.path.exists(globals_path):
            print("Globals already converted, skipping.")
        else:
            globals_tensors = {
                "vocab_embedding": ckpt.get_tensor(mapping["vocab_embedding"]),
                "lm_head": ckpt.get_tensor(mapping["lm_head"]),
                "final_layernorm": ckpt.get_tensor(mapping["final_layernorm"]),
            }
            torch.save(globals_tensors, globals_path)
            print("Saved globals chunk.")

        # Per-layer chunks
        start = perf_counter()
        for layer in range(num_layers):
            chunk_path = os.path.join(chunks_dir, f"layer_{layer:03d}.pt")
            if os.path.exists(chunk_path):
                print(f"[{layer+1}/{num_layers}] Layer {layer} already converted, skipping.")
                continue

            chunk = {}
            for name, pattern in blocks.items():
                key = pattern.format(layer=layer)
                if key not in keys:
                    raise KeyError(f"Missing tensor: {key}")
                chunk[f"{name}.{layer}"] = ckpt.get_tensor(key)

            torch.save(chunk, chunk_path)
            elapsed = perf_counter() - start
            progress = (layer + 1) / num_layers * 100
            print(f"[{layer+1}/{num_layers}] Saved layer chunk ({progress:.1f}% complete, {elapsed:.1f}s elapsed).")

    assemble_final(out_dir, num_layers)


def assemble_final(out_dir, num_layers):
    final_path = os.path.join(out_dir, "model_custom.pt")
    if os.path.exists(final_path):
        print("Final model already assembled. Skipping.")
        return

    chunks_dir = os.path.join(out_dir, "chunks")
    globals_path = os.path.join(chunks_dir, "globals.pt")
    if not os.path.exists(globals_path):
        raise FileNotFoundError("Global chunk missing, run conversion first.")

    state_dict = OrderedDict()
    state_dict.update(torch.load(globals_path, map_location="cpu"))

    print("Assembling final model from chunks...")
    start = perf_counter()

    for layer in range(num_layers):
        layer_path = os.path.join(chunks_dir, f"layer_{layer:03d}.pt")
        if not os.path.exists(layer_path):
            raise FileNotFoundError(f"Missing chunk for layer {layer}: {layer_path}")
        state_dict.update(torch.load(layer_path, map_location="cpu"))
        progress = (layer + 1) / num_layers * 100
        print(f"Assembly progress: {progress:.1f}%")

    torch.save(state_dict, final_path)
    print(f"Saved assembled model: {final_path} (took {perf_counter() - start:.1f}s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert Gemma checkpoint to TRT-LLM format with resumable chunks.")
    parser.add_argument("src", help="Path to rank0.safetensors checkpoint")
    parser.add_argument("config", help="Path to custom_build.json")
    parser.add_argument("out_dir", help="Directory for converted checkpoint")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    convert_checkpoint(args.src, args.config, args.out_dir)
