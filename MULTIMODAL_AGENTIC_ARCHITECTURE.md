# Multi-Modal Evidence Processing: FastMCP + FastAPI Agentic Middleware

**Date**: March 1, 2026
**Status**: Architecture Design (Phase 0)
**Goal**: Autonomous multi-modal evidence analysis (image/audio/video) via agentic tool calling
**Stack**: FastMCP (tool interface) + FastAPI (GPU middleware) + RabbitMQ (async orchestration)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SvelteKit Frontend                          │
│  - Evidence upload (drag-drop image/audio/video)                    │
│  - Real-time SSE progress stream                                    │
│  - Multi-modal search UI (text + image + audio queries)             │
└────────────────────┬────────────────────────────────────────────────┘
                     │ HTTP/SSE
┌────────────────────▼────────────────────────────────────────────────┐
│                    SvelteKit API Routes                             │
│  - POST /api/evidence/upload (MinIO + job creation)                 │
│  - GET /api/evidence/realtime?jobId=xxx (SSE progress)              │
│  - POST /api/multimodal/search (unified vector search)              │
└────────────────────┬────────────────────────────────────────────────┘
                     │ MCP Stdio / HTTP
┌────────────────────▼────────────────────────────────────────────────┐
│                    FastMCP Server (Node.js)                         │
│  TOOLS:                                                              │
│  - evidence:analyze_image     → Vision analysis                     │
│  - evidence:transcribe_audio  → Speech-to-text                      │
│  - evidence:process_video     → Frame extraction + audio            │
│  - evidence:search_multimodal → Unified vector search               │
│  - evidence:summarize_visual  → Image → text description            │
└────────────────────┬────────────────────────────────────────────────┘
                     │ HTTP REST
┌────────────────────▼────────────────────────────────────────────────┐
│               FastAPI Middleware (Python)                           │
│  SERVICES:                                                           │
│  - /vision/analyze       → YOLO + CLIP embeddings                   │
│  - /audio/transcribe     → Whisper + speaker diarization            │
│  - /video/process        → FFmpeg + frame sampling                  │
│  - /multimodal/embed     → Unified 768-dim CLIP embeddings          │
│  QUEUES (RabbitMQ):                                                  │
│  - vision.process        → Async YOLO inference                     │
│  - audio.process         → Async Whisper transcription              │
│  - video.process         → Async frame extraction pipeline          │
└────────────────────┬────────────────────────────────────────────────┘
                     │ GPU Inference
┌────────────────────▼────────────────────────────────────────────────┐
│                   GPU Workers (Docker)                              │
│  - YOLOv8 (object detection): 640x640, 80 classes                   │
│  - Whisper Large v3 (ASR): multi-lingual, timestamps                │
│  - CLIP ViT-B/32 (vision-text): 768-dim unified embeddings          │
│  - FFmpeg (video processing): frame extraction, audio demux         │
└────────────────────┬────────────────────────────────────────────────┘
                     │ Storage
┌────────────────────▼────────────────────────────────────────────────┐
│                   Storage Layer                                     │
│  - MinIO: Raw files (MP4, MP3, JPG, PNG)                            │
│  - Qdrant: Multi-modal vectors (768-dim CLIP)                       │
│  - PostgreSQL: Metadata (timestamps, objects, speakers)             │
│  - Redis: Job status, SSE event queue                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: FastAPI GPU Middleware (Core Services)

### File Structure

```
deeds_labs/python-middleware/
├── fastapi_multimodal/
│   ├── main.py                    # FastAPI app entry
│   ├── routers/
│   │   ├── vision.py              # YOLO + CLIP vision endpoints
│   │   ├── audio.py               # Whisper ASR endpoints
│   │   ├── video.py               # FFmpeg + frame pipeline
│   │   └── multimodal.py          # Unified embedding endpoint
│   ├── services/
│   │   ├── yolo_service.py        # YOLOv8 wrapper
│   │   ├── whisper_service.py     # Whisper wrapper
│   │   ├── clip_service.py        # CLIP ViT-B/32 wrapper
│   │   └── ffmpeg_service.py      # Video processing
│   ├── workers/
│   │   ├── vision_worker.py       # RabbitMQ consumer (vision)
│   │   ├── audio_worker.py        # RabbitMQ consumer (audio)
│   │   └── video_worker.py        # RabbitMQ consumer (video)
│   ├── models/
│   │   ├── schemas.py             # Pydantic models
│   │   └── responses.py           # API response types
│   └── utils/
│       ├── gpu_manager.py         # VRAM allocation
│       └── minio_client.py        # MinIO file fetcher
├── requirements.txt               # Python deps
├── Dockerfile                     # Multi-stage build
└── docker-compose.yml             # Orchestration
```

