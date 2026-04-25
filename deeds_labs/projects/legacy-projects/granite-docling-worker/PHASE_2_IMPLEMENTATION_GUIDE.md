# Phase 2 Implementation Guide - Processing Pipeline

## Current Status

✅ **Phase 1 Complete**: Project infrastructure, W-I9 profiling, configuration
✅ **MinIO Client Started**: Basic client wrapper created

## Remaining Phase 2 Tasks (Tasks 2-7)

Due to token constraints, here's the implementation roadmap for completing Phase 2:

### Task 2: MinIO Integration (PARTIALLY STARTED)

**Files to Create**:
- `src/storage/minio_client.py` ✅ (CREATED)
- `src/storage/upload_manager.py` - Parallel upload orchestration
- `src/storage/__init__.py` - Module exports

**Implementation Details**:
```python
# upload_manager.py should include:
- ParallelUploadManager class
- Multipart upload with 4-8 parallel streams
- Progress tracking and callbacks
- Checksum verification (SHA256)
- Resume capability with Redis state storage
- Error handling and retry logic
```

### Task 3: Page Classification Service

**Files to Create**:
- `src/processing/page_classifier.py` - Micro-ML classifier
- `src/processing/feature_extractor.py` - Feature extraction
- `src/processing/router.py` - Routing logic

**Key Components**:
- Lightweight CNN or decision tree model
- Feature extraction: text density, table presence, image count
- Categories: text, table, image, mixed
- Ensemble fallback for low confidence
- <50ms per page classification

### Task 4: GPU/CPU Pipeline Manager

**Files to Create**:
- `src/processing/pipeline_manager.py` - Main orchestrator
- `src/processing/gpu_processor.py` - Granite-Docling wrapper
- `src/processing/cpu_processor.py` - Tesseract wrapper
- `src/processing/fallback_handler.py` - Fallback logic

**Key Features**:
- Intelligent routing based on classification
- Queue management (GPU/CPU)
- Heavy ROI locking to GPU
- Adaptive fallback (300-700ms timeout)
- Status event emission

### Task 5: Redis Caching Layer

**Files to Create**:
- `src/caching/redis_manager.py` - Redis client wrapper
- `src/caching/cache_manager.py` - OCR result caching
- `src/caching/__init__.py` - Module exports

**Implementation**:
- 7-day TTL with auto-refresh
- Key format: `ocr:{document_hash}:{page_num}`
- LRU eviction policy
- 60%+ hit rate target
- Async cache writes

### Task 6: Granite-Docling VLM Integration

**Files to Create**:
- `src/models/granite_docling_wrapper.py` - Model wrapper
- `src/models/batch_processor.py` - Batch processing
- `src/models/doctags_parser.py` - DocTags format parsing

**Key Features**:
- Load 258M model
- Batch processing (32 pages)
- Extract: text, tables, math, layout
- Structure preservation
- Error handling with fallback

### Task 7: Tesseract Fallback with SIMD

**Files to Create**:
- `src/models/tesseract_wrapper.py` - Tesseract integration
- `src/models/simd_accelerator.py` - AVX2 SIMD optimization
- `src/models/confidence_scorer.py` - Confidence calculation

**Implementation**:
- AVX2 SIMD pre-filters
- 2-3x speedup vs scalar OCR
- Confidence scoring (0.0-1.0)
- Low confidence flagging
- GPU retry option

## Implementation Order

1. **Complete Task 2**: MinIO parallel upload manager
2. **Implement Task 3**: Page classifier with routing
3. **Implement Task 4**: GPU/CPU pipeline orchestration
4. **Implement Task 5**: Redis caching layer
5. **Implement Task 6**: Granite-Docling integration
6. **Implement Task 7**: Tesseract fallback with SIMD

## Code Structure Template

Each module should follow this pattern:

```python
"""
Module description
"""

import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ModuleConfig:
    """Configuration for module"""
    # Add config fields

class ModuleClass:
    """Main class for module"""

    def __init__(self, config: ModuleConfig):
        self.config = config
        logger.info(f"Initialized {self.__class__.__name__}")

    def process(self, data: Any) -> Any:
        """Main processing method"""
        try:
            # Implementation
            logger.info("Processing complete")
            return result
        except Exception as e:
            logger.error(f"Processing failed: {e}")
            raise
```

## Integration Points

### With Legal Dashboard
- Send ProcessingEvent via SSE
- Include stage, percent, ETA, details
- Optional GPU/CPU utilization metrics

### With W-I9 Profile
- Use profile.worker_threads for thread pool sizing
- Use profile.batch_size for page batching
- Use profile.tesseract_threads for OCR
- Use profile.redis_pool_size for cache connections

### With Configuration
- All settings from config.py
- Environment variable overrides
- W-I9 profile auto-tuning

## Performance Targets

- 50-100 page document: 4-10 seconds
- 1-5 page document: <2 seconds
- GPU utilization: 80%+
- CPU utilization: 70%+
- Cache hit rate: 60%+

## Testing Strategy

For each module:
1. Unit tests for core functionality
2. Integration tests with other modules
3. Performance benchmarks
4. Error handling validation

## Next Steps

1. Create upload_manager.py for MinIO parallel uploads
2. Implement page_classifier.py with feature extraction
3. Build pipeline_manager.py for GPU/CPU orchestration
4. Add redis_manager.py for caching
5. Integrate Granite-Docling wrapper
6. Add Tesseract fallback with SIMD

## Notes

- All modules should use logging for debugging
- Configuration should be injected via constructor
- Error handling should be comprehensive
- Performance should be monitored and logged
- Integration with dashboard should be seamless

---

**Status**: Phase 1 Complete, Phase 2 Ready to Implement
**Estimated Time**: 2-3 weeks for Phase 2
**Next Action**: Implement Task 2 (MinIO upload manager)
