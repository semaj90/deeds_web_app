"""
Source Validation API for RAG with Human-in-the-Loop
Implements CopilotKit + Pydantic AI pattern for verified knowledge retrieval

Flow:
1. /api/kb/search → Retrieve candidates with confidence scores
2. User validates sources in UI
3. /api/kb/validate-sources → Store validations in PostgreSQL
4. /api/kb/generate-answer → LLM generates with validated sources
5. /api/kb/update-kag → Persist new knowledge edges

Phase: Agentic RAG Source Validation (Task 1.1)
References: TASKS_SOURCE_VALIDATION_COUCHDB.md, AGENTIC_RAG_ARCHITECTURE.md
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Phase 89 imports
from services.qdrant_client import get_qdrant_client
from services.couchdb_client import get_couchdb_client
from services.database import get_db_session

# LLM imports
from services.llm_router import LLMRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/kb", tags=["knowledge-base"])


# ============================================================================
# Request/Response Models (Pydantic)
# ============================================================================

class KBSearchRequest(BaseModel):
    """Search knowledge base for relevant sources"""
    query: str = Field(..., min_length=3, max_length=2000)
    top_k: int = Field(20, ge=1, le=50)
    filters: Optional[Dict[str, Any]] = None
    include_codebase: bool = True  # Also search CouchDB file graph


class KBSearchResult(BaseModel):
    """Single search result with metadata"""
    chunk_id: str
    source_file: str
    content: str
    snippet_preview: str  # First 200 chars
    confidence_score: float  # Qdrant score
    source_type: str  # "documentation", "code", "error_fix", "community"
    metadata: Dict[str, Any]


class KBSearchResponse(BaseModel):
    """Search results with provenance"""
    query: str
    results: List[KBSearchResult]
    total_found: int
    search_timestamp: datetime


class SourceValidationRequest(BaseModel):
    """User validates which sources to use"""
    case_id: str
    query: str
    selected_chunk_ids: List[str]
    rejected_chunk_ids: Optional[List[str]] = []
    validation_notes: Optional[str] = None


class SourceValidationResponse(BaseModel):
    """Validation confirmation"""
    validation_id: str
    approved_chunks: List[KBSearchResult]
    timestamp: datetime
    ready_for_answer: bool


class AnswerGenerationRequest(BaseModel):
    """Generate answer using validated sources"""
    validation_id: str
    case_id: str
    query: str
    llm_provider: str = "gemma3-legal"
    max_tokens: int = 2000


class CitationMetadata(BaseModel):
    """Citation with source tracking"""
    chunk_id: str
    source_file: str
    snippet: str
    used_in_answer: bool
    confidence: float


class AnswerGenerationResponse(BaseModel):
    """LLM answer with full provenance"""
    answer: str
    citations: List[CitationMetadata]
    validation_id: str
    llm_provider: str
    timestamp: datetime


class KAGUpdateRequest(BaseModel):
    """Persist new knowledge graph edges"""
    validation_id: str
    entities_extracted: List[str]
    relationships: List[Dict[str, str]]  # {"from": "A", "to": "B", "type": "REFERENCES"}


# ============================================================================
# Task 1.1.1: Extended /api/kb/search
# ============================================================================

@router.post("/search", response_model=KBSearchResponse)
async def search_knowledge_base(
    request: KBSearchRequest,
    db: AsyncSession = Depends(get_db_session)
) -> KBSearchResponse:
    """
    Search knowledge base with extended metadata (Task 1.1.1)

    Returns top-20 candidates with:
    - snippet_preview (first 200 chars)
    - confidence_score (Qdrant similarity)
    - source_type (documentation/code/error_fix/community)

    Also searches CouchDB file graph if include_codebase=True
    """
    try:
        qdrant = get_qdrant_client()
        results = []

        # Step 1: Search Qdrant for document chunks
        qdrant_results = await asyncio.to_thread(
            qdrant.search,
            collection_name="phase92_kb_chunks",
            query_vector=request.query,  # Will be embedded by Qdrant
            limit=request.top_k,
            with_payload=True
        )

        for hit in qdrant_results:
            payload = hit.payload
            content = payload.get("content", "")

            results.append(KBSearchResult(
                chunk_id=str(hit.id),
                source_file=payload.get("source_file", "unknown"),
                content=content,
                snippet_preview=content[:200] + ("..." if len(content) > 200 else ""),
                confidence_score=hit.score,
                source_type=payload.get("source_type", "documentation"),
                metadata=payload
            ))

        # Step 2: Optionally search CouchDB file graph
        if request.include_codebase:
            couchdb = get_couchdb_client()

            # Simple keyword search in file paths/classes/functions
            # (Production: use full-text search with Lucene/Mango)
            query_lower = request.query.lower()

            try:
                all_files = couchdb.codebase_graph.view(
                    '_design/topology/dependency_graph',
                    limit=100
                )

                for row in all_files:
                    file_data = row.value
                    path = row.key

                    # Match on path, classes, or functions
                    if (query_lower in path.lower() or
                        any(query_lower in c.lower() for c in file_data.get('classes', [])) or
                        any(query_lower in f.lower() for f in file_data.get('functions', []))):

                        results.append(KBSearchResult(
                            chunk_id=f"code:{path}",
                            source_file=path,
                            content=f"File: {path}\nClasses: {', '.join(file_data.get('classes', []))}\nFunctions: {', '.join(file_data.get('functions', [])[:5])}",
                            snippet_preview=f"{path} ({len(file_data.get('classes', []))} classes, {len(file_data.get('functions', []))} functions)",
                            confidence_score=0.7,  # Fixed score for exact matches
                            source_type="code",
                            metadata={
                                "imports": file_data.get('imports', []),
                                "exports": file_data.get('exports', []),
                                "classes": file_data.get('classes', []),
                                "functions": file_data.get('functions', [])
                            }
                        ))

                        if len(results) >= request.top_k:
                            break
            except Exception as e:
                logger.warning(f"CouchDB search failed: {e}")

        # Sort by confidence descending
        results.sort(key=lambda x: x.confidence_score, reverse=True)
        results = results[:request.top_k]

        return KBSearchResponse(
            query=request.query,
            results=results,
            total_found=len(results),
            search_timestamp=datetime.utcnow()
        )

    except Exception as e:
        logger.error(f"Knowledge base search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Task 1.1.2: /api/kb/validate-sources (Human-in-the-Loop)
# ============================================================================

@router.post("/validate-sources", response_model=SourceValidationResponse)
async def validate_sources(
    request: SourceValidationRequest,
    db: AsyncSession = Depends(get_db_session)
) -> SourceValidationResponse:
    """
    Store human validation of sources (Task 1.1.2)

    Creates entry in case_source_validations table with:
    - Which chunks user approved/rejected
    - Timestamp for audit trail
    - Validation notes

    Returns validation_id for answer generation step
    """
    try:
        validation_id = f"val_{request.case_id}_{int(datetime.utcnow().timestamp())}"

        # Store validation in PostgreSQL
        query = text("""
            INSERT INTO case_source_validations
            (validation_id, case_id, query, approved_chunks, rejected_chunks, validation_notes, created_at)
            VALUES (:validation_id, :case_id, :query, :approved_chunks, :rejected_chunks, :validation_notes, :created_at)
        """)

        await db.execute(query, {
            "validation_id": validation_id,
            "case_id": request.case_id,
            "query": request.query,
            "approved_chunks": request.selected_chunk_ids,
            "rejected_chunks": request.rejected_chunk_ids or [],
            "validation_notes": request.validation_notes,
            "created_at": datetime.utcnow()
        })
        await db.commit()

        # Retrieve approved chunks for response
        qdrant = get_qdrant_client()
        approved_chunks = []

        for chunk_id in request.selected_chunk_ids:
            try:
                result = await asyncio.to_thread(
                    qdrant.retrieve,
                    collection_name="phase92_kb_chunks",
                    ids=[chunk_id]
                )

                if result:
                    payload = result[0].payload
                    content = payload.get("content", "")

                    approved_chunks.append(KBSearchResult(
                        chunk_id=chunk_id,
                        source_file=payload.get("source_file", "unknown"),
                        content=content,
                        snippet_preview=content[:200] + ("..." if len(content) > 200 else ""),
                        confidence_score=0.95,  # User-validated = high confidence
                        source_type=payload.get("source_type", "documentation"),
                        metadata=payload
                    ))
            except Exception as e:
                logger.warning(f"Failed to retrieve chunk {chunk_id}: {e}")

        return SourceValidationResponse(
            validation_id=validation_id,
            approved_chunks=approved_chunks,
            timestamp=datetime.utcnow(),
            ready_for_answer=len(approved_chunks) > 0
        )

    except Exception as e:
        logger.error(f"Source validation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Task 1.1.3: /api/kb/generate-answer (LLM with Citations)
# ============================================================================

@router.post("/generate-answer", response_model=AnswerGenerationResponse)
async def generate_answer(
    request: AnswerGenerationRequest,
    db: AsyncSession = Depends(get_db_session)
) -> AnswerGenerationResponse:
    """
    Generate answer using validated sources (Task 1.1.3)

    Flow:
    1. Retrieve approved sources from validation_id
    2. Build LLM prompt with source context
    3. Generate answer with citations
    4. Store in kb_answer_citations table
    """
    try:
        # Step 1: Retrieve validation
        query = text("""
            SELECT approved_chunks, query
            FROM case_source_validations
            WHERE validation_id = :validation_id
        """)

        result = await db.execute(query, {"validation_id": request.validation_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Validation not found")

        approved_chunk_ids = row.approved_chunks
        original_query = row.query

        # Step 2: Retrieve chunk contents
        qdrant = get_qdrant_client()
        sources = []

        for chunk_id in approved_chunk_ids:
            try:
                result = await asyncio.to_thread(
                    qdrant.retrieve,
                    collection_name="phase92_kb_chunks",
                    ids=[chunk_id]
                )

                if result:
                    payload = result[0].payload
                    sources.append({
                        "chunk_id": chunk_id,
                        "source_file": payload.get("source_file", "unknown"),
                        "content": payload.get("content", ""),
                        "source_type": payload.get("source_type", "documentation")
                    })
            except Exception as e:
                logger.warning(f"Failed to retrieve chunk {chunk_id}: {e}")

        if not sources:
            raise HTTPException(status_code=400, detail="No valid sources found")

        # Step 3: Build LLM prompt with sources
        source_context = "\n\n".join([
            f"[Source {i+1}: {s['source_file']}]\n{s['content']}"
            for i, s in enumerate(sources)
        ])

        prompt = f"""You are a legal AI assistant. Answer the user's question using ONLY the provided sources.
