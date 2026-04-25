#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Enhanced Tag Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Create and manage enhanced Qdrant tags with embeddings and AI summaries
Task: 5.2 - Implement tag creation pipeline
Task: 5.3 - Implement tag update mechanism
═══════════════════════════════════════════════════════════════════════
"""

import os
import uuid
import logging
import asyncio
import aiohttp
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

from backend.services.multi_db_coordinator import (
    MultiDBCoordinator,
    DatabaseType,
    Transaction
)
from backend.services.change_propagate_service import (
    ChangePropagateService,
    ChangeEvent,
    ChangeType
)
from backend.services.ai_analysis_service import AIAnalysisService
from backend.services.pattern_search_service import Pattern
from backend.services.comment_extraction_service import Comment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EnhancedQdrantTag:
    """Enhanced Qdrant Tag with embedding and AI summary."""
    id: str
    name: str
    category: str  # 'file', 'function', 'component', 'error', 'pattern'
    embedding: List[float]  # 384-dim vector from embeddinggemma
    summary: str  # AI-generated summary from gemma3-legal
    metadata: Dict[str, Any]
    timestamp: str  # ISO 8601
    cluster_id: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None  # {x, y, z}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'embedding': self.embedding,
            'summary': self.summary,
            'metadata': self.metadata,
            'timestamp': self.timestamp,
            'cluster_id': self.cluster_id,
            'coordinates': self.coordinates,
        }


class EnhancedTagService:
    """
    Enhanced Tag Service - Create and manage enhanced Qdrant tags.

    Features:
    - Generate embeddings with CUDA (embeddinggemma)
    - Create AI summary with gemma3-legal
    - Store in all databases atomically using MultiDBCoordinator
    - Update tags with change propagation
    """

    def __init__(
        self,
        coordinator: MultiDBCoordinator,
        ai_service: Optional[AIAnalysisService] = None,
        ollama_url: Optional[str] = None,
    ):
        """Initialize enhanced tag service."""
        self.coordinator = coordinator
        self.ai_service = ai_service or AIAnalysisService(ollama_url=ollama_url)
        self.change_service = ChangePropagateService(coordinator)
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "embeddinggemma:latest")
        logger.info("🏷️  EnhancedTagService initialized")

    async def create_tag(
        self,
        name: str,
        category: str,
        file_path: str,
        text_content: str,
        patterns: Optional[List[Pattern]] = None,
        comments: Optional[List[Comment]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> EnhancedQdrantTag:
        """
        Create an enhanced Qdrant tag with embedding and AI summary.

        Args:
            name: Tag name
            category: Tag category ('file', 'function', 'component', 'error', 'pattern')
            file_path: File path
            text_content: Text content to embed
            patterns: Optional list of Pattern objects
            comments: Optional list of Comment objects
            metadata: Optional metadata dictionary

        Returns:
            EnhancedQdrantTag object
        """
        logger.info(f"🏷️  Creating enhanced tag: {name} ({category})")

        # Generate embedding with CUDA
        embedding = await self._generate_embedding(text_content)

        # Generate AI summary with gemma3-legal
        summary = await self._generate_summary(text_content, patterns, comments)

        # Create tag object
        tag = EnhancedQdrantTag(
            id=str(uuid.uuid4()),
            name=name,
            category=category,
            embedding=embedding,
            summary=summary,
            metadata={
                'filePath': file_path,
                **(metadata or {})
            },
            timestamp=datetime.now().isoformat(),
        )

        # Store in all databases atomically
        success = await self._store_tag_atomic(tag)

        if success:
            logger.info(f"✅ Tag created successfully: {tag.id}")
        else:
            logger.error(f"❌ Tag creation failed: {tag.id}")
            raise Exception(f"Failed to create tag: {tag.id}")

        return tag

    async def update_tag_summary(
        self,
        tag_id: str,
        new_summary: str
    ) -> bool:
        """
        Update tag summary and propagate changes.

        Args:
            tag_id: Tag ID
            new_summary: New summary text

        Returns:
            True if update succeeded
        """
        logger.info(f"🏷️  Updating tag summary: {tag_id}")

        # Fetch existing tag
        tag = await self._fetch_tag(tag_id)
        if not tag:
            logger.error(f"❌ Tag not found: {tag_id}")
            return False

        # Create change event
        event = ChangeEvent(
            change_type=ChangeType.TAG_UPDATED,
            entity_id=tag_id,
            entity_type='tag',
            old_data=tag.to_dict(),
            new_data={
                **tag.to_dict(),
                'summary': new_summary,
                'timestamp': datetime.now().isoformat(),
            },
        )

        # Propagate change
        success = await self.change_service.propagate_change(event)

        if success:
            logger.info(f"✅ Tag summary updated: {tag_id}")
        else:
            logger.error(f"❌ Tag summary update failed: {tag_id}")

        return success

    async def update_tag_cluster(
        self,
        tag_id: str,
        cluster_id: str
    ) -> bool:
        """
        Update tag cluster assignment and propagate changes.

        Args:
            tag_id: Tag ID
            cluster_id: Cluster ID

        Returns:
            True if update succeeded
        """
        logger.info(f"🏷️  Updating tag cluster: {tag_id} → {cluster_id}")

        # Fetch existing tag
        tag = await self._fetch_tag(tag_id)
        if not tag:
            logger.error(f"❌ Tag not found: {tag_id}")
            return False

        # Create change event
        event = ChangeEvent(
            change_type=ChangeType.CLUSTER_UPDATED,
            entity_id=tag_id,
            entity_type='tag',
            old_data=tag.to_dict(),
            new_data={
                **tag.to_dict(),
                'cluster_id': cluster_id,
                'timestamp': datetime.now().isoformat(),
            },
        )

        # Propagate change
        success = await self.change_service.propagate_change(event)

        if success:
            logger.info(f"✅ Tag cluster updated: {tag_id}")
        else:
            logger.error(f"❌ Tag cluster update failed: {tag_id}")

        return success

    async def update_tag_coordinates(
        self,
        tag_id: str,
        coordinates: Dict[str, float]
    ) -> bool:
        """
        Update tag coordinates and cache in Redis.

        Args:
            tag_id: Tag ID
            coordinates: Coordinates dictionary {x, y, z}

        Returns:
            True if update succeeded
        """
        logger.info(f"🏷️  Updating tag coordinates: {tag_id}")

        # Validate coordinates
        if not all(k in coordinates for k in ['x', 'y', 'z']):
            logger.error(f"❌ Invalid coordinates: {coordinates}")
            return False

        # Cache coordinates in Redis
        cache_key = f"kb:v2:coordinates:{tag_id}"
        cache_value = {
            'x': coordinates['x'],
            'y': coordinates['y'],
            'z': coordinates['z'],
            'timestamp': datetime.now().isoformat(),
        }

        try:
            self.coordinator.redis_cache.set(
                cache_key,
                cache_value,
                ttl=86400  # 24 hours
            )
            logger.info(f"✅ Tag coordinates cached: {tag_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to cache coordinates: {e}")
            return False

    async def _generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding with CUDA (embeddinggemma).

        Args:
            text: Text to embed

        Returns:
            384-dim embedding vector
        """
        logger.info(f"🧮 Generating embedding (length: {len(text)} chars)")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/embeddings",
                    json={
                        "model": self.embedding_model,
                        "prompt": text,
                    },
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"Embedding API error: {error_text}")

                    data = await response.json()
                    embedding = data.get("embedding", [])

                    if len(embedding) not in [384, 768]:
                        raise Exception(f"Invalid embedding dimension: {len(embedding)}")

                    logger.info(f"✅ Embedding generated: {len(embedding)} dims")
                    return embedding

        except Exception as e:
            logger.error(f"❌ Embedding generation failed: {e}")
            # Return zero vector as fallback (768-dim for embeddinggemma)
            return [0.0] * 768

    async def _generate_summary(
        self,
        text: str,
        patterns: Optional[List[Pattern]] = None,
        comments: Optional[List[Comment]] = None
    ) -> str:
        """
        Generate AI summary with gemma3-legal.

        Args:
            text: Text to summarize
            patterns: Optional list of Pattern objects
            comments: Optional list of Comment objects

        Returns:
            Summary string
        """
        logger.info(f"🤖 Generating AI summary")

        try:
            if patterns:
                # Use AI analysis service for pattern-based summary
                summary = await self.ai_service.generate_summary(patterns, max_length=200)
            else:
                # Generate simple summary from text
                prompt = f"Summarize this code in 200 characters or less:\n\n{text[:1000]}"

                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{self.ollama_url}/api/generate",
                        json={
                            "model": "gemma3-legal:latest",
                            "prompt": prompt,
                            "stream": False,
                            "options": {
                                "temperature": 0.7,
                            }
                        },
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            raise Exception(f"Summary API error: {error_text}")

                        data = await response.json()
                        summary = data.get("response", "").strip()

            logger.info(f"✅ Summary generated: {len(summary)} chars")
            return summary[:200]  # Limit to 200 chars

        except Exception as e:
            logger.error(f"❌ Summary generation failed: {e}")
            # Return fallback summary
            return f"Code in {text[:50]}..."

    async def _store_tag_atomic(self, tag: EnhancedQdrantTag) -> bool:
        """
        Store tag in all databases atomically using MultiDBCoordinator.

        Args:
            tag: EnhancedQdrantTag object

        Returns:
            True if storage succeeded
        """
        logger.info(f"💾 Storing tag atomically: {tag.id}")

        # Create change event
        event = ChangeEvent(
            change_type=ChangeType.TAG_CREATED,
            entity_id=tag.id,
            entity_type='tag',
            new_data=tag.to_dict(),
        )

        # Propagate change (this handles atomic storage)
        success = await self.change_service.propagate_change(event)

        return success

    async def _fetch_tag(self, tag_id: str) -> Optional[EnhancedQdrantTag]:
        """
        Fetch tag from PostgreSQL.

        Args:
            tag_id: Tag ID

        Returns:
            EnhancedQdrantTag object or None
        """
        try:
            cursor = self.coordinator.pg_conn.cursor()
            cursor.execute(
                """
                SELECT id, name, category, file_path, summary, timestamp, cluster_id
                FROM enhanced_tags
                WHERE id = %s
                """,
                (tag_id,)
            )
            row = cursor.fetchone()

            if not row:
                return None

            # Fetch embedding from Qdrant
            embedding = await self._fetch_embedding_from_qdrant(tag_id)

            # Fetch coordinates from Redis
            coordinates = await self._fetch_coordinates_from_redis(tag_id)

            tag = EnhancedQdrantTag(
                id=row[0],
                name=row[1],
                category=row[2],
                embedding=embedding,
                summary=row[4],
                metadata={'filePath': row[3]},
                timestamp=row[5].isoformat() if row[5] else datetime.now().isoformat(),
                cluster_id=row[6],
                coordinates=coordinates,
            )

            return tag

        except Exception as e:
            logger.error(f"❌ Failed to fetch tag: {e}")
            return None

    async def _fetch_embedding_from_qdrant(self, tag_id: str) -> List[float]:
        """Fetch embedding from Qdrant."""
        try:
            result = self.coordinator.qdrant_client.retrieve(
                collection_name="knowledge_base_v2",
                ids=[tag_id],
                with_vectors=True
            )
            if result and len(result) > 0:
                return result[0].vector
        except Exception as e:
            logger.error(f"❌ Failed to fetch embedding: {e}")

        return [0.0] * 768

    async def _fetch_coordinates_from_redis(self, tag_id: str) -> Optional[Dict[str, float]]:
        """Fetch coordinates from Redis."""
        try:
            cache_key = f"kb:v2:coordinates:{tag_id}"
            cached = self.coordinator.redis_cache.get(cache_key)
            if cached:
                return {
                    'x': cached['x'],
                    'y': cached['y'],
                    'z': cached['z'],
                }
        except Exception as e:
            logger.error(f"❌ Failed to fetch coordinates: {e}")

        return None


