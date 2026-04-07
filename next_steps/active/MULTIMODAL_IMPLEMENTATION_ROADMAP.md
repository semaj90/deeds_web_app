# Multi-Modal Implementation Roadmap: Existing → Production

**Date**: March 1, 2026
**Status**: PARTIALLY SUPERSEDED (re-audit Apr 7: Whisper done via nodejs-whisper, YOLO in docling-vlm Docker, CLIP not integrated)
**Existing Code**: 1,346 lines Python (mostly stubs)
**Target**: Full FastAPI + FastMCP + Agentic production stack

---

## Existing Infrastructure (Discovered)

### ✅ Already Built (Need Implementation)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| **multimodal_feature_extractor.py** | 747 | 95% stubs | 1024-d feature vector spec (7 blocks) |
| **multimodal_search.py** | 286 | 80% stubs | Text/Visual/Graph search skeleton |
| **multimodal_retriever.py** | 313 | 70% stubs | RAG+KAG+VAG orchestration |
| **main.py** (FastAPI) | 100 | 60% working | Router infrastructure exists |

**Total Existing**: 1,346 lines (architecture + stubs)

---

## Architecture Match Analysis

### What Exists vs. What We Need

| Component | Exists? | Status | Gap |
|-----------|---------|--------|-----|
| **FastAPI App** | ✅ Yes | Skeleton | Need GPU middleware routes |
| **Multi-Modal Search** | ✅ Yes | Stubs | Need YOLO/Whisper/CLIP impl |
| **Feature Extraction** | ✅ Yes | Design doc | Need actual model loading |
| **LangChain Agents** | ❌ No | Missing | Need autonomous processor |
| **FastMCP Tools** | ✅ Partial | MCP server exists | Need 3 new tools |
| **RabbitMQ Workers** | ✅ Partial | Producer exists | Need Python consumers |
| **YOLO Service** | ❌ No | Missing | Need YOLOv8 wrapper |
| **Whisper Service** | ❌ No | Missing | Need Whisper wrapper |
| **CLIP Service** | ❌ No | Missing | Need CLIP wrapper |
| **Video Processing** | ❌ No | Missing | Need FFmpeg pipeline |

---

## Implementation Path (Phases 1-5)

### Phase 1: Core GPU Services (2 days)

**Goal**: Implement the 3 missing GPU wrappers

#### 1a. YOLO Service (`services/yolo_service.py`) - NEW 150L

```python
"""YOLOv8 object detection service."""
import torch
from ultralytics import YOLO
import numpy as np
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

class YOLOService:
    """GPU-accelerated YOLO object detection."""

    def __init__(self, model_path: str = "yolov8m.pt", gpu_id: int = 0):
        self.device = f"cuda:{gpu_id}" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.model_path = model_path
        logger.info(f"[YOLO] Initialized (device={self.device})")

    async def load(self):
        """Load YOLOv8 model to GPU."""
        self.model = YOLO(self.model_path)
        self.model.to(self.device)
        logger.info(f"[YOLO] Model loaded: {self.model_path}")

    async def detect(
        self,
        image_bytes: bytes,
        confidence_threshold: float = 0.5
    ) -> list[dict]:
        """
        Detect objects in image.

        Returns:
            [
                {
                    "class": "car",
                    "confidence": 0.92,
                    "bbox": [x1, y1, x2, y2],
                    "center": [cx, cy]
                },
                ...
            ]
        """
        # Convert bytes → PIL → numpy
        img = Image.open(io.BytesIO(image_bytes))

        # Run inference
        results = self.model(img, conf=confidence_threshold, device=self.device)

        # Parse results
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0])
                cls = int(box.cls[0])

                detections.append({
                    "class": self.model.names[cls],
                    "confidence": conf,
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "center": [float((x1+x2)/2), float((y1+y2)/2)],
                    "processing_time_ms": 45  # Placeholder
                })

        logger.info(f"[YOLO] Detected {len(detections)} objects")
        return detections

    def unload(self):
        """Release GPU memory."""
        if self.model:
            del self.model
            torch.cuda.empty_cache()
        logger.info("[YOLO] Model unloaded")

    def is_loaded(self) -> bool:
        return self.model is not None
```

