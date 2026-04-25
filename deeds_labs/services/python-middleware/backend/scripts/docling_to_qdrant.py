#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DocLing → Qdrant Integration Pipeline
Processes documents with IBM DocLing (258MB) and stores embeddings in Qdrant

Flow:
  1. Load document with DocLing (layout, tables, text extraction)
  2. Chunk text with layout metadata
  3. Generate embeddings with embeddinggemma:latest (768d)
  4. Cache in Redis (gzip compression, 24h TTL)
  5. Store in Qdrant (phase89_docling_chunks collection)
  6. Mirror to PostgreSQL pgvector
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import argparse
import json
import time
from pathlib import Path
from typing import List, Dict, Any
import requests
import torch
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import psycopg2
import redis
import gzip
import hashlib

# Add granite-docling-worker to path
GRANITE_WORKER_PATH = Path(__file__).parent.parent.parent / "granite-docling-worker"
PYTHON_CODEBASE_PATH = Path(__file__).parent.parent.parent / "python_codebase"
sys.path.insert(0, str(GRANITE_WORKER_PATH))
sys.path.insert(0, str(PYTHON_CODEBASE_PATH))

try:
    from document_processing.granite_docling_parser import GraniteDoclingParser
    DOCLING_AVAILABLE = True
    print("✅ GraniteDoclingParser available")
except ImportError as e:
    print(f"⚠️  Warning: granite-docling-parser not available: {e}")
    DOCLING_AVAILABLE = False

