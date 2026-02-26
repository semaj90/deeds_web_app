# Advanced Multimodal Retriever Engine - Design Document

## Overview

The Advanced Multimodal Retriever Engine is a GPU-accelerated cognitive retrieval system that combines four complementary search modalities:

1. **RAG (Retrieval-Augmented Generation)**: Semantic vector search using FP16 embeddings in Qdrant
2. **KAG (Knowledge-Action Graph)**: Neo4j graph expansion for reasoning over legal relationships
3. **VAG (Visual Analogy Graph)**: CUDA-accelerated tile similarity scoring for visual pattern matching
4. **HMM/SOM**: Hidden Markov Model inference and Self-Organizing Map fallback for missing connections

The system transforms legal case atoms into rune-encoded tensor blocks (CH-ROM97 format), processes them through GPU kernels, and renders results in a 3D memory palace visualization. This enables legal analysts to intuitively navigate complex case relationships and discover non-obvious connections.

## Architecture

### High-Level System Flow

```
User Query
    ↓
[Bridge Layer - FastAPI]
    ↓
    ├─→ [FP16 Embedding] → Query Vector
    ├─→ [Qdrant ANN] → Semantic Results (RAG)
    ├─→ [Neo4j Expansion] → Graph Results (KAG)
    ├─→ [Tile Loader] → Visual Tiles
    ├─→ [CUDA Kernel] → Similarity Scores (VAG)
    ├─→ [HMM Inference] → Missing Links
    ├─→ [SOM Fallback] → Cluster Neighbors
    ├─→ [Manifold Projection] → 3D Coordinates
    ├─→ [Latent Collapse] → Rune Token
    ├─→ [YOLO/SAM] → Visual Context
    └─→ [Fusion Ranker] → Final Ranking
    ↓
[CH-ROM97 Cartridge Assembly]
    ↓
[SvelteKit 3D Memory Palace Viewer]
    ↓
User Exploration & LLM Context Injection
```

### Component Architecture

#### 1. Embedding Layer
- **FP16 Embeddings**: Query and document embeddings in half-precision for GPU efficiency
- **Quantization**: INT4 latent representation for compact storage
- **Normalization**: Unit vector normalization for cosine similarity

#### 2. Retrieval Layer
- **Qdrant Vector Store**: ANN search for semantic results (top-k=20)
- **Neo4j Graph Database**: KAG expansion with depth-2 traversal
- **FAISS Index**: Approximate nearest neighbor search for large-scale retrieval
- **Redis Cache**: Fast access to frequently queried embeddings and tiles

#### 3. GPU Processing Layer
- **CUDA Tile Kernel**: Parallel similarity scoring for VAG
- **Quaternion Transformer**: 4D→3D projection with 6-DOF rotations
- **Tricubic Interpolator**: Smooth semantic path generation
- **Sparse DNN**: Efficient neural network for SOM clustering

#### 4. Inference Layer
- **HMM Engine**: Sequential pattern recognition for missing links
- **SOM Engine**: Self-organizing map for fallback clustering
- **YOLO/SAM**: Visual object detection and segmentation
- **Fusion Ranker**: Weighted combination of all modalities

#### 5. Visualization Layer
- **3D Memory Palace**: WebGL2/WebGPU renderer for rune positioning
- **Glyph Cards**: Interactive tile display with metadata
- **Semantic Paths**: Animated interpolation between query results
- **Camera Controls**: 6-DOF navigation for exploration

#### 6. Bridge Layer
- **FastAPI Router**: HTTP endpoints for all retrieval operations
- **Async Processing**: Non-blocking queries with streaming responses
- **Cartridge Assembly**: CH-ROM97 binary format generation
- **Error Handling**: Graceful degradation when components fail

## Components and Interfaces

### Component 1: Rune-to-Tensor UUID Generator

**File**: `backend/services/rune_uuid_generator.ts`

**Interface**:
```typescript
interface RuneBank {
  rune: string;
  tensor_uuid: string;
  embedding_fp16: number[];
  latent_int4: string;
  tile_index: number;
}

function buildRunes(): RuneBank[]
function getRuneByUUID(uuid: string): RuneBank | null
function getRuneBySymbol(rune: string): RuneBank | null
```

**Responsibilities**:
- Generate unique tensor UUIDs for each rune
- Embed runes using FP16 embeddings
- Quantize embeddings to INT4
- Compute tile indices for atlas lookup

### Component 2: GPU Tile Processor Kernel

**File**: `backend/cuda/glyph_tile_kernel.cu`

**Interface**:
```cuda
__global__ void process_glyph_tiles(
  const uint8_t* tile_atlas,
  const half* embeddings,
  const int N,
  float* out_scores
);
```

