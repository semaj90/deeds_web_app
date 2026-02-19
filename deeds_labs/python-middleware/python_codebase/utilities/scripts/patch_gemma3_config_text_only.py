#!/usr/bin/env python3
import json
import sys
import shutil
from pathlib import Path
from datetime import datetime

"""
Patch a Gemma3 HF config.json to force text-only (ignore vision parts).

Changes:
- model_type -> 'gemma3'
- architectures -> ['Gemma3ForCausalLM']
- remove common vision/multimodal keys if present

Usage:
  python scripts/patch_gemma3_config_text_only.py /path/to/hf_model_dir
"""

VISION_KEYS = {
    'vision_config', 'mm_projector', 'mm_projector_type', 'mm_resampler',
    'image_token_id', 'image_processor', 'vision_backbone', 'vision_embed_dim',
    'patch_size', 'num_image_tokens', 'mm_vision', 'multi_modal', 'vision'
}

def patch_config(model_dir: Path) -> None:
    cfg_path = model_dir / 'config.json'
    if not cfg_path.exists():
        raise FileNotFoundError(f"config.json not found in {model_dir}")

    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = model_dir / f'config.json.bak-{ts}'
    shutil.copy2(cfg_path, backup)

    data = json.loads(cfg_path.read_text())

    data['model_type'] = 'gemma3'
    data['architectures'] = ['Gemma3ForCausalLM']

    removed = []
    for k in list(data.keys()):
        lk = k.lower()
        if lk in VISION_KEYS or 'vision' in lk or 'multi_modal' in lk or 'mm_' in lk:
            removed.append(k)
            data.pop(k, None)

    # Optional: ensure essential text-only defaults
    data.setdefault('use_cache', True)
    data.setdefault('torch_dtype', 'float16')

    cfg_path.write_text(json.dumps(data, indent=2))
    print(f"Backed up: {backup}")
    print(f"Patched:   {cfg_path}")
    if removed:
        print("Removed keys:", ', '.join(sorted(removed)))

def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/patch_gemma3_config_text_only.py /path/to/hf_model_dir")
        return 2
    model_dir = Path(sys.argv[1]).resolve()
    patch_config(model_dir)
    return 0

if __name__ == '__main__':
    sys.exit(main())
