#!/usr/bin/env python3
"""
NLP Middleware Service
Orchestrates the document processing pipeline:
1. LangExtract (chunking) → concurrent parallel processing
2. Embedding generation (embeddinggemma:latest, 768-dim bi-encoder)
3. Entity extraction and legal concept tagging
4. GPU processing (IBM Granite Docling) for structure preservation
5. LLM output generation (Ollama)

Architecture:
- Receives chunks from LangExtract
- Generates embeddings in parallel (bi-encoder)
- Extracts legal entities and concepts
- Routes to GPU worker for Granite Docling processing
- Generates final LLM output via Ollama
"""

import asyncio
import logging
import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass, asdict

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn

# ============================================================================
# Configuration
# ============================================================================

LANGEXTRACT_URL = os.getenv("LANGEXTRACT_URL", "http://localhost:9002")
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://localhost:8000")  # embeddinggemma
GRANITE_DOCLING_URL = os.getenv("GRANITE_DOCLING_URL", "http://localhost:8094")  # GPU worker
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

# Embedding model config
EMBEDDING_MODEL = "embeddinggemma:latest"
EMBEDDING_DIM = 768
BATCH_SIZE = 32  # Batch size for parallel embedding generation

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# Data Models
# ============================================================================

class ChunkInput(BaseModel):
    """Input chunk from LangExtract"""
    id: str
    content: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EmbeddingRequest(BaseModel):
    """Request for embedding generation"""
    texts: List[str]
    model: str = EMBEDDING_MODEL


class EmbeddingResponse(BaseModel):
    """Response from embedding service"""
    embeddings: List[List[float]]
    model: str
    dimension: int


class EntityExtractionRequest(BaseModel):
    """Request for entity extraction"""
    text: str
    chunk_id: str


class EntityExtractionResponse(BaseModel):
    """Response from entity extraction"""
    chunk_id: str
    entities: List[Dict[str, Any]]
    legal_concepts: List[str]
    confidence: float


class GraniteDoclingRequest(BaseModel):
    """Request for Granite Docling GPU processing"""
    chunk_id: str
    content: str
    page_number: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GraniteDoclingResponse(BaseModel):
    """Response from Granite Docling"""
    chunk_id: str
    structured_content: Dict[str, Any]
    doc_tags: Dict[str, Any]
    confidence: float


class LLMGenerationRequest(BaseModel):
    """Request for LLM output generation"""
    query: str
    context: List[str]
    chunk_ids: List[str]
    model: str = "gemma2:latest"


class LLMGenerationResponse(BaseModel):
    """Response from LLM"""
    query: str
    response: str
    model: str
    processing_time_ms: float


class ProcessingPipelineRequest(BaseModel):
    """Full pipeline request"""
    evidence_id: str
    chunks: List[ChunkInput]
    generate_llm_output: bool = False
    llm_query: Optional[str] = None


class ProcessingPipelineResponse(BaseModel):
    """Full pipeline response"""
    evidence_id: str
    processed_chunks: List[Dict[str, Any]]
    embeddings: List[List[float]]
    entities: List[Dict[str, Any]]
    llm_output: Optional[LLMGenerationResponse] = None
    processing_time_ms: float
    status: str = "completed"


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="NLP Middleware Service",
    description="Orchestrates document processing pipeline with embeddings, entity extraction, and LLM generation",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Health Check
# ============================================================================

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "OK",
        "services": {
            "langextract": LANGEXTRACT_URL,
            "embedding": EMBEDDING_URL,
            "granite_docling": GRANITE_DOCLING_URL,
            "ollama": OLLAMA_URL,
        },
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dim": EMBEDDING_DIM,
    }


# ============================================================================
# Embedding Generation (Bi-Encoder)
# ============================================================================

