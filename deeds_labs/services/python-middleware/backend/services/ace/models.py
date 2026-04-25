"""
Data models for ACE (Agentic Context Engineering) system.

Defines core data structures for:
- Feature vector context
- Error detection and clustering
- Patch generation and validation
- Context anchors
- Search results
- Data store ingestion
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum
import numpy as np


# =============================================================================
# Feature Vector Constants
# =============================================================================

TOTAL_DIMS = 1024
BLOCK_DIMS = {
    "llm_text": 256,
    "vlm_layout": 128,
    "web_rag": 128,
    "tools": 128,
    "phase_ast": 192,
    "legal_flags": 96,
    "runtime": 96,
}

BLOCK_OFFSETS = {
    "llm_text": 0,
    "vlm_layout": 256,
    "web_rag": 384,
    "tools": 512,
    "phase_ast": 640,
    "legal_flags": 832,
    "runtime": 928,
}


# =============================================================================
# Enums
# =============================================================================

class ErrorSeverity(str, Enum):
    """Error severity levels."""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class PatchStatus(str, Enum):
    """Patch application status."""
    PENDING = "pending"
    APPLIED = "applied"
    VALIDATED = "validated"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class SearchModality(str, Enum):
    """Search modality types."""
    TEXT = "text"
    VISUAL = "visual"
    GRAPH = "graph"


class Jurisdiction(str, Enum):
    """Legal jurisdictions."""
    CA = "CA"
    FEDERAL = "Federal"
    NY = "NY"
    TX = "TX"
    FL = "FL"
    UNKNOWN = "unknown"


class LegalTopic(str, Enum):
    """Legal topic classifications."""
    CONTRACT = "contract"
    TORT = "tort"
    CRIMINAL = "criminal"
    FAMILY = "family"
    IMMIGRATION = "immigration"
    BANKRUPTCY = "bankruptcy"
    IP = "ip"
    EMPLOYMENT = "employment"
    CONSTITUTIONAL = "constitutional"


# =============================================================================
# ACE Context
# =============================================================================

@dataclass
class AceContext:
    """Context for ACE orchestrator operations."""
    conversation_id: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    query: Optional[str] = None
    intent: Optional[str] = None
    entities: List[str] = field(default_factory=list)
    temporal_refs: List[str] = field(default_factory=list)
    confidence_threshold: float = 0.7
    source_preferences: List[str] = field(default_factory=list)
    feature_vector: Optional[np.ndarray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


# =============================================================================
# Error Models
# =============================================================================

@dataclass
class ErrorInfo:
    """Information about a TypeScript/Svelte error."""
    id: str
    file: str
    line: int
    column: int
    code: str
    message: str
    severity: ErrorSeverity = ErrorSeverity.ERROR
    context: str = ""
    embedding: Optional[np.ndarray] = None
    cluster_id: Optional[str] = None
    neo4j_node_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "id": self.id,
            "file": self.file,
            "line": self.line,
            "column": self.column,
            "code": self.code,
            "message": self.message,
            "severity": self.severity.value,
            "context": self.context,
            "cluster_id": self.cluster_id,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class ErrorCluster:
    """Cluster of related errors."""
    id: str
    errors: List[ErrorInfo] = field(default_factory=list)
    centroid: Optional[np.ndarray] = None
    pattern: str = ""
    description: str = ""
    impact_score: float = 0.0
    fixability_score: float = 0.0
    priority_score: float = 0.0
    root_cause: Optional[str] = None
    suggested_fix: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)

    @property
    def size(self) -> int:
        """Number of errors in cluster."""
        return len(self.errors)

    def calculate_priority(self) -> float:
        """Calculate priority score from impact and fixability."""
        self.priority_score = (self.impact_score * 0.6) + (self.fixability_score * 0.4)
        return self.priority_score


@dataclass
class ClusterAnalysis:
    """Analysis result for an error cluster."""
    cluster_id: str
    pattern_description: str
    root_cause_analysis: str
    suggested_fixes: List[str] = field(default_factory=list)
    confidence: float = 0.0
    llm_reasoning: str = ""
    analyzed_at: datetime = field(default_factory=datetime.now)


# =============================================================================
# Patch Models
# =============================================================================

@dataclass
class PatchFile:
    """A file modification in a patch."""
    path: str
    before: str
    after: str
    changes: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class Patch:
    """A code patch for fixing errors."""
    id: str
    cluster_id: str
    files: List[PatchFile] = field(default_factory=list)
    description: str = ""
    reasoning: str = ""
    confidence: float = 0.0
    feature_vector_score: float = 0.0
    status: PatchStatus = PatchStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    applied_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None


@dataclass
class PatchResult:
    """Result of applying a patch."""
    patch_id: str
    success: bool
    errors_before: int = 0
    errors_after: int = 0
    errors_resolved: int = 0
    new_errors_introduced: int = 0
    validation_passed: bool = False
    rollback_performed: bool = False
    error_message: Optional[str] = None
    duration_ms: int = 0
    timestamp: datetime = field(default_factory=datetime.now)


# =============================================================================
# Context Anchor Models
# =============================================================================

@dataclass
class ContextAnchor:
    """Context anchor in feature vector space."""
    id: str
    conversation_id: str
    vector: np.ndarray
    history: List[np.ndarray] = field(default_factory=list)
    drift_threshold: float = 0.3
    current_drift: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    persisted: bool = False

    def calculate_drift(self, current_vector: np.ndarray) -> float:
        """Calculate drift from anchor to current vector."""
        if self.vector is None or current_vector is None:
            return 0.0

        # Cosine similarity
        dot = np.dot(self.vector, current_vector)
        norm_a = np.linalg.norm(self.vector)
        norm_b = np.linalg.norm(current_vector)

        if norm_a == 0 or norm_b == 0:
            return 1.0

        similarity = dot / (norm_a * norm_b)
        self.current_drift = 1.0 - similarity
        return self.current_drift

    def is_drifted(self) -> bool:
        """Check if context has drifted beyond threshold."""
        return self.current_drift > self.drift_threshold


# =============================================================================
# Search Models
# =============================================================================

@dataclass
class TextResult:
    """Text search result."""
    id: str
    content: str
    source: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class VisualResult:
    """Visual search result."""
    id: str
    image_path: str
    description: str
    score: float
    extracted_text: str = ""
    objects: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphResult:
    """Graph search result."""
    id: str
    entity: str
    entity_type: str
    relationships: List[Dict[str, Any]] = field(default_factory=list)
    score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SynthesizedResult:
    """Synthesized result from multiple modalities."""
    id: str
    content: str
    source: str
    modalities: List[SearchModality] = field(default_factory=list)
    combined_score: float = 0.0
    confidence: float = 0.0
    attribution: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResults:
    """Combined search results from all modalities."""
    query: str
    text_results: List[TextResult] = field(default_factory=list)
    visual_results: List[VisualResult] = field(default_factory=list)
    graph_results: List[GraphResult] = field(default_factory=list)
    synthesized: List[SynthesizedResult] = field(default_factory=list)
    feature_vector: Optional[np.ndarray] = None
    total_results: int = 0
    search_time_ms: int = 0
    timestamp: datetime = field(default_factory=datetime.now)


# =============================================================================
# Data Store Models
# =============================================================================

@dataclass
class Document:
    """Document for ingestion."""
    id: str
    content: str
    title: str = ""
    source: str = ""
    doc_type: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class IngestionResult:
    """Result of document ingestion."""
    document_id: str
    success: bool
    minio_path: Optional[str] = None
    postgres_id: Optional[int] = None
    qdrant_id: Optional[str] = None
    neo4j_node_ids: List[str] = field(default_factory=list)
    summary: Optional[str] = None
    embedding_dims: int = 0
    entities_extracted: int = 0
    error_message: Optional[str] = None
    duration_ms: int = 0
    timestamp: datetime = field(default_factory=datetime.now)


# =============================================================================
# Legal Context Models
# =============================================================================

@dataclass
class LegalContext:
    """Legal context information."""
    jurisdiction: Jurisdiction = Jurisdiction.UNKNOWN
    is_federal: bool = False
    is_state: bool = False
    state_code: str = ""
    court_level: int = 0
    topics: List[LegalTopic] = field(default_factory=list)
    topic_probs: Dict[str, float] = field(default_factory=dict)
    primary_topic: Optional[LegalTopic] = None
    statute_density: float = 0.0
    case_law_density: float = 0.0
    regulation_density: float = 0.0
    constitutional_refs: int = 0
    citation_types: Dict[str, int] = field(default_factory=dict)


# =============================================================================
# Runtime Models
# =============================================================================

@dataclass
class RuntimeMetrics:
    """Runtime performance metrics."""
    tokens_per_sec: float = 0.0
    inference_latency_ms: float = 0.0
    batch_size: int = 1
    using_tensorrt: bool = False
    using_wasm_fallback: bool = False
    gpu_memory_used_mb: float = 0.0
    gpu_memory_total_mb: float = 8192.0
    gpu_utilization: float = 0.0
    thermal_state: str = "normal"
    latency_budget_ms: float = 1000.0
    latency_remaining_ms: float = 1000.0
    deadline_pressure: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