---

## FastAPI Implementation

### 1. Main App (`main.py`)

```python
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from routers import vision, audio, video, multimodal
from services.yolo_service import YOLOService
from services.whisper_service import WhisperService
from services.clip_service import CLIPService
from utils.gpu_manager import GPUManager

# Global model instances (loaded once on startup)
yolo_service: YOLOService = None
whisper_service: WhisperService = None
clip_service: CLIPService = None
gpu_manager: GPUManager = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: Load GPU models. Shutdown: Release VRAM."""
    global yolo_service, whisper_service, clip_service, gpu_manager

    gpu_manager = GPUManager()

    # Load models sequentially to avoid OOM
    print("[Startup] Loading YOLOv8...")
    yolo_service = YOLOService(gpu_id=0)
    await yolo_service.load()

    print("[Startup] Loading Whisper Large v3...")
    whisper_service = WhisperService(gpu_id=0)
    await whisper_service.load()

    print("[Startup] Loading CLIP ViT-B/32...")
    clip_service = CLIPService(gpu_id=0)
    await clip_service.load()

    print(f"[Startup] GPU Memory: {gpu_manager.get_vram_usage()} MB / {gpu_manager.get_total_vram()} MB")

    yield  # App runs here

    # Shutdown: Cleanup
    print("[Shutdown] Releasing GPU models...")
    yolo_service.unload()
    whisper_service.unload()
    clip_service.unload()

app = FastAPI(
    title="Deeds Multi-Modal Middleware",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # SvelteKit dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(vision.router, prefix="/vision", tags=["Vision"])
app.include_router(audio.router, prefix="/audio", tags=["Audio"])
app.include_router(video.router, prefix="/video", tags=["Video"])
app.include_router(multimodal.router, prefix="/multimodal", tags=["Multi-Modal"])

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "gpu_vram_mb": gpu_manager.get_vram_usage(),
        "models_loaded": {
            "yolo": yolo_service.is_loaded(),
            "whisper": whisper_service.is_loaded(),
            "clip": clip_service.is_loaded()
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8100, log_level="info")
```

---

### 2. Vision Router (`routers/vision.py`)

```python
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import base64

from services.yolo_service import yolo_service
from services.clip_service import clip_service
from utils.minio_client import fetch_from_minio

router = APIRouter()

class VisionAnalysisRequest(BaseModel):
    evidence_id: str
    image_url: str  # MinIO object key
    confidence_threshold: float = 0.5

class DetectedObject(BaseModel):
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    center: List[float]  # [cx, cy]

class VisionAnalysisResponse(BaseModel):
    evidence_id: str
    objects: List[DetectedObject]
    embedding: List[float]  # 768-dim CLIP
    processing_time_ms: int

@router.post("/analyze", response_model=VisionAnalysisResponse)
async def analyze_image(request: VisionAnalysisRequest):
    """
    Analyze image: YOLO object detection + CLIP embedding.

    Returns:
    - objects: List of detected objects (class, bbox, confidence)
    - embedding: 768-dim CLIP vision embedding
    """
    try:
        # Fetch image from MinIO
        image_bytes = await fetch_from_minio(request.image_url)

        # YOLO detection (runs on GPU)
        objects = await yolo_service.detect(
            image_bytes,
            confidence_threshold=request.confidence_threshold
        )

        # CLIP embedding (vision tower)
        embedding = await clip_service.embed_image(image_bytes)

        return VisionAnalysisResponse(
            evidence_id=request.evidence_id,
            objects=[
                DetectedObject(
                    class_name=obj["class"],
                    confidence=obj["confidence"],
                    bbox=obj["bbox"],
                    center=obj["center"]
                )
                for obj in objects
            ],
            embedding=embedding.tolist(),
            processing_time_ms=int(objects[0]["processing_time_ms"]) if objects else 0
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision analysis failed: {str(e)}")

@router.post("/embed_batch")
async def embed_images_batch(image_urls: List[str]) -> List[List[float]]:
    """Batch embed images (CLIP vision tower). Max 32 images per request."""
    if len(image_urls) > 32:
        raise HTTPException(status_code=400, detail="Max 32 images per batch")

    embeddings = []
    for url in image_urls:
        image_bytes = await fetch_from_minio(url)
        embedding = await clip_service.embed_image(image_bytes)
        embeddings.append(embedding.tolist())

    return embeddings
```

