"""
RAG Source Validation Schemas
=============================

Pydantic models for human-in-the-loop source validation in legal RAG.
Implements the CopilotKit + PydanticAI pattern for your custom stack.

Flow:
1. kb_search(query) -> RetrieveCandidatesResponse
2. kb_validate_sources(selected_ids) -> ApprovedContext
3. kb_answer(approved_context) -> AnswerWithCitations
4. kb_update_kag(answer) -> KnowledgeGraphUpdate

Usage:
    from schemas.rag_source_validation import (
        RetrieveCandidatesRequest,
        RetrieveCandidatesResponse,
        ValidateSourcesRequest,
        ApprovedContext,
        AnswerRequest,
        AnswerWithCitations,
    )
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
import uuid


# =============================================================================
# Enums
# =============================================================================

class SourceType(str, Enum):
    """Type of retrieved source"""
    DOCUMENT = "document"
    STATUTE = "statute"
    CASE_LAW = "case_law"
    REGULATION = "regulation"
    CONTRACT = "contract"
    EVIDENCE = "evidence"
    PRECEDENT = "precedent"
    EXPERT_OPINION = "expert_opinion"


class ValidationStatus(str, Enum):
    """Source validation status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_REVIEW = "needs_review"


class ConfidenceLevel(str, Enum):
    """Confidence level for retrieved sources"""
    HIGH = "high"      # score >= 0.85
    MEDIUM = "medium"  # score >= 0.70
    LOW = "low"        # score >= 0.50
    MARGINAL = "marginal"  # score < 0.50


# =============================================================================
# Step 1: Retrieve Candidates (RAG Search)
# =============================================================================

class RetrieveCandidatesRequest(BaseModel):
    """Request to search knowledge base"""
    query: str = Field(..., description="Natural language query")
    case_id: Optional[str] = Field(None, description="Case context for filtering")
    top_k: int = Field(10, ge=1, le=50, description="Number of results")
    min_score: float = Field(0.5, ge=0.0, le=1.0, description="Minimum similarity score")
    source_types: Optional[List[SourceType]] = Field(None, description="Filter by source type")
    use_hybrid: bool = Field(True, description="Use BM25 + dense hybrid search")
    use_rerank: bool = Field(True, description="Apply GPU reranking")
    include_neighbors: bool = Field(True, description="Include KAG graph neighbors")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "What are the statute of limitations for personal injury in California?",
                "case_id": "case-2025-001",
                "top_k": 10,
                "min_score": 0.6,
                "source_types": ["statute", "case_law"],
                "use_hybrid": True,
                "use_rerank": True,
                "include_neighbors": True
            }
        }


class RetrievedChunk(BaseModel):
    """A single retrieved chunk with metadata"""
    chunk_id: str = Field(..., description="Unique chunk identifier")
    text: str = Field(..., description="Chunk text content")
    snippet: str = Field(..., description="Highlighted snippet for display")

    # Scoring
    score: float = Field(..., ge=0.0, le=1.0, description="Similarity score")
    bm25_score: Optional[float] = Field(None, description="BM25 lexical score")
    dense_score: Optional[float] = Field(None, description="Dense embedding score")
    rerank_score: Optional[float] = Field(None, description="GPU rerank score")
    confidence: ConfidenceLevel = Field(..., description="Confidence level")

    # Source metadata
    source_type: SourceType = Field(..., description="Type of source")
    source_id: str = Field(..., description="Source document ID")
    source_title: str = Field(..., description="Source document title")
    source_url: Optional[str] = Field(None, description="URL if available")

    # Location
    page_num: Optional[int] = Field(None, description="Page number")
    section: Optional[str] = Field(None, description="Section/heading")

    # Multimodal
    has_image: bool = Field(False, description="Has associated image")
    has_table: bool = Field(False, description="Has associated table")
    seal_confidence: Optional[float] = Field(None, description="Seal detection confidence")

    # KAG graph context
    related_entities: List[str] = Field(default_factory=list, description="Related KAG entities")
    graph_neighbors: List[str] = Field(default_factory=list, description="Graph neighbor chunk IDs")

    class Config:
        json_schema_extra = {
            "example": {
                "chunk_id": "chunk-abc123",
                "text": "California Code of Civil Procedure Section 335.1 provides that...",
                "snippet": "...Section 335.1 provides that the **statute of limitations** for personal injury is **two years**...",
                "score": 0.92,
                "bm25_score": 0.85,
                "dense_score": 0.94,
                "rerank_score": 0.91,
                "confidence": "high",
                "source_type": "statute",
                "source_id": "ca-ccp-335",
                "source_title": "California Code of Civil Procedure § 335.1",
                "source_url": "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CCP&sectionNum=335.1",
                "page_num": 1,
                "section": "Time of Commencing Actions",
                "has_image": False,
                "has_table": False,
                "related_entities": ["statute_of_limitations", "personal_injury", "california"],
                "graph_neighbors": ["chunk-def456", "chunk-ghi789"]
            }
        }


