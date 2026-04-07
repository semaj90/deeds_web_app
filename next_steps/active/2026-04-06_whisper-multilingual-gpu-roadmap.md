# Whisper Multilingual + GPU Acceleration Roadmap

> Created: April 6, 2026 | Status: Active
> Hardware: RTX 3060 Ti (8GB VRAM) | CUDA 13.0 | MSVC 19.42 | AVX-512

---

## Current State (April 6, 2026)

| Component | Status |
|-----------|--------|
| Model | `ggml-base.bin` (142 MB, **multilingual**, 99 languages) |
| Build | whisper.cpp compiled with **CUDA + AVX-512 + FlashAttention** |
| DLLs | `ggml-cuda.dll` (18.8 MB), `ggml-cpu.dll`, `ggml-base.dll` |
| Route | `POST /api/whisper/transcribe` — multipart/form-data, env-configurable |
| Execution | Child process spawn (`whisper-cli.exe`), model loaded per request |
| CUDA | `withCuda: true` (default), fallback env `WHISPER_CUDA=false` |
| Agent tool | `whisper_transcribe` (tool #25 of 32) |

---

## P0: Multilingual Legal Transcription

### Why Multilingual Matters for Legal AI
- Court proceedings in bilingual jurisdictions (Spanish/English, French/English)
- International law documents, treaties, depositions
- Immigration cases — witness testimony in native language
- Multilingual evidence recordings (wiretaps, surveillance)
- Code-switching in informal recordings

### Supported Languages (base model, 99 total)
**Priority for Legal AI:**
| Tier | Languages | Use Case |
|------|-----------|----------|
| T1 | English, Spanish, French, Portuguese, German | US/EU/LATAM courts |
| T2 | Arabic, Mandarin, Japanese, Korean, Hindi | International law |
| T3 | Russian, Turkish, Italian, Dutch, Polish | Extradition/Interpol |
| T4 | All remaining 86 languages | Immigration/asylum cases |

### Language Detection
- `base` model auto-detects language (first 30s of audio)
- Route should return detected language in response: `{ ok: true, text: "...", language: "es", duration: 2.3 }`
- Consider `--language auto` flag for explicit auto-detection mode
- Add `language` parameter to route for forced language mode

### TODO: Route Enhancements
```typescript
// Add to route schema:
language?: string;        // Force language ('en', 'es', 'fr', etc.) or 'auto'
translate?: boolean;      // Translate to English (whisper built-in)
timestamps?: boolean;     // Include word-level timestamps
```

---

## P1: GPU Acceleration (DONE — verify)

### Current Build (CUDA + FlashAttention)
```
cmake .. -G "Visual Studio 17 2022" \
  -DGGML_CUDA=ON \
  -DGGML_CUDA_FA=ON \
  -DCMAKE_BUILD_TYPE=Release
```

### Benchmark TODO
- [ ] Transcribe 1-min audio file on CPU-only (set `WHISPER_CUDA=false`)
- [ ] Transcribe same file with CUDA (`WHISPER_CUDA=true`)
- [ ] Compare latency: expect ~4-8x speedup on RTX 3060 Ti
- [ ] Monitor VRAM usage (`nvidia-smi`) — base model needs ~500 MB VRAM

### Ollama CUDA Optimizations (already active)
Ollama natively uses CUDA for all models. Current Ollama GPU config:
- `gemma4:e4b-it-q4_K_M` — 9.6 GB (vision, Q4_K_M quantized)
- `embeddinggemma:latest` — 621 MB (embedding model)
- VRAM budget: 8 GB total, ~6.5 GB for Ollama + ~0.5 GB for Whisper

### VRAM Coexistence Strategy
| Service | VRAM | Priority |
|---------|------|----------|
| Ollama (gemma4) | ~5.5 GB | P0 — always loaded |
| Ollama (embeddinggemma) | ~0.6 GB | P0 — always loaded |
| Whisper CUDA | ~0.5 GB | P1 — load on demand |
| **Total** | ~6.6 GB | Fits in 8 GB RTX 3060 Ti |

---

## P2: Persistent Server Mode (whisper-server.exe)

### Problem
Current: each transcription spawns `whisper-cli.exe` → loads 142 MB model → transcribes → exits.
Cold start: ~2-3s model load + inference time.

### Solution
`whisper-server.exe` is already built in `build/bin/Release/`. It's a persistent HTTP server:

```bash
# Start server (keeps model in memory)
whisper-server.exe \
  --model models/ggml-base.bin \
  --host 127.0.0.1 \
  --port 8178 \
  --gpu true

# Client sends audio via HTTP POST
curl -X POST http://127.0.0.1:8178/inference \
  -F "file=@audio.wav" \
  -F "response_format=json"
```

### TODO
- [ ] Create `scripts/start-whisper-server.ps1` — launches `whisper-server.exe` with correct model path
- [ ] Add to `docker-compose.dev.yml` as a service
- [ ] Update route to use HTTP POST to whisper-server instead of child process spawn
- [ ] Add health check endpoint to `/api/infrastructure/status`
- [ ] Benchmark: persistent server vs child process spawn latency

---

## P3: N-API Native Addon (Future)

### Current: Child Process Spawn
```
Node.js → child_process.exec('whisper-cli.exe ...') → stdout → parse
```
Overhead: ~50-100ms process spawn + stdio buffering per request.

### Alternative: N-API C++ Addon
```
Node.js → napi_call('whisper_transcribe', audioBuffer) → result object
```
Benefits:
- Zero process spawn overhead
- Direct memory sharing (no temp files)
- Streaming results possible
- Type-safe return (not stdout parsing)

### Implementation Sketch
```cpp
// whisper-napi.cpp
#include <napi.h>
#include "whisper.h"

Napi::Value Transcribe(const Napi::CallbackInfo& info) {
  auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
  auto model_path = info[1].As<Napi::String>().Utf8Value();

  struct whisper_context* ctx = whisper_init_from_file(model_path.c_str());
  // ... run inference on buffer data ...
  // ... return { text, language, segments[] } ...
  whisper_free(ctx);
}
```

### Existing Pattern
The codebase already has a C++ N-API addon in `simd-bridge/cpp/`:
- `simd_addon.cpp` — LibTorch/CUDA N-API module
- `CMakeLists.txt` — builds `simd_bridge.node`
- Pattern: `const addon = require('./build/Release/simd_bridge.node')`

### TODO
- [ ] Fork whisper N-API pattern from `simd-bridge/cpp/`
- [ ] Keep model loaded in memory (singleton context)
- [ ] Support async worker threads (non-blocking)
- [ ] GPU memory pool sharing with Ollama

---

## P4: gRPC Wrapper (Production)

### Existing gRPC Pattern
`src/lib/server/grpc/embedding-client.ts` already implements gRPC embedding with HTTP/Ollama fallback:
```
gRPC primary → HTTP fallback → Ollama final fallback
```

### Whisper gRPC Service
```protobuf
// proto/whisper.proto
service WhisperService {
  rpc Transcribe (TranscribeRequest) returns (TranscribeResponse);
  rpc TranscribeStream (TranscribeRequest) returns (stream TranscribeChunk);
}

message TranscribeRequest {
  bytes audio = 1;
  string language = 2;         // 'auto', 'en', 'es', etc.
  bool translate = 3;          // translate to English
  bool timestamps = 4;         // word-level timestamps
  string model = 5;            // 'base', 'small', 'medium'
}

message TranscribeResponse {
  string text = 1;
  string detected_language = 2;
  float duration_seconds = 3;
  repeated Segment segments = 4;
}

message Segment {
  string text = 1;
  float start = 2;
  float end = 3;
}
```

### TODO
- [ ] Define `proto/whisper.proto`
- [ ] Implement gRPC server wrapping `whisper-server.exe` or N-API addon
- [ ] Add to `embedding-client.ts` fallback chain pattern
- [ ] Regenerate protobuf types (`pbjs` + `pbts`)

---

## P5: Langfuse Observability

### What to Trace
| Event | Langfuse Span | Metadata |
|-------|--------------|----------|
| Transcription start | `whisper.transcribe` | model, language, file_size, cuda |
| Language detection | `whisper.detect_language` | detected_lang, confidence |
| Transcription complete | `whisper.complete` | duration_ms, text_length, segments |
| Pipeline handoff | `evidence.transcribe → embed` | evidence_id, chunk_count |

### Integration Point
```typescript
// In whisper route:
import { langfuse } from '$lib/server/langfuse';

const trace = langfuse.trace({ name: 'whisper-transcribe', metadata: { model, cuda: useCuda } });
const span = trace.span({ name: 'transcription', input: { fileSize, mimeType, language } });
// ... transcribe ...
span.end({ output: { text, detectedLanguage, durationMs } });
```

### TODO
- [ ] Add Langfuse spans to whisper route
- [ ] Track per-language accuracy metrics
- [ ] Dashboard: transcription latency by model size and CUDA vs CPU
- [ ] Alert on failed transcriptions (model missing, CUDA OOM)

---

## P6: Model Upgrade Path

### Recommended Progression
| Phase | Model | Size | Languages | Use Case |
|-------|-------|------|-----------|----------|
| Now | `base` | 142 MB | 99 | Dev/prototype, fast |
| Next | `small` | 466 MB | 99 | Better accuracy, still fast on GPU |
| Prod | `medium` | 1.5 GB | 99 | Best multilingual accuracy for legal |
| Max | `large-v3-turbo` | 1.5 GB | 99 | Highest accuracy, Turbo speed |

### VRAM Impact
| Model + Ollama | VRAM Total | Fits 8 GB? |
|----------------|-----------|------------|
| base + gemma4 | ~6.6 GB | ✅ Yes |
| small + gemma4 | ~7.1 GB | ✅ Tight |
| medium + gemma4 | ~8.2 GB | ⚠️ Borderline |
| large-v3-turbo + gemma4 | ~8.2 GB | ⚠️ Borderline |

### Download Commands
```bash
# From sveltekit-frontend/:
npx nodejs-whisper download    # interactive prompt
# Or manually:
cd node_modules/nodejs-whisper/cpp/whisper.cpp/models
./download-ggml-model.cmd small
./download-ggml-model.cmd medium
./download-ggml-model.cmd large-v3-turbo
```

---

## P7: JSONB Schema Inference (Evidence Pipeline Integration)

### Flow
```
Audio Upload → Whisper Transcribe → Entity Extract → JSONB Store
                    ↓
            language detection
                    ↓
        langextract_{language} schema
                    ↓
        PostgreSQL JSONB (evidence_metadata)
```

### Schema
```sql
-- In evidence table metadata JSONB:
{
  "transcription": {
    "text": "...",
    "language": "es",
    "model": "base",
    "cuda": true,
    "duration_ms": 2340,
    "segments": [
      { "start": 0.0, "end": 2.5, "text": "..." },
      { "start": 2.5, "end": 5.1, "text": "..." }
    ],
    "entities": {
      "persons": ["John Doe", "Jane Smith"],
      "dates": ["2026-01-15"],
      "money": ["$50,000"],
      "statutes": ["18 U.S.C. § 1341"]
    }
  }
}
```

### TODO
- [ ] Add `transcription` field to evidence metadata JSONB schema
- [ ] Wire whisper → langextract_legal entity extraction in evidence pipeline stage 2
- [ ] Store segments with timestamps for audio scrubbing UI
- [ ] Index transcription text in Qdrant for semantic search over audio evidence

---

## Summary: Priority Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| ✅ DONE | CUDA build + route update | — | 4-8x faster transcription |
| ✅ DONE | Multilingual model (base, 99 langs) | — | International legal support |
| P0 | Language param + auto-detect response | 1h | Client knows source language |
| P1 | Benchmark CUDA vs CPU | 30m | Verify GPU acceleration |
| P2 | Persistent whisper-server.exe | 2h | Eliminate cold start |
| P3 | N-API addon (simd-bridge pattern) | 4h | Zero spawn overhead |
| P4 | gRPC service (embedding-client pattern) | 3h | Production transport |
| P5 | Langfuse tracing | 1h | Observability |
| P6 | Upgrade to small/medium model | 30m | Better accuracy |
| P7 | JSONB evidence integration | 2h | Searchable audio evidence |
