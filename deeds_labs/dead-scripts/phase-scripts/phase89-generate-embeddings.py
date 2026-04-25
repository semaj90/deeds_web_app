#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: Standalone Embedding Generator
Generates embeddinggemma:latest (768-dim) vectors for all errors
Stores in phase89_embeddings table for clustering
"""

import os
import sys
import json
import hashlib
import time
from datetime import datetime
from typing import List, Optional
import argparse

# Fix Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

import numpy as np
import redis
import psycopg2
from psycopg2.extras import execute_values
import requests

# =============================================================================
# Configuration
# =============================================================================
CONFIG = {
    'postgres': {
        'dbname': 'legal_ai_db',
        'user': 'legal_admin',
        'password': '123456',
        'host': 'localhost',
        'port': '5434'
    },
    'redis': {
        'host': 'localhost',
        'port': 6379,
        'db': 0
    },
    'ollama': {
        'url': 'http://localhost:11434',
        'embedding_model': 'embeddinggemma:latest'
    }
}

# =============================================================================
# Redis Cache
# =============================================================================
class EmbeddingCache:
    """Redis-backed embedding cache with 7-day TTL"""

    def __init__(self, redis_client: redis.Redis, prefix: str = 'emb:phase89'):
        self.redis = redis_client
        self.prefix = prefix
        self.hits = 0
        self.misses = 0

    def _key(self, text: str) -> str:
        hash_val = hashlib.sha256(text.encode()).hexdigest()[:16]
        return f"{self.prefix}:{hash_val}"

    def get(self, text: str) -> Optional[np.ndarray]:
        try:
            key = self._key(text)
            cached = self.redis.get(key)
            if cached:
                self.hits += 1
                return np.frombuffer(cached, dtype=np.float32)
        except Exception:
            pass
        self.misses += 1
        return None

    def set(self, text: str, embedding: np.ndarray, ttl: int = 604800):
        """Cache embedding with 7-day TTL"""
        try:
            key = self._key(text)
            self.redis.setex(key, ttl, embedding.astype(np.float32).tobytes())
        except Exception:
            pass

    def stats(self) -> dict:
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        return {'hits': self.hits, 'misses': self.misses, 'hit_rate': f'{hit_rate:.1f}%'}

# =============================================================================
# Ollama Embedder
# =============================================================================
class OllamaEmbedder:
    """Generate embeddings using Ollama embeddinggemma:latest (768-dim)"""

    def __init__(self, cache: EmbeddingCache):
        self.cache = cache
        self.url = CONFIG['ollama']['url']
        self.model = CONFIG['ollama']['embedding_model']

    def embed_text(self, text: str) -> Optional[np.ndarray]:
        """Generate single embedding with cache"""
        # Check cache first
        cached = self.cache.get(text)
        if cached is not None:
            return cached

        # Generate via Ollama
        try:
            response = requests.post(
                f"{self.url}/api/embed",
                json={'model': self.model, 'input': text},
                timeout=30
            )
            if response.ok:
                data = response.json()
                emb = data.get('embeddings', [data.get('embedding')])[0]
                embedding = np.array(emb, dtype=np.float32)

                # Cache for 7 days
                self.cache.set(text, embedding)
                return embedding
        except Exception as e:
            print(f"❌ Embedding failed: {e}")
            return None

    def embed_batch(self, texts: List[str]) -> List[Optional[np.ndarray]]:
        """Embed batch of texts"""
        embeddings = []
        for i, text in enumerate(texts):
            if i % 10 == 0:
                print(f"   Embedding {i+1}/{len(texts)}...", end='\r')
            emb = self.embed_text(text)
            embeddings.append(emb)
        print()  # New line after progress
        return embeddings

# =============================================================================
# Main Pipeline
# =============================================================================
def generate_embeddings(batch_size: int = 500, max_errors: Optional[int] = None):
    """Generate embeddings for all errors in phase89_error_instances"""

    start_time = time.time()

    # Connect to services
    print("🔌 Connecting to services...")
    redis_client = redis.Redis(**CONFIG['redis'])
    pg_conn = psycopg2.connect(**CONFIG['postgres'])

    cache = EmbeddingCache(redis_client)
    embedder = OllamaEmbedder(cache)

    # Fetch errors without embeddings
    print("📥 Fetching errors from PostgreSQL...")
    with pg_conn.cursor() as cur:
        # Get errors that don't have embeddings yet
        query = """
            SELECT e.id, e.source, e.file_path, e.line, e.message, e.text_hash, e.tags
            FROM phase89_error_instances e
            LEFT JOIN phase89_embeddings emb
                ON e.text_hash = emb.text_hash
                AND emb.model = %s
            WHERE emb.text_hash IS NULL
        """
        if max_errors:
            query += f" LIMIT {max_errors}"

        cur.execute(query, (CONFIG['ollama']['embedding_model'],))
        errors = cur.fetchall()

    if not errors:
        print("✅ All errors already have embeddings!")
        return

    print(f"📊 Found {len(errors)} errors without embeddings")
    print(f"🔥 Starting embedding generation (batch_size={batch_size})...")

    # Process in batches
    total_embedded = 0
    batch_times = []

    for i in range(0, len(errors), batch_size):
        batch = errors[i:i+batch_size]
        batch_start = time.time()

        print(f"\n📦 Batch {i//batch_size + 1}/{(len(errors)-1)//batch_size + 1} ({len(batch)} errors)")

        # Prepare texts for embedding
        texts = []
        for err in batch:
            error_id, source, file_path, line, message, text_hash, tags = err
            # Combine message + context for better embedding
            text = f"{source}: {file_path}:{line} - {message}"
            if tags:
                text += f" [{', '.join(tags)}]"
            texts.append(text)

        # Generate embeddings
        embeddings = embedder.embed_batch(texts)

        # Store in PostgreSQL
        insert_data = []
        for j, (err, emb) in enumerate(zip(batch, embeddings)):
            if emb is not None:
                error_id, source, file_path, line, message, text_hash, tags = err
                insert_data.append((
                    text_hash,
                    CONFIG['ollama']['embedding_model'],
                    emb.tobytes(),
                    datetime.now()
                ))

        if insert_data:
            with pg_conn.cursor() as cur:
                execute_values(
                    cur,
                    """
                    INSERT INTO phase89_embeddings (text_hash, model, embedding, created_at)
                    VALUES %s
                    ON CONFLICT (text_hash, model) DO NOTHING
                    """,
                    insert_data
                )
                pg_conn.commit()

        batch_time = time.time() - batch_start
        batch_times.append(batch_time)
        total_embedded += len(insert_data)

        # Stats
        cache_stats = cache.stats()
        avg_time = np.mean(batch_times)
        eta = avg_time * ((len(errors) - (i + batch_size)) / batch_size)

        print(f"   ✅ Embedded: {len(insert_data)}/{len(batch)}")
        print(f"   ⏱️  Time: {batch_time:.1f}s (avg: {avg_time:.1f}s)")
        print(f"   💾 Cache: {cache_stats['hit_rate']} hit rate")
        print(f"   ⏳ ETA: {eta/60:.1f} min")

    # Final stats
    total_time = time.time() - start_time
    print(f"\n🎉 Embedding generation complete!")
    print(f"   📊 Total: {total_embedded} embeddings")
    print(f"   ⏱️  Time: {total_time/60:.1f} min")
    print(f"   ⚡ Rate: {total_embedded/(total_time/60):.1f} embeddings/min")
    print(f"   💾 Cache: {cache.stats()['hit_rate']} hit rate")

    redis_client.close()
    pg_conn.close()

# =============================================================================
# CLI
# =============================================================================
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate embeddings for Phase 89 errors')
    parser.add_argument('--batch-size', type=int, default=500, help='Batch size for processing')
    parser.add_argument('--max', type=int, help='Max errors to process (for testing)')

    args = parser.parse_args()

    print("=" * 60)
    print("🚀 Phase 89: Embedding Generator")
    print("=" * 60)
    print(f"Model: {CONFIG['ollama']['embedding_model']} (768-dim)")
    print(f"Batch Size: {args.batch_size}")
    if args.max:
        print(f"Max Errors: {args.max}")
    print("=" * 60)
    print()

    generate_embeddings(batch_size=args.batch_size, max_errors=args.max)
