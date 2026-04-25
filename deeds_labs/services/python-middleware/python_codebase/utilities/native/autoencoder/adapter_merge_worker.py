#!/usr/bin/env python3
"""
adapter_merge_worker.py

Watches Redis for adapter checkpoints and merges them into a single adapter using simple averaging.
This is a scaffold - adapt merging strategy to your aggregation algorithm (e.g., weighted averaging, AWQ/awq-aware merges).
"""
import os
import time
import json
import redis
from typing import List

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
CHECKPOINT_SET = 'adapters:checkpoints'
MERGED_ADAPTER_KEY = 'adapters:merged:latest'

r = redis.from_url(REDIS_URL)


def list_checkpoints() -> List[str]:
    return [v.decode('utf-8') for v in r.smembers(CHECKPOINT_SET)]


def _load_peft_adapter(path: str):
    """Return a PEFT adapter model object if available; otherwise None."""
    try:
        from peft import PeftModel
        import torch
        base = None
        # For merging we only load adapter weights as state_dict if possible
        if os.path.isdir(path):
            # common PEFT pattern: config.json + adapter weights under the folder
            # load state dict
            return torch.load(os.path.join(path, 'pytorch_adapter.bin'), map_location='cpu')
    except Exception:
        return None


def _save_merged_adapter_state(state: dict, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'pytorch_adapter_merged.bin')
    try:
        import torch
        torch.save(state, out_path)
    except Exception:
        with open(out_path + '.json', 'w') as f:
            json.dump({k: v.tolist() if hasattr(v, 'tolist') else v for k, v in state.items()}, f)
    return out_path


def merge_adapters(checkpoints: List[str], out_path: str):
    """
    Merge adapter checkpoints using a simple elementwise average of state_dict tensors where possible.
    Falls back to writing a manifest when merging is not possible.
    """
    # Try to load all available PEFT adapter state dicts
    states = []
    for ck in checkpoints:
        st = _load_peft_adapter(ck)
        if st is not None:
            states.append(st)

    if states:
        # Elementwise average
        merged = {}
        keys = set(k for s in states for k in s.keys())
        for k in keys:
            tensors = [s[k] for s in states if k in s]
            try:
                import torch
                stacked = torch.stack([t.float() for t in tensors], dim=0)
                mean = stacked.mean(dim=0)
                merged[k] = mean
            except Exception:
                # fallback: keep the first available
                merged[k] = tensors[0]

        # save merged
        out_dir = os.path.dirname(out_path)
        saved = _save_merged_adapter_state(merged, out_dir)
        r.set(MERGED_ADAPTER_KEY, saved)
        return saved

    # Fallback: write manifest listing checkpoints
    manifest = {
        'merged_from': checkpoints,
        'created_at': time.time(),
        'method': 'manifest-only',
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(manifest, f)
    r.set(MERGED_ADAPTER_KEY, out_path)
    return out_path


def main(poll_interval=10):
    print('Adapter merge worker started, watching Redis set:', CHECKPOINT_SET)
    while True:
        try:
            checkpoints = list_checkpoints()
            if not checkpoints:
                time.sleep(poll_interval)
                continue

            print('Found checkpoints:', checkpoints)
            merged_path = f'artifacts/merged_adapter_{int(time.time())}.json'
            out = merge_adapters(checkpoints, merged_path)
            print('Wrote merged adapter (or manifest) to', out)
            time.sleep(poll_interval)
        except Exception as e:
            print('Adapter merge worker error:', e)
            time.sleep(poll_interval)


if __name__ == '__main__':
    main()
