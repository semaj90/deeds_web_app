# Phase 3: RAG & Optimization - Implementation TODO

## Overview
Phase 3 focuses on integrating the document processing pipeline with RAG (Retrieval-Augmented Generation) systems, implementing status event streaming, TensorRT migration path, Windows build system, and performance optimization.

**Status**: Ready for Implementation
**Target Completion**: 2-3 weeks
**Priority**: High (Core RAG integration)

---

## Task 8: LangExtract Auto-Chunker
**Status**: Not Started
**Complexity**: Medium
**Estimated Time**: 3-4 days

### Objectives
- Implement semantic text chunking (256-512 tokens)
- Preserve document structure (page numbers, sections)
- Support parallel chunking (1000+ chunks/second)
- Handle table preservation in markdown format

### Subtasks
- [ ] 8.1 Create text chunking engine
  - Implement semantic chunking algorithm
  - Target 256-512 token chunks
  - Chunk at sentence/paragraph boundaries
  - Handle edge cases (short documents, long paragraphs)

- [ ] 8.2 Implement parallel chunking
  - Create thread pool (1 worker per 2 cores)
  - Process multiple texts in parallel
  - Target 1000+ chunks/second throughput
  - Monitor thread pool performance

- [ ] 8.3 Add structure preservation
  - Preserve page numbers in metadata
  - Maintain section hierarchy
  - Include document structure in chunk metadata
  - Support hierarchical chunk relationships

- [ ] 8.4 Add table preservation
  - Preserve table structure in chunks
  - Use markdown or structured format
  - Maintain cell relationships
  - Support table-specific queries

- [ ] 8.5 Implement fallback chunking
  - Use fixed-size chunking on semantic failure
  - Split at token boundaries
  - Always produce valid chunks
  - Log fallback usage for analysis

### Integration Points
- Input: OCR output from GPU/CPU pipeline
- Output: Chunks ready for embedding
- Dependencies: Task 4 (Pipeline Manager)
- Downstream: Task 9 (RAG Preparation)

### Testing Checklist
- [ ] Test chunking with various document types
- [ ] Verify chunk size distribution
- [ ] Benchmark parallel performance
- [ ] Test structure preservation
- [ ] Test fallback behavior

---

## Task 9: RAG Preparation Service
**Status**: Not Started
**Complexity**: High
**Estimated Time**: 4-5 days

### Objectives
- Build BM25 keyword index (1000+ chunks/second)
- Generate semantic embeddings (LegalBERT)
- Implement R2 ranking (BM25, <100ms for 10K chunks)
- Implement R3 ranking (semantic, combined scoring)

### Subtasks
- [ ] 9.1 Create BM25 indexer
  - Build BM25 index from chunks
  - Index 1000+ chunks/second
  - Implement keyword matching
  - Support incremental indexing

- [ ] 9.2 Create embedding generator
  - Generate semantic embeddings
  - Use legal-domain model (LegalBERT)
  - Prepare for semantic search
  - Support batch embedding generation

- [ ] 9.3 Implement R2 ranking
  - Apply BM25 ranking
  - Process <100ms for 10K chunks
  - Return top-K results
  - Support ranking customization

- [ ] 9.4 Implement R3 ranking
  - Apply semantic ranking to R2 results
  - Reduce search scope
  - Combine with R2 scores
  - Support re-ranking strategies

- [ ] 9.5 Add ranking score combination
  - Combine R2 and R3 scores
  - Use weighted combination (0.3*R2 + 0.7*R3)
  - Allow weight tuning
  - Support A/B testing

### Integration Points
- Input: Chunks from Task 8
- Output: Indexed, ranked chunks ready for retrieval
- Dependencies: Task 8 (Chunker)
- Downstream: Task 10 (Status Events), Legal Dashboard
- Existing Integration: PostgreSQL Vector Storage, RAG Ranking System

### Testing Checklist
- [ ] Test BM25 indexing performance
- [ ] Test embedding generation
- [ ] Verify R2 ranking accuracy
- [ ] Verify R3 ranking accuracy
- [ ] Test combined scoring
- [ ] Benchmark ranking performance

---

## Task 10: Status Event Emission
**Status**: Not Started
**Complexity**: Medium
**Estimated Time**: 2-3 days

### Objectives
- Emit ProcessingEvent for each pipeline stage
- Send events via SSE to Legal Dashboard
- Include metrics (GPU/CPU utilization, timing)
- Support real-time progress monitoring

### Subtasks
- [ ] 10.1 Create event emitter
  - Emit ProcessingEvent for each stage
  - Include stage, percent, ETA, details
  - Send via SSE to dashboard
  - Support event filtering

- [ ] 10.2 Add metrics collection
  - Track GPU utilization
  - Track CPU utilization
  - Monitor processing times
  - Collect memory usage

- [ ] 10.3 Implement dashboard integration
  - Send events to Legal Dashboard
  - Match ProcessingEvent schema
  - Include optional metrics
  - Support real-time updates

