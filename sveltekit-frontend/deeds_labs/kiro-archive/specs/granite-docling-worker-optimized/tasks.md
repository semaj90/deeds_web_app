# Implementation Plan: Granite-Docling Worker Optimization (W-I9 Profile)

## Overview

This implementation plan breaks down the Granite-Docling Worker into discrete, manageable coding tasks. Each task builds incrementally on previous tasks, starting with core infrastructure (W-I9 profiling, MinIO integration), then processing pipeline (GPU/CPU management), caching, classification, chunking, and RAG preparation.

---

## Tasks

- [x] 1. Set up project structure and W-I9 CPU profiling



  - Create directory structure for worker components
  - Implement CPU capability detection (AVX2, thread count, cache)
  - Create W-I9 profile configuration
  - Set up Windows native build system (MSVC/MinGW)
  - _Requirements: 1.1, 1.2, 11.1_

- [ ] 2. Implement MinIO integration with parallel streaming
  - [ ] 2.1 Create MinIO client wrapper
    - Initialize MinIO connection
    - Implement multipart upload
    - Add checksum verification
    - _Requirements: 6.1, 6.2_

  - [ ] 2.2 Implement parallel streaming
    - Create parallel chunk uploader (4-8 streams)
    - Implement progress tracking
    - Add retry logic with exponential backoff
    - _Requirements: 6.1, 6.3_

  - [ ] 2.3 Add upload resume capability
    - Store upload state in Redis
    - Implement resume from last chunk
    - Handle partial uploads
    - _Requirements: 6.4, 6.5_

- [ ] 3. Create page classification service
  - [ ] 3.1 Build Micro-ML classifier
    - Implement lightweight CNN or decision tree
    - Extract features (text density, table presence, image count)
    - Classify into categories (text, table, image, mixed)
    - _Requirements: 4.1, 4.2_

  - [ ] 3.2 Implement classification routing
    - Route pages based on classification
    - Apply ensemble for low confidence
    - Default to Granite-Docling on failure
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ] 3.3 Add classification metrics
    - Track accuracy and confidence
    - Log classification failures
    - Monitor routing decisions
    - _Requirements: 4.1_

- [ ] 4. Implement GPU/CPU pipeline manager
  - [ ] 4.1 Create GPU processing wrapper
    - Wrap Granite-Docling model
    - Implement batch processing (32 pages)
    - Add GPU memory management
    - _Requirements: 2.1, 8.1_

  - [ ] 4.2 Create CPU processing wrapper
    - Wrap Tesseract with AVX2 acceleration
    - Implement SIMD pre-filters
    - Add confidence scoring
    - _Requirements: 1.3, 7.2_

  - [ ] 4.3 Implement pipeline routing logic
    - Route pages to GPU or CPU
    - Queue management
    - Adaptive fallback triggering
    - _Requirements: 2.2, 2.3_

  - [ ] 4.4 Implement heavy ROI locking
    - Detect heavy ROI (signatures, seals, tables)
    - Lock ROI pages to GPU
    - Ensure high-confidence extraction
    - _Requirements: 2.4_

  - [ ] 4.5 Add fallback handling
    - Detect GPU failures
    - Activate CPU fallback within 300-700ms
    - Report confidence levels
    - _Requirements: 1.5, 7.1_

- [ ] 5. Implement Redis caching layer
  - [ ] 5.1 Create Redis client wrapper
    - Initialize Redis connection
    - Implement key-value operations
    - Add connection pooling
    - _Requirements: 3.1_

  - [ ] 5.2 Implement OCR result caching
    - Cache OCR results with 7-day TTL
    - Use document hash + page number as key
    - Implement cache lookup before OCR
    - _Requirements: 3.1, 3.2_

  - [ ] 5.3 Add TTL auto-refresh
    - Refresh TTL on cache hit
    - Extend TTL by 7 days
    - Track refresh frequency
    - _Requirements: 3.3_

  - [ ] 5.4 Implement LRU eviction
    - Configure Redis maxmemory-policy
    - Monitor cache memory usage
    - Alert at 90% capacity
    - _Requirements: 3.4_

  - [ ] 5.5 Add cache population on miss
    - Populate cache after OCR
    - Async cache writes
    - Handle cache write failures
    - _Requirements: 3.5_

- [ ] 6. Implement Granite-Docling VLM integration
  - [ ] 6.1 Create Granite-Docling wrapper
    - Load 258M model
    - Implement inference
    - Parse DocTags format output
    - _Requirements: 8.1, 8.2_

  - [ ] 6.2 Implement batch processing
    - Process 32 pages concurrently
    - Monitor GPU memory
    - Adjust batch size dynamically
    - _Requirements: 8.4_

  - [ ] 6.3 Add structure preservation
    - Preserve heading hierarchy
    - Maintain table structure
    - Keep spatial relationships
    - _Requirements: 8.3_

  - [ ] 6.4 Implement error handling
    - Detect parsing failures
    - Fall back to Tesseract
    - Log errors for analysis
    - _Requirements: 8.5_