# Example usage
async def example_usage():
    """Example of using the EnhancedTagService."""
    coordinator = MultiDBCoordinator()
    coordinator.connect()

    service = EnhancedTagService(coordinator)

    # Create a file tag
    tag = await service.create_tag(
        name="tag_service.ts",
        category="file",
        file_path="backend/services/tag_service.ts",
        text_content="export class TagService { ... }",
        metadata={
            'lineNumber': 1,
            'astNodeType': 'ClassDeclaration',
        }
    )

    print(f"\n✅ Tag created:")
    print(f"   ID: {tag.id}")
    print(f"   Name: {tag.name}")
    print(f"   Category: {tag.category}")
    print(f"   Summary: {tag.summary}")
    print(f"   Embedding dims: {len(tag.embedding)}")

    # Update summary
    success = await service.update_tag_summary(
        tag.id,
        "Enhanced tag service for managing Qdrant tags with AI summaries"
    )
    print(f"\n✅ Summary updated: {success}")

    # Update cluster
    cluster_id = str(uuid.uuid4())
    success = await service.update_tag_cluster(tag.id, cluster_id)
    print(f"✅ Cluster updated: {success}")

    # Update coordinates
    success = await service.update_tag_coordinates(
        tag.id,
        {'x': 0.123, 'y': 0.456, 'z': 0.789}
    )
    print(f"✅ Coordinates updated: {success}")

    coordinator.disconnect()


if __name__ == "__main__":
    asyncio.run(example_usage())