### Integration Points
- Input: Events from all pipeline stages
- Output: SSE stream to Legal Dashboard
- Dependencies: All processing tasks
- Existing Integration: Legal Dashboard (courthouse-theme)

### Testing Checklist
- [ ] Test event emission
- [ ] Verify SSE delivery
- [ ] Test dashboard integration
- [ ] Verify metrics accuracy
- [ ] Test event filtering

---

## Task 11: TensorRT-LLM Migration Path
**Status**: Not Started
**Complexity**: High
**Estimated Time**: 4-5 days

### Objectives
- Support ONNX and SafeTensors formats
- Implement TensorRT engine plan loader
- Enable 2-5x speedup with graceful fallback
- Maintain API compatibility

### Subtasks
- [ ] 11.1 Add model format support
  - Support ONNX format
  - Support SafeTensors format
  - Enable future TensorRT conversion
  - Validate model formats

- [ ] 11.2 Add performance logging
  - Log latency metrics
  - Log throughput metrics
  - Log memory usage
  - Support performance analysis

- [ ] 11.3 Implement engine plan loader
  - Load TensorRT engine plans
  - Maintain same API
  - Support graceful fallback
  - Handle missing engines

- [ ] 11.4 Add engine plan routing
  - Route to TensorRT when available
  - Target 2-5x speedup
  - Fall back to standard inference
  - Support A/B testing

### Integration Points
- Input: Granite-Docling model
- Output: Optimized inference engine
- Dependencies: Task 6 (Granite-Docling)
- Downstream: Task 13 (Performance Optimization)

### Testing Checklist
- [ ] Test ONNX format support
- [ ] Test SafeTensors format support
- [ ] Test TensorRT engine loading
- [ ] Verify speedup metrics
- [ ] Test fallback behavior

---

## Task 12: Windows Native Build System
**Status**: Not Started
**Complexity**: Medium
**Estimated Time**: 3-4 days

### Objectives
- Create MSVC build configuration
- Create MinGW build configuration
- Support Docker Desktop for Windows
- Enable WSL2 development (optional)

### Subtasks
- [ ] 12.1 Create MSVC build configuration
  - Set up CMake for MSVC
  - Configure compiler flags
  - Link dependencies
  - Test build process

- [ ] 12.2 Create MinGW build configuration
  - Set up CMake for MinGW
  - Configure compiler flags
  - Link dependencies
  - Test build process

- [ ] 12.3 Add Docker Desktop support
  - Create Dockerfile for Windows containers
  - Configure build environment
  - Enable easy deployment
  - Test containerization

- [ ] 12.4 Add WSL2 support (optional)
  - Provide WSL2 build instructions
  - Configure WSL2 environment
  - Enable Linux-like development
  - Document WSL2 setup

- [ ] 12.5 Add build error handling
  - Implement build validation
  - Provide clear error messages
  - Enable troubleshooting
  - Create build troubleshooting guide

### Integration Points
- Input: Source code
- Output: Native Windows executables
- Dependencies: Task 1 (Project Setup)
- Downstream: Deployment

### Testing Checklist
- [ ] Test MSVC build
- [ ] Test MinGW build
- [ ] Test Docker build
- [ ] Test WSL2 build
- [ ] Verify executable functionality

---

## Task 13: Performance Optimization & Tuning
**Status**: Not Started
**Complexity**: High
**Estimated Time**: 5-7 days

### Objectives
- Optimize for 50-100 page documents (4-10 seconds)
- Optimize for 1-5 page documents (<2 seconds)
- Optimize for typical 20-page documents (2-4 seconds)
- Target 80%+ GPU utilization, 70%+ CPU utilization

### Subtasks
- [ ] 13.1 Optimize for 50-100 page documents
  - Target 4-10 seconds total time
  - Profile and optimize bottlenecks
  - Measure end-to-end performance
  - Document optimization strategies

- [ ] 13.2 Optimize for 1-5 page documents
  - Target <2 seconds total time
  - Optimize for latency
  - Measure end-to-end performance
  - Minimize startup overhead

- [ ] 13.3 Optimize for typical documents
  - Target 2-4 seconds for 20 pages
  - Optimize common case
  - Measure performance
  - Balance throughput and latency

- [ ] 13.4 Optimize GPU utilization
  - Target 80%+ GPU utilization
  - Optimize batching and queuing
  - Monitor and tune
  - Implement dynamic batching

- [ ] 13.5 Optimize CPU utilization
  - Target 70%+ CPU utilization
  - Optimize thread pool sizing
  - Monitor and tune
  - Implement work stealing

### Integration Points
- Input: All pipeline components
- Output: Optimized pipeline
- Dependencies: All previous tasks
- Downstream: Production deployment

### Testing Checklist
- [ ] Benchmark 50-100 page documents
- [ ] Benchmark 1-5 page documents
- [ ] Benchmark 20-page documents
- [ ] Monitor GPU utilization
- [ ] Monitor CPU utilization
- [ ] Profile bottlenecks

