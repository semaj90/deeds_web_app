"""Data models for multi-source retrieval topology."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID


@dataclass
class QueryProfile:
    """Profile of an analyzed query."""

    query: str
    intent: str  # "legal", "general", "recent", "temporal"
    entities: List[str] = field(default_factory=list)
    temporal_refs: Optional[List[str]] = None
    confidence_threshold: float = 0.5
    source_preferences: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)
    requires_visual_search: bool = False
    requires_citations: bool = False


@dataclass
class Result:
    """Result from a retrieval source."""

    id: str
    content: str
    source: str
    relevance_score: float  # 0-1
    confidence_score: float  # 0-1
    recency_score: float  # 0-1 (1 = most recent)
    credibility_score: float  # 0-1
    timestamp: datetime
    metadata: Dict = field(default_factory=dict)
    embedding: Optional[List[float]] = None


@dataclass
class Citation:
    """Citation extracted from search results."""

    id: str
    text: str  # Quoted passage
    source_url: str
    source_title: str
    context_before: str
    context_after: str
    confidence: float
    timestamp: datetime
    highlighted: bool = True


@dataclass
class ResultWithCitations(Result):
    """Result with associated citations."""

    citations: List[Citation] = field(default_factory=list)
    highlighted_content: str = ""
    citation_count: int = 0
    citation_confidence: float = 0.0


@dataclass
class ImageAnalysis:
    """Analysis of an image using Gemma3 VLM."""

    image_id: str
    image_path: str
    extracted_text: str
    visual_objects: List[str] = field(default_factory=list)
    scene_description: str = ""
    relationships: List[str] = field(default_factory=list)
    embedding: Optional[List[float]] = None
    confidence: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    source_url: Optional[str] = None


@dataclass
class RoutingStrategy:
    """Strategy for routing queries to sources."""

    primary_sources: List[str] = field(default_factory=list)
    secondary_sources: List[str] = field(default_factory=list)
    fallback_sources: List[str] = field(default_factory=list)
    parallel_execution: bool = True
    timeout_per_source: int = 30  # seconds
    min_results_threshold: int = 1


@dataclass
class EnhancedRoutingStrategy(RoutingStrategy):
    """Enhanced routing strategy with citation and image support."""

    include_google_search: bool = True
    track_citations: bool = True
    search_images: bool = False
    vlm_analysis: bool = False
    image_confidence_threshold: float = 0.7


@dataclass
class Entity:
    """Entity in the 4D graph."""

    id: str
    name: str
    type: str
    attributes: Dict = field(default_factory=dict)


@dataclass
class Relationship:
    """Relationship between entities."""

    source_id: str
    target_id: str
    type: str
    strength: float


@dataclass
class TemporalEdge:
    """Temporal edge in the 4D graph."""

    relationship_id: str
    timestamp: datetime
    confidence: float


@dataclass
class Graph4D:
    """4D graph topology with entity, relationship, temporal, and confidence dimensions."""

    entities: Dict[str, Entity] = field(default_factory=dict)
    relationships: Dict[str, Relationship] = field(default_factory=dict)
    temporal_edges: Dict[str, TemporalEdge] = field(default_factory=dict)
    confidence_scores: Dict[str, float] = field(default_factory=dict)