Cite sources using [Source N] notation.

SOURCES:
{source_context}

USER QUESTION:
{original_query}

ANSWER (with citations):
"""

        # Step 4: Generate answer with LLM
        llm_router = LLMRouter()

        response = await asyncio.to_thread(
            llm_router.generate,
            prompt=prompt,
            provider=request.llm_provider,
            max_tokens=request.max_tokens,
            temperature=0.3  # Low temperature for factual answers
        )

        answer_text = response.get("text", "")

        # Step 5: Extract citations (simple regex for [Source N])
        import re
        citation_matches = re.findall(r'\[Source (\d+)\]', answer_text)
        cited_indices = set(int(m) - 1 for m in citation_matches)

        citations = []
        for i, source in enumerate(sources):
            citations.append(CitationMetadata(
                chunk_id=source["chunk_id"],
                source_file=source["source_file"],
                snippet=source["content"][:150] + "...",
                used_in_answer=(i in cited_indices),
                confidence=0.95  # User-validated
            ))

        # Step 6: Store answer citation mapping
        query = text("""
            INSERT INTO kb_answer_citations
            (validation_id, case_id, answer_text, citations, llm_provider, created_at)
            VALUES (:validation_id, :case_id, :answer_text, :citations, :llm_provider, :created_at)
        """)

        await db.execute(query, {
            "validation_id": request.validation_id,
            "case_id": request.case_id,
            "answer_text": answer_text,
            "citations": [c.dict() for c in citations],
            "llm_provider": request.llm_provider,
            "created_at": datetime.utcnow()
        })
        await db.commit()

        return AnswerGenerationResponse(
            answer=answer_text,
            citations=citations,
            validation_id=request.validation_id,
            llm_provider=request.llm_provider,
            timestamp=datetime.utcnow()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Answer generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Task 1.1.4: /api/kb/update-kag (Knowledge Graph Persistence)
# ============================================================================

@router.post("/update-kag")
async def update_knowledge_graph(
    request: KAGUpdateRequest,
    db: AsyncSession = Depends(get_db_session)
) -> Dict[str, Any]:
    """
    Update knowledge graph with new entities/relationships (Task 1.1.4)

    Uses LangExtract or similar to extract:
    - Named entities (cases, statutes, people, organizations)
    - Relationships (CITES, REFERENCES, OVERRULES)

    Stores in kb_provenance_graph table
    """
    try:
        # Store graph edges
        query = text("""
            INSERT INTO kb_provenance_graph
            (validation_id, entities, relationships, created_at)
            VALUES (:validation_id, :entities, :relationships, :created_at)
        """)

        await db.execute(query, {
            "validation_id": request.validation_id,
            "entities": request.entities_extracted,
            "relationships": request.relationships,
            "created_at": datetime.utcnow()
        })
        await db.commit()

        return {
            "status": "success",
            "entities_stored": len(request.entities_extracted),
            "relationships_stored": len(request.relationships),
            "validation_id": request.validation_id
        }

    except Exception as e:
        logger.error(f"KAG update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Check source validation system health"""
    try:
        qdrant = get_qdrant_client()
        couchdb = get_couchdb_client()

        # Check Qdrant
        qdrant_status = await asyncio.to_thread(
            qdrant.get_collection,
            collection_name="phase92_kb_chunks"
        )

        # Check CouchDB
        couchdb_stats = couchdb.health_check()

        return {
            "status": "healthy",
            "qdrant": {
                "collection": "phase92_kb_chunks",
                "vectors": qdrant_status.vectors_count if qdrant_status else 0
            },
            "couchdb": couchdb_stats,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