**Responsibilities**:
- Process N tiles in parallel using CUDA blocks
- Compute dot product between tile bytes and embeddings
- Output similarity scores for VAG ranking

### Component 3: N64 Tile Atlas Generator

**File**: `backend/services/atlas_generator.py`

**Interface**:
```python
def build_rune_atlas() -> Image
def get_tile_index(rune: str) -> int
def export_tiles_to_minio(atlas: Image) -> str
```

**Responsibilities**:
- Generate 32×32 tiles for each rune
- Render rune symbols using NotoSansSymbols2 font
- Compose into 8-column atlas grid
- Export to MinIO for storage

### Component 4: Neo4j KAG Loader

**File**: `backend/services/kag_loader.py`

**Interface**:
```python
def load_kag(uri: str, user: str, password: str) -> None
def expand_kag(node_id: str, depth: int) -> List[Dict]
def get_kag_edges(node_id: str) -> List[Dict]
```

**Responsibilities**:
- Create RUNE nodes in Neo4j
- Assign cluster IDs for grouping
- Establish edges based on semantic similarity
- Support depth-2 graph expansion

### Component 5: RAG + KAG + VAG Retriever Engine

**File**: `backend/services/multimodal_retriever.py`

**Interface**:
```python
def retrieve(query: str) -> Dict:
  # Returns: {
  #   "ranked": List[Result],
  #   "visual_3d_coords": List[float3],
  #   "latent_marker": str,
  #   "tiles": List[Tile]
  # }
```

**Responsibilities**:
- Embed query using FP16
- Perform Qdrant ANN search (RAG)
- Expand via Neo4j KAG
- Load tiles and run CUDA similarity (VAG)
- Fuse all results into ranked output

### Component 6: HMM Missing-Link Inference

**File**: `backend/services/hmm_engine.py`

**Interface**:
```python
def infer_missing_links(graph_results: List[Dict]) -> List[Dict]
def score_missing_link(link: Dict) -> float
```

**Responsibilities**:
- Identify missing sequential steps in reasoning
- Score missing links by probability
- Surface top-3 suggestions

### Component 7: SOM Fallback Clustering

**File**: `backend/services/som_engine.py`

**Interface**:
```python
def som_map(query_vec: np.ndarray) -> List[Dict]
def get_som_neighbors(node_id: str) -> List[Dict]
```

**Responsibilities**:
- Map query to nearest SOM node
- Return cluster neighbors
- Rank by distance

### Component 8: Manifold Projection (4D→3D)

**File**: `backend/cuda/manifold.cu`

**Interface**:
```cuda
__global__ void project4dto3d(
  const half4* in4d,
  float3* out3d,
  int N,
  float theta
);
```

**Responsibilities**:
- Project embeddings from 4D to 3D
- Apply quaternion transformations
- Compute 3D coordinates for memory palace

### Component 9: Tricubic Interpolation

**File**: `backend/cuda/tricubic.cu`

**Interface**:
```cuda
__device__ float tricubic_interp(
  float x, float y, float z,
  const float* grid
);
```

**Responsibilities**:
- Generate smooth semantic paths
- Interpolate between rune positions
- Support visualization of reasoning steps

### Component 10: Latent Collapse to Rune Token

**File**: `backend/services/latent_collapse.py`

**Interface**:
```python
def collapse_to_rune(latent_vec: np.ndarray) -> str
def encode_latent_marker(context: Dict) -> str
def decode_latent_marker(marker: str) -> Dict
```

**Responsibilities**:
- Compress multimodal context to 1D
- Apply INT4 quantization
- Select best-matching rune
- Support round-trip encoding/decoding

### Component 11: 3D Memory Palace Viewer

**File**: `sveltekit-frontend/src/lib/components/MemoryPalace3D.svelte`

**Interface**:
```svelte
<MemoryPalace3D
  points={results.visual_3d_coords}
  tiles={results.tiles}
  latentMarker={results.latent_marker}
  onRuneSelect={(rune) => {...}}
/>
```

**Responsibilities**:
- Render 3D scatter plot of runes
- Support 6-DOF camera controls
- Display glyph cards on hover
- Animate transitions between queries

### Component 12: Bridge Layer (FastAPI)

**File**: `backend/api/bridge.py`

**Interface**:
```python
@router.get("/bridge/search")
async def bridge_search(q: str) -> Dict

@router.get("/bridge/3d/memory")
async def memory_3d(q: str) -> Dict

@router.post("/bridge/cartridge")
async def build_cartridge(results: Dict) -> bytes
```

**Responsibilities**:
- Route search requests to backends
- Coordinate Redis, Qdrant, Neo4j, CUDA
- Assemble CH-ROM97 cartridges
- Support streaming responses

### Component 13: YOLO/SAM Visual Context

**File**: `backend/services/visual_context.py`

