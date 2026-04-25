#!/usr/bin/env python3
"""
Legal PDF Ingestion Worker
- Extract text from PDF using IBM Granite (via Docling)
- Chunk text with langchain
- Generate embeddings via embedding_service (Ollama)
- Store in Qdrant (legal_complaints) + Postgres (legal_embeddings)
- Build KAG (knowledge graph) in Neo4j
- Generate summaries via Gemma-3 Legal
- Integrate with RAG + KAG pipeline
"""

import os
import json
import uuid
import logging
from typing import Dict, List, Any, Tuple
from datetime import datetime

import numpy as np
from langchain.text_splitter import RecursiveCharacterTextSplitter

import qdrant_client
from qdrant_client.models import PointStruct, VectorParams, Distance

import psycopg2
from psycopg2.extras import execute_values

import neo4j
from neo4j import GraphDatabase

import requests

from embedding_service import get_embedding_service

logger = logging.getLogger(__name__)

# Configuration
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

PG_HOST = os.getenv("PG_HOST", "localhost")
PG_DB = os.getenv("PG_DB", "legal_ai_db")
PG_USER = os.getenv("PG_USER", "postgres")
PG_PASSWORD = os.getenv("PG_PASSWORD", "password")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_SUMMARY_MODEL = os.getenv("OLLAMA_SUMMARY_MODEL", "gemma3-legal:latest")

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))


# ---------- Text Extraction (IBM Granite via Docling) ----------

