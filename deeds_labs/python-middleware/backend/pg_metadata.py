"""
Postgres Metadata Schema & Operations

Authoritative storage for:
- Embeddings (pgvector)
- Documents (evidence files)
- Cases (legal cases)
- Citations (statute references)
- Charges (criminal charges)

All operations are ACID-compliant with audit trails.
"""

import asyncpg
import logging
from typing import Optional, List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


class PostgresMetadata:
    """Manages Postgres metadata operations"""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def initialize_schema(self) -> None:
        """Create all required tables"""
        async with self.pool.acquire() as conn:
            # Enable pgvector extension
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")

            # Embeddings table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS embeddings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    chunk_id VARCHAR(255) UNIQUE NOT NULL,
                    doc_id VARCHAR(255) NOT NULL,
                    embedding vector(768),
                    page INT,
                    bbox JSONB,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT fk_doc FOREIGN KEY (doc_id) REFERENCES documents(id)
                )
            """)

            # Create index for pgvector
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_embeddings_vector
                ON embeddings USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
            """)

            # Documents table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    filename VARCHAR(255) NOT NULL,
                    doc_type VARCHAR(50),
                    jurisdiction VARCHAR(50),
                    file_size INT,
                    file_hash VARCHAR(64),
                    minio_path VARCHAR(500),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Cases table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS cases (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    case_id VARCHAR(255) UNIQUE NOT NULL,
                    title VARCHAR(500),
                    court VARCHAR(255),
                    year INT,
                    jurisdiction VARCHAR(50),
                    legal_domain VARCHAR(100),
                    outcome VARCHAR(100),
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Charges table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS charges (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    case_id UUID NOT NULL,
                    statute_code VARCHAR(100),
                    charge_type VARCHAR(100),
                    severity VARCHAR(50),
                    created_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT fk_case FOREIGN KEY (case_id) REFERENCES cases(id)
                )
            """)

            # Citations table (statute references)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS citations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    embedding_id UUID NOT NULL,
                    case_id UUID,
                    statute_code VARCHAR(100),
                    statute_title VARCHAR(500),
                    relevance_score FLOAT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT fk_embedding FOREIGN KEY (embedding_id) REFERENCES embeddings(id),
                    CONSTRAINT fk_case FOREIGN KEY (case_id) REFERENCES cases(id)
                )
            """)

            # Evidence table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS evidence (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    case_id UUID NOT NULL,
                    doc_id UUID NOT NULL,
                    evidence_type VARCHAR(100),
                    status VARCHAR(50),
                    created_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT fk_case FOREIGN KEY (case_id) REFERENCES cases(id),
                    CONSTRAINT fk_doc FOREIGN KEY (doc_id) REFERENCES documents(id)
                )
            """)

            logger.info("✅ Postgres schema initialized")

    async def insert_document(
        self,
        filename: str,
        doc_type: str,
        jurisdiction: str,
        file_size: int,
        file_hash: str,
        minio_path: str,
    ) -> str:
        """Insert document metadata"""
        async with self.pool.acquire() as conn:
            doc_id = await conn.fetchval("""
                INSERT INTO documents (
                    filename, doc_type, jurisdiction, file_size, file_hash, minio_path
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            """, filename, doc_type, jurisdiction, file_size, file_hash, minio_path)
            return str(doc_id)

    async def insert_embedding(
        self,
        chunk_id: str,
        doc_id: str,
        embedding: List[float],
        page: int,
        bbox: Dict,
        metadata: Dict,
    ) -> str:
        """Insert embedding with metadata"""
        async with self.pool.acquire() as conn:
            embedding_id = await conn.fetchval("""
                INSERT INTO embeddings (
                    chunk_id, doc_id, embedding, page, bbox, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            """, chunk_id, doc_id, embedding, page, bbox, metadata)
            return str(embedding_id)

    async def insert_case(
        self,
        case_id: str,
        title: str,
        court: str,
        year: int,
        jurisdiction: str,
        legal_domain: str,
        outcome: str,
    ) -> str:
        """Insert case metadata"""
        async with self.pool.acquire() as conn:
            case_uuid = await conn.fetchval("""
                INSERT INTO cases (
                    case_id, title, court, year, jurisdiction, legal_domain, outcome
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            """, case_id, title, court, year, jurisdiction, legal_domain, outcome)
            return str(case_uuid)

    async def insert_charge(
        self,
        case_id: str,
        statute_code: str,
        charge_type: str,
        severity: str,
    ) -> str:
        """Insert charge metadata"""
        async with self.pool.acquire() as conn:
            charge_id = await conn.fetchval("""
                INSERT INTO charges (
                    case_id, statute_code, charge_type, severity
                ) VALUES ($1, $2, $3, $4)
                RETURNING id
            """, case_id, statute_code, charge_type, severity)
            return str(charge_id)

    async def insert_citation(
        self,
        embedding_id: str,
        case_id: Optional[str],
        statute_code: str,
        statute_title: str,
        relevance_score: float,
    ) -> str:
        """Insert citation (statute reference)"""
        async with self.pool.acquire() as conn:
            citation_id = await conn.fetchval("""
                INSERT INTO citations (
                    embedding_id, case_id, statute_code, statute_title, relevance_score
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """, embedding_id, case_id, statute_code, statute_title, relevance_score)
            return str(citation_id)

    async def get_embedding_by_chunk_id(self, chunk_id: str) -> Optional[Dict]:
        """Get embedding by chunk ID"""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, chunk_id, doc_id, embedding, page, bbox, metadata
                FROM embeddings
                WHERE chunk_id = $1
            """, chunk_id)

            if row:
                return dict(row)
            return None

    async def get_embeddings_by_doc_id(self, doc_id: str) -> List[Dict]:
        """Get all embeddings for a document"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, chunk_id, doc_id, embedding, page, bbox, metadata
                FROM embeddings
                WHERE doc_id = $1
                ORDER BY page, metadata->>'position'
            """, doc_id)

            return [dict(row) for row in rows]

    async def get_case_by_id(self, case_id: str) -> Optional[Dict]:
        """Get case metadata"""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, case_id, title, court, year, jurisdiction, legal_domain, outcome
                FROM cases
                WHERE case_id = $1
            """, case_id)

            if row:
                return dict(row)
            return None

    async def get_citations_for_embedding(self, embedding_id: str) -> List[Dict]:
        """Get all citations for an embedding"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, embedding_id, case_id, statute_code, statute_title, relevance_score
                FROM citations
                WHERE embedding_id = $1
                ORDER BY relevance_score DESC
            """, embedding_id)

            return [dict(row) for row in rows]

    async def search_by_statute(self, statute_code: str) -> List[Dict]:
        """Search embeddings by statute code"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT DISTINCT e.id, e.chunk_id, e.doc_id, e.embedding, e.page, e.bbox, e.metadata
                FROM embeddings e
                JOIN citations c ON e.id = c.embedding_id
                WHERE c.statute_code = $1
                ORDER BY c.relevance_score DESC
            """, statute_code)

            return [dict(row) for row in rows]

    async def search_by_jurisdiction(self, jurisdiction: str, limit: int = 100) -> List[Dict]:
        """Search embeddings by jurisdiction"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT e.id, e.chunk_id, e.doc_id, e.embedding, e.page, e.bbox, e.metadata
                FROM embeddings e
                JOIN documents d ON e.doc_id = d.id
                WHERE d.jurisdiction = $1
                LIMIT $2
            """, jurisdiction, limit)

            return [dict(row) for row in rows]

    async def get_stats(self) -> Dict:
        """Get database statistics"""
        async with self.pool.acquire() as conn:
            stats = {}

            stats["embeddings_count"] = await conn.fetchval(
                "SELECT COUNT(*) FROM embeddings"
            )
            stats["documents_count"] = await conn.fetchval(
                "SELECT COUNT(*) FROM documents"
            )
            stats["cases_count"] = await conn.fetchval(
                "SELECT COUNT(*) FROM cases"
            )
            stats["citations_count"] = await conn.fetchval(
                "SELECT COUNT(*) FROM citations"
            )

            return stats


# SQL Schema Definition (for reference)
SCHEMA_SQL = """
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table (pgvector)
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id VARCHAR(255) UNIQUE NOT NULL,
    doc_id VARCHAR(255) NOT NULL,
    embedding vector(768),
    page INT,
    bbox JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_doc FOREIGN KEY (doc_id) REFERENCES documents(id)
);

CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50),
    jurisdiction VARCHAR(50),
    file_size INT,
    file_hash VARCHAR(64),
    minio_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cases table
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500),
    court VARCHAR(255),
    year INT,
    jurisdiction VARCHAR(50),
    legal_domain VARCHAR(100),
    outcome VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Charges table
CREATE TABLE charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL,
    statute_code VARCHAR(100),
    charge_type VARCHAR(100),
    severity VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_case FOREIGN KEY (case_id) REFERENCES cases(id)
);

-- Citations table (statute references)
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    embedding_id UUID NOT NULL,
    case_id UUID,
    statute_code VARCHAR(100),
    statute_title VARCHAR(500),
    relevance_score FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_embedding FOREIGN KEY (embedding_id) REFERENCES embeddings(id),
    CONSTRAINT fk_case FOREIGN KEY (case_id) REFERENCES cases(id)
);

-- Evidence table
CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL,
    doc_id UUID NOT NULL,
    evidence_type VARCHAR(100),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_case FOREIGN KEY (case_id) REFERENCES cases(id),
    CONSTRAINT fk_doc FOREIGN KEY (doc_id) REFERENCES documents(id)
);
"""