**Interface**:
```python
def enhance_with_vision(results: List[Dict]) -> List[Dict]
def detect_objects(image: np.ndarray) -> List[Detection]
def segment_objects(detections: List[Detection]) -> List[Segment]
```

**Responsibilities**:
- Run YOLO object detection
- Segment using SAM
- Encode vision embeddings
- Blend into final ranking

### Component 14: FAISS/ANN Hybrid Search

**File**: `backend/services/faiss_search.py`

**Interface**:
```python
def build_faiss_index(embeddings: np.ndarray) -> faiss.Index
def search_faiss(query: np.ndarray, k: int) -> Tuple[np.ndarray, np.ndarray]
def rerank_with_exact(results: List[Dict]) -> List[Dict]
```

**Responsibilities**:
- Build FAISS index for embeddings
- Perform ANN search
- Re-rank with exact similarity
- Support configurable ANN parameters

### Component 15: CH-ROM97 Cartridge Assembly

**File**: `backend/services/cartridge_builder.py`

**Interface**:
```python
def build_ch_rom97(results: List[Dict]) -> bytes
def assemble_cartridge(runes: List[Dict], edges: List[Dict]) -> Cartridge
def serialize_cartridge(cartridge: Cartridge) -> bytes
def deserialize_cartridge(data: bytes) -> Cartridge
```

**Responsibilities**:
- Encode runes, tensors, tiles, metadata
- Compute graph edges
- Generate binary cartridge format
- Support serialization/deserialization

## Data Models

### RuneBank
```typescript
{
  rune: string;              // Unicode symbol
  tensor_uuid: string;       // Hex UUID
  embedding_fp16: number[];  // 768-dim FP16 vector
  latent_int4: string;       // Hex INT4 quantization
  tile_index: number;        // Atlas position
}
```

### RetrievalResult
```typescript
{
  rune: string;
  score: number;             // Fusion score (0-1)
  source: "rag" | "kag" | "vag" | "hmm" | "som";
  metadata: {
    case_id?: string;
    statute?: string;
    relevance?: number;
  };
  position_3d: [number, number, number];
  tile: Tile;
}
```

### Tile
```typescript
{
  index: number;
  data: Uint8Array;          // 32×32 grayscale
  rune: string;
  embedding: number[];
}
```

### CH_ROM97_Cartridge
```typescript
{
  version: number;
  runes: RuneBank[];
  tensors: Tensor[];
  tiles: Tile[];
  metadata: CartridgeMetadata;
  graph_edges: GraphEdge[];
  binary_data: Uint8Array;
}
```

