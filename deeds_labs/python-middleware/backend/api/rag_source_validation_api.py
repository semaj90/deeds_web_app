"""
RAG Source Validation API
==========================

Implements human-in-the-loop source validation for legal RAG.
Based on CopilotKit + PydanticAI patterns adapted to your custom stack.

Endpoints:
- POST /api/rag/search - Retrieve candidates
- POST /api/rag/validate - Validate sources (human-in-the-loop)
- POST /api/rag/answer - Generate answer from approved context
- POST /api/rag/kag/update - Update knowledge graph
- GET/POST /api/canvas/{case_id} - Case canvas state

Stack:
- Qdrant (vector search)
- embeddinggemma:latest (768d) + Gemma-3 VLM (1024d multimodal)
- gemma3-legal:latest (LLM synthesis)
- PostgreSQL (canvas state persistence)
- Neo4j (knowledge graph)
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
import logging
import time
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
import hashlib
import os

# Import schemas
from schemas.rag_source_validation import (
    RetrieveCandidatesRequest,
    RetrieveCandidatesResponse,
    RetrievedChunk,
    ValidateSourcesRequest,
    ApprovedContext,
    AnswerRequest,
    AnswerWithCitations,
    Citation,
    ActionItem,
    KnowledgeGraphUpdate,
    KAGEntity,
    KAGRelation,
    CanvasPin,
    CaseCanvasState,
    SourceType,
    ValidationStatus,
    ConfidenceLevel,
    APIResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

CONFIG = {
    "qdrant": {
        "url": os.getenv("QDRANT_URL", "http://localhost:6333"),
        "collection_rag": "phase79_rag_vectors",
        "collection_kag": "phase79_kag_graph",
    },
    "ollama": {
        "url": os.getenv("OLLAMA_URL", "http://localhost:11434"),
        "embedding_model": "embeddinggemma:latest",
        "llm_model": "gemma3-legal:latest",
    },
    "postgres": {
        "url": os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/legal_ai_db"),
    },
    "neo4j": {
        "uri": os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        "user": os.getenv("NEO4J_USER", "neo4j"),
        "password": os.getenv("NEO4J_PASSWORD", "password"),
    },
}

# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="RAG Source Validation API",
    description="Human-in-the-loop source validation for legal RAG",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores (replace with Redis/Postgres in production)
query_store: Dict[str, RetrieveCandidatesResponse] = {}
context_store: Dict[str, ApprovedContext] = {}
answer_store: Dict[str, AnswerWithCitations] = {}
canvas_store: Dict[str, CaseCanvasState] = {}


# =============================================================================
# Helper Functions
# =============================================================================

async def generate_embedding(text: str) -> List[float]:
    """Generate embedding using Ollama embeddinggemma"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{CONFIG['ollama']['url']}/api/embeddings",
            json={
                "model": CONFIG["ollama"]["embedding_model"],
                "prompt": text,
            },
            timeout=30.0,
        )
        if response.status_code == 200:
            return response.json()["embedding"]
        else:
            raise HTTPException(500, f"Embedding failed: {response.text}")


async def search_qdrant(
    embedding: List[float],
    collection: str,
    top_k: int = 10,
    min_score: float = 0.5,
) -> List[Dict]:
    """Search Qdrant vector database"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{CONFIG['qdrant']['url']}/collections/{collection}/points/search",
            json={
                "vector": embedding,
                "limit": top_k,
                "score_threshold": min_score,
                "with_payload": True,
            },
            timeout=30.0,
        )
        if response.status_code == 200:
            return response.json().get("result", [])
        else:
            logger.error(f"Qdrant search failed: {response.text}")
            return []


async def generate_llm_response(
    prompt: str,
    context: str,
    max_tokens: int = 2048,
    temperature: float = 0.3,
) -> Dict[str, Any]:
    """Generate LLM response using Ollama gemma3-legal"""
    full_prompt = f"""You are a legal research assistant. Based on the following sources, answer the question.
Always cite your sources using [1], [2], etc. notation.
Generate action items if relevant.

SOURCES:
{context}

QUESTION:
{prompt}

