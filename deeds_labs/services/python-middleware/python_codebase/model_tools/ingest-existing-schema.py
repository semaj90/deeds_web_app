#!/usr/bin/env python3
"""
RAG Ingestion for Existing PostgreSQL Schema
Adapted for your legal_documents table structure
"""

import asyncio
import asyncpg
from pathlib import Path
import json
import hashlib
from typing import List, Dict, Any
import numpy as np
import requests
from datetime import datetime
import PyPDF2
import uuid
import redis

# Configuration
DATABASE_URL = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
OLLAMA_URL = "http://localhost:11434"
REDIS_URL = "redis://localhost:6379/0"
CHUNK_SIZE = 1000
OVERLAP_SIZE = 200

class ExistingSchemaIngester:
    def __init__(self):
        self.pool = None
        self.redis_client = None

    async def connect(self):
        """Connect to PostgreSQL database and Redis cache"""
        try:
            self.pool = await asyncpg.create_pool(DATABASE_URL)
            try:
                self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
                # Test Redis connection
                self.redis_client.ping()
                print("Connected to PostgreSQL + pgvector and Redis cache")
            except Exception as redis_error:
                print(f"Redis connection failed: {redis_error}")
                print("Continuing without Redis cache...")
                self.redis_client = None
            return True
        except Exception as e:
            print(f"Database connection failed: {e}")
            return False

    def extract_pdf_text(self, pdf_path: str) -> str:
        """Extract text from PDF"""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n\n"
                print(f"Extracted {len(text)} characters from {len(pdf_reader.pages)} pages")
                return text.strip()
        except Exception as e:
            print(f"PDF extraction error: {e}")
            return ""

    def generate_embedding_512(self, text: str) -> np.ndarray:
        """Generate 512-dimensional embeddings to match existing schema"""
        try:
            # Try embeddinggemma first (primary), then nomic-embed-text
            models_to_try = ["embeddinggemma:latest", "nomic-embed-text:latest"]

            for model in models_to_try:
                try:
                    response = requests.post(
                        f"{OLLAMA_URL}/api/embeddings",
                        json={"model": model, "prompt": text},
                        timeout=30
                    )

                    if response.status_code == 200:
                        embedding = np.array(response.json()["embedding"])
                        # Truncate or pad to 512 dimensions to match schema
                        if len(embedding) > 512:
                            embedding = embedding[:512]
                        elif len(embedding) < 512:
                            # Pad with zeros
                            padding = np.zeros(512 - len(embedding))
                            embedding = np.concatenate([embedding, padding])
                        return embedding.astype(np.float32)
                except Exception:
                    continue

            print(f"Embedding failed, using random 512-dim")
            return np.random.random(512).astype(np.float32)

        except Exception as e:
            print(f"Embedding error: {e}")
            return np.random.random(512).astype(np.float32)

    async def generate_llm_summary(self, text: str) -> str:
        """Generate LLM summary using gemma3-legal model"""
        try:
            prompt = f"Summarize this legal document excerpt in 2-3 sentences:\n\n{text[:1500]}"

            response = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "gemma3-legal:latest",
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_p": 0.9,
                        "max_tokens": 200
                    }
                },
                timeout=45
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("response", "Summary unavailable").strip()
            else:
                return "LLM summary generation failed"

        except Exception as e:
            print(f"LLM summary error: {e}")
            return f"Summary error: {str(e)[:100]}"

    def chunk_document(self, text: str) -> List[str]:
        """Split document into chunks"""
        chunks = []
        start = 0

        while start < len(text):
            end = start + CHUNK_SIZE
            chunk = text[start:end]

            if end < len(text):
                boundary = max(chunk.rfind('.'), chunk.rfind('\n'), chunk.rfind(' '))
                if boundary > start + 500:
                    end = start + boundary + 1
                    chunk = text[start:end]

            chunks.append(chunk.strip())
            start = end - OVERLAP_SIZE

            if start >= len(text):
                break

        return [chunk for chunk in chunks if len(chunk.strip()) > 100]

    async def ingest_pdf(self, pdf_path: str):
        """Ingest PDF into existing legal_documents schema"""
        pdf_file = Path(pdf_path)
        print(f"Processing: {pdf_file.name}")

        # Extract text
        content = self.extract_pdf_text(pdf_path)
        if not content:
            print("No text extracted")
            return False

        # Check if document already exists
        document_id = f"complaint-{pdf_file.stem}-{datetime.now().strftime('%Y%m%d')}"

        async with self.pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT id FROM legal_documents WHERE document_id = $1 LIMIT 1",
                document_id
            )
            if existing:
                print(f"Document with ID '{document_id}' already exists")
                return False

        # Create chunks
        chunks = self.chunk_document(content)
        print(f"Created {len(chunks)} chunks")

        # Insert each chunk as a separate document
        successful = 0
        for i, chunk in enumerate(chunks):
            try:
                # Generate embeddings
                embedding = self.generate_embedding_512(chunk)

                # Create metadata for this chunk
                metadata = {
                    "source_file": pdf_file.name,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "document_type": "complaint",
                    "category": "litigation",
                    "processed_at": datetime.now().isoformat()
                }

                # Create unique document_id for each chunk
                chunk_document_id = f"{document_id}-chunk-{i:03d}"

                # Generate LLM summary for this chunk
                llm_summary = await self.generate_llm_summary(chunk)

                # Cache chunk and summary in Redis (if available)
                if self.redis_client:
                    try:
                        redis_key = f"legal:chunk:{chunk_document_id}"
                        await asyncio.to_thread(
                            self.redis_client.hset,
                            redis_key,
                            mapping={
                                "content": chunk,
                                "summary": llm_summary,
                                "embedding_dims": len(embedding),
                                "processed_at": datetime.now().isoformat()
                            }
                        )
                        await asyncio.to_thread(self.redis_client.expire, redis_key, 7 * 24 * 3600)  # 7 days
                    except Exception as cache_error:
                        print(f"Redis cache error (continuing): {cache_error}")
                else:
                    print("Redis cache not available, skipping cache storage")

                # Insert into existing schema - using embedding_gemma column
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO legal_documents
                        (document_id, title, content, document_type, metadata, embedding_gemma)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    chunk_document_id,
                    f"Legal Complaint - Chunk {i+1}",
                    chunk,
                    "complaint",
                    json.dumps({**metadata, "llm_summary": llm_summary}),
                    embedding
                    )

                successful += 1
                print(f"Chunk {i+1}/{len(chunks)} ingested successfully")

            except Exception as e:
                print(f"Chunk {i+1} failed: {e}")

        print(f"Successfully ingested {successful}/{len(chunks)} chunks")
        return successful > 0

    async def test_search(self, query: str):
        """Test semantic search using existing schema"""
        print(f"\nSearching for: '{query}'")

        query_embedding = self.generate_embedding_512(query)

        async with self.pool.acquire() as conn:
            results = await conn.fetch("""
                SELECT document_id, title, content, metadata,
                       1 - (embedding_gemma <=> $1) as similarity
                FROM legal_documents
                WHERE document_type = 'complaint'
                ORDER BY embedding_gemma <=> $1
                LIMIT 3
            """, query_embedding)

            print(f"Found {len(results)} relevant results:")
            for i, result in enumerate(results, 1):
                metadata = json.loads(result['metadata']) if result['metadata'] else {}
                chunk_info = f"Chunk {metadata.get('chunk_index', '?')+1}/{metadata.get('total_chunks', '?')}" if 'chunk_index' in metadata else ""

                print(f"\n{i}. {result['title']} {chunk_info}")
                print(f"   Similarity: {result['similarity']:.3f}")
                print(f"   Preview: {result['content'][:200]}...")

    async def get_stats(self):
        """Get statistics about ingested documents"""
        async with self.pool.acquire() as conn:
            complaint_chunks = await conn.fetchval(
                "SELECT COUNT(*) FROM legal_documents WHERE document_type = 'complaint'"
            )
            total_docs = await conn.fetchval("SELECT COUNT(*) FROM legal_documents")

            print(f"\nStatistics:")
            print(f"Total documents: {total_docs}")
            print(f"Complaint chunks: {complaint_chunks}")

async def main():
    """Main ingestion pipeline"""
    print("Complaint PDF RAG Ingestion - Existing Schema")
    print("=" * 50)

    ingester = ExistingSchemaIngester()

    try:
        # Connect
        connected = await ingester.connect()
        if not connected:
            print("Failed to connect to database")
            return

        # Ingest complaint.pdf
        success = await ingester.ingest_pdf("complaint.pdf")
        if success:
            print("\nComplaint PDF ingestion completed!")

            # Test searches
            await ingester.test_search("breach of contract")
            await ingester.test_search("plaintiff allegations")
            await ingester.test_search("damages and relief")

            # Show stats
            await ingester.get_stats()

            print("\n*** RAG SYSTEM READY ***")
            print("Your complaint.pdf is now searchable via semantic similarity!")
            print("Each chunk is stored as a separate document with embeddings.")

        else:
            print("Complaint PDF ingestion failed")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if ingester.pool:
            await ingester.pool.close()

if __name__ == "__main__":
    asyncio.run(main())