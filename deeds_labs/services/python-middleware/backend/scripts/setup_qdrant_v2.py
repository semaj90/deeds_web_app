#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Qdrant Collection Setup
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Configure Qdrant collection for enhanced knowledge base
═══════════════════════════════════════════════════════════════════════
"""

import os
import sys
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PayloadSchemaType,
    CreateCollection,
    PointStruct,
)

# Configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = "knowledge_base_v2"
VECTOR_SIZE = 384  # embeddinggemma dimension
DISTANCE_METRIC = Distance.COSINE


def setup_collection():
    """Create and configure the Qdrant collection."""
    print(f"Connecting to Qdrant at {QDRANT_URL}...")
    client = QdrantClient(url=QDRANT_URL)

    # Check if collection already exists
    collections = client.get_collections().collections
    collection_names = [c.name for c in collections]

    if COLLECTION_NAME in collection_names:
        print(f"⚠️  Collection '{COLLECTION_NAME}' already exists.")
        response = input("Do you want to recreate it? (yes/no): ")
        if response.lower() == "yes":
            print(f"Deleting existing collection '{COLLECTION_NAME}'...")
            client.delete_collection(collection_name=COLLECTION_NAME)
        else:
            print("Keeping existing collection.")
            return

    # Create collection
    print(f"Creating collection '{COLLECTION_NAME}'...")
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=VECTOR_SIZE,
            distance=DISTANCE_METRIC,
        ),
    )

    # Create payload schema
    print("Configuring payload schema...")
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="tag_id",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="name",
        field_schema=PayloadSchemaType.TEXT,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="category",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="file_path",
        field_schema=PayloadSchemaType.TEXT,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="summary",
        field_schema=PayloadSchemaType.TEXT,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="timestamp",
        field_schema=PayloadSchemaType.DATETIME,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="cluster_id",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="error_type",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="ast_node_type",
        field_schema=PayloadSchemaType.KEYWORD,
    )

    # Verify collection
    print("\nVerifying collection...")
    collection_info = client.get_collection(collection_name=COLLECTION_NAME)
    print(f"✅ Collection created successfully!")
    print(f"   - Name: {collection_info.config.params.vectors.size}")
    print(f"   - Vector size: {collection_info.config.params.vectors.size}")
    print(f"   - Distance metric: {collection_info.config.params.vectors.distance}")
    print(f"   - Points count: {collection_info.points_count}")

    print("\n✅ Qdrant collection setup complete!")
    print(f"\nCollection details:")
    print(f"  - Collection name: {COLLECTION_NAME}")
    print(f"  - Vector dimension: {VECTOR_SIZE}")
    print(f"  - Distance metric: {DISTANCE_METRIC}")
    print(f"  - Payload indexes: tag_id, name, category, file_path, summary, timestamp, cluster_id, error_type, ast_node_type")


def verify_collection():
    """Verify the collection exists and is properly configured."""
    print(f"\nVerifying collection '{COLLECTION_NAME}'...")
    client = QdrantClient(url=QDRANT_URL)

    try:
        collection_info = client.get_collection(collection_name=COLLECTION_NAME)
        print(f"✅ Collection exists")
        print(f"   - Vector size: {collection_info.config.params.vectors.size}")
        print(f"   - Distance metric: {collection_info.config.params.vectors.distance}")
        print(f"   - Points count: {collection_info.points_count}")
        return True
    except Exception as e:
        print(f"❌ Collection verification failed: {e}")
        return False


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "verify":
            verify_collection()
        else:
            setup_collection()
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