- [ ] 7. Implement Tesseract fallback with SIMD
  - [ ] 7.1 Create Tesseract wrapper
    - Initialize Tesseract engine
    - Implement OCR processing
    - Extract confidence scores
    - _Requirements: 7.1, 7.2_

  - [ ] 7.2 Add AVX2 SIMD acceleration
    - Compile Tesseract with AVX2 flags
    - Implement SIMD pre-filters
    - Target 2-3x speedup
    - _Requirements: 1.3, 7.2_

  - [ ] 7.3 Implement confidence reporting
    - Extract confidence from Tesseract
    - Report 0.0-1.0 confidence score
    - Flag low confidence for review
    - _Requirements: 7.3, 7.4_

  - [ ] 7.4 Add GPU retry option
    - Implement retry mechanism
    - Allow user-triggered re-processing
    - Track retry attempts
    - _Requirements: 7.5_

- [ ] 8. Implement LangExtract auto-chunker
  - [ ] 8.1 Create text chunking engine
    - Implement semantic chunking
    - Target 256-512 token chunks
    - Chunk at sentence/paragraph boundaries
    - _Requirements: 5.1_

  - [ ] 8.2 Implement parallel chunking
    - Create thread pool (1 worker per 2 cores)
    - Process multiple texts in parallel
    - Target 1000+ chunks/second
    - _Requirements: 5.2_

  - [ ] 8.3 Add structure preservation
    - Preserve page numbers
    - Maintain section hierarchy
    - Include document structure in metadata
    - _Requirements: 5.3_

  - [ ] 8.4 Add table preservation
    - Preserve table structure
    - Use markdown or structured format
    - Maintain cell relationships
    - _Requirements: 5.4_

  - [ ] 8.5 Implement fallback chunking
    - Use fixed-size chunking on failure
    - Split at token boundaries
    - Always produce chunks
    - _Requirements: 5.5_

- [ ] 9. Implement RAG preparation service
  - [ ] 9.1 Create BM25 indexer
    - Build BM25 index from chunks
    - Index 1000+ chunks/second
    - Implement keyword matching
    - _Requirements: 9.1_

  - [ ] 9.2 Create embedding generator
    - Generate semantic embeddings
    - Use legal-domain model (LegalBERT)
    - Prepare for semantic search
    - _Requirements: 9.2_

  - [ ] 9.3 Implement R2 ranking
    - Apply BM25 ranking
    - Process <100ms for 10K chunks
    - Return top-K results
    - _Requirements: 9.3_

  - [ ] 9.4 Implement R3 ranking
    - Apply semantic ranking to R2 results
    - Reduce search scope
    - Combine with R2 scores
    - _Requirements: 9.4_

  - [ ] 9.5 Add ranking score combination
    - Combine R2 and R3 scores
    - Use weighted combination (0.3*R2 + 0.7*R3)
    - Allow weight tuning
    - _Requirements: 9.5_

- [ ] 10. Implement status event emission
  - [ ] 10.1 Create event emitter
    - Emit ProcessingEvent for each stage
    - Include stage, percent, ETA, details
    - Send via SSE to dashboard
    - _Requirements: 2.5_

  - [ ] 10.2 Add metrics collection
    - Track GPU utilization
    - Track CPU utilization
    - Monitor processing times
    - _Requirements: 12.4, 12.5_

  - [ ] 10.3 Implement dashboard integration
    - Send events to Legal Dashboard
    - Match ProcessingEvent schema
    - Include optional metrics
    - _Requirements: 2.5_

- [ ] 11. Implement TensorRT-LLM migration path
  - [ ] 11.1 Add model format support
    - Support ONNX format
    - Support SafeTensors format
    - Enable future TensorRT conversion
    - _Requirements: 10.1_

  - [ ] 11.2 Add performance logging
    - Log latency metrics
    - Log throughput metrics
    - Log memory usage
    - _Requirements: 10.2_

  - [ ] 11.3 Implement engine plan loader
    - Load TensorRT engine plans
    - Maintain same API
    - Support graceful fallback
    - _Requirements: 10.3, 10.4_

  - [ ] 11.4 Add engine plan routing
    - Route to TensorRT when available
    - Target 2-5x speedup
    - Fall back to standard inference
    - _Requirements: 10.4, 10.5_

- [ ] 12. Implement Windows native build system
  - [ ] 12.1 Create MSVC build configuration
    - Set up CMake for MSVC
    - Configure compiler flags
    - Link dependencies
    - _Requirements: 11.1_

  - [ ] 12.2 Create MinGW build configuration
    - Set up CMake for MinGW
    - Configure compiler flags
    - Link dependencies
    - _Requirements: 11.1_

  - [ ] 12.3 Add Docker Desktop support
    - Create Dockerfile for Windows containers
    - Configure build environment
    - Enable easy deployment
    - _Requirements: 11.3_

  - [ ] 12.4 Add WSL2 support (optional)
    - Provide WSL2 build instructions
    - Configure WSL2 environment
    - Enable Linux-like development
    - _Requirements: 11.4_

  - [ ] 12.5 Add build error handling
    - Implement build validation
    - Provide clear error messages
    - Enable troubleshooting
    - _Requirements: 11.5_

