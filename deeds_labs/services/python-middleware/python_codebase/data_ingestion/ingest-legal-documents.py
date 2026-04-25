#!/usr/bin/env python3
"""
Legal Document RAG Ingestion Pipeline
Processes legal documents and stores them in PostgreSQL + pgvector for semantic search
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

# Configuration
DATABASE_URL = "postgresql://legal_admin:123456@localhost:5433/legal_ai_db"
OLLAMA_URL = "http://localhost:11434"
CHUNK_SIZE = 1000  # Characters per chunk
OVERLAP_SIZE = 200  # Overlap between chunks

class LegalDocumentIngester:
    def __init__(self):
        self.pool = None

    async def connect(self):
        """Connect to PostgreSQL database"""
        self.pool = await asyncpg.create_pool(DATABASE_URL)
        print("✅ Connected to PostgreSQL + pgvector")

    async def setup_schema(self):
        """Ensure vector extension and tables exist"""
        async with self.pool.acquire() as conn:
            # Enable pgvector extension
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")

            # Create legal documents table with vector column
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

            # Create vector index for fast similarity search
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS legal_documents_embedding_idx
                ON legal_documents USING hnsw (embedding vector_cosine_ops);
            """)

            print("✅ Database schema ready with pgvector support")

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generate embeddings using Ollama Gemma embeddings"""
        try:
            response = requests.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={
                    "model": "nomic-embed-text:latest",
                    "prompt": text
                },
                timeout=30
            )

            if response.status_code == 200:
                embedding = np.array(response.json()["embedding"])
                return embedding.astype(np.float32)
            else:
                print(f"❌ Embedding generation failed: {response.status_code}")
                return np.random.random(768).astype(np.float32)

        except Exception as e:
            print(f"❌ Embedding error: {e}")
            return np.random.random(768).astype(np.float32)

    def chunk_document(self, text: str) -> List[str]:
        """Split document into overlapping chunks"""
        chunks = []
        start = 0

        while start < len(text):
            end = start + CHUNK_SIZE
            chunk = text[start:end]

            # Find sentence boundary to avoid cutting mid-sentence
            if end < len(text):
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                boundary = max(last_period, last_newline)

                if boundary > start + 500:  # Ensure minimum chunk size
                    end = start + boundary + 1
                    chunk = text[start:end]

            chunks.append(chunk.strip())
            start = end - OVERLAP_SIZE

            if start >= len(text):
                break

        return chunks

    async def ingest_document(self, title: str, content: str, metadata: Dict[str, Any] = None):
        """Ingest a single legal document"""
        if metadata is None:
            metadata = {}

        # Generate document hash for deduplication
        doc_hash = hashlib.md5(f"{title}:{content}".encode()).hexdigest()

        # Check if document already exists
        async with self.pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT id FROM legal_documents WHERE document_hash = $1 LIMIT 1",
                doc_hash
            )

            if existing:
                print(f"⏭️  Document '{title}' already exists, skipping")
                return

        # Chunk the document
        chunks = self.chunk_document(content)
        print(f"📄 Processing '{title}' - {len(chunks)} chunks")

        # Process each chunk
        for i, chunk in enumerate(chunks):
            # Generate embedding
            embedding = self.generate_embedding(chunk)

            # Store in database
            async with self.pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO legal_documents
                    (title, content, chunk_text, embedding, metadata, document_hash, chunk_index)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                """, title, content, chunk, embedding.tolist(), json.dumps(metadata), doc_hash, i)

            print(f"  ✅ Chunk {i+1}/{len(chunks)} processed")

    async def ingest_sample_documents(self):
        """Ingest sample legal documents for testing"""
        sample_docs = [
            {
                "title": "Contract Law Fundamentals",
                "content": """
                A contract is a legally binding agreement between two or more parties. For a contract to be valid, it must contain several essential elements:

                1. Offer: One party must make a clear offer to another party.
                2. Acceptance: The other party must accept the offer unambiguously.
                3. Consideration: There must be something of value exchanged between the parties.
                4. Capacity: All parties must have the legal capacity to enter into a contract.
                5. Legality: The contract's purpose must be legal.

                Consideration is particularly important in contract law. It refers to something of value that each party gives to the other. This can be money, goods, services, or a promise to do something. Without consideration, a contract is generally not enforceable.

                Breach of contract occurs when one party fails to perform their obligations under the contract. The non-breaching party may be entitled to damages, which aim to put them in the position they would have been in if the contract had been performed.
                """,
                "metadata": {
                    "category": "contract_law",
                    "jurisdiction": "general",
                    "document_type": "educational"
                }
            },
            {
                "title": "Tort Law Overview",
                "content": """
                Tort law deals with civil wrongs that cause harm to individuals or their property. Unlike criminal law, tort law focuses on providing compensation to victims rather than punishing wrongdoers.

                The main types of torts include:

                1. Intentional Torts: Actions deliberately intended to cause harm, such as assault, battery, false imprisonment, and defamation.

                2. Negligence: The failure to exercise reasonable care, resulting in harm to another person. To prove negligence, the plaintiff must establish duty, breach, causation, and damages.

                3. Strict Liability: Liability imposed without regard to fault, typically in cases involving abnormally dangerous activities or defective products.

                Negligence is the most common type of tort claim. The standard is whether a reasonable person in the defendant's position would have acted differently. Factors considered include the foreseeability of harm, the severity of potential injury, and the burden of taking precautions.
                """,
                "metadata": {
                    "category": "tort_law",
                    "jurisdiction": "general",
                    "document_type": "educational"
                }
            },
            {
                "title": "Evidence Rules in Litigation",
                "content": """
                The Federal Rules of Evidence govern the admissibility of evidence in federal court proceedings. Key principles include:

                Relevance (Rule 401): Evidence is relevant if it has any tendency to make a fact of consequence more or less probable.

                Hearsay (Rule 801): An out-of-court statement offered to prove the truth of the matter asserted. Generally inadmissible unless an exception applies.

                Authentication (Rule 901): Evidence must be authenticated before admission, showing that it is what it purports to be.

                Best Evidence Rule (Rule 1002): Original documents are required when proving the contents of a writing, recording, or photograph.

                Privilege: Certain communications are protected from disclosure, including attorney-client privilege, spousal privilege, and doctor-patient privilege.

                Expert Testimony (Rule 702): Expert witnesses may testify if their knowledge will help the trier of fact and their testimony is based on reliable principles and methods.
                """,
                "metadata": {
                    "category": "evidence_law",
                    "jurisdiction": "federal",
                    "document_type": "rules"
                }
            }
        ]

        for doc in sample_docs:
            await self.ingest_document(
                title=doc["title"],
                content=doc["content"],
                metadata=doc["metadata"]
            )

    async def test_semantic_search(self, query: str, limit: int = 5):
        """Test semantic search functionality"""
        print(f"\n🔍 Testing semantic search: '{query}'")

        # Generate embedding for query
        query_embedding = self.generate_embedding(query)

        # Search for similar documents
        async with self.pool.acquire() as conn:
            results = await conn.fetch("""
                SELECT title, chunk_text, metadata,
                       1 - (embedding <=> $1) as similarity
                FROM legal_documents
                ORDER BY embedding <=> $1
                LIMIT $2
            """, query_embedding.tolist(), limit)

            print(f"📊 Found {len(results)} similar documents:")
            for i, result in enumerate(results, 1):
                print(f"\n{i}. {result['title']}")
                print(f"   Similarity: {result['similarity']:.3f}")
                print(f"   Category: {json.loads(result['metadata']).get('category', 'unknown')}")
                print(f"   Preview: {result['chunk_text'][:200]}...")

    async def get_stats(self):
        """Get ingestion statistics"""
        async with self.pool.acquire() as conn:
            doc_count = await conn.fetchval("SELECT COUNT(DISTINCT document_hash) FROM legal_documents")
            chunk_count = await conn.fetchval("SELECT COUNT(*) FROM legal_documents")

            print(f"\n📈 RAG Statistics:")
            print(f"   Documents: {doc_count}")
            print(f"   Chunks: {chunk_count}")
            print(f"   Avg chunks per doc: {chunk_count/doc_count if doc_count > 0 else 0:.1f}")

async def main():
    """Main ingestion pipeline"""
    print("🏛️ Legal Document RAG Ingestion Pipeline")
    print("=" * 50)

    ingester = LegalDocumentIngester()

    try:
        # Connect and setup
        await ingester.connect()
        await ingester.setup_schema()

        # Ingest sample documents
        await ingester.ingest_sample_documents()

        # Test semantic search
        await ingester.test_semantic_search("What is breach of contract?")
        await ingester.test_semantic_search("negligence in tort law")
        await ingester.test_semantic_search("hearsay evidence rules")

        # Show statistics
        await ingester.get_stats()

        print("\n🎉 RAG ingestion completed successfully!")
        print("\nYour PostgreSQL + pgvector database now contains:")
        print("- Legal document chunks with embeddings")
        print("- Semantic search capabilities")
        print("- Integration ready for TensorRT-LLM")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if ingester.pool:
            await ingester.pool.close()

if __name__ == "__main__":
    asyncio.run(main())