### GraphEdge
```typescript
{
  source_rune: string;
  target_rune: string;
  weight: number;
  type: "semantic" | "causal" | "hierarchical";
  metadata: Record<string, any>;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Rune UUID Uniqueness
*For any* set of runes, all generated tensor UUIDs must be unique and in valid hex format.
**Validates: Requirements 1.1**

### Property 2: FP16 Embedding Generation
*For any* rune, the embedding must be generated in FP16 format with correct dimensionality (768-dim).
**Validates: Requirements 1.2**

### Property 3: INT4 Quantization Validity
*For any* FP16 embedding, quantization to INT4 must produce valid 4-bit encoding without data loss beyond quantization error.
**Validates: Requirements 1.3**

### Property 4: Tile Index Bounds
*For any* rune, the computed tile index must be within valid bounds [0, num_runes-1].
**Validates: Requirements 1.4**

### Property 5: Rune Bank Completeness
*For any* rune bank, all entries must contain all required fields (rune, UUID, FP16, INT4, tile_index) with consistent types.
**Validates: Requirements 1.5**

### Property 6: CUDA Tile Kernel Correctness
*For any* set of N tiles and embeddings, the CUDA kernel output scores must match CPU reference implementation within floating-point tolerance.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 7: Tile Generation Completeness
*For any* set of runes, all tiles must be generated with correct dimensions (32×32) and count equal to number of runes.
**Validates: Requirements 3.1**

### Property 8: Tile Atlas Grid Layout
*For any* rune atlas, the grid must be correctly composed with 8 columns and all tiles properly positioned.
**Validates: Requirements 3.2, 3.3**

### Property 9: Neo4j Node Creation
*For any* set of runes, all RUNE nodes must be created in Neo4j with valid cluster IDs (0-3).
**Validates: Requirements 4.1, 4.2**

### Property 10: Neo4j Edge Consistency
*For any* set of created nodes, edges must exist with valid weights and types (semantic, causal, hierarchical).
**Validates: Requirements 4.3**

### Property 11: Query Embedding Format
*For any* query string, the embedding must be generated in FP16 format with correct dimensionality.
**Validates: Requirements 5.1**

### Property 12: ANN Search Result Count
*For any* query, Qdrant ANN search must return exactly k results (or fewer if fewer than k documents exist).
**Validates: Requirements 5.2**

### Property 13: KAG Expansion Completeness
*For any* semantic result, depth-2 Neo4j expansion must include all reachable nodes within 2 hops.
**Validates: Requirements 5.3**

### Property 14: Fusion Score Monotonicity
*For any* set of component scores (RAG, KAG, VAG), the fused score must be monotonic with respect to component scores.
**Validates: Requirements 5.4, 5.5**

### Property 15: HMM Inference Validity
*For any* graph result set, HMM inference must identify valid missing links that form coherent reasoning chains.
**Validates: Requirements 6.1, 6.2**

### Property 16: SOM Fallback Activation
*For any* query with semantic recall below threshold, SOM fallback must be activated and return valid cluster neighbors.
**Validates: Requirements 7.1, 7.2**

### Property 17: Manifold Projection Validity
*For any* set of 4D embeddings, projection to 3D must produce valid coordinates with preserved distance relationships.
**Validates: Requirements 8.1, 8.2, 8.3**

### Property 18: Tricubic Interpolation Smoothness
*For any* two rune positions, interpolated path must form smooth curve with continuous derivatives.
**Validates: Requirements 9.1, 9.2**

### Property 19: Latent Collapse Round-Trip
*For any* multimodal context, collapse to latent marker and back must recover equivalent context within tolerance.
**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

### Property 20: 3D Rendering Correctness
*For any* set of retrieval results, 3D scatter plot must position runes such that visual distance correlates with semantic similarity.
**Validates: Requirements 11.1, 11.2**

### Property 21: Bridge Routing Correctness
*For any* search request, the Bridge must route to correct backend and coordinate all required services.
**Validates: Requirements 12.1, 12.2, 12.3**

### Property 22: YOLO Detection Validity
*For any* image with legal document elements, YOLO must detect signatures, seals, and stamps with valid bounding boxes.
**Validates: Requirements 13.1, 13.2**

### Property 23: FAISS Index Validity
*For any* set of embeddings, FAISS index must be built correctly and support fast ANN search.
**Validates: Requirements 14.1, 14.2**

### Property 24: FAISS Re-ranking Correctness
*For any* ANN results, re-ranking with exact similarity must produce correct ordering.
**Validates: Requirements 14.3**

### Property 25: CH-ROM97 Cartridge Round-Trip
*For any* retrieval result set, serialized cartridge must deserialize to equivalent structure with all fields intact.
**Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**

## Error Handling

### Graceful Degradation Strategy

1. **If Qdrant fails**: Fall back to SOM clustering
2. **If Neo4j fails**: Use RAG + VAG only
3. **If CUDA kernel fails**: Use CPU-based similarity scoring
4. **If YOLO/SAM fails**: Continue with text-only retrieval
5. **If manifold projection fails**: Use 2D projection instead

### Error Responses

```python
{
  "status": "partial_success" | "fallback" | "error",
  "results": List[Result],
  "warnings": List[str],
  "fallback_reason": str
}
```

## Testing Strategy

### Unit Testing

- Test rune UUID generation for uniqueness and consistency
- Test tile atlas generation for correct grid layout
- Test Neo4j KAG loader for node/edge creation
- Test latent collapse for rune selection accuracy
- Test cartridge serialization/deserialization round-trip

### Property-Based Testing

- **Property 1**: Rune UUID uniqueness - for any set of runes, all generated UUIDs are unique
- **Property 2**: Embedding round-trip - for any rune, embedding → quantization → collapse → rune should recover original
- **Property 3**: Manifold projection consistency - for any two embeddings, their 3D distance should correlate with 4D distance
- **Property 4**: Tricubic interpolation smoothness - interpolated points should form smooth curves
- **Property 5**: Cartridge round-trip - serialized → deserialized cartridge should be identical
- **Property 6**: Fusion ranking monotonicity - fused scores should be monotonic with component scores
- **Property 7**: KAG expansion completeness - depth-2 expansion should include all reachable nodes
- **Property 8**: SOM fallback activation - SOM should activate only when semantic recall < threshold

### Testing Framework

- **Unit Tests**: pytest with fixtures for embeddings, tiles, cartridges
- **Property-Based Tests**: Hypothesis for Python, fast-check for TypeScript
- **Integration Tests**: End-to-end retrieval pipeline with mock data
- **Performance Tests**: Benchmark CUDA kernels, manifold projection, cartridge assembly

### Test Configuration

- Minimum 100 iterations per property-based test
- Mock Qdrant, Neo4j, Redis for unit tests
- Real GPU for CUDA kernel tests (fallback to CPU if unavailable)
- Streaming response tests with WebSocket simulation

