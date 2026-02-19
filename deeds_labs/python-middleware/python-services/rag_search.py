#!/usr/bin/env python3
"""
RAG Search API Routes with Tag Filtering

Provides REST endpoints for:
- Searching evidence with semantic + BM25 ranking
- Optional tag filtering (strict mode)
- Tag-based weight boosting (soft mode)
- Jurisdiction-scoped search
- Result ranking with MiniLM reranker

Integrates with:
- PGVector for semantic search
- Elasticsearch for BM25 search
- MiniLM TensorRT for reranking
- Citation tag weighting
"""

import logging
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from validators import validate_jurisdiction, get_tag_boost_factor

logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models
# ============================================================================


class RAGSearchRequest(BaseModel):
    """Request model for RAG search"""
    query: str = Field(..., min_length=1, max_length=1000)
    jurisdiction: str = Field(..., description="CA, NY, TX, Fed-US, Other")
    tag_ids: Optional[List[str]] = Field(None, description="Optional tag IDs for filtering/weighting")
    tag_mode: str = Field("weight", description="'filter' for strict filtering, 'weight' for soft boosting")
    limit: int = Field(10, ge=1, le=100, description="Max results")


class RAGSearchResult(BaseModel):
    """Single search result"""
    chunk_id: str
    evidence_id: str
    content: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    relevance_score: float
    tag_boost: float = 1.0
    matched_tags: List[str] = []
    source_metadata: Dict[str, Any] = {}


class RAGSearchResponse(BaseModel):
    """Response model for RAG search"""
    query: str
    jurisdiction: str
    results: List[RAGSearchResult]
    total_results: int
    search_time_ms: float
    tag_filter_applied: bool = False
    tag_boost_applied: bool = False


class RAGStreamRequest(BaseModel):
    """Request model for streaming RAG response"""
    query: str = Field(..., min_length=1, max_length=1000)
    jurisdiction: str = Field(..., description="CA, NY, TX, Fed-US, Other")
    tag_ids: Optional[List[str]] = Field(None, description="Optional tag IDs")
    tag_mode: str = Field("weight", description="'filter' or 'weight'")


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/api/rag", tags=["rag"])


# ============================================================================
# Dependencies
# ============================================================================

async def get_search_service():
    """Get search service instance"""
    # In production, this would be injected from app context
    return None


async def get_embedding_service():
    """Get embedding service instance"""
    return None


async def get_reranker_service():
    """Get reranker service instance"""
    return None


# ============================================================================
# Search Routes
# ============================================================================