---

### 3. Audio Router (`routers/audio.py`)

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from services.whisper_service import whisper_service
from utils.minio_client import fetch_from_minio

router = APIRouter()

class TranscriptionSegment(BaseModel):
    start: float  # seconds
    end: float
    text: str
    confidence: float
    speaker: Optional[str] = None  # Speaker diarization (future)

class AudioTranscriptionRequest(BaseModel):
    evidence_id: str
    audio_url: str  # MinIO object key
    language: Optional[str] = None  # Auto-detect if None
    task: str = "transcribe"  # "transcribe" | "translate"

class AudioTranscriptionResponse(BaseModel):
    evidence_id: str
    language: str
    segments: List[TranscriptionSegment]
    full_text: str
    processing_time_ms: int

@router.post("/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_audio(request: AudioTranscriptionRequest):
    """
    Transcribe audio using Whisper Large v3.

    Returns:
    - segments: Timestamped transcript chunks
    - full_text: Complete transcription
    - language: Detected or specified language
    """
    try:
        # Fetch audio from MinIO
        audio_bytes = await fetch_from_minio(request.audio_url)

        # Whisper transcription (runs on GPU)
        result = await whisper_service.transcribe(
            audio_bytes,
            language=request.language,
            task=request.task
        )

        return AudioTranscriptionResponse(
            evidence_id=request.evidence_id,
            language=result["language"],
            segments=[
                TranscriptionSegment(
                    start=seg["start"],
                    end=seg["end"],
                    text=seg["text"],
                    confidence=seg.get("confidence", 0.95)
                )
                for seg in result["segments"]
            ],
            full_text=result["text"],
            processing_time_ms=result["processing_time_ms"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
```

---

### 4. Video Router (`routers/video.py`)

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from services.ffmpeg_service import FFmpegService
from services.yolo_service import yolo_service
from services.whisper_service import whisper_service
from services.clip_service import clip_service
from utils.minio_client import fetch_from_minio, upload_to_minio

router = APIRouter()
ffmpeg = FFmpegService()

class VideoFrame(BaseModel):
    timestamp: float  # seconds
    frame_index: int
    objects: List[dict]  # YOLO detections
    embedding: List[float]  # 768-dim CLIP

class VideoProcessingResponse(BaseModel):
    evidence_id: str
    duration: float
    fps: float
    frames: List[VideoFrame]
    audio_transcript: Optional[str] = None
    processing_time_ms: int

@router.post("/process")
async def process_video(evidence_id: str, video_url: str, fps: float = 1.0):
    """
    Process video: Extract frames (1fps) → YOLO + CLIP per frame → Whisper audio track.

    Pipeline:
    1. FFmpeg: Extract frames (1fps) + demux audio
    2. YOLO: Detect objects in each frame
    3. CLIP: Embed each frame (768-dim)
    4. Whisper: Transcribe audio track
    5. Store: Frames → MinIO, embeddings → Qdrant, metadata → PostgreSQL
    """
    try:
        # Fetch video from MinIO
        video_bytes = await fetch_from_minio(video_url)

        # 1. Extract frames + audio
        frames_data = await ffmpeg.extract_frames(video_bytes, fps=fps)
        audio_bytes = await ffmpeg.extract_audio(video_bytes)

        # 2-3. Process frames in parallel (YOLO + CLIP)
        frames = []
        for i, frame_bytes in enumerate(frames_data["frames"]):
            timestamp = i / fps

            # YOLO detection
            objects = await yolo_service.detect(frame_bytes, confidence_threshold=0.5)

            # CLIP embedding
            embedding = await clip_service.embed_image(frame_bytes)

            # Upload frame to MinIO
            frame_key = f"{evidence_id}/frames/frame_{i:04d}.jpg"
            await upload_to_minio(frame_key, frame_bytes)

            frames.append(VideoFrame(
                timestamp=timestamp,
                frame_index=i,
                objects=[{"class": obj["class"], "confidence": obj["confidence"]} for obj in objects],
                embedding=embedding.tolist()
            ))

        # 4. Transcribe audio
        transcript = None
        if audio_bytes:
            whisper_result = await whisper_service.transcribe(audio_bytes)
            transcript = whisper_result["text"]

        return VideoProcessingResponse(
            evidence_id=evidence_id,
            duration=frames_data["duration"],
            fps=fps,
            frames=frames,
            audio_transcript=transcript,
            processing_time_ms=frames_data["processing_time_ms"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")
```

---

### 5. Multi-Modal Unified Embedding (`routers/multimodal.py`)

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal

from services.clip_service import clip_service
from utils.minio_client import fetch_from_minio

router = APIRouter()

class MultiModalEmbedRequest(BaseModel):
    modality: Literal["text", "image"]
    content: str  # Text string OR MinIO URL (for images)

@router.post("/embed")
async def embed_multimodal(request: MultiModalEmbedRequest) -> List[float]:
    """
    Unified CLIP embedding endpoint (768-dim).

    - modality="text": Encode text query → 768-dim
    - modality="image": Encode image → 768-dim

    Both map to same vector space → enables text-to-image search.
    """
    try:
        if request.modality == "text":
            embedding = await clip_service.embed_text(request.content)
        elif request.modality == "image":
            image_bytes = await fetch_from_minio(request.content)
            embedding = await clip_service.embed_image(image_bytes)
        else:
            raise ValueError(f"Invalid modality: {request.modality}")

        return embedding.tolist()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")

@router.post("/search")
async def search_multimodal(query: str, modality: Literal["text", "image"], top_k: int = 10):
    """
    Multi-modal search: Query can be text OR image, results include all modalities.

    Example:
    - query="police car at intersection" (text) → finds images + video frames
    - query="minio://evidence/ev123/photo.jpg" (image) → finds similar images
    """
    # Embed query
    if modality == "text":
        query_embedding = await clip_service.embed_text(query)
    else:
        image_bytes = await fetch_from_minio(query)
        query_embedding = await clip_service.embed_image(image_bytes)

    # Search Qdrant (all collections)
    # TODO: Implement Qdrant multi-collection search
    # For now, return placeholder
    return {
        "query": query,
        "modality": modality,
        "results": [],
        "message": "Multi-modal search not yet implemented (Phase 2)"
    }
```

---

## Phase 2: FastMCP Agentic Tools

### MCP Tool Definitions (`src/mcp/server.ts`)

```typescript
// Add to existing tool list
{
  name: "evidence:analyze_image",
  description: "Analyze image evidence: YOLO object detection + CLIP embedding. Returns detected objects (class, bbox, confidence) and 768-dim vector.",
  inputSchema: {
    type: "object",
    properties: {
      evidenceId: { type: "string", description: "Evidence record ID" },
      imageUrl: { type: "string", description: "MinIO object key (e.g., 'evidence/ev123/photo.jpg')" },
      confidenceThreshold: { type: "number", description: "YOLO confidence threshold (0.0-1.0)", default: 0.5 }
    },
    required: ["evidenceId", "imageUrl"]
  }
},
{
  name: "evidence:process_video",
  description: "Process video evidence: Extract frames (1fps) + YOLO per frame + Whisper audio transcription. Returns frame embeddings, objects, and transcript.",
  inputSchema: {
    type: "object",
    properties: {
      evidenceId: { type: "string" },
      videoUrl: { type: "string", description: "MinIO object key" },
      fps: { type: "number", description: "Frame extraction rate", default: 1.0 }
    },
    required: ["evidenceId", "videoUrl"]
  }
},
{
  name: "evidence:search_multimodal",
  description: "Search all evidence modalities (text/image/video) using unified CLIP embeddings. Query can be text OR image.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text query OR MinIO image URL" },
      modality: { type: "string", enum: ["text", "image"], description: "Query type" },
      topK: { type: "number", default: 10 }
    },
    required: ["query", "modality"]
  }
}
```

### MCP Tool Handlers

```typescript
case "evidence:analyze_image": {
  const { evidenceId, imageUrl, confidenceThreshold } = args as {
    evidenceId: string;
    imageUrl: string;
    confidenceThreshold?: number;
  };

  // Call FastAPI middleware
  const response = await fetch('http://localhost:8100/vision/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      evidence_id: evidenceId,
      image_url: imageUrl,
      confidence_threshold: confidenceThreshold ?? 0.5
    })
  });

  if (!response.ok) {
    throw new Error(`Vision analysis failed: ${response.statusText}`);
  }

  const data = await response.json();

  // Store embedding in Qdrant
  await qdrant.upsert('multimodal_evidence', {
    points: [{
      id: evidenceId,
      vector: data.embedding,
      payload: {
        evidence_id: evidenceId,
        modality: 'image',
        objects: data.objects.map((obj: any) => ({
          class: obj.class_name,
          confidence: obj.confidence
        })),
        created_at: new Date().toISOString()
      }
    }]
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        evidenceId,
        objectCount: data.objects.length,
        objects: data.objects.slice(0, 10), // Top 10
        embeddingDim: data.embedding.length,
        processingTimeMs: data.processing_time_ms
      })
    }]
  };
}