class RetrieveCandidatesResponse(BaseModel):
    """Response from knowledge base search"""
    query_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique query ID")
    query: str = Field(..., description="Original query")
    case_id: Optional[str] = Field(None, description="Case context")

    # Results
    chunks: List[RetrievedChunk] = Field(..., description="Retrieved chunks")
    total_found: int = Field(..., description="Total matching chunks")

    # Search metadata
    search_time_ms: float = Field(..., description="Search time in milliseconds")
    embedding_time_ms: float = Field(..., description="Embedding generation time")
    rerank_time_ms: Optional[float] = Field(None, description="Reranking time")

    # Model info
    embedding_model: str = Field("embeddinggemma:latest", description="Embedding model used")
    rerank_model: Optional[str] = Field(None, description="Reranking model used")

    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "query_id": "q-12345",
                "query": "statute of limitations personal injury California",
                "case_id": "case-2025-001",
                "chunks": [],  # See RetrievedChunk example
                "total_found": 47,
                "search_time_ms": 145.2,
                "embedding_time_ms": 23.4,
                "rerank_time_ms": 67.8,
                "embedding_model": "embeddinggemma:latest",
                "rerank_model": "gemma3-legal:latest"
            }
        }


# =============================================================================
# Step 2: Validate Sources (Human-in-the-Loop)
# =============================================================================

class SourceValidation(BaseModel):
    """Single source validation decision"""
    chunk_id: str = Field(..., description="Chunk ID being validated")
    status: ValidationStatus = Field(..., description="Validation decision")
    reason: Optional[str] = Field(None, description="Reason for decision")
    relevance_rating: Optional[int] = Field(None, ge=1, le=5, description="1-5 relevance rating")
    trust_rating: Optional[int] = Field(None, ge=1, le=5, description="1-5 trust rating")


class ValidateSourcesRequest(BaseModel):
    """Request to validate selected sources"""
    query_id: str = Field(..., description="Original query ID")
    case_id: str = Field(..., description="Case ID for persistence")
    validations: List[SourceValidation] = Field(..., description="Validation decisions")
    user_id: Optional[str] = Field(None, description="User making validation")
    notes: Optional[str] = Field(None, description="Additional notes")

    class Config:
        json_schema_extra = {
            "example": {
                "query_id": "q-12345",
                "case_id": "case-2025-001",
                "validations": [
                    {"chunk_id": "chunk-abc123", "status": "approved", "relevance_rating": 5},
                    {"chunk_id": "chunk-def456", "status": "approved", "relevance_rating": 4},
                    {"chunk_id": "chunk-ghi789", "status": "rejected", "reason": "Outdated precedent"}
                ],
                "user_id": "attorney-001",
                "notes": "Selected primary statute and supporting case law"
            }
        }


