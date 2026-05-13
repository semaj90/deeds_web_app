import os
import numpy as np
import turbovec
import uuid
import hashlib
from pathlib import Path

def uuid_to_uint64(u: str) -> int:
    """Map a UUID string to a uint64 using MD5 hash."""
    return int(hashlib.md5(u.encode()).hexdigest()[:16], 16)

def main():
    dim = 768
    num_vectors = 1000
    cache_dir = Path(".cache/turbovec")
    cache_dir.mkdir(parents=True, exist_ok=True)
    index_path = cache_dir / "evidence_text.tvim"

    print(f"--- TurboVec Smoke Test (dim={dim}) ---")

    # 1. Create 1K dummy 768d vectors
    print(f"Creating {num_vectors} dummy vectors...")
    vectors = np.random.random((num_vectors, dim)).astype(np.float32)
    
    # Create Qdrant-style UUIDs and map to uint64
    qdrant_ids = [str(uuid.uuid4()) for _ in range(num_vectors)]
    uint64_ids = np.array([uuid_to_uint64(uid) for uid in qdrant_ids], dtype=np.uint64)

    # 2. Build IdMapIndex(dim=768, bit_width=4)
    # Note: bit_width=4 implies 4-bit quantization (PQ)
    print("Building IdMapIndex...")
    index = turbovec.IdMapIndex(dim=dim, bit_width=4)

    # 3. Add vectors with Qdrant point IDs mapped to uint64
    print("Adding vectors to index...")
    index.add_with_ids(vectors, uint64_ids)
    print(f"Index size: {len(index)}")

    # 4. Search one query vector
    query_vec = np.random.random((1, dim)).astype(np.float32)
    print("Searching query vector...")
    distances, ids = index.search(query_vec, k=5)
    print(f"Search results (top 5):")
    for i, (d, id_val) in enumerate(zip(distances[0], ids[0])):
        print(f"  {i+1}: ID={id_val}, Distance={d:.4f}")

    # 5. Persist index to .cache/turbovec/evidence_text.tvim
    print(f"Persisting index to {index_path}...")
    index.write(str(index_path))

    # 6. Reload index
    print("Reloading index...")
    new_index = turbovec.IdMapIndex.load(str(index_path))
    print(f"Reloaded index size: {len(new_index)}")

    # 7. Verify IDs survive reload
    print("Verifying IDs...")
    _, reloaded_ids = new_index.search(query_vec, k=5)
    
    match = np.array_equal(ids, reloaded_ids)
    if match:
        print("SUCCESS: IDs match after reload.")
    else:
        print("FAILURE: IDs do not match after reload.")
        print(f"Original: {ids[0]}")
        print(f"Reloaded: {reloaded_ids[0]}")
        exit(1)

if __name__ == "__main__":
    main()
