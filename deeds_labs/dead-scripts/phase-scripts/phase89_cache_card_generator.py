#!/usr/bin/env python3
"""
Phase 89: Cache Card Generator
Scan Redis → decode blobs → create searchable cache cards → index in Qdrant
"""

import asyncio
import hashlib
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass, asdict

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import redis.asyncio as redis
except ImportError:
    import aioredis as redis

try:
    import orjson as json
    JSON_BACKEND = "orjson"
except ImportError:
    import json
    JSON_BACKEND = "stdlib"

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# Import our codec decoder
from phase89_codec import decode_blob, DecodedBlob


@dataclass
class CacheCard:
    """Lightweight searchable metadata card for a Redis key"""
    redis_key: str
    ns: str  # namespace family: phase89|emb|legacy
    kind: str  # embedding|chunk|cluster|topk|summary|tags|llm_output|prompt|retrieval
    prefix: str  # phase89:chunk etc
    source: Optional[str]  # tsc|svelte|ace|kag|rag|mcp|context7
    file_path: Optional[str]
    route_id: Optional[str]
    feature_tags: List[str]
    error_tags: List[str]
    codec: str  # json|gzip|zstd|base64+gzip|unknown
    blob_ref: str  # redis (store key for large blobs)
    content_hash: str  # sha256 of decoded content
    created_at: str
    signature_text: str  # What gets embedded
    raw_size: int
    decoded_size: int


def parse_redis_key(key: str) -> Dict[str, str]:
    """Parse Redis key into structured metadata"""
    parts = key.split(':')

    if len(parts) < 2:
        return {
            'ns': 'unknown',
            'kind': 'unknown',
            'prefix': key,
            'file_path': None,
            'route_id': None,
            'source': None
        }

    ns = parts[0]  # phase89, emb, etc
    kind = parts[1] if len(parts) > 1 else 'unknown'

    # Detect source from key patterns
    source = None
    if 'tsc' in key or 'typescript' in key.lower():
        source = 'tsc'
    elif 'svelte' in key.lower():
        source = 'svelte'
    elif 'ace' in key.lower():
        source = 'ace'
    elif 'kag' in key.lower() or 'rag' in key.lower():
        source = 'kag'
    elif 'mcp' in key.lower():
        source = 'mcp'
    elif 'context7' in key.lower():
        source = 'context7'

    # Extract file path if present
    file_path = None
    route_id = None

    if kind == 'chunk' and len(parts) >= 3:
        # phase89:chunk:src/lib/service.ts:chunk:3
        file_path = parts[2]
        if len(parts) >= 5:
            route_id = parts[4]

    return {
        'ns': ns,
        'kind': kind,
        'prefix': ':'.join(parts[:2]),
        'file_path': file_path,
        'route_id': route_id,
        'source': source
    }


def extract_tags(decoded: DecodedBlob, key_metadata: Dict[str, str]) -> Dict[str, List[str]]:
    """Extract feature and error tags from decoded content"""
    feature_tags = []
    error_tags = []

    # From key
    source = key_metadata.get('source')
    if source:
        feature_tags.append(source)

    kind = key_metadata.get('kind', '')
    if kind:
        feature_tags.append(kind)

    file_path = key_metadata.get('file_path')
    if file_path:
        # Extract file type
        if file_path.endswith('.ts'):
            feature_tags.append('typescript')
        elif file_path.endswith('.svelte'):
            feature_tags.append('svelte')
        elif file_path.endswith('.py'):
            feature_tags.append('python')
        elif file_path.endswith('.go'):
            feature_tags.append('go')

        # Extract directory hints
        if 'lib/services' in file_path:
            feature_tags.append('service')
        elif 'lib/components' in file_path:
            feature_tags.append('component')
        elif 'routes' in file_path:
            feature_tags.append('route')

    # From content (if JSON)
    if decoded.is_json and isinstance(decoded.content, dict):
        content = decoded.content

        # Check for error patterns
        if 'error' in content or 'errors' in content:
            error_tags.append('has_errors')

        # Check for specific error codes
        text_content = str(content).lower()
        if 'ts2345' in text_content:
            error_tags.append('TS2345')
        if 'ts2339' in text_content:
            error_tags.append('TS2339')
        if 'ts2322' in text_content:
            error_tags.append('TS2322')

        # Feature detection
        if 'svelte' in text_content:
            feature_tags.append('svelte')
        if 'embedding' in text_content:
            feature_tags.append('embedding')
        if 'cluster' in text_content:
            feature_tags.append('cluster')

    return {
        'feature_tags': list(set(feature_tags)),
        'error_tags': list(set(error_tags))
    }


def create_signature_text(card_metadata: Dict[str, Any]) -> str:
    """Create deterministic signature text for embedding"""
    kind = card_metadata['kind']
    key = card_metadata['redis_key']
    file_path = card_metadata.get('file_path', 'N/A')
    feature_tags = ', '.join(card_metadata.get('feature_tags', []))
    error_tags = ', '.join(card_metadata.get('error_tags', []))
    codec = card_metadata['codec']

    signature = f"""KIND: {kind}
KEY: {key}
FILE: {file_path}
FEATURE: {feature_tags or 'none'}
ERROR_TAGS: {error_tags or 'none'}
CODEC: {codec}
HINT: {kind} for {file_path if file_path != 'N/A' else 'system'}"""

    return signature.strip()