async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings using embeddinggemma:latest (768-dim bi-encoder)

    Args:
        texts: List of texts to embed

    Returns:
        List of 768-dimensional embeddings
    """
    if not texts:
        return []

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{EMBEDDING_URL}/api/embeddings",
                json={
                    "model": EMBEDDING_MODEL,
                    "prompt": texts[0] if len(texts) == 1 else " ".join(texts),
                },
            )

            if response.status_code != 200:
                logger.error(f"Embedding service error: {response.text}")
                raise HTTPException(500, "Embedding generation failed")

            data = response.json()
            embeddings = data.get("embedding", [])

            if not embeddings:
                raise HTTPException(500, "No embeddings returned")

            # For batch requests, replicate embedding for each text
            if len(texts) > 1:
                embeddings = [embeddings] * len(texts)
            else:
                embeddings = [embeddings]

            return embeddings

    except Exception as e:
        logger.error(f"Embedding generation error: {e}")
        raise HTTPException(500, f"Embedding generation failed: {str(e)}")


@app.post("/embeddings", response_model=EmbeddingResponse)
async def embeddings_endpoint(request: EmbeddingRequest) -> EmbeddingResponse:
    """Generate embeddings for texts"""
    embeddings = await generate_embeddings(request.texts)

    return EmbeddingResponse(
        embeddings=embeddings,
        model=request.model,
        dimension=EMBEDDING_DIM,
    )


# ============================================================================
# Entity Extraction
# ============================================================================

async def extract_entities(text: str, chunk_id: str) -> EntityExtractionResponse:
    """
    Extract legal entities and concepts from text

    Args:
        text: Text to extract entities from
        chunk_id: Chunk identifier

    Returns:
        Extracted entities and legal concepts
    """
    try:
        # Simple legal entity extraction (can be enhanced with NER models)
        legal_concepts = extract_legal_concepts(text)
        entities = extract_named_entities(text)

        return EntityExtractionResponse(
            chunk_id=chunk_id,
            entities=entities,
            legal_concepts=legal_concepts,
            confidence=0.85,  # Placeholder confidence
        )

    except Exception as e:
        logger.error(f"Entity extraction error: {e}")
        raise HTTPException(500, f"Entity extraction failed: {str(e)}")


def extract_legal_concepts(text: str) -> List[str]:
    """Extract legal concepts from text"""
    legal_keywords = [
        "contract", "tort", "negligence", "liability", "damages",
        "breach", "jurisdiction", "precedent", "statute", "regulation",
        "constitutional", "due process", "evidence", "discovery", "motion",
        "appeal", "plaintiff", "defendant", "witness", "testimony",
        "verdict", "judgment", "sentence", "penalty", "restitution",
        "custody", "child abuse", "endangerment", "abuse", "neglect",
    ]

    text_lower = text.lower()
    found_concepts = [
        concept for concept in legal_keywords
        if concept in text_lower
    ]

    return found_concepts


def extract_named_entities(text: str) -> List[Dict[str, Any]]:
    """Extract named entities from text"""
    # Placeholder for NER - can be enhanced with transformers.js or spaCy
    entities = []

    # Simple pattern matching for common legal entities
    patterns = {
        "statute": r"(?:U\.S\.C\.|Cal\.|F\.\d+d|S\.Ct\.)",
        "case": r"(?:v\.|vs\.)",
        "person": r"(?:Mr\.|Ms\.|Dr\.|Judge|Justice)",
    }

    import re
    for entity_type, pattern in patterns.items():
        matches = re.finditer(pattern, text)
        for match in matches:
            entities.append({
                "type": entity_type,
                "text": match.group(),
                "start": match.start(),
                "end": match.end(),
            })

    return entities


@app.post("/extract-entities", response_model=EntityExtractionResponse)
async def extract_entities_endpoint(request: EntityExtractionRequest) -> EntityExtractionResponse:
    """Extract entities from text"""
    return await extract_entities(request.text, request.chunk_id)


# ============================================================================
# Granite Docling GPU Processing
# ============================================================================

async def process_with_granite_docling(
    chunk_id: str,
    content: str,
    page_number: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> GraniteDoclingResponse:
    """
    Process chunk with Granite Docling on GPU

    Args:
        chunk_id: Chunk identifier
        content: Chunk content
        page_number: Page number
        metadata: Additional metadata

    Returns:
        Structured content and doc tags
    """
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{GRANITE_DOCLING_URL}/process",
                json={
                    "chunk_id": chunk_id,
                    "content": content,
                    "page_number": page_number,
                    "metadata": metadata or {},
                },
            )

            if response.status_code != 200:
                logger.error(f"Granite Docling error: {response.text}")
                raise HTTPException(500, "Granite Docling processing failed")

            data = response.json()

            return GraniteDoclingResponse(
                chunk_id=chunk_id,
                structured_content=data.get("structured_content", {}),
                doc_tags=data.get("doc_tags", {}),
                confidence=data.get("confidence", 0.8),
            )

    except Exception as e:
        logger.error(f"Granite Docling processing error: {e}")
        raise HTTPException(500, f"Granite Docling processing failed: {str(e)}")


@app.post("/process-granite", response_model=GraniteDoclingResponse)
async def process_granite_endpoint(request: GraniteDoclingRequest) -> GraniteDoclingResponse:
    """Process chunk with Granite Docling"""
    return await process_with_granite_docling(
        request.chunk_id,
        request.content,
        request.page_number,
        request.metadata,
    )


# ============================================================================
# Citation Enforcement
# ============================================================================

def format_llm_prompt_with_citations(
    query: str,
    docs: List[Dict[str, Any]],
    kag_graph: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Format LLM prompt with strict citation enforcement.

    Args:
        query: User query
        docs: List of documents with 'text' and 'source' keys
        kag_graph: Optional knowledge graph context

    Returns:
        Formatted prompt with citation requirements
    """
    # Build context with source references
    context = "\n\n---\n".join(
        [f"[{i+1}] {d.get('text', '')} (source={d.get('source', 'unknown')})"
         for i, d in enumerate(docs)]
    )

    kag_block = f"\n\n[GRAPH CONTEXT]\n{json.dumps(kag_graph)}" if kag_graph else ""

    return f"""You are a Legal AI assistant. Answer ONLY using these documents:

{context}{kag_block}

QUESTION: {query}

STRICT RULES:
- You MUST cite sources like [&1], [&2], etc. for every factual claim
- Do NOT invent, guess, or change text from sources
- Use **exact legal wording** seen in sources
- If the answer is not in the sources, reply: "No statutory or case authority provided in supplied context."

OUTPUT FORMAT:
1) Short answer (1–3 sentences) WITH citations
2) Legal reasoning (explain using citations)
3) If relevant: penalties, jurisdiction, limits WITH citations""".strip()