#### 1b. Whisper Service (`services/whisper_service.py`) - NEW 180L

```python
"""Whisper Large v3 ASR service."""
import torch
import whisper
import tempfile
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class WhisperService:
    """GPU-accelerated Whisper transcription."""

    def __init__(self, model_name: str = "large-v3", gpu_id: int = 0):
        self.device = f"cuda:{gpu_id}" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.model_name = model_name
        logger.info(f"[Whisper] Initialized (device={self.device})")

    async def load(self):
        """Load Whisper model to GPU."""
        self.model = whisper.load_model(self.model_name, device=self.device)
        logger.info(f"[Whisper] Model loaded: {self.model_name}")

    async def transcribe(
        self,
        audio_bytes: bytes,
        language: str = None,
        task: str = "transcribe"
    ) -> dict:
        """
        Transcribe audio using Whisper.

        Args:
            audio_bytes: Audio file bytes
            language: Language code (auto-detect if None)
            task: "transcribe" or "translate"

        Returns:
            {
                "text": "Full transcription...",
                "language": "en",
                "segments": [
                    {
                        "start": 0.0,
                        "end": 2.5,
                        "text": "Hello world",
                        "confidence": 0.95
                    },
                    ...
                ],
                "processing_time_ms": 8200
            }
        """
        import time
        start_time = time.time()

        # Save audio to temp file (Whisper needs file path)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Transcribe
            result = self.model.transcribe(
                tmp_path,
                language=language,
                task=task,
                verbose=False
            )

            # Format segments
            segments = [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"].strip(),
                    "confidence": seg.get("no_speech_prob", 0.05)  # Inverse
                }
                for seg in result["segments"]
            ]

            processing_time_ms = int((time.time() - start_time) * 1000)

            return {
                "text": result["text"],
                "language": result["language"],
                "segments": segments,
                "processing_time_ms": processing_time_ms
            }

        finally:
            # Cleanup temp file
            Path(tmp_path).unlink(missing_ok=True)

        logger.info(f"[Whisper] Transcribed {len(result['segments'])} segments")

    def unload(self):
        """Release GPU memory."""
        if self.model:
            del self.model
            torch.cuda.empty_cache()
        logger.info("[Whisper] Model unloaded")

    def is_loaded(self) -> bool:
        return self.model is not None
```

#### 1c. CLIP Service (`services/clip_service.py`) - NEW 200L

```python
"""CLIP ViT-B/32 unified vision-text embeddings."""
import torch
import clip
from PIL import Image
import io
import numpy as np
import logging

logger = logging.getLogger(__name__)

class CLIPService:
    """CLIP unified embedding service (768-dim)."""

    def __init__(self, model_name: str = "ViT-B/32", gpu_id: int = 0):
        self.device = f"cuda:{gpu_id}" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.preprocess = None
        self.model_name = model_name
        logger.info(f"[CLIP] Initialized (device={self.device})")

    async def load(self):
        """Load CLIP model to GPU."""
        self.model, self.preprocess = clip.load(self.model_name, device=self.device)
        logger.info(f"[CLIP] Model loaded: {self.model_name}")

    async def embed_text(self, text: str) -> np.ndarray:
        """
        Encode text to 768-dim embedding.

        Args:
            text: Input text

        Returns:
            768-dim numpy array (L2-normalized)
        """
        with torch.no_grad():
            text_token = clip.tokenize([text]).to(self.device)
            text_features = self.model.encode_text(text_token)

            # L2 normalize
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            embedding = text_features.cpu().numpy()[0]

        logger.debug(f"[CLIP] Text embedded: {text[:50]}... (dim={embedding.shape[0]})")
        return embedding

    async def embed_image(self, image_bytes: bytes) -> np.ndarray:
        """
        Encode image to 768-dim embedding.

        Args:
            image_bytes: Image file bytes

        Returns:
            768-dim numpy array (L2-normalized)
        """
        # Convert bytes → PIL image
        img = Image.open(io.BytesIO(image_bytes))

        # Preprocess and encode
        with torch.no_grad():
            image_input = self.preprocess(img).unsqueeze(0).to(self.device)
            image_features = self.model.encode_image(image_input)

            # L2 normalize
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            embedding = image_features.cpu().numpy()[0]

        logger.debug(f"[CLIP] Image embedded (dim={embedding.shape[0]})")
        return embedding

    async def similarity(self, text: str, image_bytes: bytes) -> float:
        """
        Compute cosine similarity between text and image.

        Returns:
            Similarity score (0-1)
        """
        text_emb = await self.embed_text(text)
        image_emb = await self.embed_image(image_bytes)

        # Cosine similarity (already L2-normalized)
        similarity = np.dot(text_emb, image_emb)

        return float(similarity)

    def unload(self):
        """Release GPU memory."""
        if self.model:
            del self.model
            del self.preprocess
            torch.cuda.empty_cache()
        logger.info("[CLIP] Model unloaded")

    def is_loaded(self) -> bool:
        return self.model is not None
```

