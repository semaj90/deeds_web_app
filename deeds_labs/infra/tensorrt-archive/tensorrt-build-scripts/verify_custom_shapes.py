#!/usr/bin/env python3
import json
from safetensors import safe_open

CKPT = "input/rank0.safetensors"
CFG = "input/custom_build.json"

cfg = json.load(open(CFG))
mapping = cfg["weights_mapping"]
blocks = mapping["blocks"]

print("Loading checkpoint:", CKPT)

with safe_open(CKPT, framework="pt", device="cpu") as f:
    keys = list(f.keys())
    print("Total tensors:", len(keys))

    for name in ("vocab_embedding", "lm_head", "final_layernorm"):
        k = mapping[name]
        if k not in keys:
            raise KeyError(f"Missing tensor: {k}")
        print(f"OK: {k}")

    for layer in (0, cfg["num_layers"] - 1):
        print(f"\n--- Layer {layer} ---")
        for lbl, pat in blocks.items():
            key = pat.format(layer=layer)
            if key not in keys:
                raise KeyError(f"Missing mapped tensor: {key}")
            print(f"OK: {key}")

print("\nAll required tensors are present!")
