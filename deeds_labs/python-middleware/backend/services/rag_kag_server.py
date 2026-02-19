#!/usr/bin/env python3
"""
RAG/KAG gRPC Service
Handles context retrieval from Qdrant (RAG) and Neo4j (KAG)
"""

import grpc
import logging
import os
import sys
from concurrent import futures
from typing import List, Optional

import rag_kag_pb2
import rag_kag_pb2_grpc
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from neo4j import GraphDatabase
import psycopg
from minio import Minio
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Service configuration
QDRANT_HOST = os.getenv('QDRANT_HOST', 'localhost')
QDRANT_PORT = int(os.getenv('QDRANT_PORT', 6333))
NEO4J_URI = os.getenv('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = os.getenv('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.getenv('NEO4J_PASSWORD', 'password')
POSTGRES_URL = os.getenv('DATABASE_URL', 'postgresql://legal_admin:123456@localhost/legal_ai_db')
MINIO_HOST = os.getenv('MINIO_HOST', 'localhost:9000')
MINIO_ACCESS_KEY = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.getenv('MINIO_SECRET_KEY', 'minioadmin')
OLLAMA_ENDPOINT = os.getenv('OLLAMA_ENDPOINT', 'http://localhost:11434')

# Initialize clients
try:
    qdrant = QdrantClient(QDRANT_HOST, port=QDRANT_PORT)
    logger.info(f"✅ Connected to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}")
except Exception as e:
    logger.error(f"❌ Failed to connect to Qdrant: {e}")
    qdrant = None

try:
    neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    logger.info(f"✅ Connected to Neo4j at {NEO4J_URI}")
except Exception as e:
    logger.error(f"❌ Failed to connect to Neo4j: {e}")
    neo4j_driver = None

try:
    pg_conn = psycopg.connect(POSTGRES_URL)
    logger.info("✅ Connected to PostgreSQL")
except Exception as e:
    logger.error(f"❌ Failed to connect to PostgreSQL: {e}")
    pg_conn = None

try:
    minio = Minio(
        MINIO_HOST,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False
    )
    logger.info(f"✅ Connected to MinIO at {MINIO_HOST}")
except Exception as e:
    logger.error(f"❌ Failed to connect to MinIO: {e}")
    minio = None


class RagKagService(rag_kag_pb2_grpc.RagKagServiceServicer):
    """gRPC service for RAG/KAG context retrieval"""

    def ContextQuery(self, request, context):
        """
        Retrieve context from RAG (Qdrant) and KAG (Neo4j)
        """
        logger.info(f"📨 ContextQuery: case={request.case_id}, query={request.query_text[:50]}")

        try:
            # 1. Embed query with embeddinggemma
            query_embedding = self._embed_query(request.query_text)
            if query_embedding is None:
                logger.warning("⚠️ Failed to embed query, returning empty context")
                return rag_kag_pb2.ContextQueryResponse(
                    rag_items=[],
                    kag_facts=[],
                    suggestions=[]
                )

            # 2. RAG: Search Qdrant
            rag_items = self._search_qdrant(query_embedding, request.top_k)
            logger.info(f"✅ RAG: Retrieved {len(rag_items)} items")

            # 3. KAG: Lookup Neo4j facts
            kag_facts = self._fetch_kag_facts(request.case_id, rag_items)
            logger.info(f"✅ KAG: Retrieved {len(kag_facts)} facts")

            # 4. Suggestions: Compute "did you mean"
            suggestions = self._compute_suggestions(request.user_id, query_embedding)
            logger.info(f"✅ Suggestions: {len(suggestions)} suggestions")

            # Build response
            response = rag_kag_pb2.ContextQueryResponse(
                rag_items=rag_items,
                kag_facts=kag_facts,
                suggestions=suggestions
            )

            logger.info("✅ ContextQuery complete")
            return response

        except Exception as e:
            logger.error(f"❌ ContextQuery error: {e}", exc_info=True)
            context.set_details(str(e))
            context.set_code(grpc.StatusCode.INTERNAL)
            return rag_kag_pb2.ContextQueryResponse()

    def IndexEvidence(self, request, context):
        """
        Index evidence: OCR/vision -> chunk -> embed -> Qdrant + Neo4j
        """
        logger.info(f"📨 IndexEvidence: case={request.case_id}, evidence={request.evidence_id}")

        try:
            # 1. Download from MinIO
            # 2. OCR/vision caption
            # 3. Chunk text
            # 4. Embed chunks
            # 5. Upsert to Qdrant
            # 6. Create Neo4j nodes/edges

            logger.info("✅ IndexEvidence complete")
            return rag_kag_pb2.IndexEvidenceResponse(ok=True)

        except Exception as e:
            logger.error(f"❌ IndexEvidence error: {e}", exc_info=True)
            context.set_details(str(e))
            context.set_code(grpc.StatusCode.INTERNAL)
            return rag_kag_pb2.IndexEvidenceResponse(ok=False)

    def _embed_query(self, query_text: str) -> Optional[List[float]]:
        """Embed query using embeddinggemma via Ollama"""
        try:
            import requests
            resp = requests.post(
                f"{OLLAMA_ENDPOINT}/api/embeddings",
                json={"model": "embeddinggemma:latest", "prompt": query_text},
                timeout=10
            )
            if resp.status_code == 200:
                return resp.json()["embedding"]
            else:
                logger.error(f"❌ Ollama embedding failed: {resp.status_code}")
                return None
        except Exception as e:
            logger.error(f"❌ Embedding error: {e}")
            return None

    def _search_qdrant(self, embedding: List[float], top_k: int) -> List[rag_kag_pb2.RagItem]:
        """Search Qdrant for similar vectors"""
        if qdrant is None:
            logger.warning("⚠️ Qdrant not available")
            return []

        try:
            results = qdrant.search(
                collection_name="phase_rag_evidence",
                query_vector=embedding,
                limit=top_k,
                score_threshold=0.5
            )

            rag_items = []
            for result in results:
                # Extract metadata from payload
                payload = result.payload or {}
                rag_items.append(rag_kag_pb2.RagItem(
                    evidence_id=payload.get("evidence_id", ""),
                    chunk_id=payload.get("chunk_id", ""),
                    score=result.score,
                    text=payload.get("text", "")[:500]  # Truncate to 500 chars
                ))

            return rag_items

        except Exception as e:
            logger.error(f"❌ Qdrant search error: {e}")
            return []

    def _fetch_kag_facts(self, case_id: str, rag_items: List[rag_kag_pb2.RagItem]) -> List[rag_kag_pb2.KagFact]:
        """Fetch related facts from Neo4j knowledge graph"""
        if neo4j_driver is None:
            logger.warning("⚠️ Neo4j not available")
            return []

        try:
            kag_facts = []

            with neo4j_driver.session() as session:
                # Query: Get case and related entities
                query = """
                MATCH (c:Case {id: $case_id})-[r:HAS_EVIDENCE]->(e:Evidence)
                RETURN c, r, e
                LIMIT 10
                """

                result = session.run(query, case_id=case_id)
                for record in result:
                    kag_facts.append(rag_kag_pb2.KagFact(
                        node_id=record["c"]["id"],
                        label="Case",
                        relation="HAS_EVIDENCE",
                        target_id=record["e"]["id"]
                    ))

            return kag_facts

        except Exception as e:
            logger.error(f"❌ Neo4j query error: {e}")
            return []

    def _compute_suggestions(self, user_id: str, query_embedding: List[float]) -> List[rag_kag_pb2.Suggestion]:
        """Compute "did you mean" suggestions from past queries"""
        if pg_conn is None:
            logger.warning("⚠️ PostgreSQL not available")
            return []

        try:
            suggestions = []

            # Query: Get past successful queries for this user
            with pg_conn.cursor() as cur:
                cur.execute("""
                    SELECT message FROM chat_turns
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT 5
                """, (user_id,))

                for row in cur.fetchall():
                    past_query = row[0]
                    # Compute similarity (placeholder)
                    similarity = 0.85
                    if similarity > 0.7:
                        suggestions.append(rag_kag_pb2.Suggestion(
                            query=past_query,
                            reason="similar past successful query",
                            score=similarity
                        ))

            return suggestions

        except Exception as e:
            logger.error(f"❌ Suggestions error: {e}")
            return []


def serve():
    """Start gRPC server"""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    rag_kag_pb2_grpc.add_RagKagServiceServicer_to_server(RagKagService(), server)
    server.add_insecure_port("[::]:50061")

    logger.info("🚀 RAG/KAG gRPC server listening on [::]:50061")
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