case "evidence:process_video": {
  const { evidenceId, videoUrl, fps } = args as {
    evidenceId: string;
    videoUrl: string;
    fps?: number;
  };

  // Call FastAPI middleware (async, returns job ID)
  const response = await fetch('http://localhost:8100/video/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      evidence_id: evidenceId,
      video_url: videoUrl,
      fps: fps ?? 1.0
    })
  });

  const data = await response.json();

  // Store frame embeddings in Qdrant (batch)
  const points = data.frames.map((frame: any, i: number) => ({
    id: `${evidenceId}_frame_${i}`,
    vector: frame.embedding,
    payload: {
      evidence_id: evidenceId,
      modality: 'video_frame',
      frame_index: frame.frame_index,
      timestamp: frame.timestamp,
      objects: frame.objects,
      created_at: new Date().toISOString()
    }
  }));

  await qdrant.upsert('multimodal_evidence', { points });

  // Store transcript as text embedding
  if (data.audio_transcript) {
    const { embedTexts } = await import('../lib/server/grpc/embedding-client.js');
    const [transcriptEmbedding] = await embedTexts([data.audio_transcript]);

    await qdrant.upsert('multimodal_evidence', {
      points: [{
        id: `${evidenceId}_transcript`,
        vector: transcriptEmbedding,
        payload: {
          evidence_id: evidenceId,
          modality: 'audio_transcript',
          text: data.audio_transcript,
          created_at: new Date().toISOString()
        }
      }]
    });
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        evidenceId,
        frameCount: data.frames.length,
        duration: data.duration,
        hasTranscript: !!data.audio_transcript,
        transcriptLength: data.audio_transcript?.length ?? 0,
        processingTimeMs: data.processing_time_ms
      })
    }]
  };
}

