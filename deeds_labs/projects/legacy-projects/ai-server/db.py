# Database Integration: PostgreSQL + PGVector + Qdrant
# Vector storage and search

import asyncpg
import os
from typing import List, Dict, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue

# PostgreSQL configuration
POSTGRES_DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
)

# Qdrant configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = "evidence_vectors"
VECTOR_DIM = 768  # nomic-embed-text dimension

# Initialize Qdrant client
qdrant_client = QdrantClient(url=QDRANT_URL)


async def get_pg_connection():
    """Get PostgreSQL connection"""
    return await asyncpg.connect(dsn=POSTGRES_DSN)


async def init_pgvector():
    """Initialize PGVector extension and tables"""
    conn = await get_pg_connection()
    try:
        # Enable pgvector extension
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")

        # Create evidence_embeddings table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS evidence_embeddings (
                id TEXT PRIMARY KEY,
                file_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                embedding vector(768),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Create index for vector similarity search
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS evidence_embeddings_vector_idx
            ON evidence_embeddings
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
        """)

        print("[PGVector] ✅ Initialized tables and indexes")
    finally:
        await conn.close()


async def store_embedding_pg(
    file_id: str,
    user_id: str,
    embedding: List[float],
    metadata: Optional[Dict] = None
):
    """Store embedding in PostgreSQL with pgvector"""
    conn = await get_pg_connection()
    try:
        await conn.execute(
            """
            INSERT INTO evidence_embeddings (id, file_id, user_id, embedding, metadata)
            VALUES ($1, $2, $3, $4::vector, $5)
            ON CONFLICT (id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata
            """,
            file_id, file_id, user_id, embedding, metadata or {}
        )
        print(f"[PGVector] ✅ Stored embedding for {file_id}")
    finally:
        await conn.close()


async def search_similar_pg(
    embedding: List[float],
    user_id: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """Search similar embeddings in PostgreSQL"""
    conn = await get_pg_connection()
    try:
        query = """
            SELECT file_id, user_id, metadata,
                   1 - (embedding <=> $1::vector) as similarity
            FROM evidence_embeddings
        """
        params = [embedding]

        if user_id:
            query += " WHERE user_id = $2"
            params.append(user_id)

        query += " ORDER BY embedding <=> $1::vector LIMIT $" + str(len(params) + 1)
        params.append(limit)

        rows = await conn.fetch(query, *params)

        results = [
            {
                "file_id": row["file_id"],
                "user_id": row["user_id"],
                "metadata": row["metadata"],
                "similarity": float(row["similarity"])
            }
            for row in rows
        ]

        print(f"[PGVector] 🔍 Found {len(results)} similar documents")
        return results
    finally:
        await conn.close()


def init_qdrant_collection():
    """Initialize Qdrant collection"""
    try:
        # Check if collection exists
        collections = qdrant_client.get_collections().collections
        collection_names = [c.name for c in collections]

        if QDRANT_COLLECTION not in collection_names:
            # Create collection
            qdrant_client.create_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
            )
            print(f"[Qdrant] ✅ Created collection: {QDRANT_COLLECTION}")
        else:
            print(f"[Qdrant] ✅ Collection exists: {QDRANT_COLLECTION}")
    except Exception as e:
        print(f"[Qdrant] ❌ Initialization failed: {e}")


def store_embedding_qdrant(
    file_id: str,
    embedding: List[float],
    metadata: Dict
):
    """Store embedding in Qdrant"""
    try:
        point = PointStruct(
            id=file_id,
            vector=embedding,
            payload=metadata
        )

        qdrant_client.upsert(
            collection_name=QDRANT_COLLECTION,
            points=[point]
        )

        print(f"[Qdrant] ✅ Stored embedding for {file_id}")
    except Exception as e:
        print(f"[Qdrant] ❌ Storage failed: {e}")


def search_similar_qdrant(
    embedding: List[float],
    user_id: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """Search similar embeddings in Qdrant"""
    try:
        # Build filter
        query_filter = None
        if user_id:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="user_id",
                        match=MatchValue(value=user_id)
                    )
                ]
            )

        # Search
        results = qdrant_client.search(
            collection_name=QDRANT_COLLECTION,
            query_vector=embedding,
            query_filter=query_filter,
            limit=limit
        )

        formatted = [
            {
                "file_id": str(result.id),
                "score": result.score,
                "payload": result.payload
            }
            for result in results
        ]

        print(f"[Qdrant] 🔍 Found {len(formatted)} similar documents")
        return formatted
    except Exception as e:
        print(f"[Qdrant] ❌ Search failed: {e}")
        return []


# Dual storage function (PGVector + Qdrant)
async def store_embedding_dual(
    file_id: str,
    user_id: str,
    embedding: List[float],
    metadata: Dict
):
    """Store embedding in both PGVector and Qdrant for redundancy"""
    # Store in PostgreSQL
    await store_embedding_pg(file_id, user_id, embedding, metadata)

    # Store in Qdrant
    metadata_with_user = {**metadata, "user_id": user_id}
    store_embedding_qdrant(file_id, embedding, metadata_with_user)

    print(f"[Database] ✅ Dual storage complete for {file_id}")


# Initialize on module import
init_qdrant_collection()
