# Design Document: Granite-Docling Worker Optimization (W-I9 Profile)

## Overview

The Granite-Docling Worker is an optimized document processing service for Intel 11th-Gen i7/i9 systems running Windows 10/11. It implements a hybrid GPU/CPU pipeline with Redis caching, page classification, parallel streaming, and Tesseract fallback. The system achieves 4-10 second parse times for 50-100 page documents and <2 second processing for small uploads. It includes a migration path to TensorRT-LLM for future optimization.

## Architecture

### High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document Ingestion                           │
│  MinIO Upload → Parallel Streaming → Document Queue            │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Page Classification                          │
│  Micro-ML Classifier → Category Detection → Routing             │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              GPU/CPU Balanced Pipeline                          │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │  GPU Path            │      │  CPU Path            │        │
│  │  Granite-Docling     │      │  Tesseract + SIMD    │        │
│  │  (Primary)           │      │  (Fallback)          │        │
│  │  - OCR               │      │  - OCR               │        │
│  │  - Layout            │      │  - Basic extraction  │        │
│  │  - Tables            │      │  - Confidence score  │        │
│  │  - Math              │      │                      │        │
│  └──────────────────────┘      └──────────────────────┘        │
│         ↓                              ↓                        │
│  Redis Cache (7-day TTL)                                       │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Text Extraction & Chunking                         │
│  LangExtract Auto-Chunker → Semantic Chunks → Metadata          │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              RAG Preparation                                    │
│  R2 (BM25) Index → R3 (Semantic) Embeddings → Ranking Hooks    │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Status Events                                      │
│  SSE Stream → Legal Dashboard (Real-Time Monitoring)           │
└─────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
Worker Service
├── Document Ingestion
│   ├── MinIO Client
│   ├── Parallel Streamer
│   └── Upload Manager
├── Page Classification
│   ├── Micro-ML Classifier
│   ├── Feature Extractor
│   └── Router
├── Processing Pipeline
│   ├── GPU Manager
│   │   ├── Granite-Docling Wrapper
│   │   ├── Batch Processor
│   │   └── Memory Manager
│   ├── CPU Manager
│   │   ├── Tesseract Wrapper
│   │   ├── SIMD Accelerator
│   │   └── Thread Pool
│   └── Fallback Manager
│       ├── Timeout Handler
│       ├── Fallback Trigger
│       └── Recovery Logic
├── Caching Layer
│   ├── Redis Client
│   ├── Cache Manager
│   └── TTL Handler
├── Text Processing
│   ├── LangExtract Chunker
│   ├── Semantic Analyzer
│   └── Metadata Generator
├── RAG Preparation
│   ├── BM25 Indexer
│   ├── Embedding Generator
│   └── Ranking Hooks
└── Status & Monitoring
    ├── Event Emitter
    ├── Metrics Collector
    └── Dashboard Integration
```

## Components and Interfaces

### 1. Document Ingestion Service

**Purpose**: Handle document uploads with parallel streaming to MinIO.

**Interfaces**:
```python
class DocumentIngestionService:
    def upload_document(
        self,
        file_path: str,
        document_id: str,
        metadata: Dict[str, Any]
    ) -> UploadResult:
        """Upload document with parallel streaming"""

    def stream_to_minio(
        self,
        file_path: str,
        bucket: str,
        key: str,
        parallel_streams: int = 4
    ) -> StreamResult:
        """Stream file to MinIO with parallel chunks"""

    def verify_upload(
        self,
        bucket: str,
        key: str,
        expected_checksum: str
    ) -> bool:
        """Verify upload integrity"""
```

**Key Features**:
- Multipart upload with 4-8 parallel streams
- Checksum verification (MD5/SHA256)
- Resume capability for failed uploads
- Automatic trigger of processing pipeline

### 2. Page Classifier

**Purpose**: Classify pages into categories for optimized routing.

**Interfaces**:
```python
class PageClassifier:
    def classify_page(
        self,
        image: np.ndarray
    ) -> PageClassification:
        """Classify page into category"""

    def extract_features(
        self,
        image: np.ndarray
    ) -> Dict[str, float]:
        """Extract classification features"""

    def route_page(
        self,
        classification: PageClassification
    ) -> ProcessingRoute:
        """Determine optimal processing route"""