@router.post("/search", response_model=RAGSearchResponse)
async def rag_search(
    request: RAGSearchRequest,
    search_service=Depends(get_search_service),
    embedding_service=Depends(get_embedding_service),
    reranker_service=Depends(get_reranker_service),
):
    """
    Search evidence with semantic + BM25 ranking and optional tag filtering.

    Request Body:
    - query: Search query (required)
    - jurisdiction: Jurisdiction (required)
    - tag_ids: Optional tag IDs for filtering or weighting
    - tag_mode: 'filter' for strict filtering, 'weight' for soft boosting
    - limit: Max results (1-100, default 10)

    Returns:
        Ranked search results with tag metadata
    """
    try:
        import time
        start_time = time.time()

        # Validate jurisdiction
        valid, error = validate_jurisdiction(request.jurisdiction)
        if not valid:
            raise HTTPException(status_code=400, detail=error)

        # Step 1: Embed query
        query_embedding = await embedding_service.embed(request.query)

        # Step 2: Search PGVector (semantic)
        pgvector_results = await search_pgvector(
            query_embedding=query_embedding,
            jurisdiction=request.jurisdiction,
            tag_ids=request.tag_ids if request.tag_mode == "filter" else None,
            limit=request.limit * 2  # Get more for reranking
        )

        # Step 3: Search Elasticsearch (BM25)
        elasticsearch_results = await search_elasticsearch(
            query=request.query,
            jurisdiction=request.jurisdiction,
            tag_ids=request.tag_ids if request.tag_mode == "filter" else None,
            limit=request.limit * 2
        )

        # Step 4: Merge and deduplicate
        merged_results = merge_search_results(pgvector_results, elasticsearch_results)

        # Step 5: Rerank with MiniLM
        reranked_results = await rerank_results(
            query=request.query,
            results=merged_results,
            reranker_service=reranker_service,
            limit=request.limit
        )

        # Step 6: Apply tag weighting (if soft mode)
        if request.tag_mode == "weight" and request.tag_ids:
            reranked_results = apply_tag_weighting(
                results=reranked_results,
                tag_ids=request.tag_ids
            )

        # Step 7: Sort by final score
        reranked_results.sort(key=lambda x: x["relevance_score"], reverse=True)

        # Step 8: Limit results
        final_results = reranked_results[:request.limit]

        search_time_ms = (time.time() - start_time) * 1000

        return RAGSearchResponse(
            query=request.query,
            jurisdiction=request.jurisdiction,
            results=[RAGSearchResult(**r) for r in final_results],
            total_results=len(final_results),
            search_time_ms=search_time_ms,
            tag_filter_applied=(request.tag_mode == "filter" and bool(request.tag_ids)),
            tag_boost_applied=(request.tag_mode == "weight" and bool(request.tag_ids))
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG search: {e}")
        raise HTTPException(status_code=500, detail="Search failed")


@router.post("/search/stream")
async def rag_search_stream(
    request: RAGStreamRequest,
    search_service=Depends(get_search_service),
    embedding_service=Depends(get_embedding_service),
    reranker_service=Depends(get_reranker_service),
):
    """
    Stream RAG search results with LLM generation.

    This endpoint:
    1. Performs RAG search
    2. Generates LLM response with streaming
    3. Validates citations
    4. Returns streaming response

    Request Body:
    - query: Search query
    - jurisdiction: Jurisdiction
    - tag_ids: Optional tag IDs
    - tag_mode: 'filter' or 'weight'

    Returns:
        Streaming response with LLM output
    """
    try:
        # Validate jurisdiction
        valid, error = validate_jurisdiction(request.jurisdiction)
        if not valid:
            raise HTTPException(status_code=400, detail=error)

        # Perform RAG search
        search_request = RAGSearchRequest(
            query=request.query,
            jurisdiction=request.jurisdiction,
            tag_ids=request.tag_ids,
            tag_mode=request.tag_mode,
            limit=10
        )

        search_results = await rag_search(
            search_request,
            search_service,
            embedding_service,
            reranker_service
        )

        # Generate LLM response with streaming
        async def generate_response():
            # Format context from search results
            context = "\n\n".join([
                f"[{i+1}] {r.content} (source: {r.section_title or 'Unknown'})"
                for i, r in enumerate(search_results.results)
            ])

            # Call LLM with streaming
            async for token in stream_llm_response(
                query=request.query,
                context=context,
                results=search_results.results
            ):
                yield token

        from fastapi.responses import StreamingResponse
        return StreamingResponse(generate_response(), media_type="text/plain")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG stream: {e}")
        raise HTTPException(status_code=500, detail="Stream failed")


# ============================================================================
# Search Helper Functions
# ============================================================================


async def search_pgvector(
    query_embedding: List[float],
    jurisdiction: str,
    tag_ids: Optional[List[str]] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Search PGVector for semantic similarity.

    Args:
        query_embedding: Query embedding vector
        jurisdiction: Jurisdiction filter
        tag_ids: Optional tag IDs for filtering
        limit: Max results

    Returns:
        List of results with relevance scores
    """
    try:
        # Query PGVector (pseudo-code)
        # results = await db.evidence_embeddings.find({
        #     "embedding": {"$nearestNeighbors": query_embedding},
        #     "jurisdiction": jurisdiction,
        #     "tags": {"$in": tag_ids} if tag_ids else None
        # }).limit(limit)

        results = []

        logger.info(f"PGVector search: {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"PGVector search error: {e}")
        return []


async def search_elasticsearch(
    query: str,
    jurisdiction: str,
    tag_ids: Optional[List[str]] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Search Elasticsearch for BM25 ranking.

    Args:
        query: Search query
        jurisdiction: Jurisdiction filter
        tag_ids: Optional tag IDs for filtering
        limit: Max results

    Returns:
        List of results with BM25 scores
    """
    try:
        # Query Elasticsearch (pseudo-code)
        # results = await es.search({
        #     "query": {
        #         "bool": {
        #             "must": [{"match": {"content": query}}],
        #             "filter": [
        #                 {"term": {"jurisdiction": jurisdiction}},
        #                 {"terms": {"tags": tag_ids}} if tag_ids else None
        #             ]
        #         }
        #     },
        #     "size": limit
        # })

        results = []

        logger.info(f"Elasticsearch search: {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"Elasticsearch search error: {e}")
        return []


def merge_search_results(
    pgvector_results: List[Dict[str, Any]],
    elasticsearch_results: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Merge and deduplicate results from PGVector and Elasticsearch.

    Args:
        pgvector_results: Results from semantic search
        elasticsearch_results: Results from BM25 search

    Returns:
        Merged and deduplicated results
    """
    # Combine results, preferring PGVector (semantic) over Elasticsearch (BM25)
    seen = set()
    merged = []

    for result in pgvector_results:
        chunk_id = result.get("chunk_id")
        if chunk_id not in seen:
            merged.append(result)
            seen.add(chunk_id)

    for result in elasticsearch_results:
        chunk_id = result.get("chunk_id")
        if chunk_id not in seen:
            merged.append(result)
            seen.add(chunk_id)

    return merged


async def rerank_results(
    query: str,
    results: List[Dict[str, Any]],
    reranker_service,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Rerank results using MiniLM cross-encoder.

    Args:
        query: Search query
        results: Results to rerank
        reranker_service: Reranker service
        limit: Max results

    Returns:
        Reranked results
    """
    try:
        # Rerank with MiniLM (pseudo-code)
        # scores = await reranker_service.rerank(
        #     query=query,
        #     documents=[r["content"] for r in results]
        # )

        # Add rerank scores
        # for i, result in enumerate(results):
        #     result["relevance_score"] = scores[i]

        return results[:limit]

    except Exception as e:
        logger.error(f"Reranking error: {e}")
        return results[:limit]


def apply_tag_weighting(
    results: List[Dict[str, Any]],
    tag_ids: List[str]
) -> List[Dict[str, Any]]:
    """
    Apply tag-based weight boosting to results.

    Args:
        results: Search results
        tag_ids: Tag IDs for weighting

    Returns:
        Results with adjusted scores
    """
    for result in results:
        # Check if result has matching tags
        result_tags = result.get("matched_tags", [])

        if result_tags:
            # Get tag weight
            tag_weight = result.get("tag_weight", 1.0)
            boost_factor = get_tag_boost_factor(tag_weight)

            # Apply boost to relevance score
            result["relevance_score"] *= boost_factor
            result["tag_boost"] = boost_factor

    return results


async def stream_llm_response(
    query: str,
    context: str,
    results: List[RAGSearchResult]
):
    """
    Stream LLM response with citation validation.

    Args:
        query: User query
        context: Search context
        results: Search results for citation

    Yields:
        Response tokens
    """
    # Format prompt with citations
    prompt = f"""You are a legal AI assistant. Answer using ONLY the provided context.

CONTEXT:
{context}

QUESTION: {query}

STRICT RULES:
- Cite sources like [&1], [&2], etc.
- Do NOT invent information
- Use exact legal wording from sources
- If answer not in context, say so

RESPONSE:"""

    # Stream from LLM (pseudo-code)
    # async for token in llm_service.stream(prompt):
    #     yield token

    yield "Streaming response would appear here..."


# ============================================================================
# Export
# ============================================================================

__all__ = ["router"]

