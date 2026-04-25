#!/usr/bin/env python3
"""
Phase 92: Timeline Collection for Event Sourcing
Creates Qdrant collection optimized for semantic timeline search with:
- MRL (Matryoshka Representation Learning) support
- Scalar quantization for GPU rerank compatibility
- Payload indexes for typed artifact routing
"""

import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance,
        VectorParams,
        OptimizersConfigDiff,
        PayloadSchemaType,
        ScalarQuantization,
        ScalarQuantizationConfig,
        ScalarType,
    )
except ImportError:
    print("❌ Missing dependencies: pip install qdrant-client")
    sys.exit(1)

# CONFIG
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "phase92_timeline_events"  # Semantic timeline search
VECTOR_SIZE = 768  # EmbeddingGemma dimension

def create_timeline_collection(enable_quantization: bool = False):
    """
    Create Qdrant timeline collection with optimizations.

    Args:
        enable_quantization: Enable scalar quantization for MRL support
                           (reduces memory, enables fast first-pass search)
    """
    print("🔧 Phase 92: Creating Timeline Collection")
    print("=" * 70)

    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # 1. Check if exists
    if client.collection_exists(COLLECTION_NAME):
        print(f"⚠️  Collection '{COLLECTION_NAME}' already exists.")
        choice = input("Delete and recreate? [y/N]: ").strip().lower()
        if choice == 'y':
            print(f"🗑️  Deleting existing collection...")
            client.delete_collection(COLLECTION_NAME)
        else:
            print("✅ Using existing collection")
            return

    print(f"\n🔨 Creating collection: {COLLECTION_NAME}")
    print(f"   Vector size: {VECTOR_SIZE}-d (EmbeddingGemma)")
    print(f"   Distance: COSINE")
    print(f"   Quantization: {'ENABLED (INT8)' if enable_quantization else 'DISABLED'}")

    # 2. Quantization config (MRL-friendly)
    quantization_config = None
    if enable_quantization:
        quantization_config = ScalarQuantization(
            scalar=ScalarQuantizationConfig(
                type=ScalarType.INT8,
                quantile=0.99,  # 99th percentile clipping
                always_ram=True  # Keep quantized vectors in RAM for speed
            )
        )
        print("   📊 Quantization: INT8 (99th percentile, RAM-backed)")

    # 3. Create collection
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=VECTOR_SIZE,
            distance=Distance.COSINE,
            quantization_config=quantization_config
        ),
        optimizers_config=OptimizersConfigDiff(
            memmap_threshold=20000  # Use mmap for large datasets
        )
    )

    print("✅ Collection created!")

    # 4. Create Payload Indexes (Typed Artifact Routing)
    print("\n📑 Creating payload indexes (typed artifact routing)...")

    # Keyword indexes for exact matches
    keyword_fields = ["actor", "op", "collection", "run_id", "redis_key", "codec"]
    for field in keyword_fields:
        print(f"   ✓ {field:20} (KEYWORD)")
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name=field,
            field_schema=PayloadSchemaType.KEYWORD
        )

    # Array indexes for tag-based routing
    array_fields = ["feature_tags", "error_tags"]
    for field in array_fields:
        print(f"   ✓ {field:20} (KEYWORD array)")
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name=field,
            field_schema=PayloadSchemaType.KEYWORD
        )

    # Integer index for timestamps (range queries)
    print(f"   ✓ {'ts_unix':20} (INTEGER for range queries)")
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="ts_unix",
        field_schema=PayloadSchemaType.INTEGER
    )

    # Float index for confidence scoring
    print(f"   ✓ {'confidence':20} (FLOAT for threshold queries)")
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="confidence",
        field_schema=PayloadSchemaType.FLOAT
    )

    print("\n✅ Timeline Collection Ready!")
    print("\n📊 Collection Info:")
    info = client.get_collection(COLLECTION_NAME)
    print(f"   Collection: {COLLECTION_NAME}")
    print(f"   Vectors: {info.vectors_count}")
    print(f"   Points: {info.points_count}")
    print(f"   Indexed fields: {len(keyword_fields) + len(array_fields) + 2}")

    print("\n🎯 Usage:")
    print("   # Semantic search over timeline")
    print(f"   client.search('{COLLECTION_NAME}', query_vector=embedding, limit=10)")
    print("\n   # Filter by actor + time range")
    print(f"   filter = {{")
    print(f"       'must': [")
    print(f"           {{'key': 'actor', 'match': {{'value': 'phase89-cache-indexer'}}}},")
    print(f"           {{'key': 'ts_unix', 'range': {{'gte': 1704067200}}}}  # Last 24h")
    print(f"       ]")
    print(f"   }}")
    print(f"   client.search('{COLLECTION_NAME}', query_vector=embedding, query_filter=filter)")

    print("\n   # Tag-based routing")
    print(f"   filter = {{'must': [{{'key': 'feature_tags', 'match': {{'any': ['svelte', 'runes']}}}}]}}")


def verify_collection():
    """Verify collection exists and show stats"""
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    if not client.collection_exists(COLLECTION_NAME):
        print(f"❌ Collection '{COLLECTION_NAME}' does not exist")
        return False

    info = client.get_collection(COLLECTION_NAME)
    print(f"✅ Collection exists: {COLLECTION_NAME}")
    print(f"   Vectors: {info.vectors_count}")
    print(f"   Points: {info.points_count}")
    print(f"   Status: {info.status}")

    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Create Phase 92 Timeline Collection")
    parser.add_argument("--quantize", action="store_true", help="Enable INT8 quantization (MRL-friendly)")
    parser.add_argument("--verify", action="store_true", help="Verify collection exists")
    args = parser.parse_args()

    if args.verify:
        verify_collection()
    else:
        create_timeline_collection(enable_quantization=args.quantize)
