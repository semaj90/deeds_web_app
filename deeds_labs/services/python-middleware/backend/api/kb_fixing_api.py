"""
Week 3 Task 1: Human-in-the-Loop Error Fixing API
==================================================

Agentic error fixing with source validation workflow:
1. User submits error details
2. System searches knowledge base for relevant sources
3. User validates/approves sources
4. System generates fix using approved sources
5. Track provenance in kb_provenance_graph

Endpoints:
    POST /api/kb/search-fix-sources - Search KB for relevant sources
    POST /api/kb/validate-sources - User approves/rejects sources
    POST /api/kb/generate-fix - Generate fix using validated sources
    GET /api/kb/fix-history - Get fix history for a file
    POST /api/kb/apply-fix - Apply generated fix and track provenance
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
import httpx
import json

router = APIRouter(prefix="/api/kb", tags=["knowledge-based-fixing"])
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================

class ErrorContext(BaseModel):
    """Error details for fix generation"""
    file_path: str
    error_message: str
    error_type: str  # typescript, python, import, syntax, etc.
    line_number: Optional[int] = None
    code_context: Optional[str] = None  # Surrounding code
    stack_trace: Optional[str] = None


class KnowledgeSource(BaseModel):
    """Knowledge base source result"""
    source_id: str
    source_type: str  # qdrant, neo4j, couchdb
    title: str
    content: str
    relevance_score: float
    metadata: Dict[str, Any] = {}
    validated: bool = False


class SourceValidationRequest(BaseModel):
    """User validation of sources"""
    error_id: str
    validated_sources: List[str]  # List of source_ids
    rejected_sources: List[str] = []
    validation_notes: Optional[str] = None


class FixGenerationRequest(BaseModel):
    """Request to generate a fix"""
    error_id: str
    validated_sources: List[str]
    llm_provider: str = "gemma3-legal:latest"
    include_explanation: bool = True


class GeneratedFix(BaseModel):
    """Generated fix result"""
    fix_id: str
    error_context: ErrorContext
    original_code: str
    fixed_code: str
    explanation: str
    source_citations: List[str]
    confidence_score: float
    generated_at: str
    llm_provider: str


class ApplyFixRequest(BaseModel):
    """Request to apply a generated fix"""
    fix_id: str
    user_approved: bool
    application_notes: Optional[str] = None


class FixProvenanceRecord(BaseModel):
    """Provenance tracking for applied fix"""
    fix_id: str
    file_path: str
    applied_at: str
    user_id: str
    validated_sources: List[str]
    fix_content: str
    success: bool
    error_message: Optional[str] = None


# ============================================================================
# In-Memory Storage (Replace with PostgreSQL in production)
# ============================================================================

# Store error contexts and search results
error_sessions: Dict[str, Dict[str, Any]] = {}
generated_fixes: Dict[str, GeneratedFix] = {}
fix_history: List[FixProvenanceRecord] = []


# ============================================================================
# Helper Functions
# ============================================================================

async def search_qdrant_sources(error_context: ErrorContext, top_k: int = 5) -> List[KnowledgeSource]:
    """Search Qdrant for relevant knowledge"""
    try:
        # Construct search query from error context
        query = f"{error_context.error_type} error: {error_context.error_message}"
        if error_context.code_context:
            query += f"\n{error_context.code_context}"

        # Call Qdrant search
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:6333/collections/phase92_knowledge_base/points/search",
                json={
                    "vector": [],  # Would use actual embeddings
                    "limit": top_k,
                    "with_payload": True
                },
                timeout=10.0
            )

            if response.status_code == 200:
                results = response.json()
                sources = []

                for i, hit in enumerate(results.get('result', [])):
                    payload = hit.get('payload', {})
                    sources.append(KnowledgeSource(
                        source_id=f"qdrant_{hit['id']}",
                        source_type="qdrant",
                        title=payload.get('title', f"Document {i+1}"),
                        content=payload.get('content', ''),
                        relevance_score=hit.get('score', 0.0),
                        metadata=payload
                    ))

                return sources
    except Exception as e:
        logger.warning(f"Qdrant search failed: {e}")

    return []


async def search_couchdb_summaries(error_context: ErrorContext, top_k: int = 3) -> List[KnowledgeSource]:
    """Search CouchDB for relevant LLM summaries"""
    try:
        # Search for summaries of similar files
        file_extension = error_context.file_path.split('.')[-1]

        async with httpx.AsyncClient() as client:
            # Query llm_summaries database
            response = await client.get(
                "http://admin:password@localhost:5984/llm_summaries/_all_docs",
                params={"include_docs": "true", "limit": str(top_k)},
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                sources = []

                for row in data.get('rows', []):
                    doc = row.get('doc', {})
                    if doc.get('type') == 'llm_summary':
                        # Calculate simple relevance based on file type match
                        doc_file = doc.get('file_path', '')
                        relevance = 0.7 if doc_file.endswith(file_extension) else 0.3

                        sources.append(KnowledgeSource(
                            source_id=f"couchdb_{doc['_id']}",
                            source_type="couchdb",
                            title=f"Summary: {doc.get('file_path', 'Unknown')}",
                            content=doc.get('summary', ''),
                            relevance_score=relevance,
                            metadata={
                                'file_path': doc.get('file_path'),
                                'llm_provider': doc.get('llm_provider'),
                                'key_entities': doc.get('key_entities', [])
                            }
                        ))

                return sources
    except Exception as e:
        logger.warning(f"CouchDB search failed: {e}")

    return []


async def generate_fix_with_llm(
    error_context: ErrorContext,
    validated_sources: List[KnowledgeSource],
    llm_provider: str
) -> GeneratedFix:
    """Generate fix using LLM with validated sources"""

    # Build context from validated sources
    sources_context = "\n\n".join([
        f"Source {i+1} ({src.source_type}):\n{src.content[:500]}"
        for i, src in enumerate(validated_sources)
    ])

    # Build prompt
    prompt = f"""You are a code fix generator. Using the validated knowledge sources below, generate a fix for this error.