---

## Task 14-16: Testing (Optional)
**Status**: Not Started
**Complexity**: Medium
**Estimated Time**: 3-4 days (optional)

### Task 14: Unit Tests
- [ ] 14.1 Write tests for page classifier
- [ ] 14.2 Write tests for pipeline manager
- [ ] 14.3 Write tests for cache manager
- [ ] 14.4 Write tests for chunker
- [ ] 14.5 Write tests for RAG preparation

### Task 15: Integration Tests
- [ ] 15.1 Test end-to-end document processing
- [ ] 15.2 Test GPU/CPU fallback
- [ ] 15.3 Test cache functionality
- [ ] 15.4 Test RAG preparation

### Task 16: Performance Tests
- [ ] 16.1 Test 50-100 page document performance
- [ ] 16.2 Test 1-5 page document performance
- [ ] 16.3 Test GPU utilization
- [ ] 16.4 Test CPU utilization

---

## Dependencies & Prerequisites

### System Requirements
- Windows 10/11 with Intel 11th-Gen i7/i9
- CUDA 11.8+ and cuDNN 8.6+
- Docker Desktop (optional)
- MinIO instance
- Redis instance
- PostgreSQL 17 with pgvector
- Python 3.10+
- MSVC or MinGW compiler

### External Dependencies
- LangExtract (chunking)
- LegalBERT (embeddings)
- TensorRT-LLM (optional optimization)
- Granite-Docling (GPU processing)
- Tesseract (CPU fallback)

### Existing Integration Points
- PostgreSQL Vector Storage (pgvector)
- RAG Ranking System (multi-factor ranking)
- Legal Dashboard (SSE streaming)
- MinIO (document storage)
- Redis (caching)
- RabbitMQ (job queue)

---

## Implementation Order

1. **Task 8** (LangExtract Chunker) - Foundation for RAG
2. **Task 9** (RAG Preparation) - Build indexes and embeddings
3. **Task 10** (Status Events) - Real-time monitoring
4. **Task 11** (TensorRT Migration) - Performance optimization path
5. **Task 12** (Windows Build) - Production deployment
6. **Task 13** (Performance Tuning) - Final optimization
7. **Tasks 14-16** (Testing) - Quality assurance (optional)

---

## Success Criteria

### Phase 3 Completion
- [ ] All 8 core tasks (8-13) implemented and tested
- [ ] LangExtract chunking working at 1000+ chunks/second
- [ ] RAG preparation with BM25 + semantic ranking
- [ ] Status events streaming to Legal Dashboard
- [ ] TensorRT migration path available
- [ ] Windows native builds working
- [ ] Performance targets met (see Task 13)
- [ ] Documentation complete

### Performance Targets
- 50-100 page documents: 4-10 seconds
- 1-5 page documents: <2 seconds
- 20-page documents: 2-4 seconds
- GPU utilization: 80%+
- CPU utilization: 70%+
- Chunking throughput: 1000+ chunks/second
- R2 ranking: <100ms for 10K chunks

### Quality Targets
- Code coverage: 80%+ (for core functionality)
- All tests passing
- No critical bugs
- Documentation complete
- Performance benchmarks documented

---

## Notes & Considerations

### Architecture Decisions
- Hybrid GPU/CPU pipeline with intelligent routing
- Redis caching with 7-day TTL
- PostgreSQL pgvector for semantic search
- BM25 + semantic ranking (R2 + R3)
- SSE streaming for real-time updates

### Known Challenges
- TensorRT optimization requires model conversion
- Windows build system complexity
- Performance tuning requires profiling
- RAG ranking requires careful weight tuning

### Future Enhancements
- Real-ESRGAN for image upscaling
- SAM for ROI segmentation
- SOM for signature/stamp detection
- Neo4j for citation graph
- Cross-case evidence linking

---

## Resources & References

### Documentation
- Granite-Docling: https://github.com/ibm-granite/granite-docling
- LangExtract: https://github.com/langextract/langextract
- LegalBERT: https://huggingface.co/nlpaueb/legal-bert-base-uncased
- TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- PostgreSQL pgvector: https://github.com/pgvector/pgvector

### Related Specs
- Legal Dashboard Progress UI: `.kiro/specs/legal-dashboard-progress-ui/`
- Granite-Docling Worker: `.kiro/specs/granite-docling-worker-optimized/`

### Existing Codebase
- RAG Ranking System: `src/lib/services/rag-ranking-system.ts`
- PostgreSQL Vector Storage: `src/lib/services/postgresql-vector-storage.ts`
- Legal Dashboard: `sveltekit-frontend/src/routes/dashboard/legal-progress/`

---

## Contact & Support

For questions or issues:
1. Check existing documentation
2. Review related specs
3. Consult existing codebase implementations
4. Refer to external library documentation

---

**Last Updated**: November 23, 2025
**Next Review**: After Task 8 completion