class DoclingQdrantPipeline:
    """Integrate DocLing document processing with Qdrant embeddings"""

    def __init__(self):
        # Service URLs
        self.ollama_url = "http://localhost:11434"
        self.qdrant_url = "http://localhost:6333"
        self.postgres_url = "postgresql://user:pass@localhost:5434/legal_ai_db"
        self.redis_url = "redis://localhost:6379"

        # GPU setup
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # Clients
        self.qdrant = QdrantClient(url=self.qdrant_url)
        self.redis_client = redis.Redis.from_url(self.redis_url, decode_responses=False)

        # Collections
        self.collection_name = "phase89_docling_chunks"

        # DocLing processors
        if DOCLING_AVAILABLE:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.processor = GraniteDoclingParser(device=device)
            print(f"✅ Using GraniteDoclingParser on {device}")
        else:
            self.processor = None

        print(f"✅ GPU Device: {self.device}")
        if torch.cuda.is_available():
            print(f"✅ GPU: {torch.cuda.get_device_name(0)}")

    def ensure_collection(self):
        """Create Qdrant collection if it doesn't exist"""
        try:
            self.qdrant.get_collection(self.collection_name)
            print(f"✅ Collection '{self.collection_name}' exists")
        except:
            print(f"📦 Creating collection '{self.collection_name}'...")
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=768,  # embeddinggemma:latest
                    distance=Distance.COSINE
                )
            )
            print(f"✅ Created 768d collection")

    def process_document(self, pdf_path: str, doc_id: str = None) -> Dict[str, Any]:
        """Process document with GraniteDoclingParser"""
        if not self.processor:
            raise RuntimeError("DocLing processor not available")

        if not doc_id:
            doc_id = Path(pdf_path).stem

        print(f"\n📄 Processing: {pdf_path}")
        print(f"   Doc ID: {doc_id}")

        # Convert PDF to images and process each page
        import fitz  # PyMuPDF
        from PIL import Image
        import tempfile
        import os

        start_time = time.time()

        pages = []
        tables = []

        pdf_doc = fitz.open(pdf_path)
        total_pages = len(pdf_doc)
        print(f"   Total pages: {total_pages}")

        for page_num in range(total_pages):
            print(f"   Processing page {page_num + 1}/{total_pages}...")

            # Render page to image
            page = pdf_doc[page_num]
            pix = page.get_pixmap(dpi=150)

            # Save to temp file - close file first, then save with PyMuPDF
            temp_path = tempfile.mktemp(suffix='.png')
            pix.save(temp_path)

            try:
                # Process with GraniteDoclingParser
                result = self.processor.parse_document(temp_path)

                if result.get('success'):
                    text = result.get('text', '')
                    doc_tags = result.get('doc_tags', {})

                    pages.append({
                        'page_num': page_num + 1,
                        'text': text,
                        'layout_type': doc_tags.get('layout_type', 'text'),
                        'bbox': [0, 0, pix.width, pix.height],
                        'confidence': result.get('metadata', {}).get('confidence', 0.9)
                    })

                    # Extract tables from doc_tags if present
                    if 'tables' in doc_tags:
                        tables.extend(doc_tags['tables'])
                else:
                    print(f"   ⚠️ Page {page_num + 1} failed: {result.get('error', 'unknown')}")

            finally:
                try:
                    os.unlink(temp_path)
                except:
                    pass  # Ignore cleanup errors

        pdf_doc.close()
        elapsed = time.time() - start_time

        print(f"✅ DocLing processing: {elapsed:.2f}s")
        print(f"   Pages processed: {len(pages)}")
        print(f"   Tables found: {len(tables)}")

        return {
            "doc_id": doc_id,
            "result": {"pages": pages, "tables": tables},
            "processing_time": elapsed
        }

    def extract_chunks(self, docling_result: Dict, doc_id: str, chunk_size: int = 512) -> List[Dict]:
        """Extract text chunks with layout metadata from DocLing output"""
        chunks = []
        chunk_id = 0

        pages = docling_result.get('pages', [])

        for page_num, page in enumerate(pages, 1):
            # Extract text content
            text_content = page.get('text', '')
            layout_type = page.get('layout_type', 'unknown')
            bbox = page.get('bbox', [0, 0, 0, 0])
            confidence = page.get('confidence', 0.0)

            # Chunk the text
            for i in range(0, len(text_content), chunk_size):
                chunk_text = text_content[i:i + chunk_size].strip()
                if not chunk_text:
                    continue

                chunks.append({
                    "chunk_id": f"{doc_id}_chunk_{chunk_id}",
                    "text": chunk_text,
                    "doc_id": doc_id,
                    "page": page_num,
                    "chunk_index": chunk_id,
                    "layout_type": layout_type,
                    "bbox": bbox,
                    "confidence": confidence,
                    "char_start": i,
                    "char_end": min(i + chunk_size, len(text_content))
                })
                chunk_id += 1

        # Extract table content
        for table in docling_result.get('tables', []):
            table_text = json.dumps(table.get('data', []))
            page_num = table.get('page', 0)

            chunks.append({
                "chunk_id": f"{doc_id}_table_{chunk_id}",
                "text": table_text,
                "doc_id": doc_id,
                "page": page_num,
                "chunk_index": chunk_id,
                "layout_type": "table",
                "bbox": table.get('bbox', [0, 0, 0, 0]),
                "confidence": table.get('confidence', 0.0),
                "char_start": 0,
                "char_end": len(table_text)
            })
            chunk_id += 1

        print(f"📦 Extracted {len(chunks)} chunks")
        return chunks

    def generate_embedding(self, text: str) -> torch.Tensor:
        """Generate embedding using Ollama embeddinggemma"""
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
                return torch.tensor(embedding, device=self.device, dtype=torch.float32)
            else:
                raise RuntimeError(f"Ollama error: {response.status_code}")

        except Exception as e:
            print(f"❌ Embedding error: {e}")
            # Return zero vector as fallback
            return torch.zeros(768, device=self.device, dtype=torch.float32)

    def cache_embedding_redis(self, key: str, embedding: torch.Tensor, metadata: Dict):
        """Cache embedding in Redis with gzip compression"""
        try:
            data = {
                "embedding": embedding.cpu().numpy().tolist(),
                "metadata": metadata
            }

            # Compress with gzip
            json_data = json.dumps(data).encode('utf-8')
            compressed = gzip.compress(json_data, compresslevel=6)

            # Store with 24h TTL
            self.redis_client.setex(
                f"docling:{key}",
                24 * 3600,  # 24 hours
                compressed
            )

        except Exception as e:
            print(f"⚠️  Redis cache error: {e}")

    def get_cached_embedding(self, key: str):
        """Get cached embedding from Redis"""
        try:
            compressed = self.redis_client.get(f"docling:{key}")
            if compressed:
                json_data = gzip.decompress(compressed).decode('utf-8')
                data = json.loads(json_data)

                embedding = torch.tensor(data['embedding'], device=self.device, dtype=torch.float32)
                metadata = data['metadata']

                return embedding, metadata

        except Exception as e:
            print(f"⚠️  Redis get error: {e}")

        return None, None

    def process_chunks(self, chunks: List[Dict]) -> Dict[str, Any]:
        """Process chunks: embed → cache → store in Qdrant + PostgreSQL"""
        embeddings = []
        payloads = []

        cached_count = 0
        generated_count = 0

        print(f"\n🔄 Processing {len(chunks)} chunks...")

        for i, chunk in enumerate(chunks):
            chunk_id = chunk['chunk_id']

            # Check cache
            cached_emb, cached_meta = self.get_cached_embedding(chunk_id)

            if cached_emb is not None:
                embedding = cached_emb
                cached_count += 1
            else:
                # Generate new embedding
                embedding = self.generate_embedding(chunk['text'])
                self.cache_embedding_redis(chunk_id, embedding, chunk)
                generated_count += 1

            embeddings.append(embedding)
            payloads.append(chunk)

            if (i + 1) % 10 == 0:
                print(f"   {i + 1}/{len(chunks)} chunks processed...")

        print(f"✅ Embeddings: {cached_count} cached, {generated_count} generated")

        # Store to Qdrant
        qdrant_count = self.store_qdrant(embeddings, payloads)

        # Mirror to PostgreSQL
        pg_count = self.mirror_to_pgvector(embeddings, payloads)

        return {
            "total_chunks": len(chunks),
            "cached": cached_count,
            "generated": generated_count,
            "qdrant_stored": qdrant_count,
            "pgvector_stored": pg_count
        }

    def store_qdrant(self, embeddings: List[torch.Tensor], payloads: List[Dict]) -> int:
        """Batch store embeddings to Qdrant"""
        try:
            points = []
            for i, (embedding, payload) in enumerate(zip(embeddings, payloads)):
                point = PointStruct(
                    id=int(hashlib.md5(payload['chunk_id'].encode()).hexdigest()[:16], 16) % (10 ** 15),
                    vector=embedding.cpu().numpy().tolist(),
                    payload=payload
                )
                points.append(point)

            self.qdrant.upsert(
                collection_name=self.collection_name,
                points=points
            )

            print(f"✅ Qdrant: {len(points)} vectors stored")
            return len(points)

        except Exception as e:
            print(f"❌ Qdrant error: {e}")
            return 0

    def mirror_to_pgvector(self, embeddings: List[torch.Tensor], payloads: List[Dict]) -> int:
        """Mirror embeddings to PostgreSQL pgvector"""
        try:
            conn = psycopg2.connect(self.postgres_url)
            cur = conn.cursor()

            # Create table if not exists
            cur.execute("""
                CREATE TABLE IF NOT EXISTS docling_embeddings (
                    id SERIAL PRIMARY KEY,
                    chunk_id TEXT UNIQUE,
                    vector vector(768),
                    doc_id TEXT,
                    page INTEGER,
                    layout_type TEXT,
                    confidence FLOAT,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Insert vectors
            for embedding, payload in zip(embeddings, payloads):
                vector_str = '[' + ','.join(map(str, embedding.cpu().numpy().tolist())) + ']'

                cur.execute("""
                    INSERT INTO docling_embeddings
                    (chunk_id, vector, doc_id, page, layout_type, confidence, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (chunk_id) DO UPDATE SET
                        vector = EXCLUDED.vector,
                        metadata = EXCLUDED.metadata
                """, (
                    payload['chunk_id'],
                    vector_str,
                    payload['doc_id'],
                    payload['page'],
                    payload['layout_type'],
                    payload['confidence'],
                    json.dumps(payload)
                ))

            conn.commit()
            cur.close()
            conn.close()

            print(f"✅ PostgreSQL: {len(embeddings)} vectors mirrored")
            return len(embeddings)

        except Exception as e:
            print(f"❌ PostgreSQL error: {e}")
            return 0

def main():
    parser = argparse.ArgumentParser(description="DocLing → Qdrant Integration")
    parser.add_argument("--input", "-i", required=True, help="Input PDF path")
    parser.add_argument("--doc-id", help="Document ID (auto-generated if omitted)")
    parser.add_argument("--chunk-size", type=int, default=512, help="Chunk size (default: 512)")

    args = parser.parse_args()

    print("=" * 70)
    print("DocLing → Qdrant Integration Pipeline")
    print("=" * 70)

    pipeline = DoclingQdrantPipeline()

    # Ensure collection exists
    pipeline.ensure_collection()

    # Process document with DocLing
    doc_result = pipeline.process_document(args.input, args.doc_id)

    # Extract chunks
    chunks = pipeline.extract_chunks(
        doc_result['result'],
        doc_result['doc_id'],
        chunk_size=args.chunk_size
    )

    # Process chunks (embed → cache → store)
    result = pipeline.process_chunks(chunks)

    print("\n" + "=" * 70)
    print("✅ Pipeline Complete!")
    print("=" * 70)
    print(f"\n📊 Results:")
    print(f"   Total chunks: {result['total_chunks']}")
    print(f"   Cached: {result['cached']}")
    print(f"   Generated: {result['generated']}")
    print(f"   Qdrant stored: {result['qdrant_stored']}")
    print(f"   PostgreSQL mirrored: {result['pgvector_stored']}")
    print(f"\n🔍 Query collection:")
    print(f"   curl http://localhost:6333/collections/phase89_docling_chunks")

if __name__ == "__main__":
    main()