**Verification**: GPU load test
```bash
python -c "from services.yolo_service import YOLOService; import asyncio; s = YOLOService(); asyncio.run(s.load())"
```

---

### Phase 2: FastAPI Routes (1 day)

**Goal**: Wire GPU services to HTTP endpoints

#### Implement from MULTIMODAL_AGENTIC_ARCHITECTURE.md:
- `routers/vision.py` (lines 2-67 in architecture doc)
- `routers/audio.py` (lines 2-89)
- `routers/video.py` (lines 2-130)
- `routers/multimodal.py` (lines 2-125)

**Bridge to Existing**:
- Use existing `main.py` router mounting (line 75+ already has pattern)
- Wire to existing `multimodal_search.py` search methods (replace stubs)

---

### Phase 3: FastMCP Integration (1 day)

**Goal**: Add 3 tools to existing MCP server

**Existing MCP Server**: `sveltekit-frontend/src/mcp/server.ts` (already has `evidence:analyze` tool)

**Add**:
1. `evidence:analyze_image` → calls FastAPI `/vision/analyze`
2. `evidence:process_video` → calls FastAPI `/video/process`
3. `evidence:search_multimodal` → calls FastAPI `/multimodal/search`

**Wire to Qdrant** (existing `qdrant-manager.ts`):
- Store image/video embeddings in new collection `multimodal_evidence`
- Reuse existing `storeDocument()` method pattern

---

### Phase 4: Agentic Workflows (2 days)

**Goal**: LangChain autonomous agent

#### Use Existing Infrastructure:
- **Existing**: `sveltekit-frontend/src/lib/agents/types.ts` (agent type definitions)
- **Existing**: `sveltekit-frontend/src/lib/components/agentic/AgentChat.svelte` (UI)
- **Existing**: `sveltekit-frontend/src/routes/api/agents/chat/+server.ts` (agent endpoint)

#### Bridge Gap:
1. Replace stub agent with real LangChain implementation
2. Wire to FastMCP tools (image/video/multimodal search)
3. Connect to existing Ollama `gemma3-legal:latest`

**File to Create**: `sveltekit-frontend/src/lib/agents/evidence-processor.ts` (220 lines, per architecture doc)

---

### Phase 5: RabbitMQ Workers (1 day)

**Goal**: Async Python workers for long-running jobs

**Existing**: `sveltekit-frontend/src/lib/server/queue/rabbitmq-manager-fixed.ts` (producer)

**Create**: 3 Python workers in `deeds_labs/python-middleware/backend/workers/`
- `vision_worker.py` → consumes `vision.process` queue
- `audio_worker.py` → consumes `audio.process` queue
- `video_worker.py` → consumes `video.process` queue

**Pattern**: Copy from existing `deeds_labs/python-middleware/backend/evidence-pipeline/` worker pattern

---

## File Creation Plan

| Phase | New Files | Lines | Depends On |
|-------|-----------|-------|------------|
| 1 | 3 GPU services | ~530 | PyTorch, Ultralytics, Whisper, CLIP |
| 2 | 4 FastAPI routers | ~380 | Phase 1 services |
| 3 | 0 (modify MCP server) | +150 | Phase 2 routes |
| 4 | 1 LangChain agent | ~220 | Phase 3 tools |
| 5 | 3 RabbitMQ workers | ~400 | Phase 2 routes |
| **Total** | **11 new files** | **~1,680** | **7-9 days** |