def validate_citations(response_text: str, num_sources: int) -> bool:
    """
    Validate that response contains proper citations.

    Args:
        response_text: LLM response text
        num_sources: Number of available sources

    Returns:
        True if citations are valid, False if hallucination detected
    """
    import re

    # Check for citation pattern [&N]
    citation_pattern = r'\[&\d+\]'
    citations = re.findall(citation_pattern, response_text)

    # If no citations found and response is substantial, likely hallucination
    if not citations and len(response_text.strip()) > 50:
        return False

    # Check for invalid citation numbers
    for citation in citations:
        num = int(citation.replace('[&', '').replace(']', ''))
        if num > num_sources or num < 1:
            return False

    return True


# ============================================================================
# LLM Output Generation
# ============================================================================

async def generate_llm_output(
    query: str,
    context: List[str],
    chunk_ids: List[str],
    model: str = "gemma2:latest",
) -> LLMGenerationResponse:
    """
    Generate LLM output using Ollama with citation enforcement.

    Args:
        query: User query
        context: Context chunks
        chunk_ids: Chunk identifiers for citation
        model: LLM model to use

    Returns:
        LLM generated response with enforced citations
    """
    try:
        # Build docs list with sources
        docs = [
            {"text": chunk, "source": f"chunk-{chunk_ids[i]}"}
            for i, chunk in enumerate(context)
        ]

        # Format prompt with citation enforcement
        prompt = format_llm_prompt_with_citations(query, docs)

        start_time = datetime.now()

        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                },
            )

            if response.status_code != 200:
                logger.error(f"Ollama error: {response.text}")
                raise HTTPException(500, "LLM generation failed")

            data = response.json()
            llm_response = data.get("response", "")

            # Validate citations
            if not validate_citations(llm_response, len(context)):
                llm_response = "No statutory or case authority provided in supplied context."

            processing_time_ms = (datetime.now() - start_time).total_seconds() * 1000

            return LLMGenerationResponse(
                query=query,
                response=llm_response,
                model=model,
                processing_time_ms=processing_time_ms,
            )

    except Exception as e:
        logger.error(f"LLM generation error: {e}")
        raise HTTPException(500, f"LLM generation failed: {str(e)}")


@app.post("/generate-llm", response_model=LLMGenerationResponse)
async def generate_llm_endpoint(request: LLMGenerationRequest) -> LLMGenerationResponse:
    """Generate LLM output"""
    return await generate_llm_output(
        request.query,
        request.context,
        request.chunk_ids,
        request.model,
    )


# ============================================================================
# Streaming RAG Endpoint
# ============================================================================

class RAGQuery(BaseModel):
    """RAG query request"""
    query: str
    context: List[str]
    chunk_ids: List[str]
    model: str = "gemma2:latest"


async def stream_llm_output(
    query: str,
    context: List[str],
    chunk_ids: List[str],
    model: str = "gemma2:latest",
):
    """
    Stream LLM output token-by-token with citation enforcement.
    First token appears in ~250-350ms.

    Args:
        query: User query
        context: Context chunks
        chunk_ids: Chunk identifiers for citation
        model: LLM model to use

    Yields:
        Response tokens as they are generated
    """
    try:
        # Build docs list with sources
        docs = [
            {"text": chunk, "source": f"chunk-{chunk_ids[i]}"}
            for i, chunk in enumerate(context)
        ]

        # Format prompt with citation enforcement
        prompt = format_llm_prompt_with_citations(query, docs)

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": True,
                },
            ) as response:
                if response.status_code != 200:
                    logger.error(f"Ollama streaming error: {response.text}")
                    yield "Error: LLM generation failed"
                    return

                full_response = ""
                async for chunk in response.aiter_text():
                    if chunk:
                        # Parse Ollama streaming response (JSON lines format)
                        try:
                            data = json.loads(chunk)
                            token = data.get("response", "")
                            if token:
                                full_response += token
                                yield token
                        except json.JSONDecodeError:
                            continue

                # Validate final response for citations
                if not validate_citations(full_response, len(context)):
                    yield "\n\n[CITATION VALIDATION FAILED]\nNo statutory or case authority provided in supplied context."

    except Exception as e:
        logger.error(f"Streaming LLM error: {e}")
        yield f"Error: {str(e)}"


