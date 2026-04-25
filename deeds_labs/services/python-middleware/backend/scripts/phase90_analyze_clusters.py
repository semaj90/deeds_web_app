#!/usr/bin/env python3
"""
Phase 90 - Analyze Cluster Patterns
Show sample errors from each cluster to understand patterns
"""

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
from collections import Counter
import json

QDRANT_URL = "http://localhost:6333"
COLLECTION = "phase90_cuda_embeddings"

def main():
    client = QdrantClient(url=QDRANT_URL)

    print("=" * 80)
    print("Phase 90: Cluster Pattern Analysis")
    print("=" * 80)
    print()

    # Analyze each cluster
    for cluster_id in range(12):
        # Get sample errors from this cluster
        results, _ = client.scroll(
            collection_name=COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="cluster_id", match=MatchValue(value=cluster_id))]
            ),
            limit=100,
            with_payload=True,
            with_vectors=False
        )

        if not results:
            print(f"Cluster {cluster_id}: Empty")
            continue

        # Count error codes in this cluster
        error_codes = Counter()
        file_patterns = Counter()
        sample_messages = []

        for point in results:
            payload = point.payload
            if 'error_code' in payload:
                error_codes[payload['error_code']] += 1
            if 'file_path' in payload:
                # Extract pattern from path
                path = payload['file_path']
                if '/routes/' in path:
                    file_patterns['routes'] += 1
                elif '/lib/' in path:
                    file_patterns['lib'] += 1
                elif '/components/' in path:
                    file_patterns['components'] += 1
                else:
                    file_patterns['other'] += 1
            if 'message' in payload and len(sample_messages) < 3:
                sample_messages.append(payload['message'][:100])

        # Get total count for cluster
        count_result = client.count(
            collection_name=COLLECTION,
            count_filter=Filter(
                must=[FieldCondition(key="cluster_id", match=MatchValue(value=cluster_id))]
            )
        )
        total = count_result.count

        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"📁 Cluster {cluster_id}: {total:,} errors")
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        if error_codes:
            print(f"   Top Error Codes:")
            for code, cnt in error_codes.most_common(5):
                print(f"      {code}: {cnt}")

        if file_patterns:
            print(f"   File Types:")
            for pattern, cnt in file_patterns.most_common(5):
                print(f"      {pattern}: {cnt}")

        if sample_messages:
            print(f"   Sample Messages:")
            for msg in sample_messages[:2]:
                print(f"      • {msg}...")

        print()

    # Summary
    print("=" * 80)
    print("📊 SUMMARY")
    print("=" * 80)
    print("The 12 clusters represent distinct error patterns in your codebase.")
    print("Focus on the largest clusters first (11, 10, 7) for maximum impact.")
    print()
    print("🎯 Next Steps:")
    print("   1. Fix one cluster at a time, starting with the largest")
    print("   2. Use the query tool: python query_phase90.py --cluster 11")
    print("   3. Generate fix suggestions with LLM context")

if __name__ == "__main__":
    main()
