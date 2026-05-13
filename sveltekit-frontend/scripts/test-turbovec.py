import turbovec
import numpy as np
import time

def test_turbovec():
    print("[START] Testing TurboVec Native Indexing...")
    
    dim = 64
    n = 1000
    queries = 1
    
    # 1. Generate random data
    print(f"   Generating {n} vectors with dimension {dim}...")
    data = np.random.random((n, dim)).astype(np.float32)
    
    # 2. Build Index (using 4-bit quantization)
    print("   Building TurboQuantIndex (4-bit)...")
    start = time.time()
    index = turbovec.TurboQuantIndex(dim, 4)
    index.add(data)
    build_time = time.time() - start
    print(f"   [OK] Index built in {build_time:.4f}s")
    
    # 3. Search
    print(f"   Performing search for {queries} queries...")
    query_vecs = np.random.random((queries, dim)).astype(np.float32)
    
    start = time.time()
    # Search takes a 2D array of queries and returns (scores, indices)
    scores, indices = index.search(query_vecs, k=5)
    search_time = (time.time() - start) / queries
    
    print(f"   [OK] Search time: {search_time*1000:.4f}ms")
    print(f"   Top result indices:\n{indices}")
    print(f"   Top result scores:\n{scores}")

if __name__ == "__main__":
    try:
        test_turbovec()
        print("\n[DONE] TurboVec Integration Verified!")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n[ERROR] TurboVec Test Failed: {e}")
        import sys
        sys.exit(1)
