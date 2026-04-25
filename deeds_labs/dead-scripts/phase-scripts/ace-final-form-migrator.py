#!/usr/bin/env python3
"""
ACE Final Form Migrator
Migrates existing phase89 Redis keys to ACE final form schema.

Usage:
    python scripts/ace-final-form-migrator.py --dry-run   # Preview changes
    python scripts/ace-final-form-migrator.py --migrate   # Execute migration
    python scripts/ace-final-form-migrator.py --index     # Index to Qdrant
"""

import asyncio
import gzip
import hashlib
import orjson
import sys
from base64 import b64encode
from dataclasses import dataclass
from datetime import datetime
from typing import Any

try:
    import redis.asyncio as aioredis
    import httpx
except ImportError:
    print("❌ Missing dependencies. Install:")
    print("   pip install redis[asyncio] httpx orjson")
    sys.exit(1)

# =============================================================================
# Configuration
# =============================================================================
@dataclass
class MigrationConfig:
    redis_url: str = 'redis://127.0.0.1:6379'
    qdrant_url: str = 'http://127.0.0.1:6333'
    ollama_url: str = 'http://localhost:11434'
    embedding_model: str = 'embeddinggemma:latest'
    batch_size: int = 100
    dry_run: bool = True

# =============================================================================
# Tag Normalization
# =============================================================================
TAG_NORMALIZATION = {
    # Language/Framework
    'typescript': ['ts', 'typescript', 'tsc', 'typescript-errors'],
    'svelte5': ['svelte', 'svelte5', 'sveltekit', 'svelte-check'],
    'javascript': ['js', 'javascript', 'ecmascript'],

    # Error Categories
    'syntax_error': ['ts1005', 'ts1003', 'ts1128', 'syntax'],
    'type_error': ['ts2322', 'ts2345', 'ts2339', 'type'],
    'import_error': ['ts2307', 'ts2792', 'module', 'import'],

    # Feature Areas
    'runes': ['runes', '$state', '$derived', '$effect', 'state-management'],
    'auth': ['authentication', 'lucia', 'session', 'auth'],
    'database': ['postgres', 'prisma', 'pg', 'database'],

    # Risk Levels
    'high_risk': ['breaking_change', 'migration', 'api_change'],
    'medium_risk': ['refactor', 'deprecation'],
    'low_risk': ['syntax_fix', 'formatting', 'semicolon']
}

def normalize_tags(raw_tags: list[str]) -> list[str]:
    """Convert raw tags to canonical form."""
    if not raw_tags:
        return []

    normalized = set()
    for tag in raw_tags:
        tag_lower = tag.lower().strip()
        # Find canonical tag
        canonical = next(
            (canon for canon, aliases in TAG_NORMALIZATION.items()
             if tag_lower in aliases or tag_lower == canon),
            tag_lower  # Keep as-is if no match
        )
        normalized.add(canonical)
    return sorted(normalized)

# =============================================================================
# Signature Text Builders
# =============================================================================
def build_cluster_signature(cluster_data: dict) -> str:
    """Build signature text for cluster artifacts."""
    tags = normalize_tags(cluster_data.get('tags', []))
    summary_snippet = cluster_data.get('summary', '')[:200]

    return f"""artifact_kind:cluster_report
cluster_id:{cluster_data.get('cluster_id', 'unknown')}
size:{cluster_data.get('size', 0)}
tags:{','.join(tags)}
summary:{summary_snippet}
source:cuda_clustering"""

def build_chunk_signature(chunk_key: str, chunk_data: bytes) -> str:
    """Build signature text for chunk embeddings."""
    # Extract file path from key: phase89:chunk:src\lib\...:chunk:3
    parts = chunk_key.split(':chunk:')
    if len(parts) >= 2:
        file_path = parts[0].replace('phase89:chunk:', '').replace('\\', '/')
        chunk_num = parts[1]
    else:
        file_path = 'unknown'
        chunk_num = '0'

    return f"""artifact_kind:code_chunk
file:{file_path}
chunk_number:{chunk_num}
source:codebase_indexer"""