```

**Categories**:
- `text`: Primarily text content
- `table`: Primarily tabular data
- `image`: Primarily images/scans
- `mixed`: Mixed content

**Performance**:
- <50ms per page classification
- 95%+ accuracy target
- Ensemble fallback for low confidence

### 3. GPU/CPU Pipeline Manager

**Purpose**: Manage hybrid GPU/CPU processing with intelligent routing.

**Interfaces**:
```python
class PipelineManager:
    def process_page(
        self,
        page: DocumentPage,
        classification: PageClassification
    ) -> ProcessingResult:
        """Process page through optimal pipeline"""

    def route_to_gpu(
        self,
        page: DocumentPage
    ) -> GPUResult:
        """Route to GPU (Granite-Docling)"""

    def route_to_cpu(
        self,
        page: DocumentPage
    ) -> CPUResult:
        """Route to CPU (Tesseract + SIMD)"""

    def handle_fallback(
        self,
        page: DocumentPage,
        error: Exception
    ) -> ProcessingResult:
        """Handle GPU failure with CPU fallback"""
```

**Routing Logic**:
- GPU for primary parsing (Granite-Docling)
- CPU for fallback (Tesseract)
- Heavy ROI pages always wait for GPU
- Adaptive fallback based on queue depth

### 4. Redis Caching Layer

**Purpose**: Cache OCR results with 7-day TTL and auto-refresh.

**Interfaces**:
```python
class CacheManager:
    def get_cached_ocr(
        self,
        document_hash: str,
        page_num: int
    ) -> Optional[OCRResult]:
        """Get cached OCR result"""

    def cache_ocr_result(
        self,
        document_hash: str,
        page_num: int,
        result: OCRResult,
        ttl: int = 604800
    ) -> bool:
        """Cache OCR result with TTL"""

    def refresh_ttl(
        self,
        document_hash: str,
        page_num: int
    ) -> bool:
        """Refresh TTL on cache hit"""
```

**Configuration**:
- Key format: `ocr:{document_hash}:{page_num}`
- TTL: 7 days (604800 seconds)
- Auto-refresh on hit
- LRU eviction policy
- Target 60%+ hit rate

### 5. LangExtract Auto-Chunker

**Purpose**: Automatically chunk text for RAG with semantic awareness.

**Interfaces**:
```python
class LangExtractChunker:
    def chunk_text(
        self,
        text: str,
        metadata: Dict[str, Any]
    ) -> List[TextChunk]:
        """Chunk text semantically"""

    def process_chunks_parallel(
        self,
        texts: List[str],
        workers: int = None
    ) -> List[List[TextChunk]]:
        """Process multiple texts in parallel"""

    def preserve_structure(
        self,
        chunks: List[TextChunk],
        document_structure: DocumentStructure
    ) -> List[TextChunk]:
        """Preserve document structure in chunks"""
```

**Configuration**:
- Chunk size: 256-512 tokens
- Workers: 1 per 2 cores (4-7 on W-I9)
- Semantic chunking at sentence/paragraph boundaries
- Preserve page numbers, sections, hierarchy

### 6. RAG Preparation Service

**Purpose**: Prepare chunks for RAG with R2/R3 ranking hooks.

**Interfaces**:
```python
class RAGPreparationService:
    def prepare_for_rag(
        self,
        chunks: List[TextChunk]
    ) -> RAGPreparedData:
        """Prepare chunks for RAG"""

    def build_bm25_index(
        self,
        chunks: List[TextChunk]
    ) -> BM25Index:
        """Build BM25 index (R2)"""

    def generate_embeddings(
        self,
        chunks: List[TextChunk],
        model: str = "legal-bert"
    ) -> List[np.ndarray]:
        """Generate semantic embeddings (R3)"""

    def apply_ranking_hooks(
        self,
        query: str,
        chunks: List[TextChunk],
        bm25_index: BM25Index,
        embeddings: List[np.ndarray]
    ) -> RankedResults:
        """Apply R2/R3 ranking hooks"""