- [ ] 13. Implement performance optimization and tuning
  - [ ] 13.1 Optimize for 50-100 page documents
    - Target 4-10 seconds total time
    - Profile and optimize bottlenecks
    - Measure end-to-end performance
    - _Requirements: 12.1_

  - [ ] 13.2 Optimize for 1-5 page documents
    - Target <2 seconds total time
    - Optimize for latency
    - Measure end-to-end performance
    - _Requirements: 12.2_

  - [ ] 13.3 Optimize for typical documents
    - Target 2-4 seconds for 20 pages
    - Optimize common case
    - Measure performance
    - _Requirements: 12.3_

  - [ ] 13.4 Optimize GPU utilization
    - Target 80%+ GPU utilization
    - Optimize batching and queuing
    - Monitor and tune
    - _Requirements: 12.4_

  - [ ] 13.5 Optimize CPU utilization
    - Target 70%+ CPU utilization
    - Optimize thread pool sizing
    - Monitor and tune
    - _Requirements: 12.5_

- [ ]* 14. Create unit tests for components
  - [ ]* 14.1 Write tests for page classifier
    - Test classification accuracy
    - Test feature extraction
    - Test routing logic
    - _Requirements: 4.1, 4.2_

  - [ ]* 14.2 Write tests for pipeline manager
    - Test GPU routing
    - Test CPU routing
    - Test fallback logic
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 14.3 Write tests for cache manager
    - Test cache hit/miss
    - Test TTL refresh
    - Test eviction
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 14.4 Write tests for chunker
    - Test chunking correctness
    - Test structure preservation
    - Test parallel processing
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 14.5 Write tests for RAG preparation
    - Test BM25 indexing
    - Test embedding generation
    - Test ranking
    - _Requirements: 9.1, 9.2, 9.3_

- [ ]* 15. Create integration tests
  - [ ]* 15.1 Test end-to-end document processing
    - Upload document
    - Process through pipeline
    - Verify output
    - _Requirements: 2.1, 4.1, 8.1_

  - [ ]* 15.2 Test GPU/CPU fallback
    - Trigger GPU failure
    - Verify CPU fallback
    - Verify output quality
    - _Requirements: 2.3, 7.1_

  - [ ]* 15.3 Test cache functionality
    - Populate cache
    - Verify cache hits
    - Verify TTL refresh
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 15.4 Test RAG preparation
    - Create chunks
    - Build indexes
    - Test ranking
    - _Requirements: 9.1, 9.2, 9.3_

- [ ]* 16. Create performance tests
  - [ ]* 16.1 Test 50-100 page document performance
    - Measure end-to-end time
    - Verify 4-10 second target
    - Profile bottlenecks
    - _Requirements: 12.1_

  - [ ]* 16.2 Test 1-5 page document performance
    - Measure end-to-end time
    - Verify <2 second target
    - Profile bottlenecks
    - _Requirements: 12.2_

  - [ ]* 16.3 Test GPU utilization
    - Monitor GPU usage
    - Verify 80%+ target
    - Optimize if needed
    - _Requirements: 12.4_

  - [ ]* 16.4 Test CPU utilization
    - Monitor CPU usage
    - Verify 70%+ target
    - Optimize if needed
    - _Requirements: 12.5_

---

## Task Execution Notes

### Prerequisites
- Windows 10/11 system with Intel 11th-Gen i7/i9
- CUDA 11.8+ and cuDNN 8.6+ for GPU support
- Docker Desktop (optional)
- MinIO instance
- Redis instance
- Python 3.10+
- MSVC or MinGW compiler

### Dependencies Between Tasks
1. Task 1 (setup) must complete before all others
2. Tasks 2-3 (ingestion, classification) can run in parallel
3. Task 4 (pipeline) depends on tasks 2-3
4. Tasks 5-7 (caching, GPU, CPU) can run in parallel
5. Task 8 (chunking) depends on task 4
6. Task 9 (RAG) depends on task 8
7. Task 10 (events) depends on tasks 4-9
8. Task 11 (TensorRT) can run in parallel
9. Task 12 (build) depends on task 1
10. Task 13 (optimization) depends on tasks 2-12
11. Tasks 14-16 (tests) can run after tasks 2-12

### Implementation Order
1. Task 1: Project setup and W-I9 profiling
2. Task 2: MinIO integration
3. Task 3: Page classification
4. Task 4: GPU/CPU pipeline
5. Task 5: Redis caching
6. Task 6: Granite-Docling integration
7. Task 7: Tesseract fallback
8. Task 8: LangExtract chunking
9. Task 9: RAG preparation
10. Task 10: Status events
11. Task 11: TensorRT migration path
12. Task 12: Windows build system
13. Task 13: Performance optimization
14. Tasks 14-16: Testing (optional)

