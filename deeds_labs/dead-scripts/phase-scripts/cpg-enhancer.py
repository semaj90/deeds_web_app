#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enhanced CPG with Embeddings and CALLS Edges
Adds semantic embeddings to all code nodes and detects function call relationships.
"""

import os
import sys
import re
import json
import hashlib
import asyncio
from pathlib import Path
from typing import List, Dict, Set, Optional
import numpy as np
import httpx

# Fix Windows encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

import psycopg2
from psycopg2.extras import execute_values
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

CONFIG = {
    "POSTGRES_DSN": "postgresql://legal_admin:123456@localhost:5434/legal_ai_db",
    "QDRANT_HOST": "localhost",
    "QDRANT_PORT": 6333,
    "OLLAMA_URL": "http://localhost:11434",
    "EMBEDDING_MODEL": "embeddinggemma:latest",
    "EMBEDDING_DIM": 768,
    "BATCH_SIZE": 20,
}


class CPGEnhancer:
    """Enhances CPG with embeddings and CALLS edges"""

    def __init__(self):
        self._embedding_cache: Dict[str, np.ndarray] = {}
        self._init_clients()

    def _init_clients(self):
        try:
            self.pg = psycopg2.connect(CONFIG["POSTGRES_DSN"])
            self.pg.autocommit = True
            print("✅ Connected to PostgreSQL")
        except Exception as e:
            print(f"❌ PostgreSQL: {e}")
            self.pg = None

        try:
            self.qdrant = QdrantClient(host=CONFIG["QDRANT_HOST"], port=CONFIG["QDRANT_PORT"])
            print("✅ Connected to Qdrant")
        except Exception as e:
            print(f"❌ Qdrant: {e}")
            self.qdrant = None

    async def embed_text(self, text: str) -> Optional[np.ndarray]:
        """Generate embedding for text"""
        cache_key = hashlib.md5(text.encode()).hexdigest()

        if cache_key in self._embedding_cache:
            return self._embedding_cache[cache_key]

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{CONFIG['OLLAMA_URL']}/api/embeddings",
                    json={"model": CONFIG["EMBEDDING_MODEL"], "prompt": text[:2000]}
                )

                if response.status_code == 200:
                    data = response.json()
                    emb = np.array(data["embedding"], dtype=np.float32)
                    self._embedding_cache[cache_key] = emb
                    return emb
        except:
            pass

        return None

    async def add_embeddings_to_cpg(self):
        """Add embeddings to CPG nodes"""
        if not self.pg:
            return

        print("\n🧠 Adding embeddings to CPG nodes...")

        cursor = self.pg.cursor()

        # Get nodes without embeddings (functions, classes, interfaces)
        cursor.execute("""
            SELECT id, type, name, qualified_name, file_path
            FROM cpg_nodes
            WHERE type IN ('Function', 'Class', 'Interface', 'Method', 'Component')
            AND embedding IS NULL
            LIMIT 500
        """)

        nodes = cursor.fetchall()
        print(f"   Found {len(nodes)} nodes to embed")

        embedded = 0
        for node_id, node_type, name, qualified_name, file_path in nodes:
            # Create text for embedding
            text = f"{node_type} {name} in {file_path}"

            embedding = await self.embed_text(text)

            if embedding is not None:
                cursor.execute("""
                    UPDATE cpg_nodes
                    SET embedding = %s::vector
                    WHERE id = %s
                """, (embedding.tolist(), node_id))
                embedded += 1

            if embedded % 20 == 0:
                print(f"   Embedded {embedded}/{len(nodes)} nodes", end="\r")

        cursor.close()
        print(f"\n   ✅ Embedded {embedded} nodes")

    def detect_calls_edges(self, root_dir: str = "src"):
        """Detect function calls and create CALLS edges"""
        if not self.pg:
            return

        print(f"\n📊 Detecting CALLS edges in {root_dir}...")

        cursor = self.pg.cursor()

        # Get all function nodes
        cursor.execute("""
            SELECT id, name, file_path
            FROM cpg_nodes
            WHERE type IN ('Function', 'Method')
        """)

        functions = {row[1]: (row[0], row[2]) for row in cursor.fetchall()}
        print(f"   Found {len(functions)} functions to analyze")

        # Pattern to find function calls
        call_pattern = re.compile(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(')

        calls_found = 0
        edges_created = 0

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', '.svelte-kit']]

            for file in files:
                if file.endswith(('.ts', '.js', '.svelte')):
                    file_path = os.path.join(root, file)

                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    except:
                        continue

                    # Find all function calls
                    for match in call_pattern.finditer(content):
                        called_name = match.group(1)

                        if called_name in functions:
                            target_id, target_file = functions[called_name]

                            # Find the source function (simplification: use file as source)
                            rel_path = os.path.relpath(file_path)
                            cursor.execute("""
                                SELECT id FROM cpg_nodes
                                WHERE file_path = %s AND type = 'File'
                                LIMIT 1
                            """, (rel_path,))

                            source_row = cursor.fetchone()
                            if source_row:
                                source_id = source_row[0]
                                edge_id = hashlib.md5(f"{source_id}->{target_id}".encode()).hexdigest()[:16]

                                # Insert edge
                                try:
                                    cursor.execute("""
                                        INSERT INTO cpg_edges (id, type, source_id, target_id, properties)
                                        VALUES (%s, 'CALLS', %s, %s, '{}')
                                        ON CONFLICT (id) DO NOTHING
                                    """, (edge_id, source_id, target_id))
                                    edges_created += 1
                                except:
                                    pass

                            calls_found += 1

        cursor.close()
        print(f"   ✅ Found {calls_found} function calls, created {edges_created} CALLS edges")

    def store_embeddings_qdrant(self):
        """Store node embeddings in Qdrant"""
        if not self.pg or not self.qdrant:
            return

        print("\n📦 Syncing embeddings to Qdrant...")

        collection = "cpg_code_embeddings"

        try:
            if not self.qdrant.collection_exists(collection):
                self.qdrant.create_collection(
                    collection_name=collection,
                    vectors_config=VectorParams(size=CONFIG["EMBEDDING_DIM"], distance=Distance.COSINE)
                )
        except:
            pass

        cursor = self.pg.cursor()
        cursor.execute("""
            SELECT id, type, name, qualified_name, file_path, embedding
            FROM cpg_nodes
            WHERE embedding IS NOT NULL
        """)

        points = []
        for row in cursor.fetchall():
            node_id, node_type, name, qualified_name, file_path, embedding = row

            if embedding is not None:
                points.append(PointStruct(
                    id=abs(hash(node_id)) % (2**63),
                    vector=embedding,
                    payload={
                        "node_id": node_id,
                        "type": node_type,
                        "name": name,
                        "qualified_name": qualified_name,
                        "file_path": file_path
                    }
                ))

        cursor.close()

        if points:
            # Batch upsert
            batch_size = 100
            for i in range(0, len(points), batch_size):
                batch = points[i:i+batch_size]
                self.qdrant.upsert(collection_name=collection, points=batch)

            print(f"   ✅ Stored {len(points)} embeddings in Qdrant")

    def get_stats(self):
        """Get CPG statistics"""
        if not self.pg:
            return

        cursor = self.pg.cursor()

        print("\n📊 CPG Statistics:")

        # Node counts by type
        cursor.execute("""
            SELECT type, COUNT(*)
            FROM cpg_nodes
            GROUP BY type
            ORDER BY COUNT(*) DESC
        """)
        print("\n   Node Types:")
        for row in cursor.fetchall():
            print(f"      {row[0]}: {row[1]}")

        # Edge counts by type
        cursor.execute("""
            SELECT type, COUNT(*)
            FROM cpg_edges
            GROUP BY type
            ORDER BY COUNT(*) DESC
        """)
        print("\n   Edge Types:")
        for row in cursor.fetchall():
            print(f"      {row[0]}: {row[1]}")

        # Nodes with embeddings
        cursor.execute("""
            SELECT COUNT(*) FROM cpg_nodes WHERE embedding IS NOT NULL
        """)
        print(f"\n   Nodes with embeddings: {cursor.fetchone()[0]}")

        cursor.close()

    async def run_enhancement(self, root_dir: str = "src"):
        """Run full CPG enhancement pipeline"""
        print("=" * 60)
        print("🔧 CPG Enhancement Pipeline")
        print("=" * 60)

        # Step 1: Detect CALLS edges
        self.detect_calls_edges(root_dir)

        # Step 2: Add embeddings
        await self.add_embeddings_to_cpg()

        # Step 3: Sync to Qdrant
        self.store_embeddings_qdrant()

        # Step 4: Show stats
        self.get_stats()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Enhance CPG with embeddings and CALLS edges")
    parser.add_argument("root_dir", nargs="?", default="src", help="Root directory")
    args = parser.parse_args()

    enhancer = CPGEnhancer()
    asyncio.run(enhancer.run_enhancement(args.root_dir))


if __name__ == "__main__":
    main()
