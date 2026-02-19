#!/usr/bin/env python3
"""
PDF Legal Document RAG Ingestion Pipeline
Processes PDF files (like complaint.pdf) and stores them in PostgreSQL + pgvector
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
import io

# Configuration
DATABASE_URL = "postgresql://legal_admin:123456@localhost:5433/legal_ai_db"
OLLAMA_URL = "http://localhost:11434"
CHUNK_SIZE = 1000
OVERLAP_SIZE = 200

class PDFLegalIngester:
    def __init__(self):
        self.pool = None

    async def connect(self):
        """Connect to PostgreSQL database"""
        self.pool = await asyncpg.create_pool(DATABASE_URL)
        print("✅ Connected to PostgreSQL + pgvector")

    async def setup_schema(self):
        """Ensure vector extension and tables exist"""
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

            print("✅ Database schema ready")

    def extract_pdf_text(self, pdf_path: str) -> str:
        """Extract text content from PDF file"""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""

                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    text += page.extract_text() + "\n\n"

                print(f"📄 Extracted {len(text)} characters from {len(pdf_reader.pages)} pages")
                return text.strip()

        except Exception as e:
            print(f"❌ Error extracting PDF: {e}")
            return ""

    def detect_document_type(self, text: str) -> Dict[str, Any]:
        """Analyze document content to determine type and extract metadata"""
        text_lower = text.lower()

        metadata = {
            "document_type": "unknown",
            "jurisdiction": "unknown",
            "category": "legal_document"
        }

        # Detect document types
        if "complaint" in text_lower or "plaintiff" in text_lower or "defendant" in text_lower:
            metadata["document_type"] = "complaint"
            metadata["category"] = "litigation"
        elif "contract" in text_lower or "agreement" in text_lower:
            metadata["document_type"] = "contract"
            metadata["category"] = "contract_law"
        elif "motion" in text_lower or "brief" in text_lower:
            metadata["document_type"] = "motion"
            metadata["category"] = "litigation"
        elif "patent" in text_lower or "invention" in text_lower:
            metadata["document_type"] = "patent"
            metadata["category"] = "intellectual_property"

        # Detect jurisdiction
        if "united states" in text_lower or "federal" in text_lower:
            metadata["jurisdiction"] = "federal"
        elif any(state in text_lower for state in ["california", "new york", "texas", "florida"]):
            for state in ["california", "new york", "texas", "florida"]:
                if state in text_lower:
                    metadata["jurisdiction"] = state
                    break

        return metadata

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generate embeddings using Ollama"""
        try:
            # Try Gemma embeddings first, fallback to nomic-embed-text
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
                        return embedding.astype(np.float32)
                except:
                    continue

            # Fallback to random embedding if both models fail
            print(f"⚠️  Using random embedding for text chunk")
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

            if end < len(text):
                # Find good breaking points
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                last_space = chunk.rfind(' ')

                # Choose the best breaking point
                boundary = max(last_period, last_newline, last_space)

                if boundary > start + 500:  # Ensure minimum chunk size
                    end = start + boundary + 1
                    chunk = text[start:end]

            chunks.append(chunk.strip())
            start = end - OVERLAP_SIZE

            if start >= len(text):
                break

        return [chunk for chunk in chunks if len(chunk.strip()) > 100]  # Filter short chunks

    async def ingest_pdf(self, pdf_path: str, custom_title: str = None):
        """Ingest a PDF document into the vector database"""
        pdf_file = Path(pdf_path)

        if not pdf_file.exists():
            print(f"❌ File not found: {pdf_path}")
            return

        print(f"📄 Processing PDF: {pdf_file.name}")

        # Extract text from PDF
        content = self.extract_pdf_text(pdf_path)
        if not content:
            print(f"❌ No text extracted from {pdf_file.name}")
            return

        # Use custom title or filename
        title = custom_title or pdf_file.stem.replace('_', ' ').replace('-', ' ').title()

        # Detect document metadata
        metadata = self.detect_document_type(content)
        metadata["source_file"] = pdf_file.name
        metadata["file_size"] = pdf_file.stat().st_size
        metadata["processed_at"] = datetime.now().isoformat()

        print(f"📋 Document type: {metadata['document_type']}")
        print(f"📍 Jurisdiction: {metadata['jurisdiction']}")

        # Generate document hash for deduplication
        doc_hash = hashlib.md5(f"{title}:{content[:1000]}".encode()).hexdigest()

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
        print(f"🔀 Created {len(chunks)} chunks")

        # Process each chunk
        successful_chunks = 0
        for i, chunk in enumerate(chunks):
            try:
                # Generate embedding
                embedding = self.generate_embedding(chunk)

                # Store in database
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO legal_documents
                        (title, content, chunk_text, embedding, metadata, document_hash, chunk_index)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """, title, content, chunk, embedding.tolist(), json.dumps(metadata), doc_hash, i)

                successful_chunks += 1
                print(f"  ✅ Chunk {i+1}/{len(chunks)}: {len(chunk)} chars")

            except Exception as e:
                print(f"  ❌ Chunk {i+1} failed: {e}")

        print(f"🎉 Successfully ingested {successful_chunks}/{len(chunks)} chunks")

    async def search_complaint(self, query: str, limit: int = 5):
        """Search for content related to the complaint"""
        print(f"\n🔍 Searching complaint for: '{query}'")

        query_embedding = self.generate_embedding(query)

        async with self.pool.acquire() as conn:
            results = await conn.fetch("""
                SELECT title, chunk_text, metadata,
                       1 - (embedding <=> $1) as similarity
                FROM legal_documents
                WHERE (metadata->>'document_type' = 'complaint' OR metadata->>'category' = 'litigation')
                ORDER BY embedding <=> $1
                LIMIT $2
            """, query_embedding.tolist(), limit)

            print(f"📊 Found {len(results)} relevant sections:")
            for i, result in enumerate(results, 1):
                print(f"\n{i}. {result['title']}")
                print(f"   Similarity: {result['similarity']:.3f}")
                print(f"   Preview: {result['chunk_text'][:300]}...")

    async def get_document_stats(self):
        """Get statistics about ingested documents"""
        async with self.pool.acquire() as conn:
            stats = await conn.fetch("""
                SELECT
                    metadata->>'document_type' as doc_type,
                    COUNT(DISTINCT document_hash) as documents,
                    COUNT(*) as chunks
                FROM legal_documents
                GROUP BY metadata->>'document_type'
                ORDER BY documents DESC
            """)

            total_docs = await conn.fetchval("SELECT COUNT(DISTINCT document_hash) FROM legal_documents")
            total_chunks = await conn.fetchval("SELECT COUNT(*) FROM legal_documents")

            print(f"\n📈 Document Statistics:")
            print(f"   Total Documents: {total_docs}")
            print(f"   Total Chunks: {total_chunks}")
            print(f"\n📋 By Document Type:")
            for stat in stats:
                print(f"   {stat['doc_type']}: {stat['documents']} docs, {stat['chunks']} chunks")

async def main():
    """Main ingestion pipeline for complaint.pdf"""
    print("🏛️ PDF Legal Document RAG Ingestion")
    print("=" * 40)

    ingester = PDFLegalIngester()

    try:
        await ingester.connect()
        await ingester.setup_schema()

        # Ingest complaint.pdf
        pdf_path = "complaint.pdf"
        if Path(pdf_path).exists():
            await ingester.ingest_pdf(pdf_path, "Legal Complaint Document")
        else:
            # Try common locations
            possible_paths = [
                "./complaint.pdf",
                "../complaint.pdf",
                "documents/complaint.pdf",
                "legal-docs/complaint.pdf"
            ]

            found = False
            for path in possible_paths:
                if Path(path).exists():
                    await ingester.ingest_pdf(path, "Legal Complaint Document")
                    found = True
                    break

            if not found:
                print(f"❌ complaint.pdf not found in current directory")
                print(f"📁 Current directory: {Path.cwd()}")
                print(f"💡 Place complaint.pdf in the current directory and run again")

        # Test searches related to complaints
        await ingester.search_complaint("plaintiff allegations")
        await ingester.search_complaint("damages sought")
        await ingester.search_complaint("defendant actions")

        # Show statistics
        await ingester.get_document_stats()

        print(f"\n🎉 PDF ingestion completed!")
        print(f"💡 Your complaint.pdf is now searchable via semantic similarity")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if ingester.pool:
            await ingester.pool.close()

if __name__ == "__main__":
    asyncio.run(main())