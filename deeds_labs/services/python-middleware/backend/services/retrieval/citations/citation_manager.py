"""Citation management system for multi-source retrieval."""

import logging
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

import aiohttp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Citation

logger = logging.getLogger(__name__)


class CitationManager:
    """Manages citation storage, verification, and retrieval."""

    def __init__(self, db_session: AsyncSession, qdrant_client, pg_pool):
        """Initialize CitationManager.

        Args:
            db_session: SQLAlchemy async session
            qdrant_client: Qdrant client for vector search
            pg_pool: PostgreSQL connection pool
        """
        self.db_session = db_session
        self.qdrant_client = qdrant_client
        self.pg_pool = pg_pool
        self.collection_name = "citations"

    async def save_citation(self, citation: Citation) -> str:
        """Save citation to database and vector store.

        Args:
            citation: Citation object to save

        Returns:
            Citation ID
        """
        try:
            # Generate ID if not present
            if not citation.id:
                citation.id = str(uuid4())

            # Store in PostgreSQL
            await self._store_in_postgres(citation)

            # Store in Qdrant if embedding available
            if citation.embedding:
                await self._store_in_qdrant(citation)

            logger.info(f"Saved citation: {citation.id}")
            return citation.id

        except Exception as e:
            logger.error(f"Error saving citation: {e}")
            raise

    async def _store_in_postgres(self, citation: Citation) -> None:
        """Store citation in PostgreSQL.

        Args:
            citation: Citation to store
        """
        try:
            async with self.pg_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO citations (
                        id, text, source_url, source_title,
                        context_before, context_after, confidence,
                        highlighted, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    citation.id,
                    citation.text,
                    citation.source_url,
                    citation.source_title,
                    citation.context_before,
                    citation.context_after,
                    citation.confidence,
                    citation.highlighted,
                    citation.timestamp,
                )
        except Exception as e:
            logger.error(f"Error storing citation in PostgreSQL: {e}")
            raise

    async def _store_in_qdrant(self, citation: Citation) -> None:
        """Store citation embedding in Qdrant.

        Args:
            citation: Citation with embedding
        """
        try:
            from qdrant_client.models import PointStruct

            point = PointStruct(
                id=hash(citation.id) % (2**31),
                vector=citation.embedding,
                payload={
                    "citation_id": citation.id,
                    "text": citation.text,
                    "source_url": citation.source_url,
                    "source_title": citation.source_title,
                    "confidence": citation.confidence,
                },
            )

            self.qdrant_client.upsert(
                collection_name=self.collection_name, points=[point]
            )
        except Exception as e:
            logger.error(f"Error storing citation in Qdrant: {e}")
            raise

    async def get_citations_for_result(self, result_id: str) -> List[Citation]:
        """Get all citations for a result.

        Args:
            result_id: Result ID

        Returns:
            List of citations
        """
        try:
            async with self.pg_pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT * FROM citations WHERE result_id = $1 ORDER BY created_at DESC",
                    result_id,
                )

                citations = []
                for row in rows:
                    citation = Citation(
                        id=row["id"],
                        text=row["text"],
                        source_url=row["source_url"],
                        source_title=row["source_title"],
                        context_before=row["context_before"],
                        context_after=row["context_after"],
                        confidence=row["confidence"],
                        timestamp=row["created_at"],
                        highlighted=row["highlighted"],
                    )
                    citations.append(citation)

                return citations
        except Exception as e:
            logger.error(f"Error retrieving citations: {e}")
            return []

    async def verify_citation(self, citation: Citation) -> bool:
        """Verify citation is still accessible at source.

        Args:
            citation: Citation to verify

        Returns:
            True if accessible, False otherwise
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(
                    citation.source_url, timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    is_accessible = response.status == 200

                    # Update verification timestamp
                    if is_accessible:
                        async with self.pg_pool.acquire() as conn:
                            await conn.execute(
                                "UPDATE citations SET verified_at = $1 WHERE id = $2",
                                datetime.now(),
                                citation.id,
                            )

                    return is_accessible
        except Exception as e:
            logger.error(f"Error verifying citation: {e}")
            return False

    async def highlight_citations(
        self, content: str, citations: List[Citation]
    ) -> str:
        """Highlight citations in content.

        Args:
            content: Original content
            citations: List of citations

        Returns:
            HTML content with highlighted citations
        """
        highlighted = content

        for citation in citations:
            if citation.highlighted:
                # Wrap citation text in HTML mark tag
                highlighted = highlighted.replace(
                    citation.text,
                    f'<mark class="citation" data-id="{citation.id}">{citation.text}</mark>',
                )

        return highlighted

    async def search_citations(
        self, query: str, top_k: int = 10
    ) -> List[Citation]:
        """Search citations by text similarity.

        Args:
            query: Search query
            top_k: Number of results

        Returns:
            List of similar citations
        """
        try:
            # Generate embedding for query
            embedding = await self._generate_embedding(query)

            if not embedding:
                return []

            # Search in Qdrant
            search_results = self.qdrant_client.search(
                collection_name=self.collection_name,
                query_vector=embedding,
                limit=top_k,
            )

            citations = []
            for result in search_results:
                citation_id = result.payload.get("citation_id")
                if citation_id:
                    # Retrieve full citation from PostgreSQL
                    async with self.pg_pool.acquire() as conn:
                        row = await conn.fetchrow(
                            "SELECT * FROM citations WHERE id = $1", citation_id
                        )

                        if row:
                            citation = Citation(
                                id=row["id"],
                                text=row["text"],
                                source_url=row["source_url"],
                                source_title=row["source_title"],
                                context_before=row["context_before"],
                                context_after=row["context_after"],
                                confidence=row["confidence"],
                                timestamp=row["created_at"],
                                highlighted=row["highlighted"],
                            )
                            citations.append(citation)

            return citations
        except Exception as e:
            logger.error(f"Error searching citations: {e}")
            return []

    async def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None
        """
        try:
            import aiohttp

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "http://localhost:11434/api/embed",
                    json={"model": "embeddinggemma", "input": text},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("embedding")
                    else:
                        logger.error(f"Embedding service error: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return None

    async def build_citation_network(
        self, citations: List[Citation]
    ) -> Dict:
        """Build citation network from citations.

        Args:
            citations: List of citations

        Returns:
            Citation network graph
        """
        network = {
            "nodes": [],
            "edges": [],
            "metadata": {
                "total_citations": len(citations),
                "unique_sources": len(set(c.source_url for c in citations)),
            },
        }

        # Add nodes
        for citation in citations:
            network["nodes"].append(
                {
                    "id": citation.id,
                    "label": citation.source_title,
                    "url": citation.source_url,
                    "confidence": citation.confidence,
                }
            )

        # Add edges (citations that reference each other)
        for i, citation1 in enumerate(citations):
            for citation2 in citations[i + 1 :]:
                if citation1.source_url == citation2.source_url:
                    network["edges"].append(
                        {
                            "source": citation1.id,
                            "target": citation2.id,
                            "type": "same_source",
                        }
                    )

        return network

    async def get_citation_stats(self) -> Dict:
        """Get citation statistics.

        Returns:
            Citation statistics
        """
        try:
            async with self.pg_pool.acquire() as conn:
                total = await conn.fetchval("SELECT COUNT(*) FROM citations")
                verified = await conn.fetchval(
                    "SELECT COUNT(*) FROM citations WHERE verified_at IS NOT NULL"
                )
                avg_confidence = await conn.fetchval(
                    "SELECT AVG(confidence) FROM citations"
                )

                return {
                    "total_citations": total,
                    "verified_citations": verified,
                    "average_confidence": avg_confidence or 0.0,
                    "verification_rate": (verified / total * 100) if total > 0 else 0,
                }
        except Exception as e:
            logger.error(f"Error getting citation stats: {e}")
            return {}
