"""
Person of Interest (POI) Service
Handles POI CRUD operations, vector embeddings, and Qdrant integration
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import asyncpg
import numpy as np

logger = logging.getLogger(__name__)


class POIService:
    """Service for managing Persons of Interest"""

    def __init__(self, db_pool: asyncpg.Pool, embedding_service, qdrant_service):
        self.db_pool = db_pool
        self.embedding_service = embedding_service
        self.qdrant_service = qdrant_service

    async def create_poi(self, case_id: str, poi_data: Dict) -> Dict:
        """Create a new Person of Interest"""
        poi_id = str(uuid.uuid4())

        # Generate embedding from profile text
        profile_text = self._build_profile_text(poi_data)
        embedding = await self.embedding_service.generate_embedding(profile_text)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO persons_of_interest
                (id, case_id, name, date_of_birth, email, phone, address,
                 status, priority, threat_level, occupation, last_known_location,
                 physical_description, embedding)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                """,
                poi_id, case_id, poi_data['name'], poi_data.get('date_of_birth'),
                poi_data.get('email'), poi_data.get('phone'), poi_data.get('address'),
                poi_data['status'], poi_data['priority'], poi_data['threat_level'],
                poi_data.get('occupation'), poi_data.get('last_known_location'),
                poi_data.get('physical_description'), embedding
            )

        # Index in Qdrant
        await self.qdrant_service.index_poi(poi_id, poi_data, embedding)

        logger.info(f"Created POI {poi_id} for case {case_id}")
        return {"id": poi_id, "case_id": case_id, **poi_data}

    async def get_poi(self, poi_id: str) -> Optional[Dict]:
        """Get a POI by ID"""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM persons_of_interest WHERE id = $1",
                poi_id
            )
        return dict(row) if row else None

    async def list_pois(self, case_id: str, limit: int = 50, offset: int = 0) -> List[Dict]:
        """List POIs for a case"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM persons_of_interest
                WHERE case_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                case_id, limit, offset
            )
        return [dict(row) for row in rows]

    async def update_poi(self, poi_id: str, poi_data: Dict) -> Dict:
        """Update a POI"""
        # Regenerate embedding if profile changed
        profile_text = self._build_profile_text(poi_data)
        embedding = await self.embedding_service.generate_embedding(profile_text)

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE persons_of_interest
                SET name = $1, date_of_birth = $2, email = $3, phone = $4,
                    address = $5, status = $6, priority = $7, threat_level = $8,
                    occupation = $9, last_known_location = $10,
                    physical_description = $11, embedding = $12, updated_at = NOW()
                WHERE id = $13
                """,
                poi_data['name'], poi_data.get('date_of_birth'),
                poi_data.get('email'), poi_data.get('phone'), poi_data.get('address'),
                poi_data['status'], poi_data['priority'], poi_data['threat_level'],
                poi_data.get('occupation'), poi_data.get('last_known_location'),
                poi_data.get('physical_description'), embedding, poi_id
            )

        # Update in Qdrant
        await self.qdrant_service.update_poi(poi_id, poi_data, embedding)

        logger.info(f"Updated POI {poi_id}")
        return await self.get_poi(poi_id)

    async def delete_poi(self, poi_id: str) -> bool:
        """Delete a POI"""
        async with self.db_pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM persons_of_interest WHERE id = $1",
                poi_id
            )

        # Remove from Qdrant
        await self.qdrant_service.delete_poi(poi_id)

        logger.info(f"Deleted POI {poi_id}")
        return True

    def _build_profile_text(self, poi_data: Dict) -> str:
        """Build text for embedding from POI data"""
        parts = [
            poi_data.get('name', ''),
            poi_data.get('occupation', ''),
            poi_data.get('physical_description', ''),
            poi_data.get('last_known_location', ''),
        ]
        return ' '.join(filter(None, parts))
