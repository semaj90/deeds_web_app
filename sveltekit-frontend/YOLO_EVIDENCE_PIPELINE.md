# YOLO + Evidence Pipeline — Full Wiring Map & Next Steps

## Last Updated: March 10, 2026

---

## Table of Contents

1. [Evidence Upload Pipeline (8 Stages)](#1-evidence-upload-pipeline-8-stages)
2. [YOLO Stack (3 Layers)](#2-yolo-stack-3-layers)
3. [Vision Analyze Endpoint](#3-vision-analyze-endpoint)
4. [LibTorch / CUDA Graph Pipeline](#4-libtorch--cuda-graph-pipeline)
5. [LangExtract Integration](#5-langextract-integration)
6. [ACE Contextual Engineering](#6-ace-contextual-engineering)
7. [Forensics + Detective Mode](#7-forensics--detective-mode)
8. [RAG / KAG / DAG Integration](#8-rag--kag--dag-integration)
9. [Cache Hierarchy (Full Stack)](#9-cache-hierarchy-full-stack)
10. [Storage: Drizzle ORM Evidence Schema](#10-storage-drizzle-orm-evidence-schema)
11. [Current Wiring Gaps](#11-current-wiring-gaps)
12. [Recommended Next Steps](#12-recommended-next-steps)

---

## 1. Evidence Upload Pipeline (8 Stages)

**File:** `src/routes/api/evidence/upload/+server.ts` (793 lines)

```
User uploads file (image/PDF/video/audio/document)
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Stage 1: MinIO Upload + SHA-256 Hash                │
│   ├── Buffer file, compute SHA-256 digest           │
│   ├── Upload to MinIO bucket (presigned URL)        │
│   ├── Insert evidence record into PostgreSQL        │
│   └── Return evidenceId + fileUrl                   │
├─────────────────────────────────────────────────────┤
│ Stage 2: Text Extraction                            │
│   ├── PDF → Docling (Granite-Docling-258M)          │
│   │     └── Fallback: pdf-parse → Tesseract OCR     │
│   ├── Images → Sharp resize → OCR → VLM (Stage 6b) │
│   ├── DOCX/TXT → direct text extraction             │
│   └── Audio → whisper transcription (stub)          │
├─────────────────────────────────────────────────────┤
│ Stage 3: Legal-Aware Chunking                       │
│   ├── legal-chunker.ts: PART → TITLE → CHAPTER →   │
│   │   ARTICLE → SECTION/§ → SUBDIVISION hierarchy   │
│   ├── Max 512 tokens/chunk, 128 token overlap       │
│   ├── Citation extraction (Cal. Const., U.S.C., §)  │
│   └── sectionPath[] preserves document structure     │
├─────────────────────────────────────────────────────┤
│ Stage 4: Batch Embedding                            │
│   ├── gRPC → embeddinggemma (:50051, GPU)           │
│   │     └── Fallback: QUIC → HTTP batch → HTTP seq  │
│   ├── 768-dim vectors per chunk                     │
│   └── Redis embedding cache (avoid re-embedding)    │
├─────────────────────────────────────────────────────┤
│ Stage 5: Dual Vector Storage                        │
│   ├── pgvector: evidence_vectors table              │
│   │     └── Quick SQL joins with case/user data     │
│   └── Qdrant: evidence_items collection             │
│         └── Hybrid search (dense + sparse)          │
├─────────────────────────────────────────────────────┤
│ Stage 6: Analysis (Parallel, Non-Fatal)             │
│   ├── 6a. Entity Extraction                         │
│   │     └── EMAIL, PHONE, DATE, CITATION, STATUTE,  │
│   │         MONEY, PERSON, ORG, LOCATION             │
│   ├── 6b. Vision Analysis (images only)             │
│   │     └── /api/vision/analyze → YOLO + VLM        │
│   ├── 6c. LangExtract Profile                       │
│   │     └── evidence_type, key_entities, tags,       │
│   │         admissibility_indicators                 │
│   └── 6d. Forensic Pattern Detection                │
│         └── PII (SSN, CC), legal keywords,           │
│             contact density, date clusters           │
├─────────────────────────────────────────────────────┤
│ Stage 7: Summarization + Auto-Tagging               │
│   ├── Ollama gemma3-legal summarization             │
│   ├── ACE auto-tagger (tag-generator.ts)            │
│   └── LangExtract suggested_tags merged             │
├─────────────────────────────────────────────────────┤
│ Stage 8: Persist Analysis to Case                   │
│   ├── evidence.metadata JSONB ← all analysis        │
│   ├── yorha_evidence_nodes ← graph nodes            │
│   ├── analysisJobs.result JSONB ← full job output   │
│   └── Redis cache ← summary for quick retrieval     │
└─────────────────────────────────────────────────────┘
```

---

## 2. YOLO Stack (3 Layers)

### Layer A: TypeScript Wrapper → Python Spawn

**File:** `src/lib/server/yolo.ts` (364 lines)

```
YOLOService.analyzeDocument(imageBuffer, filename)
  │
  ├── Save image to temp file
  ├── Write embedded Python script to temp .py
  ├── spawn('python', [script, imagePath, modelPath, outputPath, conf, iou])
  │     │
  │     ├── Load ONNX model: yolo-doc.onnx (document-specific)
  │     ├── Preprocess: cv2.resize(640x640) → normalize → CHW → batch
  │     ├── ONNX inference: ort.InferenceSession
  │     ├── Post-process: confidence filter → xywh2xyxy → scale → NMS
  │     └── Output JSON: { regions[], objects[] }
  │
  ├── Parse JSON output
  └── Return YOLOResult { text, layout.regions[], objects[], processingTime, method }
```

**Document classes (10):** text, image, table, header, footer, signature, checkbox, form_field, stamp, signature_line

**Status:** Working infrastructure. Preferred doc-layout alias `models/yolo-doc.onnx` is still missing; the live repo currently falls back to restored `models/yolov8n.onnx` for COCO detection.

---

### Layer B: Python Ultralytics Service (Full CUDA)

**File:** `deeds_labs/python-middleware/backend/services/yolo_service.py` (217 lines)

```
YOLOService(model_name='yolov8n.pt', device='cuda')
  │
  ├── initialize()
  │     ├── YOLO(model).to(device)  ← Ultralytics + PyTorch
  │     └── Warmup inference (640x640 black → primes CUDA kernels)
  │
  ├── detect(image_bytes, conf=0.5, iou=0.45, max_det=300)
  │     ├── PIL.Image.open(BytesIO(image_bytes))
  │     ├── model(image, conf, iou, max_det, verbose=False)
  │     └── Return BoundingBox[] sorted by confidence
  │
  └── detect_video_frames(video_path, sample_fps=1.0)
        ├── cv2.VideoCapture → frame extraction at sample_fps
        ├── BGR→RGB conversion
        └── Return [(timestamp, BoundingBox[])] per keyframe
```

**COCO-80 classes:** person, bicycle, car, motorcycle, bus, truck, knife, scissors, cell phone, laptop, book, etc.

**Status:** Complete, needs `yolov8n.pt` (auto-downloads from Ultralytics hub). Currently in `deeds_labs/` (archived), not wired to active pipeline.

**GPU requirements:** ~1.2GB VRAM with CUDA context (fits easily on RTX 3060 Ti 8GB alongside Ollama).

---

### Layer C: C++ TensorRT Native (Fastest Path)

**File:** `deeds_labs/cuda-binaries/cuda_vision/src/yolo_detector.cpp` (84 lines)

```
YOLODetector (pimpl pattern)
  │
  ├── load_model(model_path)
  │     ├── Read .engine file (TensorRT serialized)
  │     ├── nvinfer1::createInferRuntime(logger)
  │     ├── runtime->deserializeCudaEngine(buffer, size)
  │     └── engine->createExecutionContext()
  │
  ├── detect(cv::Mat image)   ← TODO: STUB (returns {})
  │     ├── preprocess_image → cv::resize(640x640) → float32 / 255.0
  │     └── TODO: buffer allocation, enqueue, post-process NMS
  │
  └── cleanup() → destroy context + engine
```

**Status:** Engine loading works, inference NOT implemented. Would need:
1. Input/output buffer allocation (`cudaMalloc`)
2. `context->enqueueV2(buffers, stream, nullptr)`
3. Post-process: confidence filter + NMS (same as Python)
4. Build `.engine` file from `.onnx` via `trtexec`

---

## 3. Vision Analyze Endpoint

**File:** `src/routes/api/vision/analyze/+server.ts` (249 lines)

```
POST /api/vision/analyze { image: Buffer, filename: string }
  │
  ├── SHA-256 hash of image
  ├── Redis cache check (24h TTL)
  │     └── HIT → return cached VisionResult
  │
  ├── MinIO upload (async, non-blocking)
  │
  ├── YOLO Detection (Layer A: yolo.ts)
  │     ├── analyzeDocument(imageBuffer, filename)
  │     └── Returns: regions[] (text, table, signature...) + objects[]
  │
  ├── Gemma3 VLM Multimodal Analysis
  │     ├── System prompt includes YOLO detection context
  │     ├── "You are analyzing evidence for a legal case..."
  │     ├── Image + YOLO boxes → richer VLM understanding
  │     └── Returns: description, entities, sentiment, flags
  │
  ├── Merge YOLO + VLM results
  │
  ├── Redis cache SET (24h TTL)
  │
  └── Return VisionResult {
        yolo: { regions[], objects[], processingTime },
        vlm: { description, entities, flags },
        hash, cached: false
      }
```

**Called by:** Evidence upload pipeline Stage 6b (image evidence only).

---

## 4. LibTorch / CUDA Graph Pipeline

**File:** `src/lib/server/gpu/libtorch-bridge.ts` (~290 lines)

```
LibTorch N-API Bridge (tensorrt_bridge.node addon)
  │
  ├── graphSimilarity(embeddings: Float32Array[], topK: number)
  │     ├── GPU: CUDA similarity matrix computation
  │     └── CPU fallback: inline cosine similarity
  │
  ├── clusterEmbeddings(embeddings: Float32Array[], k: number)
  │     ├── GPU: CUDA k-means clustering
  │     └── CPU fallback: simple k-means in JS
  │
  └── computeCaseEmbedding(embeddings: Float32Array[], weights: number[])
        ├── GPU: weighted aggregation (evidence → case embedding)
        └── CPU fallback: weighted mean
```

**This is SEPARATE from YOLO.** LibTorch handles:
- Evidence relationship graph analysis (similarity matrices)
- Case embedding aggregation (all evidence → single case vector)
- Cluster analysis for topic modeling

**CUDA libraries used:** cuDNN (convolution), cuBLAS (matrix ops), LibTorch (autograd + tensor ops)

**API route:** `/api/gpu/compute` → exposes graphSimilarity, clusterEmbeddings, computeCaseEmbedding

---

## 5. LangExtract Integration

**File:** `src/lib/server/services/langextract-service.ts` (383 lines)

```
LangExtract Service (HTTP client)
  │
  ├── URL Resolution:
  │     ├── LANGEXTRACT_URL env var
  │     ├── localhost:8095 (Python, Docker: phase66-langextract)
  │     └── localhost:8090 (Go microservice fallback)
  │
  ├── extractSectionsFromText(text, docId, docType)
  │     ├── POST /extract → { sections[], metadata, confidence }
  │     ├── Section types (11):
  │     │   facts, issues, reasoning, holding, citations,
  │     │   parties, motions, bibliography, procedural_history,
  │     │   sentencing, judgment
  │     └── Fallback: detectSectionsHeuristic() (regex-based)
  │
  ├── extractEvidenceProfile(text, evidenceType)
  │     ├── POST /extract → evidence-specific extraction
  │     └── Returns: type_classification, key_entities,
  │         legal_relevance, admissibility_indicators, suggested_tags
  │
  └── extractSectionsBatch(docs[], concurrency=3)
        └── Parallel extraction with per-doc fallback
```

**Called at 3 points:**
1. **Evidence upload** (Stage 6c) → `extractEvidenceProfile()` for auto-tagging
2. **POI photos** → OCR text extraction from images
3. **Web crawl** → Section extraction from crawled HTML

**Go langextract** (`go-microservice/langextract/main.go`):
- Bigram word analysis + next-word prediction (HMM model)
- `/analyze` → word frequency + bigram storage
- `/predict` → next-word prediction from bigram model
- In-memory or Redis-backed bigram store

---

## 6. ACE Contextual Engineering

**Files:**
- `src/lib/server/ace/self-prompt.ts` (138 lines) — Self-evaluation + retry
- `src/lib/server/ace/context-assembler.ts` — Context assembly
- `src/lib/server/ace/auto-tagger.ts` — Evidence auto-tagging
- `src/lib/server/ace/tag-generator.ts` — Query tag generation
- `src/lib/server/ace/style-adapter.ts` — Response style adaptation
- `src/lib/server/ace/practice-templates.ts` — Legal domain templates
- `src/lib/server/ace/types.ts` (108 lines) — Type definitions

```
ACE Pipeline (per query)
  │
  ├── Context Assembly (context-assembler.ts)
  │     ├── User profile (role, preferences)
  │     ├── Case context (PostgreSQL)
  │     ├── RAG chunks (Qdrant × 3 collections)
  │     ├── KAG graph neighbors (Neo4j)
  │     ├── Chat history (conversation context)
  │     ├── Entities (extracted from evidence)
  │     ├── Evidence metadata (forensicFlags, summary)
  │     ├── Emotion context (GoEmotions + Ekman)
  │     └── Token budget: 1900 total across 9 sources
  │
  ├── LLM Generation (Ollama gemma3-legal)
  │     └── System prompt = assembled ACE context
  │
  ├── Self-Evaluation (self-prompt.ts)
  │     ├── evaluateResponse(query, response, context)
  │     ├── Scores: quality, completeness, accuracy (0.0-1.0)
  │     └── shouldRetry = quality < 0.6
  │
  ├── Correction (max 1 retry)
  │     ├── generateCorrectionPrompt(eval, query, response)
  │     ├── Top 3 suggestions injected
  │     └── Re-generate with correction context
  │
  └── Auto-Tag (auto-tagger.ts)
        ├── Tags from LLM analysis
        ├── Tags from LangExtract profile
        └── Tags from forensic flags
```

---

## 7. Forensics + Detective Mode

### Forensic Detection

**File:** `src/lib/server/analysis/forensics.ts`

```
detectForensicPatterns(text) → ForensicFlag[]
  │
  ├── PII Detection
  │     ├── SSN: \d{3}-\d{2}-\d{4}          → HIGH severity
  │     ├── Credit Card: 13-19 digits + Luhn → HIGH severity
  │     └── Banking: routing/account keywords → MEDIUM severity
  │
  ├── Contact Density
  │     ├── >5 emails → MEDIUM severity
  │     └── >3 phone numbers → MEDIUM severity
  │
  ├── Date Clusters
  │     └── >5 date patterns → LOW severity
  │
  └── Legal Keywords (33 patterns)
        ├── HIGH: non-compete, arbitration, indemnification,
        │   attorney-client, settlement, indictment, subpoena, warrant
        └── LOW: deposition, testimony, plaintiff, defendant
```

### Detective Mode UI

```
Detective Evidence Pipeline
  │
  ├── Evidence Upload → All 8 stages above
  │
  ├── Graph Analysis (LibTorch GPU)
  │     ├── graphSimilarity() → evidence relationship scores
  │     ├── clusterEmbeddings() → topic clusters
  │     └── Stored in evidenceRelationships table
  │
  ├── Relationship Types (18 enums):
  │     supports, contradicts, same_person, timeline,
  │     chain_of_custody, corroborates, alibi, motive,
  │     opportunity, means, witness_statement, physical_evidence,
  │     digital_evidence, circumstantial, direct_evidence,
  │     hearsay, privileged, inadmissible
  │
  └── UI Components
        ├── ContextualDetectiveBoard.svelte — Main interface
        ├── DetectiveEvidenceMap.svelte — Relationship graph viz
        ├── YoRHaDetectiveCommandCenter.svelte — Command center
        ├── evidence-canvas (WebGPU force layout + highlighting)
        └── XState detective-mode machine — State orchestration
```

---

## 8. RAG / KAG / DAG Integration

**File:** `src/lib/sdk/index.ts` (122 lines) — ALL TypeScript

```
UnifiedAIClient.hybridAugment(query, caseId)
  │
  ├── RAG (Retrieval-Augmented Generation)
  │     ├── RAGClient → Qdrant vector search
  │     ├── Collections: evidence_items, legal_documents, legal_cases
  │     ├── Hybrid: dense (768-dim cosine) + sparse (BM25)
  │     └── Returns: ranked chunks with scores
  │
  ├── KAG (Knowledge-Augmented Generation)
  │     ├── KAGClient → Neo4j graph traversal
  │     ├── Evidence → Entity → Statute → Precedent paths
  │     ├── Schema validation, W3C spec checks
  │     └── Returns: graph neighbors with relationship types
  │
  └── DAG (Directed Acyclic Graph)
        ├── DAGClient → PostgreSQL / Drizzle
        ├── Dependency ordering for fix priority
        ├── Cluster-aware task scheduling
        └── Returns: ordered task/analysis queue
```

**YOLO feeds into RAG/KAG/DAG through:**
1. YOLO detections → embedded as evidence chunk metadata → Qdrant `evidence_items`
2. Detected objects (person, vehicle, weapon) → entity extraction → Neo4j nodes
3. Forensic flags → priority scoring in DAG task queue

---

## 9. Cache Hierarchy (Full Stack)

```
L0:  LokiJS (client, in-memory, 5-10min)      ← Browser session
L0.5: Glyph Cache (server, Map, 2-10min)       ← Binary compressed prompt fragments
L1:  IndexedDB (client, persistent, 7-day)     ← Survives refresh
L2:  Memory Map (server, 5min TTL)             ← In-process Map
L3:  Redis (server, configurable TTL)          ← Cross-request
     ├── Embedding cache (avoid re-embedding)
     ├── Vision analysis cache (24h TTL)
     ├── ACE evaluation cache (1h TTL)
     ├── LangExtract results
     └── YOLO detection results
L4:  Qdrant llm_response_cache (0.85 sim)      ← Semantic dedup
L5:  PostgreSQL JSONB (permanent)               ← evidence.metadata, analysisJobs.result
L6:  MinIO object storage (permanent)           ← Original files
```

**Excessive caching philosophy:** Run inference ONCE, cache at EVERY tier. A second query for the same evidence hits L3 Redis in <1ms instead of re-running YOLO (200ms) + VLM (2000ms) + embedding (50ms).

---

## 10. Storage: Drizzle ORM Evidence Schema

### Core Evidence Table

**File:** `src/lib/server/db/schema-postgres.ts` (lines 255-284)

```sql
evidence {
  id             UUID PRIMARY KEY
  caseId         UUID → cases.id
  userId         UUID → users.id
  title          VARCHAR(255) NOT NULL
  description    TEXT
  filePath       VARCHAR(500)        -- MinIO path
  fileType       VARCHAR(100)        -- MIME type
  fileSize       INTEGER             -- bytes
  hash           VARCHAR(255)        -- SHA-256
  source         VARCHAR(255)
  dateObtained   TIMESTAMPTZ
  chainOfCustody JSONB               -- custody chain audit trail
  metadata       JSONB               -- ← ALL analysis results stored here
  evidenceType   ENUM(16 types)      -- document|photo|video|audio|...
  fileName       VARCHAR(255)
  fileUrl        TEXT                 -- MinIO presigned URL
  canvasPosition JSONB               -- detective board coordinates
  uploadedBy     UUID
  uploadedAt     TIMESTAMP
  createdAt      TIMESTAMPTZ
  updatedAt      TIMESTAMPTZ
}
```

### evidence.metadata JSONB Structure (populated by pipeline)

```jsonc
{
  // From Stage 2: Text extraction
  "extractedText": "...",
  "ocrConfidence": 0.92,
  "pageCount": 14,

  // From Stage 3: Chunking
  "chunkCount": 28,
  "sectionPaths": ["Article I / Section 2", ...],

  // From Stage 6a: Entity extraction
  "entities": {
    "PERSON": ["John Smith", "Jane Doe"],
    "DATE": ["2024-03-15"],
    "STATUTE": ["Cal. Civ. Code § 1234"],
    "MONEY": ["$50,000"]
  },

  // From Stage 6b: Vision analysis (images only)
  "yolo": {
    "regions": [{ "type": "signature", "bbox": [...], "confidence": 0.94 }],
    "objects": [{ "class": "person", "bbox": [...], "confidence": 0.87 }]
  },
  "vlm": {
    "description": "Document shows a signed contract with...",
    "flags": ["signature_present", "notarized"]
  },

  // From Stage 6c: LangExtract profile
  "langextract": {
    "evidence_type_classification": "documentary",
    "key_entities": [...],
    "admissibility_indicators": ["authenticated", "business_record"],
    "suggested_tags": ["contract", "employment", "non-compete"]
  },

  // From Stage 6d: Forensic flags
  "forensicFlags": [
    { "type": "LEGAL_KEYWORD", "description": "non-compete clause", "severity": "medium" }
  ],

  // From Stage 7: Summary + tags
  "summary": "Employment contract between Smith and Acme Corp...",
  "tags": ["contract", "employment", "non-compete", "signed"],

  // From ACE evaluation
  "aceEval": { "quality": 0.82, "completeness": 0.78 }
}
```

### Related Tables

| Table | Purpose | Relationship |
|-------|---------|-------------|
| `evidenceVectors` | pgvector embeddings per chunk | evidenceId → evidence.id |
| `evidenceRelationships` | Graph edges (18 relationship types) | sourceId/targetId → evidence.id |
| `analysisJobs` | Pipeline job tracking (status, result JSONB) | evidenceId → evidence.id |
| `yorha_evidence_nodes` | Graph nodes for section-level evidence | evidenceId → evidence.id |
| `caseNoteStatuteLinks` | Evidence → statute connections | caseNoteId → cases |
| `poiPhotos` | POI photo metadata + face embeddings | personId → criminals.id |

### Qdrant Mirroring

Every evidence chunk exists in BOTH storage tiers:

```
pgvector (evidence_vectors)     Qdrant (evidence_items)
  ├── SQL joins with cases       ├── Fast vector similarity search
  ├── Drizzle ORM queries        ├── Hybrid dense + sparse
  ├── Backup / migrations        ├── Filtering by metadata
  └── Quick lookups by ID        └── Cross-collection search
```

---

## 11. Current Wiring Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **Preferred doc-layout model missing** | HIGH | `models/yolo-doc.onnx` is still not present; Layer A currently falls back to restored `models/yolov8n.onnx` (COCO) instead of document-layout detection |
| **Python YOLO not wired** | MEDIUM | `yolo_service.py` is in `deeds_labs/` (archived), not called by active pipeline |
| **C++ TensorRT stub** | LOW | `detect()` returns `{}` — inference not implemented |
| **Video evidence** | MEDIUM | Upload pipeline handles images via `/api/vision/analyze` but no video frame extraction |
| **YOLO → RAG indexing** | MEDIUM | YOLO detections stored in metadata JSONB but NOT indexed as separate Qdrant points |
| **YOLO → Neo4j entities** | LOW | Detected objects (person, vehicle) not pushed to KAG graph as entity nodes |
| **RabbitMQ YOLO queue** | LOW | No dedicated queue for async YOLO processing — runs synchronously in upload |
| **Image enhancement** | MEDIUM | Sharp resize exists but no adaptive enhancement (contrast, denoising) before OCR/YOLO |
| **Docling ↔ LangExtract** | LOW | Both extract text; results not cross-validated or merged |

---

## 12. Recommended Next Steps

### Priority 1: Wire Python YOLO Service (HIGH IMPACT)

**Why:** The Python `yolo_service.py` has full Ultralytics + CUDA support with COCO-80 classes — far more capable than the document-only ONNX model in Layer A. It can detect persons, vehicles, weapons, phones, etc. in evidence photos.

**Action:**
1. Move `yolo_service.py` from `deeds_labs/` to `sveltekit-frontend/scripts/yolo-server.py`
2. Add FastAPI wrapper (3 endpoints: `/detect`, `/detect-video`, `/health`)
3. Add to `docker-compose.yml` as `yolo-service` container (port 8096)
4. Update `src/lib/server/yolo.ts` to call the FastAPI service instead of spawning embedded Python
5. Wire video evidence: `/api/evidence/upload` → detect video MIME → call `detect_video_frames()`

**VRAM budget:** YOLOv8n = ~1.2GB. With Ollama gemma3-legal (7.3GB) loaded, total ≈ 8.5GB → tight fit on 8GB RTX 3060 Ti. Use `yolov8n` (nano) or swap to CPU when Ollama is active.

### Priority 2: YOLO Detections → RAG/KAG Index (HIGH IMPACT)

**Why:** YOLO detections are currently stored in `evidence.metadata` JSONB but NOT searchable via RAG. A query like "show me evidence with weapons" can't find YOLO-detected knives/guns.

**Action:**
1. After YOLO detection, create Qdrant points in `evidence_items` with payload:
   ```json
   { "type": "yolo_detection", "class": "knife", "confidence": 0.91,
     "bbox": [x1,y1,x2,y2], "evidenceId": "...", "caseId": "..." }
   ```
2. Embed detection descriptions: `"knife detected in evidence photo with 91% confidence at coordinates [...]"`
3. Push detected entities (PERSON, VEHICLE) to Neo4j as KAG nodes linked to evidence
4. Add to DAG task queue for detective mode relationship analysis

### Priority 3: Image Enhancement Pipeline (MEDIUM IMPACT)

**Why:** OCR accuracy and YOLO confidence both improve significantly with pre-processed images. Low-quality evidence photos (phone cameras, scans, faxes) need enhancement.

**Action:**
1. In `src/routes/api/vision/analyze/+server.ts`, add pre-processing before YOLO:
   ```
   Sharp pipeline: auto-orient → resize (max 2048px) → sharpen → normalize contrast → denoise
   ```
2. For Docling/OCR: binarize (Otsu threshold) + deskew before text extraction
3. Cache both original and enhanced versions in MinIO (separate keys)
4. Store enhancement metadata in `evidence.metadata.imageEnhancement`

### Priority 4: RabbitMQ Async YOLO Queue (MEDIUM IMPACT)

**Why:** YOLO + VLM analysis takes 2-5 seconds. Running synchronously in the upload endpoint blocks the response. Users should get instant upload confirmation with async analysis.

**Action:**
1. Add `yolo.analyze` queue to RabbitMQ (8th queue)
2. Evidence upload returns immediately after Stage 1 (MinIO + DB record)
3. Stages 2-8 run as RabbitMQ consumer job
4. WebSocket push to client when analysis completes (DetectiveWebSocketManager)
5. Frontend shows "analyzing..." spinner → auto-refreshes with results

### Priority 5: ACE Integration with YOLO Context (MEDIUM IMPACT)

**Why:** ACE context assembly doesn't include YOLO detection results. When a user asks about evidence, the LLM doesn't know what objects/layout were detected.

**Action:**
1. In `context-assembler.ts`, add YOLO context from `evidence.metadata.yolo`:
   ```typescript
   // Token budget: allocate 100 tokens for YOLO context
   if (evidenceMetadata?.yolo) {
     aceContext.yoloDetections = formatYOLOForPrompt(evidenceMetadata.yolo);
   }
   ```
2. Format: "Evidence contains: 2 signatures (94%, 87%), 1 table (91%), 3 text regions"
3. Include in system prompt so LLM can reference specific detections
4. ACE self-eval can validate LLM response mentions detected objects

### Priority 6: C++ TensorRT Implementation (LOW PRIORITY)

**Why:** Only worth implementing if Python YOLO becomes a latency bottleneck. TensorRT C++ is ~3-5x faster than PyTorch but requires `.engine` file compilation per GPU architecture.

**Action (deferred):**
1. Export YOLOv8n to ONNX: `yolo export model=yolov8n.pt format=onnx`
2. Build TensorRT engine: `trtexec --onnx=yolov8n.onnx --saveEngine=yolov8n.engine --fp16`
3. Implement `detect()` in `yolo_detector.cpp`:
   - Allocate CUDA input/output buffers
   - `context->enqueueV2(buffers, stream, nullptr)`
   - Post-process: confidence filter + NMS
4. Expose via N-API addon (same pattern as `libtorch-bridge.ts`)

### Priority 7: Evidence Summary Dashboard Enhancements (LOW PRIORITY)

**Why:** All analysis data is stored in `evidence.metadata` JSONB but the frontend evidence pages don't fully surface it.

**Action:**
1. Evidence detail page: show YOLO detection overlay on uploaded images
2. Case summary: aggregate all evidence YOLO detections per case
3. Detective board: use YOLO object classes as node types in relationship graph
4. Timeline view: video evidence keyframes with detection thumbnails

---

## Architecture Diagram: Full Evidence Flow

```
                           ┌─────────────┐
                           │  User Upload │
                           └──────┬──────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  /api/evidence/upload       │
                    │  (8-stage pipeline)         │
                    └──┬──┬──┬──┬──┬──┬──┬──┬───┘
                       │  │  │  │  │  │  │  │
  ┌────────────────────┘  │  │  │  │  │  │  └────────────────┐
  │                       │  │  │  │  │  │                   │
  ▼                       ▼  │  ▼  │  ▼  │                   ▼
MinIO                  Docling │ Legal │ gRPC              PostgreSQL
(object store)         (OCR)   │Chunker│ Embedding         (evidence table)
                               │       │                   (metadata JSONB)
                               ▼       ▼
                          /api/vision  Qdrant + pgvector
                          /analyze     (dual storage)
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                    ▼          ▼          ▼
               YOLO         VLM      LangExtract
            (detection)  (Gemma3)   (sections)
                    │          │          │
                    └──────────┼──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   ACE Context       │
                    │   Assembly          │
                    │  (9 sources)        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Ollama LLM         │
                    │  gemma3-legal       │
                    │  (summary + eval)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Detective Mode     │
                    │  (graph + forensics │
                    │   + WebSocket)      │
                    └─────────────────────┘
```

---

## GPU VRAM Budget (RTX 3060 Ti — 8192 MiB)

| Model | VRAM | When Loaded |
|-------|------|-------------|
| gemma3-legal (Q4_K_M) | ~7.3 GB | Always (primary LLM) |
| embeddinggemma (BF16) | ~622 MB | Always (embedding) |
| **Total baseline** | **~7.9 GB** | **Near capacity** |
| YOLOv8n (PyTorch) | ~1.2 GB | On-demand (conflicts with above) |
| TensorRT YOLO engine | ~200 MB | On-demand (much lighter) |

**Strategy:** Use TensorRT `.engine` path when possible (200MB vs 1.2GB). Or offload YOLO to CPU (still fast for nano model: ~50ms/image on i5). GPU arbiter (`gpu-arbiter.ts`) should manage VRAM contention.
