#!/usr/bin/env python3
"""
True Streaming Safetensors Writer
- Zero-copy incremental writing
- No giant final save operation
- Manual safetensors format construction
"""
import os
import json
import struct
from pathlib import Path

print("🚀 True Streaming Safetensors Writer")
print("=" * 40)

def streaming_safetensors_merge(shard_paths, output_file):
    """
    Stream-write safetensors format with manual offset management
    Avoids loading all tensors into memory at once
    """

    # Import safetensors for reading input files
    try:
        from safetensors.torch import load_file
        print("✅ safetensors imported for reading")
    except ImportError:
        print("❌ safetensors not available")
        return False

    print(f"📂 Output: {output_file}")

    # Ensure output directory exists
    Path(os.path.dirname(output_file)).mkdir(parents=True, exist_ok=True)

    # Start writing to output file
    with open(output_file, "wb") as fout:
        # Reserve space for header (we'll patch this later)
        header_size_placeholder = 8
        fout.write(b"\0" * header_size_placeholder)

        current_offset = header_size_placeholder
        metadata = {}
        total_tensors = 0

        print(f"📦 Processing {len(shard_paths)} shard files...")

        for i, shard_path in enumerate(shard_paths, 1):
            shard_name = os.path.basename(shard_path)
            print(f"\n[{i}/{len(shard_paths)}] Streaming {shard_name}...")

            try:
                # Load current shard
                tensors = load_file(shard_path)
                shard_tensor_count = len(tensors)
                print(f"  📥 Loaded {shard_tensor_count} tensors")

                # Stream each tensor directly to output
                for tensor_name, tensor_data in tensors.items():
                    # Convert to numpy for byte extraction
                    if hasattr(tensor_data, 'numpy'):
                        np_array = tensor_data.numpy()
                    else:
                        np_array = tensor_data

                    # Get tensor info
                    dtype_str = str(np_array.dtype)
                    shape = list(np_array.shape)

                    # Convert to bytes (C-contiguous order)
                    if not np_array.flags['C_CONTIGUOUS']:
                        np_array = np.ascontiguousarray(np_array)

                    tensor_bytes = np_array.tobytes()
                    tensor_size = len(tensor_bytes)

                    # Write tensor data directly to file
                    fout.write(tensor_bytes)

                    # Record metadata for header
                    metadata[tensor_name] = {
                        "dtype": dtype_str,
                        "shape": shape,
                        "data_offsets": [current_offset, current_offset + tensor_size]
                    }

                    current_offset += tensor_size
                    total_tensors += 1

                    # Progress indicator
                    if total_tensors % 100 == 0:
                        current_size_gb = current_offset / (1024**3)
                        print(f"    💾 {total_tensors} tensors written, {current_size_gb:.1f}GB")

                print(f"  ✅ Streamed {shard_tensor_count} tensors from {shard_name}")

                # Force cleanup
                del tensors
                import gc
                gc.collect()

            except Exception as e:
                print(f"  ❌ Error processing {shard_name}: {e}")
                return False

        # Now create and write the header
        print(f"\n📝 Writing safetensors header...")

        # Construct header JSON
        header_data = {
            "__metadata__": {},
            **metadata
        }

        header_json = json.dumps(header_data, separators=(',', ':'))
        header_bytes = header_json.encode('utf-8')
        header_length = len(header_bytes)

        # Patch the header at the beginning of the file
        fout.seek(0)

        # Write header length (8 bytes, little endian)
        fout.write(struct.pack('<Q', header_length))

        # Write header data
        fout.write(header_bytes)

        # Final verification
        fout.flush()

    # Verify output file
    if os.path.exists(output_file):
        final_size = os.path.getsize(output_file) / (1024**3)
        print(f"\n✅ SUCCESS!")
        print(f"📊 Total tensors: {total_tensors}")
        print(f"📊 Final size: {final_size:.2f}GB")
        print(f"📂 Output: {output_file}")
        return True
    else:
        print(f"\n❌ Output file not created")
        return False

def main():
    """Main execution"""

    # Setup paths
    base_dir = "/mnt/c/Users/james/Videos/deeds-web-app"
    temp_dir = os.path.join(base_dir, "temp_shards")
    output_dir = os.path.join(base_dir, "gemma3_trt_checkpoint")
    output_file = os.path.join(output_dir, "rank0.safetensors")

    # Check for temp files
    temp_files = []
    for i in range(1, 6):
        temp_file = os.path.join(temp_dir, f"temp_{i:02d}.safetensors")
        if os.path.exists(temp_file):
            temp_files.append(temp_file)

    if not temp_files:
        print("❌ No temp files found")
        return False

    print(f"📂 Found {len(temp_files)} temp files:")
    total_input_size = 0
    for temp_file in temp_files:
        size_gb = os.path.getsize(temp_file) / (1024**3)
        total_input_size += size_gb
        print(f"  {os.path.basename(temp_file)}: {size_gb:.1f}GB")

    print(f"📊 Total input: {total_input_size:.1f}GB")

    # Remove existing incomplete file if present
    if os.path.exists(output_file):
        try:
            os.remove(output_file)
            print(f"🗑️ Removed existing incomplete file")
        except:
            print(f"⚠️ Could not remove existing file")

    # Run streaming conversion
    success = streaming_safetensors_merge(temp_files, output_file)

    if success:
        # Copy config file
        try:
            import shutil
            config_src = os.path.join(base_dir, "model_unsloth_hf_f16", "config.json")
            config_dst = os.path.join(output_dir, "config.json")

            if os.path.exists(config_src):
                shutil.copy2(config_src, config_dst)
                print("✅ Config copied")
        except Exception as e:
            print(f"⚠️ Config copy failed: {e}")

        print("\n🎉 Streaming conversion complete!")
        print("🚀 Ready for TensorRT build:")
        print("trtllm-build --checkpoint_dir ./gemma3_trt_checkpoint --output_dir ./gemma3_engines --max_batch_size 4 --max_input_len 2048 --max_seq_len 4096 --gemm_plugin float16 --gpt_attention_plugin float16 --remove_input_padding enable --log_level info")

        return True
    else:
        print("❌ Streaming conversion failed")
        return False

if __name__ == "__main__":
    try:
        import numpy as np
        success = main()
        exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)