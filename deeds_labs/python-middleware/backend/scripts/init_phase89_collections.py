#!/usr/bin/env python3
"""
Phase 89: Initialize Qdrant Collections
Creates all required collections for ACE timeline + knowledge system
"""

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import requests
import json

QDRANT_URL = "http://localhost:6333"

# Collection specs: name -> (dimension, distance_metric)
COLLECTIONS = {
    # Main knowledge collections (768d for embeddinggemma:latest)
    "phase89_cache_index": (768, "Cosine"),
    "phase89_code_chunks": (768, "Cosine"),
    "phase89_error_chunks": (768, "Cosine"),
    "phase89_kb_cards": (768, "Cosine"),
    "phase89_timeline_cards": (768, "Cosine"),  # NEW: timeline events

    # Fallback collections for Week 3 compatibility
    "knowledge_base": (768, "Cosine"),
    "phase76_knowledge_base": (768, "Cosine"),
}

def create_collection(name: str, dimension: int, distance: str) -> bool:
    """Create a Qdrant collection with specified parameters"""

    # Check if exists
    try:
        resp = requests.get(f"{QDRANT_URL}/collections/{name}")
        if resp.status_code == 200:
            print(f"✅ Collection '{name}' already exists")
            return True
    except:
        pass

    # Create collection
    payload = {
        "vectors": {
            "size": dimension,
            "distance": distance
        }
    }

    try:
        resp = requests.put(
            f"{QDRANT_URL}/collections/{name}",
            json=payload,
            timeout=10
        )

        if resp.status_code in [200, 201]:
            print(f"✅ Created collection '{name}' ({dimension}d, {distance})")
            return True
        else:
            print(f"❌ Failed to create '{name}': {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False

    except Exception as e:
        print(f"❌ Error creating '{name}': {e}")
        return False

def create_payload_indexes(collection_name: str) -> bool:
    """Create payload indexes for common query fields"""

    indexes = [
        {"field_name": "file_path", "field_schema": "keyword"},
        {"field_name": "type", "field_schema": "keyword"},
        {"field_name": "error_type", "field_schema": "keyword"},
        {"field_name": "timestamp", "field_schema": "float"},
        {"field_name": "actor", "field_schema": "keyword"},
        {"field_name": "operation", "field_schema": "keyword"},
        {"field_name": "collection", "field_schema": "keyword"},
    ]

    success = True
    for idx in indexes:
        try:
            resp = requests.put(
                f"{QDRANT_URL}/collections/{collection_name}/index",
                json=idx,
                timeout=5
            )
            if resp.status_code not in [200, 201]:
                # Index may already exist, don't fail
                pass
        except:
            pass

    return success

def main():
    print("=" * 70)
    print("Phase 89: Qdrant Collection Initialization")
    print("=" * 70)
    print()

    # Check Qdrant is running
    try:
        resp = requests.get(f"{QDRANT_URL}/collections", timeout=5)
        if resp.status_code != 200:
            print(f"❌ Qdrant not responding (status {resp.status_code})")
            return False

        existing = resp.json()['result']['collections']
        print(f"📊 Found {len(existing)} existing collections")
        print()

    except Exception as e:
        print(f"❌ Cannot connect to Qdrant at {QDRANT_URL}")
        print(f"   Error: {e}")
        print()
        print("Start Qdrant with:")
        print("   docker run -p 6333:6333 qdrant/qdrant")
        return False

    # Create collections
    print("Creating Phase 89 collections...")
    print()

    success_count = 0
    for name, (dim, dist) in COLLECTIONS.items():
        if create_collection(name, dim, dist):
            create_payload_indexes(name)
            success_count += 1

    print()
    print("=" * 70)
    print(f"✅ Created/verified {success_count}/{len(COLLECTIONS)} collections")
    print()
    print("Collections ready:")
    for name in COLLECTIONS.keys():
        print(f"  - {name}")
    print()
    print("Next steps:")
    print("  1. Run: python backend/scripts/verify_week3_ready.py")
    print("  2. Test: curl http://localhost:6333/collections")
    print("=" * 70)

    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