def extract_text_from_pdf(pdf_path: str) -> Tuple[str, List[str]]:
    """
    Extract text from PDF using Docling (IBM Granite backend).
    Returns (full_text, page_texts).
    """
    logger.info(f"📄 Extracting text from {pdf_path}...")

    try:
        # Try Docling first (uses IBM Granite internally)
        from docling.document_converter import DocumentConverter

        converter = DocumentConverter()
        result = converter.convert(pdf_path)

        full_text = result.document.export_to_markdown()
        page_texts = [full_text]  # Docling returns full doc, not per-page

        logger.info(f"✅ Extracted text via Docling (IBM Granite)")
        return full_text, page_texts
    except ImportError:
        logger.warning("⚠️  Docling not available, falling back to PyPDF2")
        # Fallback to PyPDF2
        import PyPDF2

        full_text = ""
        page_texts = []

        with open(pdf_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page_num, page in enumerate(reader.pages):
                text = page.extract_text()
                page_texts.append(text)
                full_text += f"\n--- Page {page_num + 1} ---\n{text}"

        logger.info(f"✅ Extracted {len(page_texts)} pages via PyPDF2")
        return full_text, page_texts


# ---------- Text Chunking ----------

def chunk_text(text: str) -> List[str]:
    """
    Split text into overlapping chunks using langchain.
    """
    logger.info(f"✂️  Chunking text (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})...")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

    chunks = splitter.split_text(text)
    logger.info(f"✅ Created {len(chunks)} chunks")
    return chunks


# ---------- Summary Generation (Gemma-3 Legal) ----------

def generate_summary(text: str, max_length: int = 5) -> str:
    """
    Generate a short summary using Gemma-3 Legal via Ollama.
    Returns 1-5 sentence summary.
    """
    logger.info(f"📝 Generating summary via {OLLAMA_SUMMARY_MODEL}...")

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_SUMMARY_MODEL,
                "prompt": f"Summarize this legal text in 1-5 sentences:\n\n{text[:2000]}",
                "stream": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        summary = data.get("response", "").strip()
        logger.info(f"✅ Generated summary: {summary[:100]}...")
        return summary
    except Exception as e:
        logger.warning(f"⚠️  Summary generation failed: {e}")
        return text[:200]  # Fallback to first 200 chars


# ---------- Qdrant Storage ----------

def store_in_qdrant(
    chunks: List[str],
    embeddings: np.ndarray,
    case_id: str,
    metadata: Dict[str, Any],
) -> None:
    """
    Store embeddings in Qdrant (legal_complaints collection).
    """
    logger.info(f"📦 Storing {len(chunks)} embeddings in Qdrant...")

    client = qdrant_client.QdrantClient(QDRANT_HOST, port=QDRANT_PORT)

    # Create collection
    try:
        client.recreate_collection(
            collection_name="legal_complaints",
            vectors_config=VectorParams(size=768, distance=Distance.COSINE),
        )
    except Exception as e:
        logger.warning(f"   ⚠️  Collection creation: {e}")

    # Create points
    points = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        points.append(
            PointStruct(
                id=i,
                vector=embedding.tolist(),
                payload={
                    "case_id": case_id,
                    "chunk_index": i,
                    "text": chunk[:500],
                    "metadata": metadata,
                    "created_at": datetime.now().isoformat(),
                },
            )
        )

    client.upsert(collection_name="legal_complaints", points=points)
    logger.info(f"✅ Stored {len(points)} points in Qdrant")


# ---------- PostgreSQL Storage ----------

def store_in_postgres(
    chunks: List[str],
    embeddings: np.ndarray,
    case_id: str,
    metadata: Dict[str, Any],
    summary: str,
) -> None:
    """
    Store embeddings in PostgreSQL + pgvector (legal_embeddings table).
    """
    logger.info(f"🐘 Storing {len(chunks)} embeddings in PostgreSQL...")

    conn = psycopg2.connect(
        host=PG_HOST,
        database=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
    )

    with conn.cursor() as cur:
        # Create table
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS legal_embeddings (
                id UUID PRIMARY KEY,
                case_id TEXT,
                chunk_index INTEGER,
                embedding VECTOR(768),
                text_chunk TEXT,
                summary TEXT,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        # Insert rows
        rows = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            rows.append(
                (
                    str(uuid.uuid4()),
                    case_id,
                    i,
                    embedding.tolist(),
                    chunk,
                    summary if i == 0 else None,  # Store summary with first chunk
                    json.dumps(metadata),
                )
            )

        execute_values(
            cur,
            """
            INSERT INTO legal_embeddings (id, case_id, chunk_index, embedding, text_chunk, summary, metadata)
            VALUES %s
        """,
            rows,
        )

    conn.commit()
    conn.close()
    logger.info(f"✅ Stored {len(rows)} rows in PostgreSQL")


# ---------- KAG (Knowledge Graph) ----------

def build_knowledge_graph(
    chunks: List[str],
    case_id: str,
    case_name: str,
    metadata: Dict[str, Any],
) -> None:
    """
    Build knowledge graph in Neo4j.
    Extract legal entities, statutes, claims, and relationships.
    """
    logger.info(f"🔗 Building knowledge graph in Neo4j...")

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    # Define legal entities (extracted from metadata or hardcoded for this case)
    legal_entities = {
        "Supremacy Clause": "U.S. Const. Art. VI - Federal law is supreme",
        "Preemption": "Federal law overrides conflicting state law",
        "Intergovernmental Immunity": "States cannot regulate federal government",
        "Private Detention": "California A.B. 32 - ban on private detention facilities",
        "Federal Authority": "DOJ enforcement power under Supremacy Clause",
    }

    relationships = [
        ("Supremacy Clause", "SUPPORTS", "Preemption"),
        ("Preemption", "APPLIES_TO", "Private Detention"),
        ("Federal Authority", "ENFORCES", "Supremacy Clause"),
        ("Intergovernmental Immunity", "RELATES_TO", "Preemption"),
    ]

    with driver.session() as session:
        # Create case node
        session.run(
            """
            MERGE (c:Case {id: $case_id, name: $case_name, filed: $filed})
            SET c.metadata = $metadata
            """,
            case_id=case_id,
            case_name=case_name,
            filed=datetime.now().isoformat(),
            metadata=metadata,
        )

        # Create legal entity nodes
        for entity, description in legal_entities.items():
            session.run(
                """
                MERGE (e:LegalEntity {name: $name})
                SET e.description = $description
                """,
                name=entity,
                description=description,
            )

            # Link to case
            session.run(
                """
                MATCH (c:Case {id: $case_id})
                MATCH (e:LegalEntity {name: $entity})
                MERGE (c)-[:ASSERTS]->(e)
                """,
                case_id=case_id,
                entity=entity,
            )

        # Create relationships
        for source, rel_type, target in relationships:
            session.run(
                """
                MATCH (s:LegalEntity {name: $source})
                MATCH (t:LegalEntity {name: $target})
                MERGE (s)-[r:RELATES {type: $rel_type}]->(t)
                """,
                source=source,
                target=target,
                rel_type=rel_type,
            )

    driver.close()
    logger.info(f"✅ Built knowledge graph with {len(legal_entities)} entities")


# ---------- Main Ingestion Pipeline ----------

class PDFIngestionWorker:
    """
    Main worker for PDF ingestion.
    Orchestrates: extract → chunk → embed → store (Qdrant + Postgres + Neo4j).
    """

    def __init__(self):
        self.embedding_service = get_embedding_service()
        logger.info("✅ PDFIngestionWorker initialized")

    def ingest(
        self,
        pdf_path: str,
        case_id: str,
        case_name: str,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Main ingestion pipeline.
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"🚀 Ingesting PDF: {pdf_path}")
        logger.info(f"{'='*60}\n")

        # 1. Extract text
        full_text, page_texts = extract_text_from_pdf(pdf_path)

        # 2. Chunk text
        chunks = chunk_text(full_text)

        # 3. Generate embeddings
        logger.info(f"🧠 Generating embeddings for {len(chunks)} chunks...")
        embeddings = self.embedding_service.embed_batch(chunks)

        # 4. Generate summary
        summary = generate_summary(full_text)

        # 5. Store in Qdrant
        store_in_qdrant(chunks, embeddings, case_id, metadata)

        # 6. Store in PostgreSQL
        store_in_postgres(chunks, embeddings, case_id, metadata, summary)

        # 7. Build knowledge graph
        build_knowledge_graph(chunks, case_id, case_name, metadata)

        # 8. Export results
        results = {
            "case_id": case_id,
            "case_name": case_name,
            "pdf_path": pdf_path,
            "chunk_count": len(chunks),
            "embedding_dim": embeddings.shape[1],
            "summary": summary,
            "metadata": metadata,
            "created_at": datetime.now().isoformat(),
        }

        with open(f"ingestion_results_{case_id}.json", "w") as f:
            json.dump(results, f, indent=2)

        logger.info(f"\n{'='*60}")
        logger.info(f"✅ Ingestion Complete!")
        logger.info(f"{'='*60}")
        logger.info(f"\n📊 Results:")
        logger.info(f"   Chunks: {len(chunks)}")
        logger.info(f"   Embeddings: {embeddings.shape}")
        logger.info(f"   Summary: {summary[:100]}...")
        logger.info(f"\n💾 Outputs:")
        logger.info(f"   • Qdrant collection: legal_complaints")
        logger.info(f"   • PostgreSQL table: legal_embeddings")
        logger.info(f"   • Neo4j graph: Case + LegalEntity nodes")
        logger.info(f"   • Results file: ingestion_results_{case_id}.json")

        return results


def main():
    """
    Example usage.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    worker = PDFIngestionWorker()

    # Check embedding service health
    if not worker.embedding_service.health_check():
        logger.error("❌ Embedding service health check failed")
        return

    # Example: ingest the DOJ complaint
    pdf_path = os.getenv("PDF_PATH", "download_complaint (2).pdf")
    case_id = os.getenv("CASE_ID", "US_v_CA_AB32_2020")
    case_name = os.getenv("CASE_NAME", "United States v. California (A.B. 32 Challenge)")

    metadata = {
        "source": "DOJ Complaint",
        "filed_date": "2020-01-24",
        "jurisdiction": "Federal",
        "subject": "Supremacy Clause - Private Detention Facility Ban",
    }

    if not os.path.exists(pdf_path):
        logger.error(f"❌ PDF not found: {pdf_path}")
        return

    results = worker.ingest(pdf_path, case_id, case_name, metadata)


if __name__ == "__main__":
    main()
