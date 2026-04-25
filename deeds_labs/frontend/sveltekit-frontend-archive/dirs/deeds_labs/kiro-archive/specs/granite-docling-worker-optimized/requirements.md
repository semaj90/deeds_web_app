# Requirements Document: Granite-Docling Worker Optimization (W-I9 Profile)

## Introduction

This specification defines the requirements for an optimized Granite-Docling document processing worker tuned for Intel 11th-Gen i7/i9 systems (W-I9 profile) running on Windows 10/11 with Docker Desktop. The worker implements a hybrid GPU/CPU pipeline with Redis caching, page classification, parallel streaming, and Tesseract fallback. It is designed to achieve 4-10 second parse times for 50-100 page documents and <2 second processing for small uploads (1-5 pages). The system includes a migration path to TensorRT-LLM engine plans for future optimization.

## Glossary

- **W-I9 Profile**: Optimization profile for Intel 11th-Gen i7/i9 CPUs with 8 cores/16 threads, AVX2 support, and L2/L3 cache optimization
- **Granite-Docling**: 258M Vision Language Model for document parsing (OCR, layout, tables, math)
- **GPU/CPU Balanced Pipeline**: Hybrid processing that uses GPU for primary parsing and CPU for fallback/preprocessing
- **Page Classifier**: Micro-ML model that categorizes pages (text, table, image, mixed) for optimized processing
- **Redis Caching**: In-memory cache for OCR results with 7-day TTL and auto-refresh
- **Tesseract Fallback**: CPU-based OCR fallback when GPU is unavailable or overloaded
- **LangExtract Auto-Chunker**: Automatic text chunking for RAG embedding with semantic awareness
- **MinIO Parallel Streaming**: Object storage with parallel upload/download for document ingestion
- **R2/R3 Ranking Hooks**: Ranking mechanisms for RAG retrieval (R2: BM25, R3: semantic)
- **TensorRT-LLM**: NVIDIA's inference optimization framework for model engine plans
- **Engine Plan**: Compiled TensorRT model optimized for specific hardware
- **AVX2 SIMD**: Advanced Vector Extensions 2 for CPU acceleration
- **ROI (Region of Interest)**: High-priority document areas (signatures, seals, tables)

## Requirements

### Requirement 1: W-I9 CPU Optimization Profile

**User Story:** As a developer, I want the worker optimized for Intel 11th-Gen i7/i9 CPUs so that document processing is as fast as possible on my Windows system.

#### Acceptance Criteria

1. WHEN the worker initializes, THE system SHALL detect CPU capabilities and apply W-I9 profile automatically
   - _References: AVX2 detection, thread count (8C/16T), cache size detection_
   - _Tech: Use CPUID instructions or Python's `cpuinfo` library_
   - _Fallback: Default to conservative settings if detection fails_

2. WHILE processing documents, THE system SHALL use 10-14 threads (auto-detected based on available cores)
   - _References: W-I9 profile specifies thread scaling for 8C/16T_
   - _Tech: Use `multiprocessing.cpu_count()` with scaling factor_
   - _Tuning: Reserve 2 cores for system/GPU communication_

3. WHEN OCR preprocessing runs, THE system SHALL use AVX2 SIMD acceleration for CPU fallback
   - _References: Tesseract fallback uses SIMD pre-filters_
   - _Tech: Compile Tesseract with AVX2 flags on Windows_
   - _Performance: Target 2-3x speedup vs. scalar OCR_

4. WHERE page segmentation is needed, THE system SHALL optimize for L2/L3 cache behavior
   - _References: W-I9 profile has 4MB L2 (per core) + 12MB L3_
   - _Tech: Batch process pages in cache-friendly sizes (32-page batches)_
   - _Measurement: Monitor cache hit rates_

5. IF GPU is unavailable, THEN THE system SHALL fall back to CPU with 300-700ms wait before timeout
   - _References: Tesseract fallback delay tuning_
   - _Tech: Implement adaptive timeout based on queue depth_
   - _Reliability: Always preserve evidence, degrade gracefully_

### Requirement 2: GPU/CPU Balanced Pipeline

**User Story:** As a system operator, I want a balanced GPU/CPU pipeline so that processing is fast and reliable without GPU bottlenecks.

#### Acceptance Criteria

1. WHEN document processing starts, THE system SHALL route pages to GPU (Granite-Docling) or CPU (Tesseract) based on availability
   - _References: Hybrid pipeline design_
   - _Tech: Implement queue-based routing with priority_
   - _Logic: GPU for primary parsing, CPU for fallback_

2. WHILE GPU is processing, THE system SHALL queue CPU tasks for preprocessing and fallback
   - _References: Parallel preprocessing pipeline_
   - _Tech: Use thread pools for CPU tasks_
   - _Concurrency: 32 pages concurrent batch processing_

