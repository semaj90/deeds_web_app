"""
Search Service: Semantic search with Qdrant and result retrieval from MinIO

Provides:
- Query embedding generation (Gemma-3b)
- Qdrant semantic search (top-50)
- Result retrieval from MinIO
- Latency tracking and logging
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
from datetime import datetime

import torch
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, Range
from minio import Minio
from minio.error import S3Error
from io import BytesIO
from transformers import AutoTokenizer, AutoModel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class RankedResult:
    """Search result with ranking"""
    rank: int
    chunk_id: str
    doc_id: str
    text: str
    relevance_score: float
    page: int
    bounding_boxes: List[Dict]
    semantic_type: str
    metadata: Dict


@dataclass
class SearchResult:
    """Complete search result"""
    search_id: str
    query: str
    results: List[RankedResult]
    total_results: int
    latency_ms: int
    cached: bool
    timestamp: datetime


class SearchService:
    """Semantic search service with Qdrant and MinIO"""

    def __init__(
        self,
        qdrant_url: str = "http://localhost:6333",
        qdrant_api_key: Optional[str] = None,
        minio_endpoint: str = "localhost:9000",
        minio_access_key: str = "minio",
        minio_secret_key: str = "minio123",
        minio_bucket: str = "legal-evidence",
        embedding_model: str = "google/gemma-2b-it",
        collection_name: str = "evidence_chunks",
    ):
        self.qdrant_url = qdrant_url
        self.qdrant_api_key = qdrant_api_key
        self.minio_endpoint = minio_endpoint
        self.minio_access_key = minio_access_key
        self.minio_secret_key = minio_secret_key
        self.minio_bucket = minio_bucket
        self.embedding_model = embedding_model
        self.collection_name = collection_name

        # Initialize clients
        self.qdrant_client = AsyncQdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key,
        )

        # Initialize MinIO
        endpoint = minio_endpoint.replace("http://", "").replace("https://", "")
        self.minio = Minio(
            endpoint,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            secure=False,
        )

        # Load embedding model
        logger.info(f"Loading embedding model: {embedding_model}")
        self.tokenizer = AutoTokenizer.from_pretrained(embedding_model)
        self.model = AutoModel.from_pretrained(embedding_model)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        self.model.eval()

        logger.info(f"✅ Search Service initialized")
        logger.info(f"   Qdrant: {qdrant_url}")
        logger.info(f"   MinIO: {minio_endpoint}")
        logger.info(f"   Embedding Model: {embedding_model}")
        logger.info(f"   Device: {self.device}")

    def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using Gemma3-2b"""
        try:
            # Tokenize
            inputs = self.tokenizer(
                text,
                max_length=512,
                truncation=True,
                padding=True,
                return_tensors="pt",
            )

            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Generate embedding
            with torch.no_grad():
                outputs = self.model(**inputs)
                # Use mean pooling
                embeddings = outputs.last_hidden_state.mean(dim=1)

            # Convert to list
            embedding = embeddings[0].cpu().tolist()
            return embedding

        except Exception as e:
            logger.error(f"Embedding generation error: {e}")
            raise

    async def search(
        self,
        query: str,
        top_k: int = 50,
        filters: Optional[Dict] = None,
    ) -> List[RankedResult]:
        """Search for similar chunks in Qdrant"""
        start_time = time.time()

        try:
            # Generate query embedding
            logger.info(f"Generating embedding for query: {query[:50]}...")
            query_embedding = self._generate_embedding(query)

            # Build Qdrant filter
            qdrant_filter = None
            if filters:
                conditions = []

                if "jurisdiction" in filters:
                    conditions.append(
                        FieldCondition(
                            key="metadata.jurisdiction",
                            match=MatchValue(value=filters["jurisdiction"]),
                        )
                    )

                if "statute" in filters:
                    conditions.append(
                        FieldCondition(
                            key="metadata.statute",
                            match=MatchValue(value=filters["statute"]),
                        )
                    )

                if "date_range" in filters:
                    date_range = filters["date_range"]
                    if len(date_range) == 2:
                        conditions.append(
                            FieldCondition(
                                key="metadata.date",
                                range=Range(
                                    gte=date_range[0],
                                    lte=date_range[1],
                                ),
                            )
                        )

                if conditions:
                    qdrant_filter = Filter(must=conditions)

            # Search Qdrant
            logger.info(f"Searching Qdrant for top-{top_k} results...")
            search_results = await self.qdrant_client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=qdrant_filter,
                limit=top_k,
                with_payload=True,
            )

            # Retrieve full chunk metadata from MinIO
            logger.info(f"Retrieving metadata for {len(search_results)} results...")
            results = []

            for rank, result in enumerate(search_results, 1):
                try:
                    chunk_id = result.payload.get("chunk_id")
                    doc_id = result.payload.get("doc_id")

                    # Fetch chunk metadata from MinIO
                    chunk_path = f"evidence/{doc_id}/chunks/{chunk_id}.json"
                    response = self.minio.get_object(self.minio_bucket, chunk_path)
                    chunk_data = json.loads(response.read().decode())
                    response.close()

                    ranked_result = RankedResult(
                        rank=rank,
                        chunk_id=chunk_id,
                        doc_id=doc_id,
                        text=chunk_data.get("text", ""),
                        relevance_score=result.score,
                        page=chunk_data.get("page", 0),
                        bounding_boxes=chunk_data.get("bounding_boxes", []),
                        semantic_type=chunk_data.get("semantic_type", "text"),
                        metadata=chunk_data.get("metadata", {}),
                    )

                    results.append(ranked_result)
                    logger.debug(f"  ✅ Retrieved chunk {chunk_id}")

                except Exception as e:
                    logger.warning(f"  ⚠️ Error retrieving chunk {chunk_id}: {e}")
                    continue

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info(f"✅ Search completed in {latency_ms}ms ({len(results)} results)")

            return results

        except Exception as e:
            logger.error(f"Search error: {e}")
            raise

    async def search_with_metadata(
        self,
        query: str,
        top_k: int = 50,
        filters: Optional[Dict] = None,
    ) -> SearchResult:
        """Search and return SearchResult with metadata"""
        search_id = f"search_{int(time.time() * 1000)}"
        start_time = time.time()

        try:
            results = await self.search(query, top_k, filters)

            latency_ms = int((time.time() - start_time) * 1000)

            return SearchResult(
                search_id=search_id,
                query=query,
                results=results,
                total_results=len(results),
                latency_ms=latency_ms,
                cached=False,
                timestamp=datetime.now(),
            )

        except Exception as e:
            logger.error(f"Search with metadata error: {e}")
            raise

    async def get_chunk_details(self, doc_id: str, chunk_id: str) -> Optional[Dict]:
        """Get full chunk details from MinIO"""
        try:
            chunk_path = f"evidence/{doc_id}/chunks/{chunk_id}.json"
            response = self.minio.get_object(self.minio_bucket, chunk_path)
            chunk_data = json.loads(response.read().decode())
            response.close()
            return chunk_data

        except S3Error as e:
            logger.error(f"Error retrieving chunk {chunk_id}: {e}")
            return None

    async def get_related_chunks(
        self,
        doc_id: str,
        chunk_id: str,
        limit: int = 5,
    ) -> List[Dict]:
        """Get related chunks from same document"""
        try:
            # List all chunks for document
            objects = self.minio.list_objects(
                self.minio_bucket,
                prefix=f"evidence/{doc_id}/chunks/",
            )

            related_chunks = []
            for obj in objects:
                if obj.object_name.endswith(".json"):
                    try:
                        response = self.minio.get_object(self.minio_bucket, obj.object_name)
                        chunk_data = json.loads(response.read().decode())
                        response.close()

                        if chunk_data.get("id") != chunk_id:
                            related_chunks.append(chunk_data)

                        if len(related_chunks) >= limit:
                            break

                    except Exception as e:
                        logger.warning(f"Error reading chunk {obj.object_name}: {e}")
                        continue

            return related_chunks

        except Exception as e:
            logger.error(f"Error getting related chunks: {e}")
            return []

    async def close(self):
        """Close connections"""
        await self.qdrant_client.close()
        logger.info("✅ Search Service closed")


# Global service instance
search_service: Optional[SearchService] = None


async def get_search_service() -> SearchService:
    """Get or create search service instance"""
    global search_service

    if search_service is None:
        search_service = SearchService()

    return search_service


async def close_search_service():
    """Close search service"""
    global search_service

    if search_service:
        await search_service.close()
        search_service = None
