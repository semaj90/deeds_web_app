#!/usr/bin/env python3
"""
Phase 90 - Query Error Clusters from Qdrant
Query by error code, file path, surface area, or semantic similarity
"""

import argparse
import json
from typing import List, Dict, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny

def query_by_error_code(qdrant: QdrantClient, collection: str, error_code: str, limit: int = 20) -> List[Dict]:
    """Query errors by error code (e.g., ts2305, ts2339)"""
    results = qdrant.scroll(
        collection_name=collection,
        scroll_filter=Filter(
            must=[FieldCondition(key="errorCode", match=MatchValue(value=error_code))]
        ),
        limit=limit,
        with_payload=True,
        with_vectors=False
    )

    return [r.payload for r in results[0]]

def query_by_file(qdrant: QdrantClient, collection: str, file_pattern: str, limit: int = 20) -> List[Dict]:
    """Query errors in a specific file or pattern"""
    # Scroll and filter manually (Qdrant doesn't support LIKE)
    results = qdrant.scroll(
        collection_name=collection,
        limit=limit * 10,  # Over-fetch for filtering
        with_payload=True,
        with_vectors=False
    )

    filtered = []
    for r in results[0]:
        if file_pattern.lower() in r.payload.get("filePath", "").lower():
            filtered.append(r.payload)
            if len(filtered) >= limit:
                break

    return filtered

def query_by_surface(qdrant: QdrantClient, collection: str, surfaces: List[str], limit: int = 50) -> List[Dict]:
    """Query errors by surface area (ui, api, rag, ace)"""
    results = qdrant.scroll(
        collection_name=collection,
        scroll_filter=Filter(
            must=[FieldCondition(key="surface", match=MatchAny(any=surfaces))]
        ),
        limit=limit,
        with_payload=True,
        with_vectors=False
    )

    return [r.payload for r in results[0]]

def semantic_search(qdrant: QdrantClient, collection: str, query_text: str, limit: int = 10) -> List[Dict]:
    """Semantic search using sentence-transformers"""
    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
        query_vector = model.encode(query_text).tolist()

        results = qdrant.search(
            collection_name=collection,
            query_vector=query_vector,
            limit=limit,
            with_payload=True
        )

        return [{"score": r.score, **r.payload} for r in results]
    except Exception as e:
        print(f"⚠️  Semantic search failed: {e}")
        return []

def get_stats(qdrant: QdrantClient, collection: str) -> Dict:
    """Get collection statistics"""
    info = qdrant.get_collection(collection)

    # Sample to get error code distribution
    sample = qdrant.scroll(
        collection_name=collection,
        limit=5000,
        with_payload=True,
        with_vectors=False
    )

    error_codes = {}
    surfaces = {}
    files = {}

    for r in sample[0]:
        code = r.payload.get("errorCode", "unknown")
        error_codes[code] = error_codes.get(code, 0) + 1

        for surf in r.payload.get("surface", []):
            surfaces[surf] = surfaces.get(surf, 0) + 1

        file_path = r.payload.get("filePath", "")
        files[file_path] = files.get(file_path, 0) + 1

    return {
        "total_points": info.points_count,
        "vector_dim": info.config.params.vectors.size,
        "top_error_codes": dict(sorted(error_codes.items(), key=lambda x: -x[1])[:10]),
        "surface_distribution": surfaces,
        "top_files": dict(sorted(files.items(), key=lambda x: -x[1])[:10])
    }

def main():
    parser = argparse.ArgumentParser(description="Query Phase 90 Error Clusters")
    parser.add_argument("--collection", default="phase90_cuda_embeddings", help="Qdrant collection")
    parser.add_argument("--error-code", help="Filter by error code (e.g., ts2305)")
    parser.add_argument("--file", help="Filter by file path pattern")
    parser.add_argument("--surface", nargs="+", help="Filter by surface areas")
    parser.add_argument("--search", help="Semantic search query")
    parser.add_argument("--stats", action="store_true", help="Show collection statistics")
    parser.add_argument("--limit", type=int, default=20, help="Result limit")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    qdrant = QdrantClient(host="localhost", port=6333)

    # Check if collection exists
    try:
        info = qdrant.get_collection(args.collection)
        print(f"✅ Collection: {args.collection} ({info.points_count} points)")
    except Exception as e:
        print(f"❌ Collection not found: {args.collection}")
        print("   Run phase90_cuda_embedder.py first to create embeddings")
        return

    print()

    if args.stats:
        stats = get_stats(qdrant, args.collection)
        print("📊 Collection Statistics")
        print("=" * 60)
        print(f"Total Points: {stats['total_points']}")
        print(f"Vector Dimension: {stats['vector_dim']}")
        print()
        print("🔴 Top Error Codes:")
        for code, count in stats['top_error_codes'].items():
            print(f"   {code}: {count}")
        print()
        print("📍 Surface Distribution:")
        for surf, count in stats['surface_distribution'].items():
            print(f"   {surf}: {count}")
        print()
        print("📂 Top Files (by error count):")
        for file, count in stats['top_files'].items():
            short_file = file.split("\\")[-1] if "\\" in file else file.split("/")[-1]
            print(f"   {short_file}: {count}")
        return

    results = []

    if args.error_code:
        print(f"🔍 Querying errors with code: {args.error_code}")
        results = query_by_error_code(qdrant, args.collection, args.error_code, args.limit)

    elif args.file:
        print(f"🔍 Querying errors in files matching: {args.file}")
        results = query_by_file(qdrant, args.collection, args.file, args.limit)

    elif args.surface:
        print(f"🔍 Querying errors in surface areas: {args.surface}")
        results = query_by_surface(qdrant, args.collection, args.surface, args.limit)

    elif args.search:
        print(f"🔍 Semantic search: '{args.search}'")
        results = semantic_search(qdrant, args.collection, args.search, args.limit)

    else:
        # Default: show stats
        print("Use --stats, --error-code, --file, --surface, or --search")
        print()
        print("Examples:")
        print("  python query_phase90.py --stats")
        print("  python query_phase90.py --error-code ts2305")
        print("  python query_phase90.py --file AiAssistant")
        print("  python query_phase90.py --surface ui api")
        print("  python query_phase90.py --search 'property does not exist on type'")
        return

    if not results:
        print("   No results found")
        return

    print(f"\n   Found: {len(results)} results\n")

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        for i, r in enumerate(results, 1):
            score = r.pop("score", None)
            print(f"[{i}] {r.get('errorCode', 'N/A')}: {r.get('filePath', 'N/A')}")
            print(f"    Line {r.get('line', '?')}:{r.get('col', '?')}")
            msg = r.get('message', '')[:100]
            print(f"    {msg}{'...' if len(r.get('message', '')) > 100 else ''}")
            if score:
                print(f"    Similarity: {score:.3f}")
            print()

if __name__ == "__main__":
    main()