class ApprovedContext(BaseModel):
    """Approved sources ready for LLM synthesis"""
    context_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique context ID")
    query_id: str = Field(..., description="Original query ID")
    case_id: str = Field(..., description="Case ID")

    # Approved chunks
    approved_chunks: List[RetrievedChunk] = Field(..., description="Approved source chunks")
    rejected_chunk_ids: List[str] = Field(default_factory=list, description="Rejected chunk IDs")

    # Aggregated context
    combined_context: str = Field(..., description="Combined text from approved sources")
    total_tokens: int = Field(..., description="Total token count")

    # Validation metadata
    validated_by: Optional[str] = Field(None, description="User who validated")
    validated_at: datetime = Field(default_factory=datetime.utcnow)

    # For case canvas state
    canvas_pin: Optional[Dict[str, Any]] = Field(None, description="Case canvas pin data")


# =============================================================================
# Step 3: Generate Answer with Citations
# =============================================================================

class AnswerRequest(BaseModel):
    """Request to generate answer from approved context"""
    context_id: str = Field(..., description="Approved context ID")
    query: str = Field(..., description="Original query")
    case_id: str = Field(..., description="Case ID")

    # Generation options
    max_tokens: int = Field(2048, ge=100, le=8192, description="Max output tokens")
    temperature: float = Field(0.3, ge=0.0, le=1.0, description="Generation temperature")
    include_citations: bool = Field(True, description="Include inline citations")
    include_todos: bool = Field(True, description="Generate action items")

    # Legal-specific options
    jurisdiction: Optional[str] = Field(None, description="Jurisdiction context")
    legal_area: Optional[str] = Field(None, description="Legal area (tort, contract, etc.)")


class Citation(BaseModel):
    """Inline citation reference"""
    citation_id: str = Field(..., description="Citation identifier (e.g., [1])")
    chunk_id: str = Field(..., description="Source chunk ID")
    source_title: str = Field(..., description="Source document title")
    source_url: Optional[str] = Field(None, description="Source URL")
    page_num: Optional[int] = Field(None, description="Page number")
    quote: str = Field(..., description="Quoted text supporting claim")


class ActionItem(BaseModel):
    """Generated action item / TODO"""
    action_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str = Field(..., description="Action description")
    priority: str = Field("medium", description="Priority level")
    due_date: Optional[str] = Field(None, description="Suggested due date")
    assigned_to: Optional[str] = Field(None, description="Suggested assignee")
    related_chunks: List[str] = Field(default_factory=list, description="Related source chunks")


class AnswerWithCitations(BaseModel):
    """LLM-generated answer with full provenance"""
    answer_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    context_id: str = Field(..., description="Source context ID")
    case_id: str = Field(..., description="Case ID")

    # The answer
    answer: str = Field(..., description="Generated answer with inline citations")
    summary: str = Field(..., description="One-paragraph summary")

    # Citations
    citations: List[Citation] = Field(default_factory=list, description="Citation references")

    # Action items
    action_items: List[ActionItem] = Field(default_factory=list, description="Generated TODOs")

    # Metadata
    model: str = Field("gemma3-legal:latest", description="LLM model used")
    tokens_used: int = Field(..., description="Tokens consumed")
    generation_time_ms: float = Field(..., description="Generation time")

    # Confidence
    answer_confidence: float = Field(..., ge=0.0, le=1.0, description="Answer confidence")
    grounding_score: float = Field(..., ge=0.0, le=1.0, description="How grounded in sources")

    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "answer_id": "ans-12345",
                "context_id": "ctx-67890",
                "case_id": "case-2025-001",
                "answer": "Under California law, the statute of limitations for personal injury claims is **two years** from the date of injury [1]. This is codified in California Code of Civil Procedure Section 335.1 [2]. However, the discovery rule may toll this period if the injury was not immediately apparent [3]...",
                "summary": "California personal injury claims must be filed within 2 years, with possible tolling under the discovery rule.",
                "citations": [
                    {
                        "citation_id": "[1]",
                        "chunk_id": "chunk-abc123",
                        "source_title": "CA CCP § 335.1",
                        "quote": "An action for assault, battery, or injury to, or for the death of, an individual caused by the wrongful act or neglect of another"
                    }
                ],
                "action_items": [
                    {
                        "description": "Verify exact date of injury for limitations calculation",
                        "priority": "high"
                    },
                    {
                        "description": "Research discovery rule applicability to this case",
                        "priority": "medium"
                    }
                ],
                "model": "gemma3-legal:latest",
                "tokens_used": 847,
                "generation_time_ms": 1234.5,
                "answer_confidence": 0.89,
                "grounding_score": 0.95
            }
        }


