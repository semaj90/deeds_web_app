# Phase 14: Legal AI System Frontend & Backend Integration Todo

## 🧠 Backend: Go SIMD + cuBLAS Batch Embed Pipeline

- [ ] Scaffold `batch_embed.go`:
  - Accepts `{ docId, chunks: [text, ...] }` via POST `/batch-embed`
  - Parses JSON with `simdjson-go`
  - (Optional) Batch calls Ollama (gemma3-legal) for embeddings
  - Computes embeddings (simulate or use cuBLAS)
  - Stores results in Redis (`embedding:<docId>`)
  - Returns `{ docId, embeddings: [...] }`

## 🎨 Frontend: SvelteKit UI with Melt UI, Bits UI, XState

- [ ] Build modular SvelteKit UI:
  - FileUploader: PDF upload, triggers backend
  - ProcessingStatus: Real-time status via WebSocket
  - ResultsDisplay: Shows summary, embeddings, tags
- [ ] Integrate XState for upload/processing/result state management
- [ ] Use Melt UI for headless logic, Bits UI for styling
- [ ] Add WebSocket client for backend status updates
- [ ] Add AI modal shell (`ollama-agent-shell.svelte`):
  - Terminal-style assistant for self-prompting
  - Streams Claude/Ollama output
  - Inline markdown editing and feedback
- [ ] Add WebGPU canvas (`webgpu-viewer.svelte`):
  - Renders embeddings as 2D/3D nodes
  - Responds to docId focus/hover
- [ ] Add intent prediction (`xstate/prefetchMachine.ts`):
  - Uses IntersectionObserver for UI focus
  - Prefetches topK embeddings with Loki.js + Fuse.js

## 🔁 End-to-End Pipeline

- [ ] PDF upload → BullMQ job → Go processing → Redis/WebSocket update → UI
- [ ] Test /api/ai/self-prompt handler for Claude/Ollama summarization
- [ ] Validate batch embedding and result display

## 🛠️ Setup & Optimization

- [ ] Install Go, CUDA Toolkit, cuBLAS on Windows
- [ ] Set up Redis, PostgreSQL, Ollama locally
- [ ] Add all required npm packages:
  - `xstate`, `@xstate/svelte`, `melt-ui`, `@melt-ui/svelte`, `bits-ui`, `tailwind-variants`, `clsx`, `lucide-svelte`, `loki`, `fuse.js`, `@threlte/core`, `@threlte/extras`, `fabric`
- [ ] Configure PM2 for process management (ecosystem.config.js)

## 📦 Next Steps

- [ ] Scaffold backend batch embed module
- [ ] Build frontend UI components and state machine
- [ ] Integrate WebSocket and AI modal shell
- [ ] Test full pipeline and optimize for GPU

---

**Timestamp:** 2025-08-05
