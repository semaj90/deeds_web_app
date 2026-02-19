"""
Evidence Memory: Track evidence referenced in chat

Provides:
- Evidence tracking
- Relevance scoring
- Evidence clustering
- Timeline visualization
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class EvidenceReference:
    """Evidence reference in chat"""
    chunk_id: str
    doc_id: str
    relevance_score: float
    reference_count: int
    last_referenced: datetime


class EvidenceMemory:
    """Track evidence referenced in chat"""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        ttl_seconds: int = 86400,  # 24 hours
    ):
        self.redis_url = redis_url
        self.ttl_seconds = ttl_seconds
        self.redis_client: Optional[redis.Redis] = None

        logger.info(f"✅ Evidence Memory initialized")
        logger.info(f"   Redis: {redis_url}")
        logger.info(f"   TTL: {ttl_seconds}s")

    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis_client = await redis.from_url(self.redis_url)
            logger.info("✅ Connected to Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("✅ Disconnected from Redis")

    async def _ensure_connected(self):
        """Ensure connection is active"""
        if self.redis_client is None:
            await self.connect()

    async def add_evidence(
        self,
        case_id: str,
        chunk_id: str,
        doc_id: str,
        relevance_score: float,
    ) -> None:
        """Add evidence reference to memory"""
        try:
            await self._ensure_connected()

            key = f"evidence_memory:{case_id}:{chunk_id}"

            # Get current reference count
            current = await self.redis_client.hgetall(key)
            ref_count = int(current.get(b"reference_count", 0)) + 1

            # Update evidence reference
            await self.redis_client.hset(
                key,
                mapping={
                    "chunk_id": chunk_id,
                    "doc_id": doc_id,
                    "relevance_score": str(relevance_score),
                    "reference_count": str(ref_count),
                    "last_referenced": datetime.now().isoformat(),
                },
            )

            # Set expiration
            await self.redis_client.expire(key, self.ttl_seconds)

            logger.info(f"✅ Added evidence reference: {chunk_id} (count: {ref_count})")

        except Exception as e:
            logger.error(f"Error adding evidence reference: {e}")

    async def get_evidence(
        self,
        case_id: str,
        limit: int = 10,
    ) -> List[EvidenceReference]:
        """Get top referenced evidence"""
        try:
            await self._ensure_connected()

            # Get all evidence keys for case
            pattern = f"evidence_memory:{case_id}:*"
            keys = await self.redis_client.keys(pattern)

            evidence_list = []

            for key in keys:
                data = await self.redis_client.hgetall(key)

                if data:
                    evidence_list.append(
                        EvidenceReference(
                            chunk_id=data.get(b"chunk_id", b"").decode(),
                            doc_id=data.get(b"doc_id", b"").decode(),
                            relevance_score=float(data.get(b"relevance_score", 0)),
                            reference_count=int(data.get(b"reference_count", 0)),
                            last_referenced=datetime.fromisoformat(
                                data.get(b"last_referenced", b"").decode()
                            ),
                        )
                    )

            # Sort by reference count (descending)
            evidence_list.sort(key=lambda x: x.reference_count, reverse=True)

            # Return top N
            top_evidence = evidence_list[:limit]
            logger.info(f"✅ Retrieved {len(top_evidence)} evidence references")

            return top_evidence

        except Exception as e:
            logger.error(f"Error retrieving evidence: {e}")
            return []

    async def score_evidence(self, case_id: str) -> Dict[str, float]:
        """Score evidence by relevance and reference count"""
        try:
            evidence_list = await self.get_evidence(case_id, limit=100)

            scores = {}

            for evidence in evidence_list:
                # Score = (relevance * 0.6) + (reference_count / max_count * 0.4)
                max_count = max([e.reference_count for e in evidence_list], default=1)
                score = (evidence.relevance_score * 0.6) + (
                    evidence.reference_count / max_count * 0.4
                )

                scores[evidence.chunk_id] = score

            logger.info(f"✅ Scored {len(scores)} evidence items")
            return scores

        except Exception as e:
            logger.error(f"Error scoring evidence: {e}")
            return {}

    async def cluster_evidence(self, case_id: str) -> Dict[str, List[str]]:
        """Cluster evidence by topic (simplified)"""
        try:
            evidence_list = await self.get_evidence(case_id, limit=100)

            # Simple clustering by doc_id
            clusters = {}

            for evidence in evidence_list:
                doc_id = evidence.doc_id
                if doc_id not in clusters:
                    clusters[doc_id] = []
                clusters[doc_id].append(evidence.chunk_id)

            logger.info(f"✅ Clustered evidence into {len(clusters)} groups")
            return clusters

        except Exception as e:
            logger.error(f"Error clustering evidence: {e}")
            return {}

    async def get_timeline(self, case_id: str) -> List[Dict]:
        """Get evidence timeline"""
        try:
            evidence_list = await self.get_evidence(case_id, limit=100)

            # Sort by last referenced time
            evidence_list.sort(key=lambda x: x.last_referenced, reverse=True)

            timeline = [
                {
                    "chunk_id": e.chunk_id,
                    "doc_id": e.doc_id,
                    "timestamp": e.last_referenced.isoformat(),
                    "reference_count": e.reference_count,
                }
                for e in evidence_list
            ]

            logger.info(f"✅ Generated timeline with {len(timeline)} events")
            return timeline

        except Exception as e:
            logger.error(f"Error generating timeline: {e}")
            return []

    async def clear_evidence(self, case_id: str) -> int:
        """Clear all evidence for case"""
        try:
            await self._ensure_connected()

            pattern = f"evidence_memory:{case_id}:*"
            keys = await self.redis_client.keys(pattern)

            if keys:
                deleted = await self.redis_client.delete(*keys)
                logger.info(f"✅ Cleared {deleted} evidence references")
                return deleted
            else:
                logger.info("No evidence to clear")
                return 0

        except Exception as e:
            logger.error(f"Error clearing evidence: {e}")
            return 0

    async def close(self):
        """Close service"""
        await self.disconnect()
        logger.info("✅ Evidence Memory closed")


# Global evidence memory instance
evidence_memory: Optional[EvidenceMemory] = None


async def get_evidence_memory() -> EvidenceMemory:
    """Get or create evidence memory instance"""
    global evidence_memory

    if evidence_memory is None:
        evidence_memory = EvidenceMemory()
        await evidence_memory.connect()

    return evidence_memory


async def close_evidence_memory():
    """Close evidence memory"""
    global evidence_memory

    if evidence_memory:
        await evidence_memory.close()
        evidence_memory = None
