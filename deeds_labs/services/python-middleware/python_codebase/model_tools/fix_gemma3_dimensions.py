#!/usr/bin/env python3
"""
Fix Gemma-3-12B checkpoint config with correct dimensions
"""
import json
import os
import sys

def fix_checkpoint_config(checkpoint_dir):
    """Fix the config.json in a Gemma-3 checkpoint directory"""

    config_path = os.path.join(checkpoint_dir, "config.json")

    if not os.path.exists(config_path):
        print(f"❌ Config file not found: {config_path}")
        return False

    # Load current config
    with open(config_path, 'r') as f:
        config = json.load(f)

    print("🔧 Current config values:")
    print(f"   hidden_size: {config.get('hidden_size', 'missing')}")
    print(f"   intermediate_size: {config.get('intermediate_size', 'missing')}")
    print(f"   num_attention_heads: {config.get('num_attention_heads', 'missing')}")

    # Fix the incorrect values
    config['hidden_size'] = 4096
    config['intermediate_size'] = 16384
    config['num_attention_heads'] = 32

    # Also fix builder_config if it exists
    if 'builder_config' in config:
        builder = config['builder_config']
        builder['hidden_size'] = 4096
        builder['inter_size'] = 16384
        builder['num_heads'] = 32
        builder['head_size'] = 128  # 4096 / 32 = 128

    # Save corrected config
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print("✅ Fixed config values:")
    print(f"   hidden_size: {config['hidden_size']}")
    print(f"   intermediate_size: {config['intermediate_size']}")
    print(f"   num_attention_heads: {config['num_attention_heads']}")

    return True

def main():
    if len(sys.argv) != 2:
        print("Usage: python fix_gemma3_dimensions.py <checkpoint_directory>")
        print("Example: python fix_gemma3_dimensions.py /home/james/gemma3_trtllm_checkpoint")
        sys.exit(1)

    checkpoint_dir = sys.argv[1]

    if not os.path.exists(checkpoint_dir):
        print(f"❌ Checkpoint directory not found: {checkpoint_dir}")
        sys.exit(1)

    print(f"🔧 Fixing Gemma-3-12B config in: {checkpoint_dir}")

    if fix_checkpoint_config(checkpoint_dir):
        print("\n🎉 Config fixed successfully!")
        print("The checkpoint now has correct Gemma-3-12B dimensions:")
        print("  - hidden_size: 4096")
        print("  - intermediate_size: 16384")
        print("  - num_attention_heads: 32")
    else:
        print("\n❌ Failed to fix config")
        sys.exit(1)

if __name__ == "__main__":
    main()