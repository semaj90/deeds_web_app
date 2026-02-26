# Design Document: Multi-Modal Self-Healing ACE Context Engineering

## Overview

This system enhances the existing 1024-dimensional multi-modal feature vector infrastructure with self-healing error fixing capabilities, LLM graph analysis, and ACE (Agentic Context Engineering) integration. The architecture combines Phase 72 AST error reduction with multi-source retrieval topology to create an intelligent, self-correcting codebase agent.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ACE Orchestrator                                     │
│  (Agentic Context Engineering - Query routing, context management)          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Feature Vector Assembler (1024d)                          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬────────┬────────┐│
│  │LLM Text  │VLM Layout│Web/RAG   │Tools     │Phase/AST │Legal   │Runtime ││
│  │(256d)    │(128d)    │(128d)    │(128d)    │(192d)    │(96d)   │(96d)   ││
│  └──────────┴──────────┴──────────┴──────────┴──────────┴────────┴────────┘│
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ Self-Healing  │    │ Multi-Modal       │    │ Context Anchor    │
│ Error Engine  │    │ Search Engine     │    │ Manager           │
└───────┬───────┘    └─────────┬─────────┘    └─────────┬─────────┘
        │                      │                        │
        ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Data Store Topology Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Qdrant     │  │  pgvector    │  │    MinIO     │  │    Neo4j     │   │
│  │  (vectors)   │◄─►│ (embeddings) │  │  (documents) │  │   (graph)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Go SIMD Scorer (High-Performance)                       │
│  (Binary encoding, SIMD operations, C++ integration)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Enhanced Feature Vector Assembler

**Purpose**: Assemble 1024-dimensional feature vector from multi-modal signals for ACE integration.

**Interface**:
```python
class EnhancedFeatureVectorAssembler:
    """Assembles 1024-d feature vector with ACE integration."""

    async def assemble_from_ace_context(
        self,
        ace_context: AceContext,
        llm_response: Optional[Dict] = None,
        doc_analysis: Optional[Dict] = None,
        search_results: Optional[List[Dict]] = None,
        tool_history: Optional[List[Dict]] = None,
        error_report: Optional[Dict] = None,
        phase_info: Optional[Dict] = None,
        legal_context: Optional[Dict] = None,
        gpu_stats: Optional[Dict] = None,
        inference_stats: Optional[Dict] = None
    ) -> np.ndarray:
        """Assemble feature vector from ACE context and signals."""

    def to_go_simd_format(self, vector: np.ndarray) -> bytes:
        """Serialize for Go SIMD scorer."""

    def from_go_simd_format(self, data: bytes) -> np.ndarray:
        """Deserialize from Go SIMD scorer."""
```

### 2. Self-Healing Error Engine

**Purpose**: Detect, analyze, and fix TypeScript/Svelte errors automatically.

**Interface**:
```python
class SelfHealingErrorEngine:
    """Self-healing error detection and fixing engine."""

    async def extract_errors(self) -> List[ErrorInfo]:
        """Extract errors from svelte-check output."""

    async def generate_embeddings(self, errors: List[ErrorInfo]) -> List[np.ndarray]:
        """Generate embeddings for errors."""

    async def store_errors(self, errors: List[ErrorInfo], embeddings: List[np.ndarray]) -> None:
        """Store errors in Qdrant, pgvector, and Neo4j."""

    async def cluster_errors(self) -> List[ErrorCluster]:
        """Cluster errors using graph algorithms and embeddings."""

    async def analyze_clusters(self, clusters: List[ErrorCluster]) -> List[ClusterAnalysis]:
        """Analyze clusters with Gemma3-legal."""

    async def generate_patches(self, analysis: List[ClusterAnalysis]) -> List[Patch]:
        """Generate patch candidates."""

    async def apply_and_validate(self, patches: List[Patch]) -> List[PatchResult]:
        """Apply patches and validate with rollback."""

    async def update_feature_vector(self, results: List[PatchResult]) -> np.ndarray:
        """Update feature vector with results."""
```

### 3. Multi-Modal Search Engine

**Purpose**: Unified search across text, visual, and graph modalities.

