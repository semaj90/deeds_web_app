# Shared Types for Evidence AI Assistant
# Compatible with SvelteKit 2 TypeScript types

from typing import List, Dict, Optional, Literal
from datetime import datetime
from pydantic import BaseModel


class EvidenceFile(BaseModel):
    id: str
    user_id: str
    case_id: Optional[str] = None
    filename: str
    bucket: str
    path: str  # MinIO path: userId/caseId/fileId-filename
    uploaded_at: datetime
    tags: List[str] = []
    embedding: Optional[List[float]] = None
    summary: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None
    status: Literal["pending", "processing", "completed", "failed"] = "pending"


class AIResponse(BaseModel):
    text: str
    source: Literal["triton", "tensorrt", "ollama"]
    model: Optional[str] = None
    tokens_generated: Optional[int] = None
    processing_time_ms: Optional[int] = None
    tool_invocations: Optional[List[str]] = None


class WorkflowEvent(BaseModel):
    file_id: str
    stage: Literal["upload", "ocr", "embedding", "analysis", "storage", "complete"]
    progress: int  # 0-100
    status: Literal["idle", "processing", "completed", "failed"]
    error: Optional[str] = None
    timestamp: datetime


class SearchQuery(BaseModel):
    query: str
    user_id: Optional[str] = None
    use_vector: bool = True
    limit: int = 10
    embedding: Optional[List[float]] = None


class SearchResult(BaseModel):
    id: str
    filename: str
    snippet: str
    tags: List[str] = []
    vector_score: Optional[float] = None
    fuzzy_score: Optional[float] = None
    uploaded_at: Optional[datetime] = None


class AISuggestion(BaseModel):
    file_id: str
    snippet: str
    suggested_tags: List[str] = []
    insight: Optional[str] = None
    score: float = 0.0
    relevance: float = 0.0


class StreamingUpdate(BaseModel):
    file_id: str
    status: Literal["idle", "processing", "embedding", "tagging", "completed", "failed"]
    progress: int  # 0-100
    summary: Optional[str] = None
    auto_tags: List[str] = []
    token: Optional[str] = None
    error: Optional[str] = None
    timestamp: int  # Unix timestamp in milliseconds