# =============================================================================
# Step 4: Update Knowledge Graph (KAG)
# =============================================================================

class KAGEntity(BaseModel):
    """Entity extracted for knowledge graph"""
    entity_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="Entity name")
    entity_type: str = Field(..., description="Entity type (person, statute, concept, etc.)")
    properties: Dict[str, Any] = Field(default_factory=dict)
    source_chunk_ids: List[str] = Field(default_factory=list, description="Source chunks")


class KAGRelation(BaseModel):
    """Relation between entities"""
    relation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_entity_id: str = Field(..., description="Source entity")
    target_entity_id: str = Field(..., description="Target entity")
    relation_type: str = Field(..., description="Relation type (e.g., 'cites', 'contradicts', 'supports')")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    properties: Dict[str, Any] = Field(default_factory=dict)
    source_chunk_ids: List[str] = Field(default_factory=list)


class KnowledgeGraphUpdate(BaseModel):
    """Knowledge graph update from answer generation"""
    update_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    answer_id: str = Field(..., description="Source answer ID")
    case_id: str = Field(..., description="Case ID")

    # New entities and relations
    entities: List[KAGEntity] = Field(default_factory=list)
    relations: List[KAGRelation] = Field(default_factory=list)

    # Provenance tracking
    claims_based_on: List[str] = Field(default_factory=list, description="Source chunk IDs")

    timestamp: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# Case Canvas State (for evidence board)
# =============================================================================

class CanvasPin(BaseModel):
    """A pin on the case canvas / evidence board"""
    pin_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str = Field(..., description="Case ID")

    # Content
    title: str = Field(..., description="Pin title")
    content: str = Field(..., description="Pin content/summary")
    pin_type: str = Field(..., description="evidence, research, note, action, etc.")

    # Source tracking
    source_query_id: Optional[str] = Field(None, description="Source query ID")
    source_chunk_ids: List[str] = Field(default_factory=list)
    source_answer_id: Optional[str] = Field(None, description="Source answer ID")

    # Position on canvas
    x: float = Field(0.0, description="X position")
    y: float = Field(0.0, description="Y position")
    width: float = Field(200.0, description="Width")
    height: float = Field(150.0, description="Height")
    color: str = Field("#ffffff", description="Background color")

    # Connections to other pins
    connected_to: List[str] = Field(default_factory=list, description="Connected pin IDs")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(None)
    updated_at: Optional[datetime] = Field(None)

    # Validation state
    is_validated: bool = Field(False)
    validation_status: ValidationStatus = Field(ValidationStatus.PENDING)


class CaseCanvasState(BaseModel):
    """Full case canvas state"""
    case_id: str = Field(..., description="Case ID")
    canvas_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Pins
    pins: List[CanvasPin] = Field(default_factory=list)

    # Layout
    zoom: float = Field(1.0, ge=0.1, le=3.0)
    pan_x: float = Field(0.0)
    pan_y: float = Field(0.0)

    # Query history
    queries: List[str] = Field(default_factory=list, description="Query IDs")
    answers: List[str] = Field(default_factory=list, description="Answer IDs")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(None)
    version: int = Field(1)


# =============================================================================
# API Response Wrappers
# =============================================================================

class APIResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool = Field(True)
    data: Optional[Any] = Field(None)
    error: Optional[str] = Field(None)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PaginatedResponse(BaseModel):
    """Paginated response"""
    items: List[Any] = Field(default_factory=list)
    total: int = Field(0)
    page: int = Field(1)
    page_size: int = Field(20)
    has_more: bool = Field(False)