---

## Dependency Installation

### Python Requirements (add to `requirements.txt`)

```txt
# Multi-modal ML
torch>=2.0.0
torchvision>=0.15.0
ultralytics>=8.0.0  # YOLOv8
openai-whisper>=20230918  # Whisper Large v3
git+https://github.com/openai/CLIP.git  # CLIP ViT-B/32

# Video processing
ffmpeg-python>=0.2.0

# Existing (verify)
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
pydantic>=2.0.0
python-multipart  # File uploads
```

### System Dependencies (Docker)

```dockerfile
# Add to existing Dockerfile
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*
```

---

## Testing Strategy

### Phase 1 Tests (GPU Services)

```python
# tests/test_yolo_service.py
import pytest
from services.yolo_service import YOLOService

@pytest.mark.asyncio
async def test_yolo_detect():
    service = YOLOService()
    await service.load()

    # Load test image
    with open("tests/fixtures/police_car.jpg", "rb") as f:
        image_bytes = f.read()

    # Detect
    objects = await service.detect(image_bytes, confidence_threshold=0.5)

    # Verify
    assert len(objects) > 0
    assert objects[0]["class"] in ["car", "truck", "person"]
    assert objects[0]["confidence"] > 0.5
    assert len(objects[0]["bbox"]) == 4
```

### Phase 2 Tests (FastAPI Routes)

```python
# tests/test_vision_routes.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_vision_analyze():
    with open("tests/fixtures/police_car.jpg", "rb") as f:
        image_bytes = f.read()

    response = client.post("/vision/analyze", json={
        "evidence_id": "test-123",
        "image_url": "minio://evidence/test.jpg"
    })

    assert response.status_code == 200
    data = response.json()
    assert "objects" in data
    assert "embedding" in data
    assert len(data["embedding"]) == 768  # CLIP dim
```

---

## Performance Targets

| Operation | Target | Measured | Status |
|-----------|--------|----------|--------|
| YOLO detection | <50ms | TBD | ⏳ |
| CLIP image embed | <30ms | TBD | ⏳ |
| CLIP text embed | <10ms | TBD | ⏳ |
| Whisper (60s audio) | <10s | TBD | ⏳ |
| Video frame extract (60s @ 1fps) | <3s | TBD | ⏳ |
| Full video pipeline (60s) | <100s | TBD | ⏳ |

---

## Integration with Existing Systems

### Qdrant (EXISTING)

**File**: `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts`

**Add Collection**:
```typescript
// In ensureCollections()
{
  name: 'multimodal_evidence',
  config: {
    vectors: {
      size: 768,  // CLIP embedding dimension
      distance: 'Cosine'
    }
  }
}
```

### MinIO (EXISTING)

**File**: `sveltekit-frontend/src/lib/server/storage/minio-client.ts`

**Use**: Fetch image/video/audio bytes for FastAPI processing

### Redis (EXISTING)

**File**: `sveltekit-frontend/src/lib/server/redis.ts`

**Use**: Job status pub/sub for async video processing

---

## Next Steps (Post-Implementation)

1. **Speaker Diarization** (Pyannote + Whisper) - 1 week
2. **Video Scene Detection** (PySceneDetect) - 3 days
3. **OCR in Frames** (Tesseract + EAST) - 4 days
4. **Face Recognition** (FaceNet + CLIP) - 1 week
5. **Audio Event Detection** (AudioSet classifier) - 1 week

---

## Conclusion

**Existing Infrastructure**: 1,346 lines (95% stubs)
**Implementation Needed**: 1,680 lines (11 new files)
**Total Effort**: 7-9 days (Phases 1-5)

The **architecture is already designed**, we just need to **fill in the GPU service implementations** and **wire the FastAPI routes**. The FastMCP and LangChain integration can reuse existing patterns from the SvelteKit codebase.

**Ready to start Phase 1 (GPU Services)?** ✅

---

**Document Version**: 1.0
**Last Updated**: March 1, 2026
**Status**: PARTIALLY SUPERSEDED � Python stubs not implemented; Node.js approach used instead