3. WHEN GPU queue exceeds threshold, THE system SHALL automatically activate CPU fallback
   - _References: Adaptive fallback triggering_
   - _Tech: Monitor GPU queue depth and memory_
   - _Threshold: Trigger at 80% GPU memory or 10+ page queue_

4. WHERE heavy ROI (signatures, seals, tables) is detected, THE system SHALL always wait for GPU
   - _References: Heavy ROI lock requirement_
   - _Tech: Classify pages and lock ROI pages to GPU_
   - _Priority: Ensure high-confidence extraction for legal evidence_

5. IF processing completes, THEN THE system SHALL emit status events to Legal Dashboard
   - _References: Integration with dashboard streaming_
   - _Tech: Send SSE events with stage, percent, ETA_
   - _Format: Match ProcessingEvent schema from dashboard_

### Requirement 3: Redis Caching for OCR Results

**User Story:** As a system operator, I want OCR results cached in Redis so that repeated documents process faster.

#### Acceptance Criteria

1. WHEN OCR completes, THE system SHALL cache results in Redis with 7-day TTL
   - _References: Redis caching TTL requirement_
   - _Tech: Use Redis with key format: `ocr:{document_hash}:{page_num}`_
   - _Expiry: Set TTL to 604800 seconds (7 days)_

2. WHILE processing, THE system SHALL check Redis cache before running OCR
   - _References: Cache-first lookup_
   - _Tech: Hash document content for cache key_
   - _Hit Rate: Target 60%+ hit rate for repeated documents_

3. WHEN cache is accessed, THE system SHALL auto-refresh TTL on hit
   - _References: Auto-refresh requirement_
   - _Tech: Extend TTL by 7 days on each cache hit_
   - _Benefit: Keep frequently used documents cached_

4. WHERE cache memory is limited, THE system SHALL implement LRU eviction
   - _References: Memory management_
   - _Tech: Configure Redis maxmemory-policy to allkeys-lru_
   - _Monitoring: Alert when cache is 90% full_

5. IF cache miss occurs, THEN THE system SHALL process with OCR and populate cache
   - _References: Cache population on miss_
   - _Tech: Async cache write after OCR completes_
   - _Reliability: Continue processing even if cache write fails_

### Requirement 4: Page Classifier (Micro-ML)

**User Story:** As a developer, I want a lightweight page classifier so that pages are routed to optimal processing pipelines.

#### Acceptance Criteria

1. WHEN page is ingested, THE system SHALL classify into category: text, table, image, mixed
   - _References: Page classifier categories_
   - _Tech: Use lightweight CNN or decision tree model_
   - _Speed: <50ms per page classification_

2. WHILE classifying, THE system SHALL extract features: text density, table presence, image count
   - _References: Feature extraction for classification_
   - _Tech: Use OpenCV for image analysis_
   - _Accuracy: Target 95%+ classification accuracy_

3. WHEN classification completes, THE system SHALL route to appropriate processor
   - _References: Routing based on classification_
   - _Tech: Text → Granite-Docling, Tables → Table extractor, Images → Vision model_
   - _Optimization: Skip unnecessary processing steps_

4. WHERE confidence is low, THE system SHALL use ensemble classification
   - _References: Ensemble fallback_
   - _Tech: Combine multiple classifiers_
   - _Threshold: Use ensemble if primary confidence <80%_

5. IF classification fails, THEN THE system SHALL default to Granite-Docling (safest option)
   - _References: Safe default_
   - _Tech: Fallback to primary parser_
   - _Logging: Log classification failures for analysis_

### Requirement 5: Parallel LangExtract Auto-Chunker

**User Story:** As a developer, I want automatic text chunking for RAG so that embeddings are semantically coherent.

#### Acceptance Criteria

1. WHEN text extraction completes, THE system SHALL automatically chunk text for embeddings
   - _References: Auto-chunking requirement_
   - _Tech: Use semantic chunking (sentence/paragraph boundaries)_
   - _Size: Target 256-512 token chunks_

2. WHILE chunking, THE system SHALL run 1 worker per 2 cores (4-7 workers on W-I9)
   - _References: Parallel LangExtract requirement_
   - _Tech: Use thread pool with core-based scaling_
   - _Throughput: Process 1000+ chunks/second_

3. WHEN chunking completes, THE system SHALL preserve document structure and metadata
   - _References: Structure preservation_
   - _Tech: Include page number, section, hierarchy in chunk metadata_
   - _Traceability: Enable chunk-to-source mapping_

