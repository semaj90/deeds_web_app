#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

"""
Fix symlinks for multi-shard safetensors to match expected HF names from
model.safetensors.index.json.

Given a directory containing e.g. model-00001-of-00005-006.safetensors actual files,
this script ensures canonical names like model-00001-of-00005.safetensors exist as
symlinks pointing to the best-matching actual file.

Usage:
  python scripts/fix_safetensors_symlinks.py /path/to/model_dir
"""

def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/fix_safetensors_symlinks.py /path/to/model_dir")
        return 2

    model_dir = Path(sys.argv[1]).resolve()
    index_path = model_dir / 'model.safetensors.index.json'
    if not index_path.exists():
        print(f"ERROR: {index_path} not found. This script relies on the HF index.")
        return 1

    idx = json.loads(index_path.read_text())
    weight_map = idx.get('weight_map') or {}
    expected_files = sorted(set(weight_map.values()))
    if not expected_files:
        print("ERROR: No expected shard filenames found in index weight_map.")
        return 1

    # Compile regex to match a shard with extra numeric suffix before extension
    # e.g., model-00001-of-00005-006.safetensors
    def find_candidate(target_name: str) -> Path | None:
        base = target_name.replace('.safetensors', '')
        # 1) Exact file
        exact = model_dir / target_name
        if exact.exists():
            return exact
        # 2) Any file starting with base + '-' and ending .safetensors
        pattern = re.compile(re.escape(base) + r'-\d+\.safetensors$')
        candidates = [p for p in model_dir.glob(base + '-*.safetensors') if pattern.search(p.name)]
        if not candidates:
            return None
        # Pick the newest modified file
        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return candidates[0]

    fixed = 0
    missing = []
    for name in expected_files:
        target = model_dir / name
        cand = find_candidate(name)
        if cand is None:
            missing.append(name)
            continue
        if target.exists():
            # If it's already a symlink to the same inode/name, skip
            if target.is_symlink() and target.resolve() == cand.resolve():
                continue
            # If it's a regular file, leave it
            if target.is_file() and not target.is_symlink():
                continue
            # Otherwise, remove and recreate
            target.unlink(missing_ok=True)
        # Create symlink
        rel = cand.name
        target.symlink_to(rel)
        print(f"Linked {target.name} -> {rel}")
        fixed += 1

    if missing:
        print("WARNING: No candidate files found for:")
        for m in missing:
            print("  ", m)
    print(f"Done. Repaired {fixed} shard link(s).")
    return 0

if __name__ == '__main__':
    sys.exit(main())
