import sys
import json
import argparse
import numpy as np
import turbovec as tv
import os

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", type=str, required=True)
    parser.add_argument("--vector", type=str, required=True)
    parser.add_argument("--top_k", type=int, default=10)
    args = parser.parse_args()

    if not os.path.exists(args.index):
        print(f"Index not found: {args.index}", file=sys.stderr)
        sys.exit(1)

    try:
        # Load index
        # Based on smoke test: dim=768, bit_width=4
        index = tv.IdMapIndex(dim=768, bit_width=4)
        index.read(args.index)

        # Parse query vector
        query_vec = np.array(json.loads(args.vector), dtype=np.float32)
        
        # Search
        # TurboVec search returns (distances, ids)
        distances, ids = index.search(query_vec.reshape(1, -1), k=args.top_k)

        results = []
        for d, i in zip(distances[0], ids[0]):
            results.append({
                "id": str(i),
                "score": float(d)
            })

        print(json.dumps(results))
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
