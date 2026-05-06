# Audio-to-Knowledge Pipeline — Consolidated Roadmap

**Created**: April 19, 2026 (consolidated from 2 source files)
**Status**: MOSTLY COMPLETE — Route+pipeline implemented (Sprint 4B), GPU benchmark + persistent server pending
**Hardware**: RTX 3060 Ti (8GB VRAM), whisper.cpp CUDA + FlashAttention + AVX-512

---

## Current State

| Component | Status |
|-----------|--------|
| Model | `ggml-base.bin` (142 MB, multilingual, 99 languages) |
| Build | whisper.cpp compiled with **CUDA + AVX-512 + FlashAttention** |
| Route | `POST /api/whisper/transcribe` — multipart/form-data, env-configurable |
| Execution | Child process spawn (`whisper-cli.exe`), model loaded per request |
| Agent tool | `whisper_transcribe` (tool #25 of 34) |
| Audio queue | RabbitMQ `audio.process` defined, Sprint 4B consumer exists |

---

## Pending Work (Priority Order)

### ~~P0: Route Enhancements~~ ✅ DONE (verified Apr 19, 2026)
- [x] Add `language` param — Zod validated, default 'auto', `VALID_LANGUAGES` set
- [x] Add `translate` boolean — passes `--translate` to whisper.cpp
- [x] Add `timestamps` boolean — returns word-level segments
- [x] Return detected language in response JSON — `language` field in response

### P1: GPU Benchmark (30m)
- [ ] Transcribe 1-min audio with `WHISPER_CUDA=false` (CPU)
- [ ] Transcribe same with `WHISPER_CUDA=true` (GPU)
- [ ] Compare latency (expect ~4-8x speedup on RTX 3060 Ti)
- [ ] Monitor VRAM: base model needs ~500 MB

### P2: Persistent Server Mode (2h)
Current: spawn `whisper-cli.exe` per request (~2-3s cold start).
Fix: Use `whisper-server.exe` (already built in `build/bin/Release/`):
```bash
whisper-server.exe --model models/ggml-base.bin --host 127.0.0.1 --port 8178 --gpu true
```
- [ ] Create `scripts/start-whisper-server.ps1`
- [ ] Add to docker-compose.dev.yml
- [ ] Update route to HTTP POST instead of child process
- [ ] Add health check to `/api/infrastructure/status`

### P3: N-API Native Addon (4h — Future)
Zero process spawn overhead. Pattern: fork from `simd-bridge/cpp/` (existing N-API addon).
Keep model loaded in memory as singleton. Support async worker threads.

### P4: gRPC Wrapper (3h — Future)
Mirror `embedding-client.ts` fallback pattern: gRPC → HTTP → Ollama.
Define `proto/whisper.proto` with `Transcribe` + `TranscribeStream` RPCs.

### P5: Langfuse Observability (1h)
- [x] Add spans to whisper route — `traceLLM()` wraps both server-mode and CLI-mode transcription
- [ ] Track per-language accuracy metrics (DEFERRED — needs production data)

### P6: Model Upgrade Path
| Phase | Model | Size | VRAM with Ollama |
|-------|-------|------|------------------|
| Now | base | 142 MB | ~6.6 GB ✅ |
| Next | small | 466 MB | ~7.1 GB ✅ |
| Prod | medium | 1.5 GB | ~8.2 GB ⚠️ |

---

## Full Pipeline Design (Implementation Pending)

```
Audio Upload (Client)
  → XState v5 audio-upload-machine.ts (states: idle → uploading → transcribing → analyzing → complete)
  → SSE Progress Stream (concurrent UX updates)
  → RabbitMQ audio.process Queue
  → Whisper CUDA (multi-lingual ASR)
  → LangExtract Entity Extraction (names, dates, money, citations)
  → ACE Quality Analysis + Summary
  → Qdrant Embedding + Indexing
  → JSONB Metadata Storage (evidence.metadata.transcription)
  → KAG/DAG Graph Integration
  → SSE Chat Context Available
```

### Implementation Checklist — ✅ ALL DONE (Sprint 4B, verified Apr 19, 2026)
- [x] XState v5 audio upload machine — `AudioUploadWidget.svelte` + state management
- [x] SSE progress endpoint — `api/audio/progress/[id]/+server.ts` (Redis HGETALL polling)
- [x] RabbitMQ `audio.process` consumer — `workers/audio-processor.ts` + `audio-queue-consumer.ts`
- [x] Whisper integration with language detection — `transcribeAudio()` returns language + segments
- [x] LangExtract entity extraction — `extractEntities()` in audio-processor pipeline
- [x] ACE quality analysis — `analyzeWithACE()` generates summary + claims
- [x] Qdrant embedding + indexing — `indexInQdrant()` to evidence_items collection
- [x] JSONB `transcription` field — `updateEvidenceRecord()` writes to evidence.metadata
- [x] Wire whisper → langextract in evidence pipeline — audio-processor stage 2
- [x] Store segments with timestamps — `indexSegments()`, `whisperSegments` Drizzle table
- [x] KAG graph edges — audio evidence wired to Neo4j evidence graph
- [x] Cache routing (Bifrost L2 / Redis L1) — bifrostChat() cascade in SSE chat
- [x] SSE chat context injection — audio transcripts injected via document attachment system

---

## Consolidated From

- `audio-to-knowledge-pipeline.md`
- `2026-04-06_whisper-multilingual-gpu-roadmap.md`