case "evidence:search_multimodal": {
  const { query, modality, topK } = args as {
    query: string;
    modality: 'text' | 'image';
    topK?: number;
  };

  // Embed query via FastAPI
  const embedResponse = await fetch('http://localhost:8100/multimodal/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modality, content: query })
  });

  const queryEmbedding = await embedResponse.json();

  // Search Qdrant multimodal_evidence collection
  const results = await qdrant.search('multimodal_evidence', {
    vector: queryEmbedding,
    limit: topK ?? 10,
    with_payload: true
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        query,
        modality,
        resultCount: results.length,
        results: results.map(r => ({
          evidenceId: r.payload.evidence_id,
          modality: r.payload.modality,
          score: r.score,
          metadata: r.payload
        }))
      })
    }]
  };
}
```

---

## Phase 3: Agentic Workflow Orchestration

### Autonomous Evidence Processing Agent

**Concept**: When user uploads video, agent autonomously:
1. Detects modality (video)
2. Calls `evidence:process_video` tool
3. Analyzes transcript with `evidence:analyze` (existing text tool)
4. Generates summary combining visual + audio
5. Auto-tags with detected objects + transcript keywords
6. Creates timeline of key events (frame timestamps + transcript alignment)

**Implementation** (`src/lib/server/agents/evidence-processor-agent.ts`):

```typescript
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';