async def scan_redis_keys(
    cache: redis.Redis,
    pattern: str = "phase89:*",
    batch_size: int = 1000
) -> List[str]:
    """Scan Redis for keys matching pattern"""
    keys = []
    cursor = 0

    while True:
        cursor, batch = await cache.scan(cursor, match=pattern, count=batch_size)
        keys.extend([k.decode('utf-8') if isinstance(k, bytes) else k for k in batch])

        if cursor == 0:
            break

    return keys


async def create_cache_card(
    cache: redis.Redis,
    key: str
) -> Optional[CacheCard]:
    """Create a cache card for a Redis key"""
    try:
        # Get raw value
        raw_value = await cache.get(key)
        if raw_value is None:
            return None

        if isinstance(raw_value, str):
            raw_value = raw_value.encode('utf-8')

        # Decode blob
        decoded = decode_blob(raw_value)

        # Parse key metadata
        key_metadata = parse_redis_key(key)

        # Extract tags
        tags = extract_tags(decoded, key_metadata)

        # Compute content hash
        if isinstance(decoded.content, (dict, list)):
            content_bytes = str(decoded.content).encode('utf-8')
        elif isinstance(decoded.content, str):
            content_bytes = decoded.content.encode('utf-8')
        else:
            content_bytes = bytes(decoded.content)

        content_hash = hashlib.sha256(content_bytes).hexdigest()

        # Create card metadata
        card_data = {
            'redis_key': key,
            'ns': key_metadata['ns'],
            'kind': key_metadata['kind'],
            'prefix': key_metadata['prefix'],
            'source': key_metadata.get('source'),
            'file_path': key_metadata.get('file_path'),
            'route_id': key_metadata.get('route_id'),
            'feature_tags': tags['feature_tags'],
            'error_tags': tags['error_tags'],
            'codec': decoded.codec,
            'blob_ref': f"redis:{key}",
            'content_hash': content_hash,
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'raw_size': decoded.raw_size,
            'decoded_size': decoded.decoded_size
        }

        # Create signature text
        card_data['signature_text'] = create_signature_text(card_data)

        return CacheCard(**card_data)

    except Exception as e:
        print(f"❌ Failed to create card for {key}: {e}")
        return None


async def index_cache_cards(
    cards: List[CacheCard],
    collection_name: str = "phase89_cache_index",
    embedding_dim: int = 768
):
    """Index cache cards in Qdrant (without embeddings for now)"""
    client = QdrantClient(url="http://localhost:6333")

    # Recreate collection
    try:
        client.delete_collection(collection_name)
    except:
        pass

    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=embedding_dim, distance=Distance.COSINE)
    )

    print(f"✅ Created Qdrant collection: {collection_name}")

    # For now, index with zero vectors (we'll add embeddings in next step)
    points = []
    for i, card in enumerate(cards):
        point = PointStruct(
            id=i,
            vector=[0.0] * embedding_dim,  # Placeholder, will be replaced by embeddings
            payload=asdict(card)
        )
        points.append(point)

    # Batch upsert
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        client.upsert(collection_name=collection_name, points=batch)
        print(f"  Indexed {i + len(batch)}/{len(points)} cards...")

    print(f"✅ Indexed {len(points)} cache cards")


async def main():
    print("🗂️  Phase 89: Cache Card Generator")
    print("=" * 70)
    print(f"JSON Backend: {JSON_BACKEND}")
    print()

    # Connect to Redis
    cache = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)

    try:
        await cache.ping()
        print("✅ Redis connected")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        await cache.aclose()
        return

    # Scan for phase89:* keys
    print("\n📊 Scanning Redis keys...")
    keys = await scan_redis_keys(cache, pattern="phase89:*", batch_size=1000)
    print(f"✅ Found {len(keys):,} phase89:* keys")

    # Sample 100 keys for codec analysis
    sample_size = min(100, len(keys))
    sample_keys = keys[:sample_size]

    print(f"\n🔍 Analyzing {sample_size} keys for codec detection...")

    codec_stats = {}
    cards = []

    for i, key in enumerate(sample_keys):
        card = await create_cache_card(cache, key)
        if card:
            cards.append(card)
            codec = card.codec
            codec_stats[codec] = codec_stats.get(codec, 0) + 1

        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{sample_size} keys...")

    print(f"\n✅ Created {len(cards)} cache cards")

    # Print codec statistics
    print("\n📊 Codec Statistics:")
    print("-" * 70)
    for codec, count in sorted(codec_stats.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / len(cards)) * 100
        print(f"  {codec:30} {count:5} ({percentage:5.1f}%)")

    # Save codec stats
    stats_file = Path("reports/phase89_chunk_codec_stats.json")
    stats_file.parent.mkdir(parents=True, exist_ok=True)

    stats_data = {
        'total_keys': len(keys),
        'analyzed_keys': len(cards),
        'codec_distribution': codec_stats,
        'sample_cards': [asdict(card) for card in cards[:10]]  # First 10 as examples
    }

    if JSON_BACKEND == "orjson":
        import orjson
        stats_file.write_bytes(orjson.dumps(stats_data, option=orjson.OPT_INDENT_2))
    else:
        stats_file.write_text(json.dumps(stats_data, indent=2))

    print(f"\n💾 Saved codec stats: {stats_file}")

    # Index in Qdrant
    if cards:
        print(f"\n🔍 Indexing {len(cards)} cards in Qdrant...")
        await index_cache_cards(cards)

    await cache.aclose()

    print("\n✅ Cache card generation complete!")


if __name__ == "__main__":
    asyncio.run(main())