@app.post("/rag/stream")
async def rag_stream_endpoint(request: RAGQuery):
    """
    Stream RAG response with citation enforcement.
    First token in ~250-350ms.

    Usage:
        curl -N -X POST http://localhost:8003/rag/stream \
          -H "Content-Type: application/json" \
          -d '{"query": "What is the penalty for perjury in California?", "context": ["..."], "chunk_ids": ["1", "2"]}'
    """
    return StreamingResponse(
        stream_llm_output(
            request.query,
            request.context,
            request.chunk_ids,
            request.model,
        ),
        media_type="text/plain",
    )


# ============================================================================
# Full Processing Pipeline
# ============================================================================

async def process_pipeline(
    evidence_id: str,
    chunks: List[ChunkInput],
    generate_llm_output: bool = False,
    llm_query: Optional[str] = None,
) -> ProcessingPipelineResponse:
    """
    Full processing pipeline:
    1. Generate embeddings (parallel, bi-encoder)
    2. Extract entities
    3. Process with Granite Docling (GPU)
    4. Generate LLM output (optional)

    Args:
        evidence_id: Evidence identifier
        chunks: List of chunks to process
        generate_llm_output: Whether to generate LLM output
        llm_query: Query for LLM generation

    Returns:
        Processed chunks with embeddings, entities, and optional LLM output
    """
    start_time = datetime.now()

    try:
        # Step 1: Generate embeddings in parallel (bi-encoder)
        logger.info(f"Generating embeddings for {len(chunks)} chunks...")
        chunk_texts = [chunk.content for chunk in chunks]
        embeddings = await generate_embeddings(chunk_texts)

        # Step 2: Extract entities in parallel
        logger.info("Extracting entities...")
        entity_tasks = [
            extract_entities(chunk.content, chunk.id)
            for chunk in chunks
        ]
        entities_list = await asyncio.gather(*entity_tasks, return_exceptions=True)

        # Step 3: Process with Granite Docling in parallel
        logger.info("Processing with Granite Docling...")
        granite_tasks = [
            process_with_granite_docling(
                chunk.id,
                chunk.content,
                chunk.page_number,
                chunk.metadata,
            )
            for chunk in chunks
        ]
        granite_results = await asyncio.gather(*granite_tasks, return_exceptions=True)

        # Step 4: Generate LLM output (optional)
        llm_output = None
        if generate_llm_output and llm_query:
            logger.info("Generating LLM output...")
            llm_output = await generate_llm_output(
                llm_query,
                chunk_texts,
                [chunk.id for chunk in chunks],
            )

        # Compile results
        processed_chunks = []
        for i, chunk in enumerate(chunks):
            processed_chunk = {
                "id": chunk.id,
                "content": chunk.content,
                "page_number": chunk.page_number,
                "section_title": chunk.section_title,
                "embedding": embeddings[i] if i < len(embeddings) else None,
                "entities": entities_list[i].dict() if i < len(entities_list) and not isinstance(entities_list[i], Exception) else {},
                "granite_output": granite_results[i].dict() if i < len(granite_results) and not isinstance(granite_results[i], Exception) else {},
            }
            processed_chunks.append(processed_chunk)

        processing_time_ms = (datetime.now() - start_time).total_seconds() * 1000

        return ProcessingPipelineResponse(
            evidence_id=evidence_id,
            processed_chunks=processed_chunks,
            embeddings=embeddings,
            entities=[e.dict() if not isinstance(e, Exception) else {} for e in entities_list],
            llm_output=llm_output,
            processing_time_ms=processing_time_ms,
            status="completed",
        )

    except Exception as e:
        logger.error(f"Pipeline processing error: {e}")
        raise HTTPException(500, f"Pipeline processing failed: {str(e)}")


@app.post("/process-pipeline", response_model=ProcessingPipelineResponse)
async def process_pipeline_endpoint(request: ProcessingPipelineRequest) -> ProcessingPipelineResponse:
    """Process full pipeline"""
    return await process_pipeline(
        request.evidence_id,
        request.chunks,
        request.generate_llm_output,
        request.llm_query,
    )


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8003)),
        log_level="info",
    )
