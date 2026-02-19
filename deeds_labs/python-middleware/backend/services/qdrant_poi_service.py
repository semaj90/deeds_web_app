"""
Qdrant POI Service
Handles vector indexing and semantic search for Persons of Interest
"""

import logging
from typing import Dict, List, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams

logger = logging.getLogger(__name__)


class QdrantPOIService:
    """Service for managing POI vectors in Qdrant"""

    def __init__(self, qdrant_url: str = "http://localhost:6333"):
        self.client = QdrantClient(url=qdrant_url)
        self.collection_name = "persons_of_interest"
        self._ensure_collection()

    def _ensure_collection(self):
        """Ensure the POI collection exists"""
        try:
            self.client.get_collection(self.collection_name)
        except Exception:
            logger.info(f"Creating collection {self.collection_name}")
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )

    async def index_poi(self, poi_id: str, poi_data: Dict, embedding: List[float]):
        """Index a POI in Qdrant"""
        point = PointStruct(
            id=hash(poi_id) % (2**63),
            vector=embedding,
            payload={
                "poi_id": poi_id,
                "case_id": poi_data.get("case_id"),
                "name": poi_data.get("name"),
                "status": poi_data.get("status"),
                "priority": poi_data.get("priority"),
                "threat_level": poi_data.get("threat_level"),
                "occupation": poi_data.get("occupation"),
                "last_known_location": poi_data.get("last_known_location"),
            }
        )

        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )
        logger.info(f"Indexed POI {poi_id} in Qdrant")

    async def update_poi(self, poi_id: str, poi_data: Dict, embedding: List[float]):
        """Update a POI in Qdrant"""
        await self.index_poi(poi_id, poi_data, embedding)

    async def delete_poi(self, poi_id: str):
        """Delete a POI from Qdrant"""
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector={"ids": [hash(poi_id) % (2**63)]}
            )
            logger.info(f"Deleted POI {poi_id} from Qdrant")
        except Exception as e:
            logger.error(f"Error deleting POI {poi_id}: {e}")

    async def search_similar_pois(
        self,
        query_embedding: List[float],
        case_id: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict]:
        """Search for similar POIs"""
        filters = None
        if case_id or status or priority:
            conditions = []
            if case_id:
                conditions.append({"key": "case_id", "match": {"value": case_id}})
            if status:
                conditions.append({"key": "status", "match": {"value": status}})
            if priority:
                conditions.append({"key": "priority", "match": {"value": priority}})

            if conditions:
                filters = {"must": conditions} if len(conditions) > 1 else conditions[0]

        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=filters,
            limit=limit,
            with_payload=True
        )

        return [
            {
                "poi_id": result.payload["poi_id"],
                "name": result.payload["name"],
                "status": result.payload["status"],
                "priority": result.payload["priority"],
                "threat_level": result.payload["threat_level"],
                "similarity_score": result.score
            }
            for result in results
        ]