// Define tools as LangChain DynamicStructuredTools
const analyzeImageTool = new DynamicStructuredTool({
  name: "analyze_image",
  description: "Analyze image evidence using YOLO + CLIP",
  schema: z.object({
    evidenceId: z.string(),
    imageUrl: z.string(),
    confidenceThreshold: z.number().optional()
  }),
  func: async ({ evidenceId, imageUrl, confidenceThreshold }) => {
    // Call FastAPI via MCP-like pattern
    const response = await fetch('http://localhost:8100/vision/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evidence_id: evidenceId,
        image_url: imageUrl,
        confidence_threshold: confidenceThreshold ?? 0.5
      })
    });
    return await response.json();
  }
});

const processVideoTool = new DynamicStructuredTool({
  name: "process_video",
  description: "Process video: frames + audio transcription",
  schema: z.object({
    evidenceId: z.string(),
    videoUrl: z.string(),
    fps: z.number().optional()
  }),
  func: async ({ evidenceId, videoUrl, fps }) => {
    const response = await fetch('http://localhost:8100/video/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evidence_id: evidenceId,
        video_url: videoUrl,
        fps: fps ?? 1.0
      })
    });
    return await response.json();
  }
});

// Agent system prompt
const EVIDENCE_AGENT_PROMPT = `You are an autonomous evidence processing agent for a legal case management system.

Your capabilities:
1. Analyze images: YOLO object detection + CLIP embeddings
2. Process videos: Frame extraction (1fps) + YOLO per frame + Whisper audio
3. Transcribe audio: Whisper Large v3 with timestamps
4. Multi-modal search: Unified CLIP embeddings across all evidence

When given evidence to process:
1. Detect modality (image/audio/video)
2. Call appropriate tool
3. Analyze results (objects detected, transcript quality, etc.)
4. Generate structured summary
5. Identify key findings (people, vehicles, timestamps, locations)

Always provide detailed explanations of what you found and why it's relevant.`;

// Create agent
const model = new ChatOllama({
  baseUrl: 'http://localhost:11434',
  model: 'gemma3-legal:latest',
  temperature: 0.3
});

const tools = [analyzeImageTool, processVideoTool];

const agent = await createToolCallingAgent({
  llm: model,
  tools,
  prompt: EVIDENCE_AGENT_PROMPT
});

const executor = new AgentExecutor({
  agent,
  tools,
  verbose: true
});

// Execute autonomous processing
export async function processEvidenceAutonomously(
  evidenceId: string,
  fileUrl: string,
  fileType: string
): Promise<string> {
  const input = `Process this ${fileType} evidence: ${fileUrl} (ID: ${evidenceId})

  Analyze thoroughly and provide:
  1. What objects/people/vehicles were detected?
  2. What was said in the audio (if video/audio)?
  3. Key timestamps and events
  4. Recommended tags for categorization
  5. Potential legal relevance`;

  const result = await executor.invoke({ input });
  return result.output;
}
```

---

## Phase 4: RabbitMQ Async Processing

### Queue Architecture

```typescript
// Queue definitions (add to rabbitmq-manager-fixed.ts)
const MULTIMODAL_QUEUES = {
  'vision.process': { durable: true, maxPriority: 10 },
  'audio.process': { durable: true, maxPriority: 10 },
  'video.process': { durable: true, maxPriority: 10 },
  'multimodal.embed': { durable: true }
};

// Publisher (SvelteKit upload endpoint)
await publishToQueue('video.process', {
  evidenceId: 'ev-123',
  videoUrl: 'evidence/ev-123/dashcam.mp4',
  fps: 1.0,
  priority: 8  // High priority for videos
});

// Consumer (FastAPI worker)
// File: fastapi_multimodal/workers/video_worker.py
import pika
import asyncio
from services.ffmpeg_service import FFmpegService
from services.yolo_service import YOLOService
from services.whisper_service import WhisperService

def callback(ch, method, properties, body):
    data = json.loads(body)
    evidence_id = data['evidenceId']
    video_url = data['videoUrl']
    fps = data.get('fps', 1.0)

    # Process video (async)
    result = asyncio.run(process_video_pipeline(evidence_id, video_url, fps))

    # Publish results back to SvelteKit via Redis pub/sub
    redis_client.publish(f'evidence:{evidence_id}:complete', json.dumps(result))

    ch.basic_ack(delivery_tag=method.delivery_tag)

