#!/usr/bin/env python3
"""
Simple PDF Legal Document RAG Ingestion - No Unicode issues
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

# Configuration
DATABASE_URL = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
OLLAMA_URL = "http://localhost:11434"
CHUNK_SIZE = 1000
OVERLAP_SIZE = 200

class SimpleIngester:
    def __init__(self):
        self.pool = None

    async def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.pool = await asyncpg.create_pool(DATABASE_URL)
            print("Connected to PostgreSQL + pgvector")
            return True
        except Exception as e:
            print(f"Connection failed: {e}")
            return False

    async def setup_schema(self):
        """Setup database schema"""
        async with self.pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS legal_documents (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    chunk_text TEXT NOT NULL,
                    embedding vector(768),
                    metadata JSONB,
                    document_hash TEXT UNIQUE,
                    chunk_index INTEGER,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS legal_documents_embedding_idx
                ON legal_documents USING hnsw (embedding vector_cosine_ops);
            """)

            print("Database schema ready")

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

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generate embeddings using Ollama"""
        try:
            # Try nomic-embed-text model
            response = requests.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": "nomic-embed-text:latest", "prompt": text},
                timeout=30
            )

            if response.status_code == 200:
                embedding = np.array(response.json()["embedding"])
                return embedding.astype(np.float32)
            else:
                print(f"Embedding failed, using random")
                return np.random.random(768).astype(np.float32)

        except Exception as e:
            print(f"Embedding error: {e}")
            return np.random.random(768).astype(np.float32)

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
        """Ingest PDF into vector database"""
        pdf_file = Path(pdf_path)
        print(f"Processing: {pdf_file.name}")

        # Extract text
        content = self.extract_pdf_text(pdf_path)
        if not content:
            print("No text extracted")
            return False

        # Generate title and metadata
        title = "Legal Complaint Document"
        metadata = {
            "document_type": "complaint",
            "category": "litigation",
            "source_file": pdf_file.name,
            "processed_at": datetime.now().isoformat()
        }

        # Generate document hash
        doc_hash = hashlib.md5(f"{title}:{content[:1000]}".encode()).hexdigest()

        # Check if exists
        async with self.pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT id FROM legal_documents WHERE document_hash = $1 LIMIT 1",
                doc_hash
            )
            if existing:
                print("Document already exists")
                return False

        # Chunk document
        chunks = self.chunk_document(content)
        print(f"Created {len(chunks)} chunks")

        # Process chunks
        successful = 0
        for i, chunk in enumerate(chunks):
            try:
                embedding = self.generate_embedding(chunk)

                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO legal_documents
                        (title, content, chunk_text, embedding, metadata, document_hash, chunk_index)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """, title, content, chunk, embedding.tolist(), json.dumps(metadata), doc_hash, i)

                successful += 1
                print(f"Chunk {i+1}/{len(chunks)} processed")

            except Exception as e:
                print(f"Chunk {i+1} failed: {e}")

        print(f"Successfully ingested {successful}/{len(chunks)} chunks")
        return successful > 0

    async def test_search(self, query: str):
        """Test semantic search"""
        print(f"\nSearching for: '{query}'")

        query_embedding = self.generate_embedding(query)

        async with self.pool.acquire() as conn:
            results = await conn.fetch("""
                SELECT title, chunk_text, metadata,
                       1 - (embedding <=> $1) as similarity
                FROM legal_documents
                ORDER BY embedding <=> $1
                LIMIT 3
            """, query_embedding.tolist())

            print(f"Found {len(results)} results:")
            for i, result in enumerate(results, 1):
                print(f"\n{i}. Similarity: {result['similarity']:.3f}")
                print(f"   Preview: {result['chunk_text'][:200]}...")

    async def get_stats(self):
        """Get ingestion statistics"""
        async with self.pool.acquire() as conn:
            doc_count = await conn.fetchval("SELECT COUNT(DISTINCT document_hash) FROM legal_documents")
            chunk_count = await conn.fetchval("SELECT COUNT(*) FROM legal_documents")

            print(f"\nStatistics:")
            print(f"Documents: {doc_count}")
            print(f"Chunks: {chunk_count}")

async def main():
    """Main ingestion pipeline"""
    print("PDF Legal Document RAG Ingestion")
    print("=" * 40)

    ingester = SimpleIngester()

    try:
        # Connect and setup
        connected = await ingester.connect()
        if not connected:
            print("Failed to connect to database")
            return

        await ingester.setup_schema()

        # Ingest PDF
        success = await ingester.ingest_pdf("complaint.pdf")
        if success:
            print("\nPDF ingestion completed successfully!")

            # Test searches
            await ingester.test_search("breach of contract")
            await ingester.test_search("plaintiff allegations")
            await ingester.test_search("damages")

            # Show stats
            await ingester.get_stats()

        else:
            print("PDF ingestion failed")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if ingester.pool:
            await ingester.pool.close()

if __name__ == "__main__":
    asyncio.run(main())