**Interface**:
```python
class MultiModalSearchEngine:
    """Multi-modal search across text, visual, and graph."""

    async def search(
        self,
        query: str,
        modalities: List[str] = ["text", "visual", "graph"],
        top_k: int = 10
    ) -> SearchResults:
        """Unified multi-modal search."""

    async def search_text(self, query: str, top_k: int) -> List[TextResult]:
        """Text search with Qdrant/pgvector fallback."""

    async def search_visual(self, query: str, top_k: int) -> List[VisualResult]:
        """Visual search with Gemma3 VLM embeddings."""

    async def search_graph(self, query: str, top_k: int) -> List[GraphResult]:
        """Graph search with Neo4j traversal."""

    async def synthesize_results(
        self,
        text_results: List[TextResult],
        visual_results: List[VisualResult],
        graph_results: List[GraphResult]
    ) -> SearchResults:
        """Synthesize and rank multi-modal results."""
```

### 4. Context Anchor Manager

**Purpose**: Manage context anchors in feature vector space for coherent conversations.

**Interface**:
```python
class ContextAnchorManager:
    """Manages context anchors in feature vector space."""

    async def create_anchor(self, feature_vector: np.ndarray, conversation_id: str) -> ContextAnchor:
        """Create initial context anchor."""

    async def update_anchor(
        self,
        anchor: ContextAnchor,
        new_vector: np.ndarray,
        preserve_history: bool = True
    ) -> ContextAnchor:
        """Update anchor while preserving history."""

    async def filter_by_anchor(
        self,
        anchor: ContextAnchor,
        results: List[Any],
        threshold: float = 0.7
    ) -> List[Any]:
        """Filter results by relevance to anchor."""

    async def detect_drift(self, anchor: ContextAnchor, current_vector: np.ndarray) -> float:
        """Detect context drift from anchor."""

    async def persist_anchor(self, anchor: ContextAnchor) -> None:
        """Persist anchor for future reference."""

    async def load_anchor(self, conversation_id: str) -> Optional[ContextAnchor]:
        """Load persisted anchor."""
```

### 5. Data Store Topology Manager

**Purpose**: Unified ingestion and query across all data stores.

**Interface**:
```python
class DataStoreTopologyManager:
    """Manages unified data store topology."""

    async def ingest_document(self, document: Document) -> IngestionResult:
        """Ingest document across all stores."""

    async def store_in_minio(self, document: Document) -> str:
        """Store raw content in MinIO."""

    async def store_in_postgres(self, document: Document, minio_path: str) -> int:
        """Store summary and embedding in PostgreSQL."""

    async def mirror_to_qdrant(self, embedding: np.ndarray, metadata: Dict) -> str:
        """Mirror embedding to Qdrant."""

    async def create_neo4j_entities(self, document: Document) -> List[str]:
        """Create Neo4j nodes and relationships."""

    async def query_topology(self, query: str) -> TopologyQueryResult:
        """Query across all stores."""
```

## Data Models

### ErrorInfo
```python
@dataclass
class ErrorInfo:
    id: str
    file: str
    line: int
    column: int
    code: str
    message: str
    severity: str
    context: str
    embedding: Optional[np.ndarray] = None
    cluster_id: Optional[str] = None
```

### ErrorCluster
```python
@dataclass
class ErrorCluster:
    id: str
    errors: List[ErrorInfo]
    centroid: np.ndarray
    pattern: str
    impact_score: float
    fixability_score: float
```

### ContextAnchor
```python
@dataclass
class ContextAnchor:
    id: str
    conversation_id: str
    vector: np.ndarray
    history: List[np.ndarray]
    created_at: datetime
    updated_at: datetime
    drift_threshold: float = 0.3
```

### SearchResults
```python
@dataclass
class SearchResults:
    query: str
    text_results: List[TextResult]
    visual_results: List[VisualResult]
    graph_results: List[GraphResult]
    synthesized: List[SynthesizedResult]
    feature_vector: np.ndarray
```

