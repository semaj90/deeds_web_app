"""
ACE (Agentic Context Engineering) Module

Multi-Modal Self-Healing ACE Context Engineering system that combines:
- 1024-dimensional feature vector assembly
- Self-healing error detection and fixing
- Multi-modal search (text, visual, graph)
- Context anchor management
- Data store topology ingestion
"""

from .models import (
    AceContext,
    ErrorInfo,
    ErrorCluster,
    ClusterAnalysis,
    Patch,
    PatchResult,
    ContextAnchor,
    SearchResults,
    IngestionResult,
)
from .enhanced_feature_vector import EnhancedFeatureVectorAssembler
from .self_healing_engine import SelfHealingErrorEngine
from .multimodal_search import MultiModalSearchEngine
from .context_anchor import ContextAnchorManager
from .data_store_topology import DataStoreTopologyManager

__all__ = [
    # Models
    "AceContext",
    "ErrorInfo",
    "ErrorCluster",
    "ClusterAnalysis",
    "Patch",
    "PatchResult",
    "ContextAnchor",
    "SearchResults",
    "IngestionResult",
    # Components
    "EnhancedFeatureVectorAssembler",
    "SelfHealingErrorEngine",
    "MultiModalSearchEngine",
    "ContextAnchorManager",
    "DataStoreTopologyManager",
]
