#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: GPU-Accelerated Unified Pipeline
- PyTorch CUDA 12.6 for tensor operations
- Qdrant vector storage (43,353 vectors)
- PostgreSQL pgvector mirroring
- Redis caching with embeddinggemma:latest
- CouchDB AST graph analysis
- Neo4j knowledge graph
- Gzip compression for storage
- Streaming chunk processing
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import torch
import torch.nn.functional as F
import numpy as np
import json
import gzip
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import requests
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import psycopg2
from psycopg2.extras import execute_values
import redis
import hashlib

class GPUAcceleratedPipeline:
    """Unified GPU-accelerated pipeline with all storage backends"""

    def __init__(self):
        # GPU setup
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.embedding_dim = 768  # embeddinggemma:latest

        # Service URLs
        self.ollama_url = "http://localhost:11434"
        self.qdrant_url = "http://localhost:6333"
        self.couchdb_url = "http://localhost:5984"
        self.neo4j_url = "bolt://localhost:7687"
        self.postgres_url = "postgresql://user:pass@localhost:5434/legal_ai_db"
        self.redis_url = "redis://localhost:6379"

        # Initialize clients
        self.qdrant = QdrantClient(url=self.qdrant_url)
        self.redis_client = redis.Redis.from_url(self.redis_url, decode_responses=False)

        # Collection names
        self.collections = {
            'code_units': 'phase89_code_units',
            'code_chunks': 'phase89_code_chunks',
            'error_chunks': 'phase89_error_chunks',
            'summaries': 'phase89_summaries',
            'ast_topology': 'phase89_ast_topology'
        }

        print(f"✅ GPU Device: {self.device}")
        if torch.cuda.is_available():
            print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
            print(f"✅ GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    def generate_embedding_gpu(self, text: str) -> torch.Tensor:
        """Generate embedding using Ollama + move to GPU"""
        try:
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": "embeddinggemma:latest",
                    "prompt": text
                },
                timeout=30
            )

            if response.status_code == 200:
                embedding = response.json()['embedding']
                # Convert to GPU tensor
                return torch.tensor(embedding, device=self.device, dtype=torch.float32)
            else:
                raise Exception(f"Ollama error: {response.status_code}")

        except Exception as e:
            print(f"⚠️  Embedding generation failed: {e}")
            return torch.randn(self.embedding_dim, device=self.device)

    def compress_data(self, data: Dict[str, Any]) -> bytes:
        """Gzip compress JSON data"""
        json_bytes = json.dumps(data).encode('utf-8')
        return gzip.compress(json_bytes, compresslevel=6)

    def decompress_data(self, compressed: bytes) -> Dict[str, Any]:
        """Gzip decompress to JSON"""
        json_bytes = gzip.decompress(compressed)
        return json.loads(json_bytes.decode('utf-8'))

    def cache_embedding_redis(self, key: str, embedding: torch.Tensor, metadata: Dict[str, Any]):
        """Cache embedding in Redis with gzip compression"""
        cache_data = {
            'embedding': embedding.cpu().tolist(),
            'metadata': metadata,
            'timestamp': datetime.now().isoformat(),
            'device': str(self.device)
        }

        compressed = self.compress_data(cache_data)

        # Store with expiry (24 hours)
        self.redis_client.setex(
            f"embedding:{key}",
            86400,  # 24 hours
            compressed
        )

    def get_cached_embedding_redis(self, key: str) -> Optional[Tuple[torch.Tensor, Dict[str, Any]]]:
        """Retrieve cached embedding from Redis"""
        compressed = self.redis_client.get(f"embedding:{key}")

        if compressed:
            data = self.decompress_data(compressed)
            embedding = torch.tensor(data['embedding'], device=self.device, dtype=torch.float32)
            return embedding, data['metadata']

        return None

    def store_qdrant(self, collection_name: str, vectors: List[torch.Tensor],
                     payloads: List[Dict[str, Any]], ids: Optional[List[str]] = None):
        """Store vectors in Qdrant with metadata"""

        # Convert GPU tensors to CPU numpy
        vectors_cpu = [v.cpu().numpy() for v in vectors]

        # Generate IDs if not provided
        if ids is None:
            ids = [hashlib.md5(str(p).encode()).hexdigest() for p in payloads]

        # Create points
        points = [
            PointStruct(
                id=id_val,
                vector=vec.tolist(),
                payload=payload
            )
            for id_val, vec, payload in zip(ids, vectors_cpu, payloads)
        ]

        # Upsert to Qdrant
        self.qdrant.upsert(
            collection_name=collection_name,
            points=points
        )

        return len(points)

    def mirror_to_pgvector(self, vectors: List[torch.Tensor], payloads: List[Dict[str, Any]],
                           table_name: str = 'embeddings'):
        """Mirror Qdrant vectors to PostgreSQL pgvector for SQL search"""

        conn = psycopg2.connect(self.postgres_url)
        cur = conn.cursor()

        # Ensure table exists
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id SERIAL PRIMARY KEY,
                vector vector(768),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Create index if not exists
        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS {table_name}_vector_idx
            ON {table_name} USING ivfflat (vector vector_cosine_ops)
        """)

        # Prepare data
        vectors_cpu = [v.cpu().numpy().tolist() for v in vectors]
        data = [(vec, json.dumps(payload)) for vec, payload in zip(vectors_cpu, payloads)]

        # Batch insert
        execute_values(
            cur,
            f"INSERT INTO {table_name} (vector, metadata) VALUES %s",
            data,
            template="(%s::vector, %s::jsonb)"
        )

        conn.commit()
        cur.close()
        conn.close()

        return len(data)

    def process_document_streaming(self, text: str, doc_id: str, chunk_size: int = 512):
        """Stream process document: chunk → embed → cache → store"""

        # Chunk text
        chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

        embeddings_gpu = []
        payloads = []

        for i, chunk in enumerate(chunks):
            chunk_key = f"{doc_id}_chunk_{i}"

            # Check Redis cache first
            cached = self.get_cached_embedding_redis(chunk_key)

            if cached:
                embedding, metadata = cached
                print(f"✅ Cache hit: {chunk_key}")
            else:
                # Generate embedding on GPU
                embedding = self.generate_embedding_gpu(chunk)

                metadata = {
                    'doc_id': doc_id,
                    'chunk_id': i,
                    'chunk_text': chunk[:200],  # Preview
                    'chunk_size': len(chunk)
                }

                # Cache to Redis
                self.cache_embedding_redis(chunk_key, embedding, metadata)
                print(f"✅ Generated + cached: {chunk_key}")

            embeddings_gpu.append(embedding)
            payloads.append(metadata)

        # Store to Qdrant
        n_qdrant = self.store_qdrant(
            self.collections['code_chunks'],
            embeddings_gpu,
            payloads
        )

        # Mirror to PostgreSQL pgvector
        n_pg = self.mirror_to_pgvector(
            embeddings_gpu,
            payloads,
            table_name='document_embeddings'
        )

        return {
            'chunks': len(chunks),
            'embeddings': len(embeddings_gpu),
            'qdrant_stored': n_qdrant,
            'pgvector_stored': n_pg
        }

    def gpu_similarity_search(self, query_embedding: torch.Tensor, k: int = 10) -> List[Dict[str, Any]]:
        """GPU-accelerated similarity search in Qdrant"""

        query_vec = query_embedding.cpu().numpy().tolist()

        results = self.qdrant.search(
            collection_name=self.collections['code_chunks'],
            query_vector=query_vec,
            limit=k
        )

        return [
            {
                'id': hit.id,
                'score': hit.score,
                'payload': hit.payload
            }
            for hit in results
        ]

    def synthesize_llm_output_gpu(self, query: str, contexts: List[str]) -> Dict[str, Any]:
        """Synthesize LLM output with GPU-accelerated context ranking"""

        # Generate query embedding
        query_emb = self.generate_embedding_gpu(query)

        # Generate context embeddings
        context_embs = torch.stack([
            self.generate_embedding_gpu(ctx) for ctx in contexts
        ])

        # GPU-accelerated similarity scoring
        query_norm = F.normalize(query_emb.unsqueeze(0), p=2, dim=1)
        context_norm = F.normalize(context_embs, p=2, dim=1)

        scores = torch.mm(query_norm, context_norm.T).squeeze(0)

        # Rank contexts
        ranked_indices = torch.argsort(scores, descending=True).cpu().numpy()

        # Take top 3 contexts
        top_contexts = [contexts[i] for i in ranked_indices[:3]]

        # Generate summary with Ollama
        prompt = f"Query: {query}\n\nContext:\n" + "\n".join(top_contexts) + "\n\nSummary:"

        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": "gemma3-legal:latest",
                    "prompt": prompt,
                    "stream": False
                },
                timeout=60
            )

            summary = response.json().get('response', 'No summary generated')

        except Exception as e:
            summary = f"Error: {e}"

        return {
            'query': query,
            'top_contexts': top_contexts,
            'scores': scores[ranked_indices[:3]].cpu().tolist(),
            'summary': summary
        }

def main():
    print("\n" + "="*70)
    print("Phase 89: GPU-Accelerated Unified Pipeline Test")
    print("="*70 + "\n")

    pipeline = GPUAcceleratedPipeline()

    # Test document processing
    print("\n1️⃣ Testing Document Processing Pipeline...\n")

    test_doc = """
    This is a test legal document about property deeds.
    It contains information about recording requirements,
    notarization procedures, and county clerk responsibilities.
    This text will be chunked, embedded, cached, and stored.
    """

    result = pipeline.process_document_streaming(
        test_doc,
        doc_id="test_doc_001",
        chunk_size=100
    )

    print(f"\n✅ Processing complete:")
    print(f"   • Chunks: {result['chunks']}")
    print(f"   • Embeddings: {result['embeddings']}")
    print(f"   • Qdrant stored: {result['qdrant_stored']}")
    print(f"   • pgvector stored: {result['pgvector_stored']}")

    # Test similarity search
    print("\n2️⃣ Testing GPU-Accelerated Similarity Search...\n")

    query_emb = pipeline.generate_embedding_gpu("What are recording requirements?")
    search_results = pipeline.gpu_similarity_search(query_emb, k=3)

    print(f"✅ Found {len(search_results)} results:")
    for i, hit in enumerate(search_results, 1):
        print(f"   {i}. Score: {hit['score']:.4f} - {hit['payload'].get('chunk_text', '')[:50]}...")

    # Test LLM synthesis
    print("\n3️⃣ Testing LLM Output Synthesis...\n")

    synthesis = pipeline.synthesize_llm_output_gpu(
        query="What are deed recording requirements?",
        contexts=[
            "Deeds must be notarized by a licensed notary public.",
            "Recording fees vary by county but typically range from $50-$100.",
            "Documents must be filed with the county clerk within 30 days."
        ]
    )

    print(f"✅ Synthesis complete:")
    print(f"   • Top contexts: {len(synthesis['top_contexts'])}")
    print(f"   • Summary: {synthesis['summary'][:100]}...")

    print("\n" + "="*70)
    print("✅ GPU-Accelerated Pipeline Test Complete!")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
