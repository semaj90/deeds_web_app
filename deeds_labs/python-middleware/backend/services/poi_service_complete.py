"""
Person of Interest (POI) Service - Complete Implementation
Handles POI CRUD operations, vector embeddings, and Qdrant integration
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import asyncpg

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
        return {
            "id": poi_id,
            "case_id": case_id,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **poi_data
        }

    async def get_poi(self, poi_id: str) -> Optional[Dict]:
        """Get a POI by ID"""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM persons_of_interest WHERE id = $1",
                poi_id
            )
        if row:
            poi_dict = dict(row)
            if 'embedding' in poi_dict and poi_dict['embedding'] is not None:
                poi_dict['embedding'] = poi_dict['embedding'].tolist() if hasattr(poi_dict['embedding'], 'tolist') else list(poi_dict['embedding'])
            return poi_dict
        return None

    async def list_pois(self, case_id: str, limit: int = 50, offset: int = 0) -> Tuple[List[Dict], int]:
        """List POIs for a case"""
        async with self.db_pool.acquire() as conn:
            count_row = await conn.fetchval(
                "SELECT COUNT(*) FROM persons_of_interest WHERE case_id = $1",
                case_id
            )

            rows = await conn.fetch(
                """
                SELECT * FROM persons_of_interest
                WHERE case_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                case_id, limit, offset
            )

        pois = []
        for row in rows:
            poi_dict = dict(row)
            if 'embedding' in poi_dict and poi_dict['embedding'] is not None:
                poi_dict['embedding'] = poi_dict['embedding'].tolist() if hasattr(poi_dict['embedding'], 'tolist') else list(poi_dict['embedding'])
            pois.append(poi_dict)

        return pois, count_row or 0

    async def update_poi(self, poi_id: str, poi_data: Dict) -> Optional[Dict]:
        """Update a POI"""
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
                poi_data.get('name'), poi_data.get('date_of_birth'),
                poi_data.get('email'), poi_data.get('phone'), poi_data.get('address'),
                poi_data.get('status'), poi_data.get('priority'), poi_data.get('threat_level'),
                poi_data.get('occupation'), poi_data.get('last_known_location'),
                poi_data.get('physical_description'), embedding, poi_id
            )

        await self.qdrant_service.update_poi(poi_id, poi_data, embedding)

        logger.info(f"Updated POI {poi_id}")
        return await self.get_poi(poi_id)

    async def delete_poi(self, poi_id: str) -> bool:
        """Delete a POI"""
        async with self.db_pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM persons_of_interest WHERE id = $1",
                poi_id
            )

        await self.qdrant_service.delete_poi(poi_id)

        logger.info(f"Deleted POI {poi_id}")
        return True

    async def add_associate(self, poi_id: str, associate_id: str, relationship_type: str, notes: Optional[str] = None) -> Dict:
        """Add a known associate to a POI"""
        associate_rel_id = str(uuid.uuid4())

        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO known_associates (id, poi_id, associate_id, relationship_type, notes)
                VALUES ($1, $2, $3, $4, $5)
                """,
                associate_rel_id, poi_id, associate_id, relationship_type, notes
            )

        logger.info(f"Added associate {associate_id} to POI {poi_id}")
        return {
            "id": associate_rel_id,
            "poi_id": poi_id,
            "associate_id": associate_id,
            "relationship_type": relationship_type,
            "notes": notes,
            "created_at": datetime.utcnow().isoformat()
        }

    async def list_associates(self, poi_id: str) -> List[Dict]:
        """List known associates for a POI"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT ka.*, poi.name as associate_name
                FROM known_associates ka
                LEFT JOIN persons_of_interest poi ON ka.associate_id = poi.id
                WHERE ka.poi_id = $1
                ORDER BY ka.created_at DESC
                """,
                poi_id
            )
        return [dict(row) for row in rows]

    async def remove_associate(self, poi_id: str, associate_id: str) -> bool:
        """Remove a known associate"""
        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                DELETE FROM known_associates
                WHERE poi_id = $1 AND associate_id = $2
                """,
                poi_id, associate_id
            )

        logger.info(f"Removed associate {associate_id} from POI {poi_id}")
        return True

    async def search_similar_pois(self, query_embedding: List[float], case_id: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """Search for similar POIs using vector similarity"""
        results = await self.qdrant_service.search_similar_pois(query_embedding, case_id, limit=limit)
        return results

    def _build_profile_text(self, poi_data: Dict) -> str:
        """Build text for embedding from POI data"""
        parts = [
            poi_data.get('name', ''),
            poi_data.get('occupation', ''),
            poi_data.get('physical_description', ''),
            poi_data.get('last_known_location', ''),
        ]
        return ' '.join(filter(None, parts))
