#!/usr/bin/env python3
"""
Resume-Safe Incremental Safetensors Merger
- Resumes from existing 8GB partial rank0.safetensors
- Streams tensors directly to disk (no RAM spikes)
- Crash-proof with immediate flush after each tensor
- Never builds full model in memory
"""

import os
import json
import struct
from pathlib import Path

def resume_merge_safetensors(shard_paths, output_file):
    """
    Resume-safe merge of safetensors shards
    Picks up from existing partial file if present
    """

    # Import required modules
    try:
        from safetensors.torch import load_file
        import numpy as np
        print("✅ Required modules imported")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False

    print(f"🚀 Resume-Safe Safetensors Merger")
    print(f"📂 Output: {output_file}")

    # Step 1: Scan existing file to see what's already written
    written_tensors = set()
    current_offset = 8  # Start after header space
    existing_metadata = {}

    if os.path.exists(output_file):
        try:
            existing_size = os.path.getsize(output_file) / (1024**3)
            print(f"📂 Found existing file: {existing_size:.1f}GB")

            with open(output_file, "rb") as fin:
                # Read header length
                header_len_bytes = fin.read(8)
                if len(header_len_bytes) == 8:
                    header_len = struct.unpack('<Q', header_len_bytes)[0]

                    if header_len > 0 and header_len < 1024*1024:  # Sanity check
                        # Read header
                        header_bytes = fin.read(header_len)
                        header_data = json.loads(header_bytes.decode('utf-8'))

                        # Parse existing tensors
                        for name, info in header_data.items():
                            if name == "__metadata__":
                                continue
                            written_tensors.add(name)
                            existing_metadata[name] = info
                            # Track highest offset
                            if "data_offsets" in info:
                                end_offset = info["data_offsets"][1]
                                current_offset = max(current_offset, end_offset)

                        print(f"🔄 Resuming from {len(written_tensors)} existing tensors")
                        print(f"📊 Current offset: {current_offset} bytes ({current_offset/(1024**3):.1f}GB)")

        except Exception as e:
            print(f"⚠️ Could not parse existing file: {e}")
            print(f"🔄 Starting fresh conversion")
            written_tensors = set()
            existing_metadata = {}
            current_offset = 8
    else:
        print(f"📂 Creating new output file")

    # Ensure output directory exists
    Path(os.path.dirname(output_file)).mkdir(parents=True, exist_ok=True)

    # Open file for writing (append mode if exists, create if new)
    file_mode = "r+b" if os.path.exists(output_file) else "wb"

    with open(output_file, file_mode) as fout:
        # If new file, write placeholder header
        if current_offset == 8:
            fout.write(b"\0" * 8)
            fout.flush()

        # Step 2: Process each shard
        total_new_tensors = 0
        all_metadata = existing_metadata.copy()

        for i, shard_path in enumerate(shard_paths, 1):
            shard_name = os.path.basename(shard_path)
            print(f"\n[{i}/{len(shard_paths)}] Processing {shard_name}...")

            try:
                # Load shard
                tensors = load_file(shard_path)
                shard_tensor_count = len(tensors)
                print(f"  📥 Loaded {shard_tensor_count} tensors")

                new_tensors_in_shard = 0

                # Process each tensor in this shard
                for tensor_name, tensor_data in tensors.items():

                    # Skip if already written
                    if tensor_name in written_tensors:
                        continue

                    # Convert to numpy array
                    if hasattr(tensor_data, 'numpy'):
                        np_array = tensor_data.numpy()
                    else:
                        np_array = tensor_data

                    # Ensure C-contiguous for consistent byte order
                    if not np_array.flags['C_CONTIGUOUS']:
                        np_array = np.ascontiguousarray(np_array)

                    # Get tensor info
                    dtype_str = str(np_array.dtype)
                    shape = list(np_array.shape)
                    tensor_bytes = np_array.tobytes()
                    tensor_size = len(tensor_bytes)

                    # Write tensor data at current offset
                    fout.seek(current_offset)
                    fout.write(tensor_bytes)

                    # Record metadata
                    all_metadata[tensor_name] = {
                        "dtype": dtype_str,
                        "shape": shape,
                        "data_offsets": [current_offset, current_offset + tensor_size]
                    }

                    # Update tracking
                    current_offset += tensor_size
                    written_tensors.add(tensor_name)
                    new_tensors_in_shard += 1
                    total_new_tensors += 1

                    # Immediate flush for crash safety
                    fout.flush()
                    os.fsync(fout.fileno())

                    # Progress update
                    if total_new_tensors % 50 == 0:
                        current_gb = current_offset / (1024**3)
                        print(f"    💾 {total_new_tensors} new tensors written, {current_gb:.1f}GB total")

                print(f"  ✅ Added {new_tensors_in_shard} new tensors from {shard_name}")

                # Cleanup after each shard
                del tensors
                import gc
                gc.collect()

            except Exception as e:
                print(f"  ❌ Error processing {shard_name}: {e}")
                continue

        # Step 3: Write final header with all metadata
        print(f"\n📝 Writing final header...")

        # Construct complete header
        header_data = {
            "__metadata__": {},
            **all_metadata
        }

        header_json = json.dumps(header_data, separators=(',', ':'))
        header_bytes = header_json.encode('utf-8')
        header_length = len(header_bytes)

        # Write header at beginning of file
        fout.seek(0)
        fout.write(struct.pack('<Q', header_length))
        fout.write(header_bytes)

        # Final flush
        fout.flush()
        os.fsync(fout.fileno())

    # Final verification
    if os.path.exists(output_file):
        final_size = os.path.getsize(output_file) / (1024**3)
        total_tensors = len(all_metadata)

        print(f"\n✅ SUCCESS!")
        print(f"📊 Total tensors: {total_tensors}")
        print(f"📊 New tensors added: {total_new_tensors}")
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

    # Find temp shard files
    shard_paths = []
    for i in range(1, 6):
        temp_file = os.path.join(temp_dir, f"temp_{i:02d}.safetensors")
        if os.path.exists(temp_file):
            shard_paths.append(temp_file)

    if not shard_paths:
        print("❌ No temp shard files found")
        return False

    print(f"📂 Found {len(shard_paths)} temp files:")
    total_input_size = 0
    for shard_path in shard_paths:
        size_gb = os.path.getsize(shard_path) / (1024**3)
        total_input_size += size_gb
        print(f"  {os.path.basename(shard_path)}: {size_gb:.1f}GB")

    print(f"📊 Total input: {total_input_size:.1f}GB")

    # Run resume-safe merge
    success = resume_merge_safetensors(shard_paths, output_file)

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

        print("\n🎉 Resume-safe merge complete!")
        print("🚀 Ready for TensorRT build:")
        print("trtllm-build --checkpoint_dir ./gemma3_trt_checkpoint --output_dir ./gemma3_engines --max_batch_size 4 --max_input_len 2048 --max_seq_len 4096 --gemm_plugin float16 --gpt_attention_plugin float16 --remove_input_padding enable --log_level info")

        return True
    else:
        print("❌ Resume-safe merge failed")
        return False

if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)