# =============================================================================
# Migration Logic
# =============================================================================
class ACEMigrator:
    def __init__(self, config: MigrationConfig):
        self.config = config
        self.redis: aioredis.Redis = None
        self.stats = {
            'scanned': 0,
            'migrated': 0,
            'indexed': 0,
            'skipped': 0,
            'errors': 0
        }

    async def connect(self):
        """Connect to Redis and verify infrastructure."""
        print("\n🔌 Connecting to infrastructure...")

        self.redis = await aioredis.from_url(
            self.config.redis_url,
            decode_responses=False  # Binary mode for embeddings
        )

        # Test connection
        await self.redis.ping()
        print("   ✅ Redis connected")

        # Verify Qdrant
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.config.qdrant_url}/collections")
            if resp.status_code == 200:
                print("   ✅ Qdrant accessible")
            else:
                print("   ⚠️  Qdrant not accessible")

        # Verify Ollama
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{self.config.ollama_url}/api/tags")
                if resp.status_code == 200:
                    models = resp.json().get('models', [])
                    if any(self.config.embedding_model in m['name'] for m in models):
                        print(f"   ✅ Ollama: {self.config.embedding_model}")
                    else:
                        print(f"   ⚠️  Missing model: {self.config.embedding_model}")
        except:
            print("   ⚠️  Ollama not accessible")

        print()

    async def scan_keys(self) -> dict[str, list[str]]:
        """Scan all phase89 keys and categorize them."""
        print("🔍 Scanning Redis keys...")

        categories = {
            'cluster': [],
            'chunk': [],
            'embedding': [],
            'collection': [],
            'unknown': []
        }

        cursor = 0
        while True:
            cursor, keys = await self.redis.scan(
                cursor,
                match='phase89:*',
                count=1000
            )

            for key in keys:
                key_str = key.decode('utf-8')
                self.stats['scanned'] += 1

                if ':cluster:' in key_str:
                    categories['cluster'].append(key_str)
                elif ':chunk:' in key_str:
                    categories['chunk'].append(key_str)
                elif ':embedding:' in key_str:
                    categories['embedding'].append(key_str)
                elif ':collection:' in key_str:
                    categories['collection'].append(key_str)
                else:
                    categories['unknown'].append(key_str)

            if cursor == 0:
                break

        print(f"   📊 Scanned: {self.stats['scanned']} keys")
        for cat, keys in categories.items():
            if keys:
                print(f"      {cat}: {len(keys)} keys")
        print()

        return categories

    async def migrate_cluster(self, old_key: str, data: dict) -> dict | None:
        """Migrate cluster artifact to ACE final form."""
        try:
            # Build signature
            signature = build_cluster_signature(data)
            hash_val = hashlib.sha256(signature.encode()).hexdigest()[:16]

            # Normalize tags
            tags = normalize_tags(data.get('tags', []))

            # Infer error codes from summary
            error_codes = self._extract_error_codes(data.get('summary', ''))

            # Build new artifact
            new_artifact = {
                'artifact_kind': 'cluster_report',
                'cluster_id': data.get('cluster_id'),
                'error_ids': data.get('error_ids', []),
                'size': data.get('size', len(data.get('error_ids', []))),
                'summary': data.get('summary', ''),
                'tags': tags,
                'error_codes': error_codes,
                'confidence': 0.75,  # Default for unsupervised clustering
                'created_at': int(datetime.now().timestamp()),
                'source': 'cuda_clustering',
                'migrated_from': old_key
            }

            # New key
            new_key = f"ace:cache:cluster_report:{hash_val}"

            return {
                'old_key': old_key,
                'new_key': new_key,
                'artifact': new_artifact,
                'signature': signature
            }

        except Exception as e:
            print(f"   ❌ Error migrating {old_key}: {e}")
            self.stats['errors'] += 1
            return None

    async def migrate_chunk(self, old_key: str, embedding_data: bytes) -> dict | None:
        """Migrate chunk embedding to ACE final form."""
        try:
            # Build signature
            signature = build_chunk_signature(old_key, embedding_data)
            hash_val = hashlib.sha256(signature.encode()).hexdigest()[:16]

            # Extract metadata from key
            parts = old_key.split(':chunk:')
            file_path = parts[0].replace('phase89:chunk:', '').replace('\\', '/') if parts else 'unknown'
            chunk_num = parts[1] if len(parts) > 1 else '0'

            # Infer tags from file path
            tags = self._infer_tags_from_path(file_path)

            # Build new artifact (metadata only, embedding stays separate)
            new_artifact = {
                'artifact_kind': 'code_chunk',
                'file_path': file_path,
                'chunk_number': int(chunk_num),
                'tags': tags,
                'created_at': int(datetime.now().timestamp()),
                'source': 'codebase_indexer',
                'migrated_from': old_key
            }

            # New key (keep embedding separate)
            new_key = f"ace:cache:embedding:{hash_val}"
            new_meta_key = f"ace:cache:code_chunk:{hash_val}"

            return {
                'old_key': old_key,
                'new_embedding_key': new_key,
                'new_meta_key': new_meta_key,
                'artifact': new_artifact,
                'signature': signature,
                'embedding_data': embedding_data
            }

        except Exception as e:
            print(f"   ❌ Error migrating {old_key}: {e}")
            self.stats['errors'] += 1
            return None

    async def execute_migration(self, migrations: list[dict]):
        """Execute migrations (write new keys, optionally delete old)."""
        print(f"🚀 Executing migration ({len(migrations)} items)...")

        if self.config.dry_run:
            print("   ⚠️  DRY RUN MODE - No changes will be made")
            for mig in migrations[:5]:  # Show first 5
                print(f"      {mig['old_key']} → {mig.get('new_key', mig.get('new_meta_key'))}")
            if len(migrations) > 5:
                print(f"      ... and {len(migrations) - 5} more")
            return

        pipeline = self.redis.pipeline()

        for mig in migrations:
            # Write new artifact
            if 'new_key' in mig:
                pipeline.set(
                    mig['new_key'],
                    orjson.dumps(mig['artifact'])
                )

            # Write embedding separately
            if 'new_embedding_key' in mig:
                pipeline.set(mig['new_embedding_key'], mig['embedding_data'])

            if 'new_meta_key' in mig:
                pipeline.set(
                    mig['new_meta_key'],
                    orjson.dumps(mig['artifact'])
                )

            # Mark old key as migrated (don't delete yet)
            pipeline.set(f"{mig['old_key']}:migrated", b'1', ex=86400 * 7)  # 7 day TTL

        await pipeline.execute()
        self.stats['migrated'] += len(migrations)
        print(f"   ✅ Migrated {len(migrations)} keys")

    async def index_to_qdrant(self, migrations: list[dict]):
        """Index migrated artifacts to phase89_cache_index."""
        print(f"📊 Indexing to Qdrant ({len(migrations)} items)...")

        if self.config.dry_run:
            print("   ⚠️  DRY RUN MODE - No indexing")
            return

        # Ensure collection exists
        await self._ensure_collection('phase89_cache_index', vector_size=768)

        # Batch embed signatures
        signatures = [m['signature'] for m in migrations]
        embeddings = await self._embed_batch(signatures)

        # Build Qdrant points
        points = []
        for i, mig in enumerate(migrations):
            point = {
                'id': i + 1,  # TODO: Use UUID or hash
                'vector': embeddings[i].tolist(),
                'payload': {
                    'redis_key': mig.get('new_key', mig.get('new_meta_key')),
                    'artifact_kind': mig['artifact']['artifact_kind'],
                    'source': mig['artifact']['source'],
                    'signature_text': mig['signature'],
                    'tags': mig['artifact'].get('tags', []),
                    'error_codes': mig['artifact'].get('error_codes', []),
                    'file_paths': [mig['artifact'].get('file_path')] if 'file_path' in mig['artifact'] else [],
                    'confidence': mig['artifact'].get('confidence', 0.5),
                    'created_at': mig['artifact']['created_at']
                }
            }
            points.append(point)

        # Upsert to Qdrant
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"{self.config.qdrant_url}/collections/phase89_cache_index/points",
                json={'points': points}
            )

            if resp.status_code == 200:
                self.stats['indexed'] += len(points)
                print(f"   ✅ Indexed {len(points)} points to Qdrant")
            else:
                print(f"   ❌ Qdrant indexing failed: {resp.text}")

    async def _ensure_collection(self, name: str, vector_size: int = 768):
        """Ensure Qdrant collection exists."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.config.qdrant_url}/collections/{name}")

            if resp.status_code == 404:
                # Create collection
                await client.put(
                    f"{self.config.qdrant_url}/collections/{name}",
                    json={
                        'vectors': {
                            'size': vector_size,
                            'distance': 'Cosine'
                        }
                    }
                )
                print(f"   ✅ Created collection: {name}")

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Batch embed texts via Ollama."""
        embeddings = []

        async with httpx.AsyncClient(timeout=60.0) as client:
            for text in texts:
                resp = await client.post(
                    f"{self.config.ollama_url}/api/embeddings",
                    json={
                        'model': self.config.embedding_model,
                        'prompt': text
                    }
                )

                if resp.status_code == 200:
                    embeddings.append(resp.json()['embedding'])
                else:
                    # Fallback: zero vector
                    embeddings.append([0.0] * 768)

        return embeddings

    def _extract_error_codes(self, text: str) -> list[str]:
        """Extract TS error codes from summary text."""
        import re
        codes = re.findall(r'\bTS\d{4}\b', text)
        return sorted(set(codes))

    def _infer_tags_from_path(self, file_path: str) -> list[str]:
        """Infer tags from file path."""
        tags = []

        if '.svelte' in file_path:
            tags.append('svelte5')
        if '.ts' in file_path or 'typescript' in file_path:
            tags.append('typescript')
        if 'routes' in file_path:
            tags.append('routes')
        if 'components' in file_path:
            tags.append('components')
        if 'auth' in file_path or 'login' in file_path:
            tags.append('auth')
        if 'admin' in file_path:
            tags.append('admin')

        return normalize_tags(tags)

    async def run(self):
        """Main migration workflow."""
        try:
            await self.connect()

            # Scan keys
            categories = await self.scan_keys()

            # Migrate clusters
            cluster_migrations = []
            for key in categories['cluster']:
                data = await self.redis.get(key)
                if data:
                    data = orjson.loads(data)
                    mig = await self.migrate_cluster(key, data)
                    if mig:
                        cluster_migrations.append(mig)

            if cluster_migrations:
                await self.execute_migration(cluster_migrations)
                await self.index_to_qdrant(cluster_migrations)

            # Migrate chunks (sample only in dry-run)
            chunk_migrations = []
            chunk_limit = 50 if self.config.dry_run else len(categories['chunk'])

            for key in categories['chunk'][:chunk_limit]:
                data = await self.redis.get(key)
                if data:
                    mig = await self.migrate_chunk(key, data)
                    if mig:
                        chunk_migrations.append(mig)

            if chunk_migrations:
                await self.execute_migration(chunk_migrations)
                # Don't index raw embeddings (only metadata)

            # Print summary
            print("\n" + "=" * 60)
            print("📊 Migration Summary")
            print("=" * 60)
            for k, v in self.stats.items():
                print(f"   {k.capitalize()}: {v}")
            print()

            if self.config.dry_run:
                print("⚠️  This was a DRY RUN. No changes were made.")
                print("   Run with --migrate to execute migration.")
            else:
                print("✅ Migration complete!")
                print("   Old keys marked as :migrated (7 day TTL)")
                print("   New keys: ace:cache:*")
                print("   Indexed to: phase89_cache_index")

        finally:
            if self.redis:
                await self.redis.close()

# =============================================================================
# CLI
# =============================================================================
async def main():
    import argparse

    parser = argparse.ArgumentParser(description='ACE Final Form Migrator')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without executing')
    parser.add_argument('--migrate', action='store_true', help='Execute migration')
    parser.add_argument('--index', action='store_true', help='Index to Qdrant (requires --migrate)')

    args = parser.parse_args()

    config = MigrationConfig(
        dry_run=not args.migrate
    )

    migrator = ACEMigrator(config)
    await migrator.run()

if __name__ == '__main__':
    asyncio.run(main())