4. WHERE chunks contain tables, THE system SHALL preserve table structure
   - _References: Table preservation_
   - _Tech: Use markdown or structured format for tables_
   - _Accuracy: Maintain cell relationships_

5. IF chunking fails, THEN THE system SHALL use fallback chunking (fixed-size)
   - _References: Fallback chunking_
   - _Tech: Split at fixed token boundaries_
   - _Reliability: Always produce chunks for embedding_

### Requirement 6: MinIO Parallel Streaming

**User Story:** As a system operator, I want parallel document streaming to MinIO so that large uploads are fast and reliable.

#### Acceptance Criteria

1. WHEN document is uploaded, THE system SHALL stream to MinIO in parallel chunks
   - _References: Parallel streaming requirement_
   - _Tech: Use multipart upload with 4-8 parallel streams_
   - _Speed: Target 100MB/s throughput_

2. WHILE streaming, THE system SHALL compute checksums for integrity verification
   - _References: Integrity verification_
   - _Tech: Calculate MD5/SHA256 during streaming_
   - _Verification: Verify after upload completes_

3. WHEN upload completes, THE system SHALL trigger document processing pipeline
   - _References: Pipeline triggering_
   - _Tech: Use MinIO event notifications or polling_
   - _Latency: <100ms delay between upload and processing start_

4. WHERE network is unstable, THE system SHALL implement retry logic with exponential backoff
   - _References: Retry logic_
   - _Tech: Retry failed chunks with 1s, 2s, 4s delays_
   - _Max Retries: 3 attempts per chunk_

5. IF upload fails, THEN THE system SHALL preserve partial upload and allow resume
   - _References: Resume capability_
   - _Tech: Store upload state in Redis_
   - _Recovery: Resume from last successful chunk_

### Requirement 7: Tesseract Emergency Fallback

**User Story:** As a system operator, I want Tesseract fallback so that documents are always processed even if GPU fails.

#### Acceptance Criteria

1. WHEN GPU processing fails, THE system SHALL automatically activate Tesseract fallback
   - _References: Fallback activation_
   - _Tech: Detect GPU errors and trigger fallback_
   - _Speed: Activate within 300-700ms_

2. WHILE Tesseract processes, THE system SHALL use AVX2 SIMD acceleration
   - _References: SIMD acceleration requirement_
   - _Tech: Compile Tesseract with AVX2 flags_
   - _Performance: Target 2-3x speedup vs. scalar_

3. WHEN Tesseract completes, THE system SHALL report confidence level
   - _References: Confidence reporting_
   - _Tech: Extract confidence from Tesseract output_
   - _Range: 0.0-1.0 confidence score_

4. WHERE confidence is low, THE system SHALL flag for manual review
   - _References: Low confidence flagging_
   - _Tech: Mark pages with confidence <0.7 for review_
   - _Workflow: Queue for human verification_

5. IF GPU becomes available, THEN THE system SHALL offer GPU re-processing
   - _References: GPU retry option_
   - _Tech: Implement retry mechanism_
   - _User Control: Allow user to trigger re-processing_

### Requirement 8: Granite-Docling VLM Integration

**User Story:** As a developer, I want Granite-Docling integrated as primary parser so that documents are parsed with high accuracy.

#### Acceptance Criteria

1. WHEN document page is ready, THE system SHALL send to Granite-Docling for parsing
   - _References: Primary parser integration_
   - _Tech: Use Granite-Docling 258M model_
   - _Input: Preprocessed image (768px long dimension)_

2. WHILE Granite-Docling processes, THE system SHALL extract: text, tables, math, layout
   - _References: Extraction requirements_
   - _Tech: Parse DocTags format output_
   - _Completeness: Extract all document elements_

3. WHEN parsing completes, THE system SHALL preserve document structure
   - _References: Structure preservation_
   - _Tech: Maintain heading hierarchy, table structure, spatial relationships_
   - _Accuracy: Preserve semantic meaning_

4. WHERE GPU memory is limited, THE system SHALL batch process pages
   - _References: Batch processing_
   - _Tech: Process 32 pages concurrently_
   - _Memory: Monitor GPU memory and adjust batch size_

5. IF parsing fails, THEN THE system SHALL fall back to Tesseract
   - _References: Fallback chain_
   - _Tech: Implement error handling and fallback_
   - _Reliability: Always produce output_

### Requirement 9: R2/R3 Ranking Hooks for RAG

**User Story:** As a developer, I want ranking hooks so that RAG retrieval is accurate and relevant.

#### Acceptance Criteria

1. WHEN chunks are created, THE system SHALL prepare for R2 (BM25) ranking
   - _References: R2 ranking requirement_
   - _Tech: Build BM25 index from chunks_
   - _Speed: Index 1000+ chunks/second_