```

**Ranking Strategy**:
- R2 (BM25): Keyword matching
- R3 (Semantic): Semantic similarity
- Combined score: 0.3*R2 + 0.7*R3 (tunable)

## Data Models

### ProcessingEvent

```typescript
interface ProcessingEvent {
  stage: 'ingestion' | 'classification' | 'gpu_processing' | 'cpu_fallback' | 'chunking' | 'rag_prep' | 'complete';
  status: string;
  page: number;
  pages_total: number;
  percent: number;
  eta: number;
  details: string;
  timestamp: string;
  confidence?: number;
  gpu_utilization?: number;
  cpu_utilization?: number;
}
```

### PageClassification

```python
@dataclass
class PageClassification:
    category: str  # 'text', 'table', 'image', 'mixed'
    confidence: float  # 0.0-1.0
    features: Dict[str, float]
    recommended_route: str  # 'gpu', 'cpu', 'ensemble'
```

### TextChunk

```python
@dataclass
class TextChunk:
    content: str
    page_number: int
    section: str
    hierarchy_level: int
    start_token: int
    end_token: int
    metadata: Dict[str, Any]
    embedding: Optional[np.ndarray] = None
    bm25_score: Optional[float] = None
    semantic_score: Optional[float] = None
```

## Error Handling

### GPU Failure Handling

**Scenario**: GPU processing fails
- **Detection**: Monitor GPU errors and timeouts
- **Handling**: Activate CPU fallback within 300-700ms
- **Fallback**: Use Tesseract with SIMD acceleration
- **Reporting**: Send fallback event with confidence level
- **Recovery**: Offer GPU retry option

### Cache Failures

**Scenario**: Redis cache unavailable
- **Handling**: Continue processing without cache
- **Fallback**: Process with OCR
- **Retry**: Attempt cache write after processing
- **Reliability**: Always produce output

### Upload Failures

**Scenario**: MinIO upload fails
- **Handling**: Retry with exponential backoff
- **Resume**: Store upload state for resume
- **Max Retries**: 3 attempts per chunk
- **Fallback**: Allow manual retry

## Testing Strategy

### Unit Tests
- Page classifier accuracy
- Cache hit/miss logic
- Chunking correctness
- Ranking score calculation

### Integration Tests
- GPU/CPU pipeline switching
- Fallback activation
- Cache population and retrieval
- End-to-end document processing

### Performance Tests
- 50-100 page document: 4-10 seconds
- 1-5 page document: <2 seconds
- GPU utilization: 80%+
- CPU utilization: 70%+

## Performance Optimization

### W-I9 CPU Tuning
- Thread count: 10-14 (auto-detected)
- AVX2 SIMD acceleration
- L2/L3 cache optimization
- 32-page batch processing

### GPU Optimization
- Batch processing for throughput
- Memory management
- Queue-based routing
- Adaptive fallback

### Caching Strategy
- 7-day TTL with auto-refresh
- LRU eviction
- 60%+ hit rate target
- Async cache writes

## Deployment Architecture

### Windows Native Build
- MSVC or MinGW compilation
- Windows 10/11 support
- Docker Desktop containerization
- WSL2 optional support

### Service Components
- Document Ingestion Service
- Page Classification Service
- GPU/CPU Pipeline Manager
- Cache Manager
- Chunking Service
- RAG Preparation Service
- Status Event Emitter

### External Dependencies
- MinIO (object storage)
- Redis (caching)
- Granite-Docling (GPU parsing)
- Tesseract (CPU fallback)
- CUDA/cuDNN (GPU support)

## TensorRT-LLM Migration Path

### Current State
- Standard model formats (ONNX, SafeTensors)
- Performance logging
- Bottleneck identification

### Future State
- Engine plan loading
- TensorRT inference
- 2-5x speedup target
- Automatic fallback to standard inference

### Migration Steps
1. Export models to standard formats
2. Build TensorRT engine plans
3. Implement engine plan loader
4. Route to TensorRT when available
5. Maintain backward compatibility

## Integration with Legal Dashboard

### Status Events
- Send ProcessingEvent via SSE
- Real-time progress updates
- Fallback notifications
- Completion events

### Event Format
- Matches dashboard ProcessingEvent schema
- Includes stage, percent, ETA, details
- Optional GPU/CPU utilization metrics

### Dashboard Integration
- Real-time progress display
- Per-page status tracking
- Fallback alerts
- Completion notifications