### Patch
```python
@dataclass
class Patch:
    id: str
    cluster_id: str
    files: List[PatchFile]
    description: str
    confidence: float
    reasoning: str
    feature_vector_score: float
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Feature Vector Dimension Consistency
*For any* input signals (LLM, VLM, Web/RAG, Tools, Phase/AST, Legal, Runtime), the assembled feature vector SHALL always be exactly 1024 dimensions with correct block sizes (256+128+128+128+192+96+96).
**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

### Property 2: Error Embedding Storage Consistency
*For any* error with generated embedding, storing in the system SHALL result in identical embeddings retrievable from both Qdrant and pgvector.
**Validates: Requirements 2.3, 5.3**

### Property 3: Neo4j Error Graph Consistency
*For any* stored error, a corresponding Neo4j node SHALL exist with correct properties, and relationship weights SHALL correlate with embedding similarity.
**Validates: Requirements 2.4, 2.5**

### Property 4: Error Cluster Prioritization
*For any* set of error clusters with impact and fixability scores, prioritization SHALL be deterministic and consistent with score ordering.
**Validates: Requirements 3.4**

### Property 5: Multi-Modal Search Fallback
*For any* text search query, results SHALL be consistent regardless of whether Qdrant or pgvector responds, with automatic fallback on failure.
**Validates: Requirements 4.2**

### Property 6: Data Store Ingestion Completeness
*For any* ingested document, the system SHALL have: raw content in MinIO, summary+embedding in PostgreSQL, mirrored embedding in Qdrant, and entity nodes in Neo4j.
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 7: Context Anchor Preservation
*For any* context update, the anchor history SHALL be preserved and the updated anchor SHALL be retrievable with the same conversation_id.
**Validates: Requirements 6.2, 6.5**

### Property 8: Context Drift Detection
*For any* context anchor and current feature vector, drift detection SHALL return a value between 0 and 1, and drift exceeding threshold SHALL trigger alert.
**Validates: Requirements 6.4**

### Property 9: Patch Validation Rollback
*For any* applied patch that fails validation, the system SHALL rollback to the pre-patch state with no residual changes.
**Validates: Requirements 7.4**

### Property 10: Feature Vector Block Update Consistency
*For any* completed operation (analysis, ingestion, validation, metrics collection), the corresponding feature vector block SHALL be updated with correct dimensions.
**Validates: Requirements 3.5, 5.5, 7.5, 8.5, 9.4**

### Property 11: Serialization Round-Trip
*For any* feature vector, serializing to Go SIMD format and deserializing back SHALL preserve vector values within floating-point tolerance (1e-6).
**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

### Property 12: Legal Context Jurisdiction Detection
*For any* legal document with jurisdiction indicators, the system SHALL detect and classify jurisdiction correctly, updating the legal flags block.
**Validates: Requirements 9.1, 9.4**

### Property 13: Runtime Metrics Tracking
*For any* TensorRT-LLM or GPU operation, metrics (tokens/sec, latency, memory, utilization) SHALL be tracked and encoded in the 96-dimensional runtime block.
**Validates: Requirements 8.1, 8.2, 8.5**

## Error Handling

### Error Extraction Failures
- Retry svelte-check with exponential backoff
- Fall back to cached error list if available
- Log failure and continue with partial results

### Embedding Generation Failures
- Retry with different embedding model
- Fall back to keyword-based matching
- Mark errors as "unembedded" for later processing

### Data Store Failures
- Automatic failover between Qdrant and pgvector
- Queue failed writes for retry
- Alert on persistent failures

### Patch Application Failures
- Automatic rollback using ts-morph
- Preserve original file state
- Log failure with detailed context

### Context Drift Handling
- Alert user when drift exceeds threshold
- Offer to reset or refocus context
- Preserve history for analysis

## Testing Strategy

### Unit Testing
- Test feature vector block encoding for each modality
- Test error extraction parsing
- Test embedding generation consistency
- Test Neo4j node creation
- Test context anchor operations

### Property-Based Testing (Hypothesis)
- Property 1: Feature Vector Dimension Consistency
- Property 2: Error Embedding Storage Consistency
- Property 3: Neo4j Error Graph Consistency
- Property 4: Error Cluster Prioritization
- Property 5: Multi-Modal Search Fallback
- Property 6: Data Store Ingestion Completeness
- Property 7: Context Anchor Preservation
- Property 8: Context Drift Detection
- Property 9: Patch Validation Rollback
- Property 10: Feature Vector Block Update Consistency
- Property 11: Serialization Round-Trip
- Property 12: Legal Context Jurisdiction Detection
- Property 13: Runtime Metrics Tracking

### Integration Testing
- End-to-end self-healing loop
al search with all stores
- Context anchor persistence and retrieval
- Go SIMD scorer integration

### Performance Testing
- Feature vector assembly latency (<10ms)
- Error clustering performance (<5s for 1000 errors)
- Multi-modal search latency (<500ms)
- Go SIMD scoring throughput (>10k vectors/sec)

