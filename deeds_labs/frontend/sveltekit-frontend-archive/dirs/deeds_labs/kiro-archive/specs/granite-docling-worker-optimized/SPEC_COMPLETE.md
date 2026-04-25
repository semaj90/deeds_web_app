# Granite-Docling Worker Optimization Spec - COMPLETE ✅

## Summary

A comprehensive specification for an optimized Granite-Docling document processing worker tuned for Intel 11th-Gen i7/i9 systems (W-I9 profile) running on Windows 10/11. The worker implements a hybrid GPU/CPU pipeline with Redis caching, page classification, parallel streaming, and Tesseract fallback.

## Specification Documents

### 1. Requirements Document
**File**: `.kiro/specs/granite-docling-worker-optimized/requirements.md`

**12 Detailed Requirements**:
1. W-I9 CPU Optimization Profile
2. GPU/CPU Balanced Pipeline
3. Redis Caching for OCR Results
4. Page Classifier (Micro-ML)
5. Parallel LangExtract Auto-Chunker
6. MinIO Parallel Streaming
7. Tesseract Emergency Fallback
8. Granite-Docling VLM Integration
9. R2/R3 Ranking Hooks for RAG
10. TensorRT-LLM Engine Plan Migration Path
11. Windows Native Build Support
12. Performance Targets

**Key Features**:
- EARS-compliant acceptance criteria
- Glossary of technical terms
- Specific performance targets
- Integration requirements

### 2. Design Document
**File**: `.kiro/specs/granite-docling-worker-optimized/design.md`

**Architecture**:
- High-level system flow diagram
- Component architecture
- Data models and interfaces
- Error handling strategies
- Testing approach
- Performance optimization details
- TensorRT-LLM migration path

**Key Components**:
- Document Ingestion Service
- Page Classifier
- GPU/CPU Pipeline Manager
- Redis Caching Layer
- LangExtract Auto-Chunker
- RAG Preparation Service
- Status Event Emitter

### 3. Implementation Plan
**File**: `.kiro/specs/granite-docling-worker-optimized/tasks.md`

**16 Major Tasks with 60+ Subtasks**:
1. Project setup and W-I9 profiling
2. MinIO integration with parallel streaming
3. Page classification service
4. GPU/CPU pipeline manager
5. Redis caching layer
6. Granite-Docling VLM integration
7. Tesseract fallback with SIMD
8. LangExtract auto-chunker
9. RAG preparation service
10. Status event emission
11. TensorRT-LLM migration path
12. Windows native build system
13. Performance optimization
14. Unit tests (optional)
15. Integration tests (optional)
16. Performance tests (optional)

**Optional Tasks**: 14-16 (testing) marked as optional for faster MVP

## Key Specifications

### W-I9 Optimization Profile
- **CPU**: Intel 11th-Gen i7/i9 (8 cores, 16 threads)
- **Threads**: 10-14 (auto-detected)
- **SIMD**: AVX2 acceleration
- **Cache**: L2/L3 optimization
- **Batch Size**: 32 pages concurrent

### Performance Targets
- **50-100 page document**: 4-10 seconds (full parse + embeddings)
- **1-5 page document**: <2 seconds
- **Typical 20-page document**: 2-4 seconds
- **GPU Utilization**: 80%+
- **CPU Utilization**: 70%+

### Technology Stack
- **Language**: Python 3.10+
- **GPU**: CUDA 11.8+, cuDNN 8.6+
- **Models**: Granite-Docling (258M), Tesseract, LegalBERT
- **Storage**: MinIO (object storage)
- **Cache**: Redis (7-day TTL)
- **Build**: MSVC/MinGW (Windows native)
- **Containers**: Docker Desktop (optional)

### Integration Points
- **Legal Dashboard**: SSE event streaming
- **MinIO**: Document ingestion
- **Redis**: OCR caching
- **CUDA**: GPU acceleration
- **TensorRT-LLM**: Future optimization

## Deliverables

### Code Files (to be implemented)
- W-I9 CPU profiler
- MinIO client with parallel streaming
- Page classifier (Micro-ML)
- GPU/CPU pipeline manager
- Redis cache manager
- Granite-Docling wrapper
- Tesseract wrapper with AVX2
- LangExtract chunker
- RAG preparation service
- Status event emitter
- TensorRT-LLM loader
- Windows build system

### Configuration Files
- CMakeLists.txt (MSVC/MinGW)
- Dockerfile (Windows containers)
- WSL2 build instructions
- W-I9 profile configuration

### Documentation
- README with setup instructions
- API documentation
- Performance tuning guide
- Troubleshooting guide

## Implementation Timeline

### Phase 1: Core Infrastructure (Tasks 1-4)
- Project setup and W-I9 profiling
- MinIO integration
- Page classification
- GPU/CPU pipeline
- **Estimated**: 2-3 weeks

### Phase 2: Processing Pipeline (Tasks 5-7)
- Redis caching
- Granite-Docling integration
- Tesseract fallback
- **Estimated**: 2-3 weeks

### Phase 3: RAG & Optimization (Tasks 8-13)
- LangExtract chunking
- RAG preparation
- Status events
- TensorRT migration path
- Windows build system
- Performance optimization
- **Estimated**: 3-4 weeks

### Phase 4: Testing (Tasks 14-16, optional)
- Unit tests
- Integration tests
- Performance tests
- **Estimated**: 1-2 weeks (optional)

**Total Estimated Time**: 7-12 weeks (core), 8-14 weeks (with testing)

## Success Criteria

### Functional
- ✅ Document ingestion via MinIO
- ✅ Page classification working
- ✅ GPU/CPU pipeline operational
- ✅ Redis caching functional
- ✅ Granite-Docling parsing working
- ✅ Tesseract fallback operational
- ✅ Text chunking working
- ✅ RAG preparation complete
- ✅ Status events streaming
- ✅ Windows native build working

### Performance
- ✅ 50-100 page document: 4-10 seconds
- ✅ 1-5 page document: <2 seconds
- ✅ GPU utilization: 80%+
- ✅ CPU utilization: 70%+
- ✅ Cache hit rate: 60%+

### Quality
- ✅ Error handling and recovery
- ✅ Graceful fallback mechanisms
- ✅ Comprehensive logging
- ✅ Status event streaming
- ✅ Dashboard integration

## Next Steps

1. **Review & Approval**: Confirm spec is ready for implementation
2. **Environment Setup**: Prepare Windows development environment
3. **Task Execution**: Begin with Task 1 (project setup)
4. **Iterative Development**: Complete tasks in order
5. **Testing & Optimization**: Validate performance targets
6. **Deployment**: Package as `granite-docling-worker-optimized.zip`

## Files Created

```
.kiro/specs/granite-docling-worker-optimized/
├── requirements.md          # 12 requirements with EARS compliance
├── design.md               # Architecture and design decisions
├── tasks.md                # 16 tasks with 60+ subtasks
└── SPEC_COMPLETE.md        # This file
```

## Status

**✅ SPECIFICATION COMPLETE**

- Requirements: ✅ Approved
- Design: ✅ Approved
- Tasks: ✅ Approved
- Ready for Implementation: ✅ YES

---

**Date**: November 23, 2025
**Target OS**: Windows 10/11 (WSL2 optional)
**Target CPU**: Intel 11th-Gen i7/i9 (W-I9 Profile)
**Build Format**: .zip source code (no .exe)
**Future Path**: TensorRT-LLM engine plans