2. WHILE chunks are embedded, THE system SHALL prepare for R3 (semantic) ranking
   - _References: R3 ranking requirement_
   - _Tech: Generate embeddings for semantic search_
   - _Model: Use legal-domain embeddings (e.g., LegalBERT)_

3. WHEN query is received, THE system SHALL apply R2 ranking first
   - _References: R2 ranking application_
   - _Tech: Use BM25 for keyword matching_
   - _Speed: <100ms for 10K chunks_

4. WHERE R2 results are available, THE system SHALL apply R3 ranking to top-K results
   - _References: R3 ranking on R2 results_
   - _Tech: Semantic similarity on BM25 top-K_
   - _Efficiency: Reduce semantic search scope_

5. IF both rankings are available, THEN THE system SHALL combine scores for final ranking
   - _References: Score combination_
   - _Tech: Weighted combination (e.g., 0.3*R2 + 0.7*R3)_
   - _Tuning: Allow weight adjustment_

### Requirement 10: TensorRT-LLM Engine Plan Migration Path

**User Story:** As a developer, I want a migration path to TensorRT-LLM so that future optimization is possible.

#### Acceptance Criteria

1. WHEN worker is deployed, THE system SHALL support standard model format (ONNX, SafeTensors)
   - _References: Model format compatibility_
   - _Tech: Export models in standard formats_
   - _Flexibility: Enable future TensorRT conversion_

2. WHILE processing, THE system SHALL log model performance metrics
   - _References: Performance logging_
   - _Tech: Track latency, throughput, memory usage_
   - _Analysis: Enable bottleneck identification_

3. WHEN TensorRT-LLM is available, THE system SHALL support engine plan loading
   - _References: Engine plan support_
   - _Tech: Implement engine plan loader_
   - _Compatibility: Maintain same API_

4. WHERE engine plans are available, THE system SHALL use them for inference
   - _References: Engine plan usage_
   - _Tech: Route to TensorRT inference when available_
   - _Performance: Target 2-5x speedup vs. standard inference_

5. IF engine plan is not available, THEN THE system SHALL fall back to standard inference
   - _References: Graceful fallback_
   - _Tech: Automatic fallback mechanism_
   - _Reliability: Always process documents_

### Requirement 11: Windows Native Build Support

**User Story:** As a developer, I want native Windows build support so that I can develop and test on Windows without WSL.

#### Acceptance Criteria

1. WHEN building on Windows, THE system SHALL compile all dependencies natively
   - _References: Native Windows compilation_
   - _Tech: Use MSVC or MinGW for C++ components_
   - _Compatibility: Support Windows 10/11_

2. WHILE running on Windows, THE system SHALL use Windows-native APIs where possible
   - _References: Windows API usage_
   - _Tech: Use Windows threading, file I/O_
   - _Performance: Leverage Windows optimizations_

3. WHEN Docker Desktop is available, THE system SHALL support containerized deployment
   - _References: Docker Desktop support_
   - _Tech: Provide Dockerfile for Windows containers_
   - _Convenience: Enable easy deployment_

4. WHERE WSL2 is available, THE system SHALL support WSL2 deployment (optional)
   - _References: WSL2 optional support_
   - _Tech: Provide WSL2 build instructions_
   - _Flexibility: Allow Linux-like development environment_

5. IF native build fails, THEN THE system SHALL provide clear error messages and troubleshooting
   - _References: Error handling_
   - _Tech: Implement build validation_
   - _Support: Enable quick issue resolution_

### Requirement 12: Performance Targets

**User Story:** As a system operator, I want to achieve specific performance targets so that the system meets production requirements.

#### Acceptance Criteria

1. WHEN processing 50-100 page evidence document, THE system SHALL complete in 4-10 seconds
   - _References: Large document target_
   - _Tech: Optimize pipeline for throughput_
   - _Measurement: Include parsing + embeddings_

2. WHILE processing 1-5 page upload, THE system SHALL complete in <2 seconds
   - _References: Small document target_
   - _Tech: Optimize for latency_
   - _Measurement: Include all processing steps_

3. WHEN processing typical legal document (20 pages), THE system SHALL complete in 2-4 seconds
   - _References: Typical document target_
   - _Tech: Optimize for common case_
   - _Measurement: Full pipeline_

4. WHERE GPU is available, THE system SHALL achieve 80%+ GPU utilization
   - _References: GPU utilization target_
   - _Tech: Optimize batching and queuing_
   - _Monitoring: Track GPU utilization_

5. IF CPU fallback is active, THEN THE system SHALL maintain 70%+ CPU utilization
   - _References: CPU utilization target_
   - _Tech: Optimize thread pool sizing_
   - _Monitoring: Track CPU utilization_

