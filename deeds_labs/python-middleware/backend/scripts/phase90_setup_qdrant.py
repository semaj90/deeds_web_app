#!/usr/bin/env python3
"""
Phase 90 - Qdrant Collection Setup with Indexed Payload Fields
Optimized for 100k+ diagnostic cards with fast filtering
"""

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PayloadSchemaType
)

def setup_error_cards_collection(client: QdrantClient):
    """
    Create phase90_error_cards collection with indexed payload fields.

    Indexed fields for fast filtering:
    - errorCode (keyword)
    - tool (keyword)
    - severity (keyword)
    - filePath (text with tokenization)
    - surface[] (keyword array)
    - tech[] (keyword array)
    - clusterId (keyword)
    - runId (keyword)
    """
    collection_name = "phase90_error_cards"

    # Delete if exists (for clean setup)
    try:
        client.delete_collection(collection_name)
        print(f"🗑️  Deleted existing {collection_name}")
    except:
        pass

    # Create collection with vector config
    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(
            size=768,
            distance=Distance.COSINE
        )
    )
    print(f"✅ Created collection: {collection_name}")

    # Create payload indexes for fast filtering
    indexes = [
        ("errorCode", PayloadSchemaType.KEYWORD),
        ("tool", PayloadSchemaType.KEYWORD),
        ("severity", PayloadSchemaType.KEYWORD),
        ("clusterId", PayloadSchemaType.KEYWORD),
        ("runId", PayloadSchemaType.KEYWORD),
        ("kind", PayloadSchemaType.KEYWORD),
        # Arrays
        ("surface", PayloadSchemaType.KEYWORD),
        ("tech", PayloadSchemaType.KEYWORD),
    ]

    for field_name, schema_type in indexes:
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field_name,
            field_schema=schema_type
        )
        print(f"   📇 Indexed: {field_name} ({schema_type})")

    # Text index for filePath (allows partial matching)
    client.create_payload_index(
        collection_name=collection_name,
        field_name="filePath",
        field_schema=PayloadSchemaType.TEXT,
    )
    print(f"   📇 Indexed: filePath (TEXT)")

    print(f"\n✅ All indexes created for {collection_name}")


def setup_cluster_cards_collection(client: QdrantClient):
    """
    Create phase90_error_clusters collection with indexed fields.

    Indexed fields:
    - errorCode (dominant code)
    - surface[] (all surfaces affected)
    - tech[] (all tech involved)
    - runId
    """
    collection_name = "phase90_error_clusters"

    try:
        client.delete_collection(collection_name)
        print(f"🗑️  Deleted existing {collection_name}")
    except:
        pass

    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(
            size=768,
            distance=Distance.COSINE
        )
    )
    print(f"✅ Created collection: {collection_name}")

    indexes = [
        ("errorCode", PayloadSchemaType.KEYWORD),
        ("kind", PayloadSchemaType.KEYWORD),
        ("runId", PayloadSchemaType.KEYWORD),
        ("surface", PayloadSchemaType.KEYWORD),
        ("tech", PayloadSchemaType.KEYWORD),
    ]

    for field_name, schema_type in indexes:
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field_name,
            field_schema=schema_type
        )
        print(f"   📇 Indexed: {field_name} ({schema_type})")

    print(f"\n✅ All indexes created for {collection_name}")


def setup_file_profile_indexes(client: QdrantClient):
    """
    Add indexes to existing fastmcp_file_profiles collection.
    Non-destructive - only adds indexes.
    """
    collection_name = "fastmcp_file_profiles"

    print(f"\n📊 Adding indexes to {collection_name}...")

    # Check if collection exists
    try:
        info = client.get_collection(collection_name)
        print(f"   Found collection with {info.points_count} points")
    except:
        print(f"   ⚠️  Collection {collection_name} not found, skipping")
        return

    # Add indexes (idempotent - won't fail if already exist)
    indexes = [
        ("kind", PayloadSchemaType.KEYWORD),
        ("role", PayloadSchemaType.KEYWORD),
        ("surface", PayloadSchemaType.KEYWORD),
        ("tech", PayloadSchemaType.KEYWORD),
        ("risk", PayloadSchemaType.KEYWORD),
        ("change_frequency", PayloadSchemaType.KEYWORD),
        ("runId", PayloadSchemaType.KEYWORD),
    ]

    for field_name, schema_type in indexes:
        try:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field_name,
                field_schema=schema_type
            )
            print(f"   📇 Indexed: {field_name} ({schema_type})")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"   ✓ Already indexed: {field_name}")
            else:
                print(f"   ⚠️  Failed to index {field_name}: {e}")

    print(f"\n✅ Indexes ready for {collection_name}")


def print_example_queries():
    """Print example filter queries for the UI"""

    print("\n" + "=" * 70)
    print("📋 Example Qdrant Filter Queries (for UI)")
    print("=" * 70)

    examples = [
        {
            "name": "Top 20 TS1005 errors",
            "filter": {
                "must": [
                    {"key": "errorCode", "match": {"value": "TS1005"}}
                ]
            },
            "limit": 20,
            "with_payload": True
        },
        {
            "name": "Errors in routes surface area",
            "filter": {
                "must": [
                    {"key": "surface", "match": {"any": ["routes"]}}
                ]
            },
            "limit": 50,
            "with_payload": True
        },
        {
            "name": "Drizzle-related errors",
            "filter": {
                "must": [
                    {"key": "tech", "match": {"any": ["drizzle"]}}
                ]
            },
            "limit": 30,
            "with_payload": True
        },
        {
            "name": "TS1005 errors in evidence surface (combined)",
            "filter": {
                "must": [
                    {"key": "errorCode", "match": {"value": "TS1005"}},
                    {"key": "surface", "match": {"any": ["evidence"]}}
                ]
            },
            "limit": 20,
            "with_payload": True
        },
        {
            "name": "All errors from latest run",
            "filter": {
                "must": [
                    {"key": "runId", "match": {"value": "index_2026-01-02_1810"}}
                ]
            },
            "limit": 100,
            "with_payload": True
        },
        {
            "name": "Members of cluster_7",
            "filter": {
                "must": [
                    {"key": "clusterId", "match": {"value": "cluster_7"}}
                ]
            },
            "limit": 50,
            "with_payload": True
        }
    ]

    for ex in examples:
        print(f"\n📌 {ex['name']}:")
        print("   curl http://localhost:6333/collections/phase90_error_cards/points/scroll \\")
        print("     -H 'Content-Type: application/json' \\")
        print(f"     -d '{json.dumps(ex, indent=2)}'")


if __name__ == "__main__":
    import json

    print("🚀 Phase 90: Qdrant Collection Setup")
    print("=" * 70)

    client = QdrantClient(url="http://localhost:6333")

    # Setup diagnostic collections
    setup_error_cards_collection(client)
    print()
    setup_cluster_cards_collection(client)
    print()

    # Enhance existing file profiles
    setup_file_profile_indexes(client)

    # Print query examples
    print_example_queries()

    print("\n" + "=" * 70)
    print("✅ Qdrant setup complete!")
    print("\n📊 Collections ready:")
    print("   - phase90_error_cards (with 8 indexed fields)")
    print("   - phase90_error_clusters (with 5 indexed fields)")
    print("   - fastmcp_file_profiles (indexes added)")
    print("\n💡 Run: python phase90_unified_diagnostics.py to test")