channel.basic_consume(queue='video.process', on_message_callback=callback)
channel.start_consuming()
```

---

## Deployment Architecture

### Docker Compose (`docker-compose.multimodal.yml`)

```yaml
version: '3.8'

services:
  fastapi-multimodal:
    build: ./deeds_labs/python-middleware/fastapi_multimodal
    ports:
      - "8100:8100"
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - MINIO_ENDPOINT=host.docker.internal:9000
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
    volumes:
      - ./models:/app/models  # Pre-downloaded YOLO/Whisper/CLIP weights
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - rabbitmq
      - minio

  vision-worker:
    build: ./deeds_labs/python-middleware/fastapi_multimodal
    command: python -m workers.vision_worker
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - rabbitmq
      - fastapi-multimodal

  audio-worker:
    build: ./deeds_labs/python-middleware/fastapi_multimodal
    command: python -m workers.audio_worker
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - rabbitmq
      - fastapi-multimodal

  video-worker:
    build: ./deeds_labs/python-middleware/fastapi_multimodal
    command: python -m workers.video_worker
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - rabbitmq
      - fastapi-multimodal
```

---

## Performance Estimates

### GPU Memory (RTX 3060 Ti, 8GB VRAM)

| Model | VRAM | Precision | Notes |
|-------|------|-----------|-------|
| YOLOv8 (medium) | 1.2 GB | FP16 | 640x640 input |
| Whisper Large v3 | 2.9 GB | FP16 | Multi-lingual |
| CLIP ViT-B/32 | 0.6 GB | FP16 | Vision + text towers |
| **Total (all loaded)** | **4.7 GB** | | **59% VRAM, safe** |
| Inference batch (concurrent) | +0.8 GB | | Max 6.5 GB total |

### Processing Times (RTX 3060 Ti)

| Task | Input | Time | Notes |
|------|-------|------|-------|
| YOLO detection | 1920x1080 image | 45ms | 80 classes, FP16 |
| CLIP image embed | 1920x1080 image | 28ms | Resize to 224x224 |
| Whisper transcribe | 60s audio (16kHz) | 8.2s | English, timestamps |
| Video frame extract | 60s video @ 1fps | 2.1s | FFmpeg, 60 frames |
| **Full video pipeline** | **60s dashcam video** | **~95s** | **1fps, YOLO+CLIP per frame** |

### Scalability (RabbitMQ Queue)

- **Serial processing**: 60s video = 95s → ~38 videos/hour per GPU
- **With 3 workers**: 3 GPUs × 38 = ~114 videos/hour
- **Queue depth monitoring**: Alert if pending >50 videos (indicates backlog)

---

## Future Enhancements

1. **Speaker Diarization** (Pyannote): Whisper + speaker labels ("Speaker 1: ...", "Speaker 2: ...")
2. **Video Scene Detection**: Detect scene changes, segment into clips
3. **OCR in Video Frames**: Extract text from dashcam timestamps, license plates
4. **Face Recognition**: CLIP + face embeddings for person tracking across videos
5. **Audio Event Detection**: Gunshots, sirens, glass breaking (AudioSet classifier)
6. **Real-time Processing**: WebRTC stream → live YOLO + transcription
7. **Multi-Camera Sync**: Align timestamps from multiple dashcam angles

---

## Next Steps

1. **Prototype FastAPI Middleware** ⏱️ 2 days
   - Implement vision/audio/video routers
   - YOLOv8 + Whisper + CLIP service wrappers
   - Docker build with CUDA support

2. **Integrate with MCP Server** ⏱️ 1 day
   - Add 3 new tools (analyze_image, process_video, search_multimodal)
   - Wire to FastAPI HTTP calls
   - Store embeddings in Qdrant

3. **Build LangChain Agent** ⏱️ 2 days
   - Autonomous evidence processor
   - Tool calling with gemma3-legal
   - Structured output (JSON summary)

4. **RabbitMQ Workers** ⏱️ 1 day
   - 3 Python workers (vision/audio/video)
   - Queue consumers with Redis result pub/sub
   - Async job status updates

5. **UI Components** ⏱️ 3 days
   - Video player with object overlays
   - Audio waveform with transcript alignment
   - Multi-modal search results UI

**Total Estimate**: ~9 days for MVP

---

**Architecture Version**: 1.0
**Last Updated**: March 1, 2026
**Status**: Design Complete, Ready for Implementation 🚀
