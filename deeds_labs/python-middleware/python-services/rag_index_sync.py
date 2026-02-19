#!/usr/bin/env python3
"""
RAG Index Sync Service

Maintains synchronization between:
- Evidence files and RAG index
- Citation tags and RAG search weights
- Embeddings and vector search

Handles:
- Adding evidence chunks to RAG index
- Updating RAG index when tags change
- Removing chunks when evidence deleted
- Regenerating embeddings
- Calculating tag-based weight boosts
"""

import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime

logger = logging.getLogger(__name__)


# ============================================================================
# RAG Index Sync Service
# ============================================================================

class RAGIndexSyncService:
    """Service for synchronizing RAG index with evidence and tags."""

    def __init__(self, db_client, embedding_service, search_service):
        """
        Initialize RAG index sync service.

        Args:
            db_client: Database client
            embedding_service: Embedding generation service
            search_service: Search service (PGVector + Elasticsearch)
        """
        self.db = db_client
        self.embedding_service = embedding_service
        self.search_service = search_service

    async def add_evidence_to_index(
        self,
        evidence_id: str,
        chunks: List[Dict[str, Any]],
        tags: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Add evidence chunks to RAG index with embeddings and tag metadata.

        Args:
            evidence_id: Evidence file ID
            chunks: List of chunks with content, page_number, section_title
            tags: Optional list of tag names

        Returns:
            Result with indexed chunk count
        """
        try:
            indexed_count = 0

            for chunk in chunks:
                # Generate embedding for chunk
                embedding = await self.embedding_service.embed(chunk["content"])

                # Calculate tag weight
                tag_weight = 1.0
                if tags:
                    # Get usage count for tags
                    tag_usage = await self._get_tag_usage_count(tags)
                    from validators import calculate_tag_weight
                    tag_weight = calculate_tag_weight(tag_usage)

                # Create RAG index metadata entry
                rag_metadata = {
                    "chunk_id": chunk["id"],
                    "evidence_id": evidence_id,
                    "tags": tags or [],
                    "tag_weight": tag_weight,
                    "jurisdiction": chunk.get("jurisdiction", "Other"),
                    "updated_at": datetime.utcnow().isoformat()
                }

                # Insert into database (pseudo-code)
                # await self.db.rag_index_metadata.insert(rag_metadata)

                # Add to search index (PGVector)
                await self.search_service.add_to_pgvector(
                    chunk_id=chunk["id"],
                    embedding=embedding,
                    metadata=rag_metadata
                )

                # Add to search index (Elasticsearch)
                await self.search_service.add_to_elasticsearch(
                    chunk_id=chunk["id"],
                    content=chunk["content"],
                    metadata=rag_metadata
                )

                indexed_count += 1

            logger.info(
                f"Added {indexed_count} chunks to RAG index for evidence {evidence_id}",
                extra={"evidence_id": evidence_id, "chunk_count": indexed_count}
            )

            return {
                "success": True,
                "evidence_id": evidence_id,
                "indexed_count": indexed_count,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to add evidence to RAG index: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def update_tags_in_index(
        self,
        evidence_id: str,
        tag_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Update RAG index when tags change for evidence.

        This recalculates tag weights and updates all chunks for the evidence.

        Args:
            evidence_id: Evidence file ID
            tag_ids: List of tag IDs

        Returns:
            Result with updated chunk count
        """
        try:
            # Get tag names (pseudo-code)
            # tags = await self.db.citation_tags.find({"id": {"$in": tag_ids}})
            # tag_names = [tag["name"] for tag in tags]
            tag_names = []

            # Get all chunks for evidence (pseudo-code)
            # chunks = await self.db.evidence_chunks.find({"evidence_id": evidence_id})
            chunks = []

            updated_count = 0

            for chunk in chunks:
                # Calculate new tag weight
                tag_weight = 1.0
                if tag_names:
                    tag_usage = await self._get_tag_usage_count(tag_names)
                    from validators import calculate_tag_weight
                    tag_weight = calculate_tag_weight(tag_usage)

                # Update RAG index metadata (pseudo-code)
                # await self.db.rag_index_metadata.updateOne(
                #     {"chunk_id": chunk["id"]},
                #     {
                #         "$set": {
                #             "tags": tag_names,
                #             "tag_weight": tag_weight,
                #             "updated_at": datetime.utcnow().isoformat()
                #         }
                #     },
                #     upsert=True
                # )

                # Update search indexes
                await self.search_service.update_metadata(
                    chunk_id=chunk["id"],
                    metadata={
                        "tags": tag_names,
                        "tag_weight": tag_weight,
                        "updated_at": datetime.utcnow().isoformat()
                    }
                )

                updated_count += 1

            logger.info(
                f"Updated {updated_count} chunks in RAG index for evidence {evidence_id}",
                extra={"evidence_id": evidence_id, "tag_count": len(tag_names)}
            )

            return {
                "success": True,
                "evidence_id": evidence_id,
                "updated_count": updated_count,
                "tag_count": len(tag_names),
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to update tags in RAG index: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def remove_evidence_from_index(
        self,
        evidence_id: str
    ) -> Dict[str, Any]:
        """
        Remove evidence chunks from RAG index when evidence is deleted.

        Args:
            evidence_id: Evidence file ID

        Returns:
            Result with removed chunk count
        """
        try:
            # Get all chunks for evidence (pseudo-code)
            # chunks = await self.db.evidence_chunks.find({"evidence_id": evidence_id})
            chunks = []

            removed_count = 0

            for chunk in chunks:
                # Remove from RAG index metadata (pseudo-code)
                # await self.db.rag_index_metadata.deleteOne({"chunk_id": chunk["id"]})

                # Remove from search indexes
                await self.search_service.remove_from_pgvector(chunk["id"])
                await self.search_service.remove_from_elasticsearch(chunk["id"])

                removed_count += 1

            logger.info(
                f"Removed {removed_count} chunks from RAG index for evidence {evidence_id}",
                extra={"evidence_id": evidence_id, "chunk_count": removed_count}
            )

            return {
                "success": True,
                "evidence_id": evidence_id,
                "removed_count": removed_count,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to remove evidence from RAG index: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def regenerate_embeddings(
        self,
        evidence_id: str
    ) -> Dict[str, Any]:
        """
        Regenerate embeddings for all chunks of evidence.

        Args:
            evidence_id: Evidence file ID

        Returns:
            Result with regenerated chunk count
        """
        try:
            # Get all chunks for evidence (pseudo-code)
            # chunks = await self.db.evidence_chunks.find({"evidence_id": evidence_id})
            chunks = []

            regenerated_count = 0

            for chunk in chunks:
                # Generate new embedding
                embedding = await self.embedding_service.embed(chunk["content"])

                # Update embedding in database (pseudo-code)
                # await self.db.evidence_embeddings.updateOne(
                #     {"chunk_id": chunk["id"]},
                #     {"$set": {"embedding": embedding, "updated_at": datetime.utcnow().isoformat()}},
                #     upsert=True
                # )

                # Update in search index
                await self.search_service.update_embedding(
                    chunk_id=chunk["id"],
                    embedding=embedding
                )

                regenerated_count += 1

            logger.info(
                f"Regenerated {regenerated_count} embeddings for evidence {evidence_id}",
                extra={"evidence_id": evidence_id, "chunk_count": regenerated_count}
            )

            return {
                "success": True,
                "evidence_id": evidence_id,
                "regenerated_count": regenerated_count,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to regenerate embeddings: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def update_tag_weight_on_summary_save(
        self,
        tag_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Update tag weights when a summary is saved (for auto-scaling).

        This increments usage_count for tags and recalculates weights.

        Args:
            tag_ids: List of tag IDs used in summary

        Returns:
            Result with updated tag count
        """
        try:
            updated_count = 0

            for tag_id in tag_ids:
                # Get existing tag (pseudo-code)
                # tag = await self.db.citation_tags.findOne({"id": tag_id})
                tag = None

                if not tag:
                    logger.warning(f"Tag {tag_id} not found")
                    continue

                # Increment usage count
                new_usage_count = tag.get("usage_count", 0) + 1

                # Calculate new weight
                from validators import calculate_tag_weight
                new_weight = calculate_tag_weight(new_usage_count)

                # Update tag (pseudo-code)
                # await self.db.citation_tags.updateOne(
                #     {"id": tag_id},
                #     {
                #         "$set": {
                #             "usage_count": new_usage_count,
                #             "updated_at": datetime.utcnow().isoformat()
                #         }
                #     }
                # )

                # Update all RAG index entries with this tag
                # rag_entries = await self.db.rag_index_metadata.find({"tags": tag["name"]})
                # for entry in rag_entries:
                #     await self.db.rag_index_metadata.updateOne(
                #         {"id": entry["id"]},
                #         {"$set": {"tag_weight": new_weight}}
                #     )

                updated_count += 1

            logger.info(
                f"Updated weights for {updated_count} tags on summary save",
                extra={"tag_count": updated_count}
            )

            return {
                "success": True,
                "updated_count": updated_count,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to update tag weights: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def _get_tag_usage_count(self, tag_names: List[str]) -> int:
        """
        Get total usage count for a list of tags.

        Args:
            tag_names: List of tag names

        Returns:
            Total usage count
        """
        try:
            # Query tags (pseudo-code)
            # tags = await self.db.citation_tags.find({"name": {"$in": tag_names}})
            # return sum(tag["usage_count"] for tag in tags)
            return 0

        except Exception as e:
            logger.error(f"Failed to get tag usage count: {e}")
            return 0


# ============================================================================
# Search Service Interface (Pseudo-code)
# ============================================================================

class SearchService:
    """Interface for search operations (PGVector + Elasticsearch)."""

    async def add_to_pgvector(
        self,
        chunk_id: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """Add chunk to PGVector index."""
        pass

    async def add_to_elasticsearch(
        self,
        chunk_id: str,
        content: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """Add chunk to Elasticsearch index."""
        pass

    async def update_metadata(
        self,
        chunk_id: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """Update metadata for chunk in both indexes."""
        pass

    async def update_embedding(
        self,
        chunk_id: str,
        embedding: List[float]
    ) -> bool:
        """Update embedding in PGVector index."""
        pass

    async def remove_from_pgvector(self, chunk_id: str) -> bool:
        """Remove chunk from PGVector index."""
        pass

    async def remove_from_elasticsearch(self, chunk_id: str) -> bool:
        """Remove chunk from Elasticsearch index."""
        pass


# ============================================================================
# Export
# ============================================================================

__all__ = ["RAGIndexSyncService", "SearchService"]