ANSWER (with citations):"""

    async with httpx.AsyncClient() as client:
        start_time = time.time()
        response = await client.post(
            f"{CONFIG['ollama']['url']}/api/generate",
            json={
                "model": CONFIG["ollama"]["llm_model"],
                "prompt": full_prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                },
            },
            timeout=120.0,
        )
        generation_time = (time.time() - start_time) * 1000

        if response.status_code == 200:
            data = response.json()
            return {
                "text": data.get("response", ""),
                "tokens": data.get("eval_count", 0),
                "generation_time_ms": generation_time,
            }
        else:
            raise HTTPException(500, f"LLM generation failed: {response.text}")


def score_to_confidence(score: float) -> ConfidenceLevel:
    """Convert numeric score to confidence level"""
    if score >= 0.85:
        return ConfidenceLevel.HIGH
    elif score >= 0.70:
        return ConfidenceLevel.MEDIUM
    elif score >= 0.50:
        return ConfidenceLevel.LOW
    else:
        return ConfidenceLevel.MARGINAL


def extract_citations(text: str, chunks: List[RetrievedChunk]) -> List[Citation]:
    """Extract citation references from generated text"""
    citations = []
    for i, chunk in enumerate(chunks, 1):
        citation_marker = f"[{i}]"
        if citation_marker in text:
            # Find a relevant quote from the chunk
            quote = chunk.text[:200] + "..." if len(chunk.text) > 200 else chunk.text
            citations.append(Citation(
                citation_id=citation_marker,
                chunk_id=chunk.chunk_id,
                source_title=chunk.source_title,
                source_url=chunk.source_url,
                page_num=chunk.page_num,
                quote=quote,
            ))
    return citations


def extract_action_items(text: str) -> List[ActionItem]:
    """Extract action items from generated text"""
    # Simple heuristic: look for TODO, action item, next step patterns
    actions = []
    lines = text.split("\n")

    action_keywords = ["todo:", "action:", "next step:", "should:", "recommend:", "consider:"]

    for line in lines:
        line_lower = line.lower().strip()
        for keyword in action_keywords:
            if keyword in line_lower:
                actions.append(ActionItem(
                    description=line.strip(),
                    priority="medium",
                ))
                break

    return actions


# =============================================================================
# API Endpoints
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "RAG Source Validation API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "config": {
            "qdrant": CONFIG["qdrant"]["url"],
            "ollama": CONFIG["ollama"]["url"],
        }
    }


# -----------------------------------------------------------------------------
# Step 1: Retrieve Candidates
# -----------------------------------------------------------------------------

@app.post("/api/rag/search", response_model=RetrieveCandidatesResponse)
async def search_knowledge_base(request: RetrieveCandidatesRequest):
    """
    Step 1: Retrieve candidate chunks from knowledge base.

    Uses:
    - embeddinggemma:latest for query embedding
    - Qdrant for vector search
    - Optional BM25 hybrid search
    - Optional GPU reranking
    """
    logger.info(f"🔍 RAG Search: {request.query[:50]}...")
    start_time = time.time()

    # Generate query embedding
    embed_start = time.time()
    query_embedding = await generate_embedding(request.query)
    embed_time = (time.time() - embed_start) * 1000

    # Search Qdrant
    search_start = time.time()
    results = await search_qdrant(
        embedding=query_embedding,
        collection=CONFIG["qdrant"]["collection_rag"],
        top_k=request.top_k,
        min_score=request.min_score,
    )
    search_time = (time.time() - search_start) * 1000

    # Convert to RetrievedChunk objects
    chunks = []
    for i, result in enumerate(results):
        payload = result.get("payload", {})
        score = result.get("score", 0.0)

        # Create snippet with highlighting (simplified)
        text = payload.get("text", "")
        snippet = text[:300] + "..." if len(text) > 300 else text

        chunk = RetrievedChunk(
            chunk_id=payload.get("chunk_id", f"chunk-{i}"),
            text=text,
            snippet=snippet,
            score=score,
            dense_score=score,
            confidence=score_to_confidence(score),
            source_type=SourceType(payload.get("source_type", "document")),
            source_id=payload.get("source_id", "unknown"),
            source_title=payload.get("source_title", payload.get("title", "Untitled")),
            source_url=payload.get("source_url"),
            page_num=payload.get("page_num"),
            section=payload.get("section"),
            has_image=payload.get("has_image", False),
            has_table=payload.get("has_table", False),
            seal_confidence=payload.get("seal_confidence"),
            related_entities=payload.get("entities", []),
            graph_neighbors=payload.get("neighbors", []),
        )
        chunks.append(chunk)

    total_time = (time.time() - start_time) * 1000

    # Create response
    response = RetrieveCandidatesResponse(
        query=request.query,
        case_id=request.case_id,
        chunks=chunks,
        total_found=len(chunks),
        search_time_ms=search_time,
        embedding_time_ms=embed_time,
        embedding_model=CONFIG["ollama"]["embedding_model"],
    )

    # Store for later validation
    query_store[response.query_id] = response

    logger.info(f"✅ Found {len(chunks)} chunks in {total_time:.1f}ms")
    return response


# -----------------------------------------------------------------------------
# Step 2: Validate Sources (Human-in-the-Loop)
# -----------------------------------------------------------------------------

@app.post("/api/rag/validate", response_model=ApprovedContext)
async def validate_sources(request: ValidateSourcesRequest):
    """
    Step 2: Validate and approve sources for synthesis.

    This is the human-in-the-loop gate:
    - User reviews retrieved chunks
    - User approves/rejects sources
    - Approved sources become the LLM context
    """
    logger.info(f"✅ Validating sources for query {request.query_id}")

    # Get original query
    if request.query_id not in query_store:
        raise HTTPException(404, f"Query {request.query_id} not found")

    original = query_store[request.query_id]

    # Separate approved and rejected
    approved_ids = set()
    rejected_ids = set()

    for validation in request.validations:
        if validation.status == ValidationStatus.APPROVED:
            approved_ids.add(validation.chunk_id)
        elif validation.status == ValidationStatus.REJECTED:
            rejected_ids.add(validation.chunk_id)

    # Filter chunks
    approved_chunks = [c for c in original.chunks if c.chunk_id in approved_ids]

    if not approved_chunks:
        raise HTTPException(400, "No sources approved. Please select at least one source.")

    # Combine context
    combined_context = "\n\n---\n\n".join([
        f"[{i+1}] {chunk.source_title}\n{chunk.text}"
        for i, chunk in enumerate(approved_chunks)
    ])

    # Estimate tokens (rough: 4 chars per token)
    total_tokens = len(combined_context) // 4

    # Create canvas pin for case
    canvas_pin = {
        "title": f"Research: {original.query[:50]}...",
        "content": f"Selected {len(approved_chunks)} sources",
        "pin_type": "research",
        "source_chunk_ids": [c.chunk_id for c in approved_chunks],
    }

    # Create approved context
    context = ApprovedContext(
        query_id=request.query_id,
        case_id=request.case_id,
        approved_chunks=approved_chunks,
        rejected_chunk_ids=list(rejected_ids),
        combined_context=combined_context,
        total_tokens=total_tokens,
        validated_by=request.user_id,
        canvas_pin=canvas_pin,
    )

    # Store for answer generation
    context_store[context.context_id] = context

    # Update case canvas
    if request.case_id not in canvas_store:
        canvas_store[request.case_id] = CaseCanvasState(case_id=request.case_id)

    canvas_store[request.case_id].queries.append(request.query_id)

    logger.info(f"✅ Approved {len(approved_chunks)} sources, rejected {len(rejected_ids)}")
    return context


# -----------------------------------------------------------------------------
# Step 3: Generate Answer with Citations
# -----------------------------------------------------------------------------

@app.post("/api/rag/answer", response_model=AnswerWithCitations)
async def generate_answer(request: AnswerRequest):
    """
    Step 3: Generate answer using only approved sources.

    Uses gemma3-legal:latest with:
    - Only approved context (grounded)
    - Inline citations [1], [2], etc.
    - Generated action items
    - Confidence scoring
    """
    logger.info(f"🤖 Generating answer for context {request.context_id}")

    # Get approved context
    if request.context_id not in context_store:
        raise HTTPException(404, f"Context {request.context_id} not found")

    context = context_store[request.context_id]

    # Generate LLM response
    llm_result = await generate_llm_response(
        prompt=request.query,
        context=context.combined_context,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
    )

    answer_text = llm_result["text"]

    # Extract citations
    citations = extract_citations(answer_text, context.approved_chunks)

    # Extract action items
    action_items = extract_action_items(answer_text)

    # Create summary (first paragraph or first 200 chars)
    summary = answer_text.split("\n\n")[0][:500]

    # Calculate grounding score (how many sources were cited)
    sources_cited = len(citations)
    sources_available = len(context.approved_chunks)
    grounding_score = sources_cited / max(sources_available, 1)

    # Answer confidence based on source quality
    avg_source_score = sum(c.score for c in context.approved_chunks) / len(context.approved_chunks)
    answer_confidence = avg_source_score * grounding_score

    # Create response
    answer = AnswerWithCitations(
        context_id=request.context_id,
        case_id=request.case_id,
        answer=answer_text,
        summary=summary,
        citations=citations,
        action_items=action_items,
        model=CONFIG["ollama"]["llm_model"],
        tokens_used=llm_result["tokens"],
        generation_time_ms=llm_result["generation_time_ms"],
        answer_confidence=answer_confidence,
        grounding_score=grounding_score,
    )

    # Store answer
    answer_store[answer.answer_id] = answer

    # Update case canvas
    if request.case_id in canvas_store:
        canvas_store[request.case_id].answers.append(answer.answer_id)

    logger.info(f"✅ Generated answer with {len(citations)} citations, {len(action_items)} actions")
    return answer


# -----------------------------------------------------------------------------
# Step 4: Update Knowledge Graph
# -----------------------------------------------------------------------------

@app.post("/api/rag/kag/update", response_model=KnowledgeGraphUpdate)
async def update_knowledge_graph(answer_id: str):
    """
    Step 4: Update knowledge graph from answer.

    Extracts:
    - Entities from answer and sources
    - Relations (claims_based_on, supports, etc.)
    - Provenance tracking
    """
    logger.info(f"📊 Updating KAG from answer {answer_id}")

    if answer_id not in answer_store:
        raise HTTPException(404, f"Answer {answer_id} not found")

    answer = answer_store[answer_id]
    context = context_store.get(answer.context_id)

    if not context:
        raise HTTPException(404, "Context not found")

    # Extract entities (simplified - use LangExtract in production)
    entities = []
    relations = []

    # Create entity for the answer itself
    answer_entity = KAGEntity(
        name=f"Answer: {answer.summary[:50]}",
        entity_type="analysis",
        properties={
            "answer_id": answer.answer_id,
            "confidence": answer.answer_confidence,
        },
        source_chunk_ids=[c.chunk_id for c in context.approved_chunks],
    )
    entities.append(answer_entity)

    # Create "claims_based_on" relations
    for chunk in context.approved_chunks:
        source_entity = KAGEntity(
            name=chunk.source_title,
            entity_type=chunk.source_type.value,
            properties={
                "chunk_id": chunk.chunk_id,
                "score": chunk.score,
            },
        )
        entities.append(source_entity)

        relation = KAGRelation(
            source_entity_id=answer_entity.entity_id,
            target_entity_id=source_entity.entity_id,
            relation_type="claims_based_on",
            confidence=chunk.score,
            source_chunk_ids=[chunk.chunk_id],
        )
        relations.append(relation)

    # Create KAG update
    update = KnowledgeGraphUpdate(
        answer_id=answer_id,
        case_id=answer.case_id,
        entities=entities,
        relations=relations,
        claims_based_on=[c.chunk_id for c in context.approved_chunks],
    )

    # TODO: Persist to Neo4j in production

    logger.info(f"✅ Created {len(entities)} entities, {len(relations)} relations")
    return update


# -----------------------------------------------------------------------------
# Case Canvas State
# -----------------------------------------------------------------------------

@app.get("/api/canvas/{case_id}", response_model=CaseCanvasState)
async def get_canvas_state(case_id: str):
    """Get case canvas state"""
    if case_id not in canvas_store:
        # Create new canvas
        canvas_store[case_id] = CaseCanvasState(case_id=case_id)

    return canvas_store[case_id]


@app.post("/api/canvas/{case_id}/pin", response_model=CanvasPin)
async def add_canvas_pin(case_id: str, pin: CanvasPin):
    """Add pin to case canvas"""
    if case_id not in canvas_store:
        canvas_store[case_id] = CaseCanvasState(case_id=case_id)

    pin.case_id = case_id
    canvas_store[case_id].pins.append(pin)
    canvas_store[case_id].updated_at = datetime.utcnow()

    return pin


@app.put("/api/canvas/{case_id}", response_model=CaseCanvasState)
async def update_canvas_state(case_id: str, state: CaseCanvasState):
    """Update full canvas state"""
    state.case_id = case_id
    state.updated_at = datetime.utcnow()
    state.version = canvas_store.get(case_id, CaseCanvasState(case_id=case_id)).version + 1
    canvas_store[case_id] = state
    return state


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("API_PORT", 8002))
    host = os.getenv("API_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting RAG Source Validation API on {host}:{port}")
    logger.info(f"   Qdrant: {CONFIG['qdrant']['url']}")
    logger.info(f"   Ollama: {CONFIG['ollama']['url']}")

    uvicorn.run(app, host=host, port=port, log_level="info")