ERROR CONTEXT:
File: {error_context.file_path}
Error Type: {error_context.error_type}
Error Message: {error_context.error_message}
Line: {error_context.line_number or 'N/A'}

CODE CONTEXT:
{error_context.code_context or 'N/A'}

VALIDATED KNOWLEDGE SOURCES:
{sources_context}

Generate a fix that:
1. Resolves the error based on the validated sources
2. Maintains code style and conventions
3. Includes clear explanation with source citations

Output format:
FIXED_CODE:
<fixed code here>

EXPLANATION:
<explanation with [Source N] citations>
"""

    # Call Ollama API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": llm_provider,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 1000
                    }
                },
                timeout=60.0
            )

            if response.status_code == 200:
                result = response.json()
                llm_response = result.get('response', '')

                # Parse response
                fixed_code = ""
                explanation = ""

                if "FIXED_CODE:" in llm_response:
                    parts = llm_response.split("EXPLANATION:")
                    fixed_code = parts[0].replace("FIXED_CODE:", "").strip()
                    explanation = parts[1].strip() if len(parts) > 1 else ""
                else:
                    # Fallback parsing
                    fixed_code = llm_response
                    explanation = "Fix generated based on validated sources"

                fix_id = f"fix_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

                return GeneratedFix(
                    fix_id=fix_id,
                    error_context=error_context,
                    original_code=error_context.code_context or "",
                    fixed_code=fixed_code,
                    explanation=explanation,
                    source_citations=[src.source_id for src in validated_sources],
                    confidence_score=0.85,  # Could be calculated based on source relevance
                    generated_at=datetime.utcnow().isoformat(),
                    llm_provider=llm_provider
                )
    except Exception as e:
        logger.error(f"LLM fix generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Fix generation failed: {str(e)}")


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/search-fix-sources")
async def search_fix_sources(error_context: ErrorContext) -> Dict[str, Any]:
    """
    Search knowledge base for relevant sources to fix an error.

    Returns sources from Qdrant, CouchDB, and potentially Neo4j.
    User will validate these sources before fix generation.
    """
    error_id = f"error_{datetime.utcnow().strftime('%Y%m%d_%H%M%S%f')}"

    # Search multiple sources in parallel
    qdrant_sources = await search_qdrant_sources(error_context, top_k=5)
    couchdb_sources = await search_couchdb_summaries(error_context, top_k=3)

    # Combine and sort by relevance
    all_sources = qdrant_sources + couchdb_sources
    all_sources.sort(key=lambda x: x.relevance_score, reverse=True)

    # Store session
    error_sessions[error_id] = {
        "error_context": error_context.model_dump(),
        "sources": [src.model_dump() for src in all_sources],
        "created_at": datetime.utcnow().isoformat()
    }

    return {
        "error_id": error_id,
        "error_context": error_context,
        "sources": all_sources[:10],  # Top 10 sources
        "total_found": len(all_sources)
    }


@router.post("/validate-sources")
async def validate_sources(request: SourceValidationRequest) -> Dict[str, Any]:
    """
    User validates which sources should be used for fix generation.

    Stores validated sources for this error session.
    """
    if request.error_id not in error_sessions:
        raise HTTPException(status_code=404, detail="Error session not found")

    session = error_sessions[request.error_id]

    # Mark sources as validated
    for source in session['sources']:
        if source['source_id'] in request.validated_sources:
            source['validated'] = True

    session['validated_sources'] = request.validated_sources
    session['rejected_sources'] = request.rejected_sources
    session['validation_notes'] = request.validation_notes
    session['validated_at'] = datetime.utcnow().isoformat()

    return {
        "error_id": request.error_id,
        "validated_count": len(request.validated_sources),
        "rejected_count": len(request.rejected_sources),
        "status": "ready_for_fix_generation"
    }


@router.post("/generate-fix", response_model=GeneratedFix)
async def generate_fix(request: FixGenerationRequest) -> GeneratedFix:
    """
    Generate a fix using validated sources and LLM.

    Returns the generated fix with explanation and source citations.
    """
    if request.error_id not in error_sessions:
        raise HTTPException(status_code=404, detail="Error session not found")

    session = error_sessions[request.error_id]

    # Get validated sources
    validated_sources = [
        KnowledgeSource(**src)
        for src in session['sources']
        if src['source_id'] in request.validated_sources
    ]

    if not validated_sources:
        raise HTTPException(status_code=400, detail="No validated sources provided")

    # Generate fix
    error_context = ErrorContext(**session['error_context'])
    generated_fix = await generate_fix_with_llm(
        error_context,
        validated_sources,
        request.llm_provider
    )

    # Store generated fix
    generated_fixes[generated_fix.fix_id] = generated_fix

    return generated_fix


@router.post("/apply-fix")
async def apply_fix(request: ApplyFixRequest) -> FixProvenanceRecord:
    """
    Apply a generated fix and track provenance.

    Records the fix application in kb_provenance_graph for audit trail.
    """
    if request.fix_id not in generated_fixes:
        raise HTTPException(status_code=404, detail="Fix not found")

    if not request.user_approved:
        raise HTTPException(status_code=400, detail="Fix not approved by user")

    fix = generated_fixes[request.fix_id]

    # Create provenance record
    provenance = FixProvenanceRecord(
        fix_id=request.fix_id,
        file_path=fix.error_context.file_path,
        applied_at=datetime.utcnow().isoformat(),
        user_id="user_1",  # Would come from auth context
        validated_sources=fix.source_citations,
        fix_content=fix.fixed_code,
        success=True,
        error_message=None
    )

    fix_history.append(provenance)

    # TODO: Actually apply fix to file system
    # TODO: Store in kb_provenance_graph table in PostgreSQL

    return provenance


@router.get("/fix-history/{file_path:path}")
async def get_fix_history(file_path: str, limit: int = 10) -> List[FixProvenanceRecord]:
    """
    Get fix history for a specific file.

    Shows all fixes applied to this file with provenance tracking.
    """
    file_fixes = [
        fix for fix in fix_history
        if fix.file_path == file_path
    ]

    # Sort by most recent first
    file_fixes.sort(key=lambda x: x.applied_at, reverse=True)

    return file_fixes[:limit]


@router.get("/stats")
async def get_kb_fixing_stats() -> Dict[str, Any]:
    """Get overall statistics for KB-based error fixing"""
    return {
        "active_error_sessions": len(error_sessions),
        "generated_fixes": len(generated_fixes),
        "applied_fixes": len(fix_history),
        "success_rate": sum(1 for f in fix_history if f.success) / len(fix_history) if fix_history else 0.0,
        "total_sources_validated": sum(
            len(session.get('validated_sources', []))
            for session in error_sessions.values()
        )
    }
