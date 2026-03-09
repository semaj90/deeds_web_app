# Enhanced-Bits Component Tree & Integration Diagram

**Context:** NES.css + Svelte 5 + SvelteKit 2 UI library for a Legal-AI platform. Backend & infra: Redis, PostgreSQL (+ pgvector), Drizzle-ORM, RabbitMQ, Loki.js (client-side DB), Fuse.js (fuzzy search). This document is a visual/textual component tree and system-integration map optimized for SvelteKit 2 SSR and Svelte 5 runes.

---

## 1) Component Tree (Nested / Ownership view)

```
App (SvelteKit routes)
├─ Layouts
│  ├─ RootLayout.svelte
│  └─ DashboardLayout.svelte
│
├─ UI Core (enhanced-bits)
│  ├─ Button.svelte
│  ├─ Icon.svelte
│  ├─ Badge.svelte
│  ├─ Avatar.svelte
│  ├─ Card/ (compound)
│  │  ├─ Card.svelte (Root)
│  │  ├─ CardHeader.svelte
│  │  ├─ CardTitle.svelte
│  │  └─ CardContent.svelte
│  ├─ Dialog.svelte
│  ├─ Modal/FullScreenModal.svelte
│  ├─ Input.svelte
│  ├─ Select.svelte
│  └─ Alert.svelte
│
├─ Evidence Layer
│  ├─ EvidenceCard.svelte            # uses Card, Button, Badge, Icon, EvidenceThumbnail
│  ├─ EvidenceThumbnail.svelte       # img/video/audio preview, lightweight player
│  ├─ EvidenceAIAnalysis.svelte      # confidence bars, entities list, AI summary
│  ├─ EvidenceTimeline.svelte        # chain-of-custody component
│  ├─ EvidenceTags.svelte            # MultiSelect + Tag chips
│  └─ EvidenceHash.svelte            # hash verification & copy
│
├─ Forms & Inputs
│  ├─ FileUploader.svelte            # drag-n-drop + progress + WebWorkers hook
│  ├─ MultiSelect.svelte
│  ├─ SearchInput.svelte             # debounced + Fuse.js / pgvector switch
│  ├─ DatePicker.svelte
│  └─ RichTextEditor.svelte
│
├─ Dashboard & Layout
│  ├─ Board.svelte                   # grid/drag-drop (interacts w/ DnD lib)
│  ├─ Sidebar.svelte
│  ├─ Toolbar.svelte
│  └─ SplitView.svelte
│
├─ Visualizations
│  ├─ ConfidenceBar.svelte
│  ├─ TimelineGraph.svelte
│  ├─ Heatmap.svelte                 # vector-sim visualization (pgvector results)
│  └─ EntityCloud.svelte
│
├─ Notifications
│  ├─ Toast.svelte
│  ├─ ProgressBar.svelte
│  └─ LoaderOverlay.svelte
│
└─ Utilities
   ├─ CopyButton.svelte
   ├─ Collapsible.svelte
   └─ DebugPanel.svelte              # optional - shows request/redis/socket stats
```

---

## 2) Integration Map — Where each infra piece fits

### PostgreSQL + pgvector + Drizzle-ORM
- **Role:** canonical persistent store for cases, evidence metadata, embeddings index with `pgvector`.
- **What lives here:** Evidence records, metadata, case records, embedding vectors, user/team data, ACLs.
- **Drizzle:** server-side database access in SvelteKit endpoints and server hooks. Use typed queries + migrations.
- **Patterns:**
  - Keep heavy vector similarity queries in server endpoints `/api/search/vector` and return paginated results.
  - Store `embedding_version` and `embedding_model` fields on `evidence` rows.

### Redis (pub/sub, caching, ephemeral state)
- **Role:** real-time pub/sub (notifications), ephemeral caches (search caches), session locks for long-running AI jobs.
- **Where used:**
  - Notify frontend via Server-Sent Events (SSE) or WebSocket when RabbitMQ job completes.
  - Cache expensive query results (e.g., top-K vector results for a user session) with short TTL.

### RabbitMQ (job queue)
- **Role:** decouple uploads/AI analysis from request lifecycle. Workers process embeddings, QLoRA training tasks, OCR, video thumbnails.
- **Flow:**
  1. Upload → S3/MinIO + create `evidence` DB record (Drizzle) → push job to RabbitMQ `jobs.evidence.process`
  2. Worker consumes job → runs AI tasks (embedding, OCR, thumbnail) → stores outputs (MinIO + DB updates) → publishes status to Redis channel.

### Loki.js (client-side DB)
- **Role:** offline-first client DB for local evidence indexing, quick offline search, small caches.
- **Use cases:**
  - Persist UI state, recent search results, last N evidence items.
  - Fast local filtering (when offline or for instant UX) before falling back to server results.

### Fuse.js (client fuzzy search)
- **Role:** fast fuzzy search on the client-side index (Loki.js) for instant UX.
- **Where used:** SearchInput.svelte for immediate suggestions; fallback to server `pgvector` search for semantic similarity.

### WebGPU / RAG / Ollama (optional)
- **Role:** GPU-accelerated RAG/embedder on a GPU node (Ollama or custom). Not strictly UI, but components will call SvelteKit endpoints which in turn call the RAG service.

---

## 3) Data Flow Diagrams (textual)

### A. Upload & Analysis (simplified)
```
Browser (FileUploader) --> POST /api/evidence/upload (SvelteKit endpoint)
  -> store file to MinIO/S3
  -> create DB row (Drizzle) in PostgreSQL
  -> push job to RabbitMQ (process-evidence)
  -> respond 202 + jobId

Worker (consumes RabbitMQ) -> process (OCR, thumbnail, embeddings)
  -> update DB (Drizzle) with analysis, store thumbnail to MinIO
  -> publish status to Redis channel `evidence:status:{id}`

Browser subscribed to Redis channel (via SSE or WebSocket proxy) shows progress
```

### B. Search Flow
```
User types in SearchInput (client):
  -> Fuse.js + Loki.js quick filter (local instant results)
  -> If user presses Search or requests semantic: call /api/search?q=...&mode=vector
    -> Server executes pgvector similarity query via Drizzle
    -> Return ranked results with scores
    -> Cache results in Redis for short TTL
```

---

## 4) Component-to-API mapping (endpoints)

```
GET  /api/evidence/:id                -> evidence detail (Card + Dialog data)
POST /api/evidence/upload             -> handles file upload, returns jobId
GET  /api/evidence/:id/thumbnail      -> proxied thumbnail from MinIO
POST /api/search?q=...&mode=fuse      -> server-side fuzzy fallback
POST /api/search/vector               -> vector semantic search (pgvector)
GET  /api/ai/status/:jobId            -> pollable status (or SSE)
```

Security: endpoints run server-side checks for ACLs. Use signed URLs for asset fetches from MinIO.

---

## 5) SvelteKit + Svelte 5 Patterns & Notes
- **SSR**: Keep heavy Graph/pgvector queries on server endpoints; avoid exposing embeddings to client.
- **$props()**: use reactive rune pattern where components receive data from load functions.
- **Hydration**: For Board.svelte heavy DOM, use `onMount` to initialize drag-and-drop only on client.
- **SSE vs WebSocket**: Prefer SSE for ordered logs (analysis progress), WebSocket for interactive bi-directional features.

---

## 6) File layout suggestion (src/)
```
src/
├─ lib/
│  ├─ components/ui/enhanced-bits/  # components listed above
│  ├─ stores/                        # svelte stores for real-time state
│  ├─ services/
│  │  ├─ api.ts                      # fetch wrappers, auth
│  │  ├─ redis-proxy.ts              # optional SSE/WebSocket proxy
│  │  ├─ search.ts                   # client/server search helpers
│  │  └─ workers/                    # worker job payload schemas
│  └─ utils/
│     ├─ format.ts
│     └─ embeddings.ts
└─ routes/
   ├─ evidence/
   │  ├─ +page.svelte                 # evidence list (Board)
   │  └─ [id]/+page.svelte            # evidence detail route (Card + Dialog)
   └─ api/
      ├─ evidence/
      │  └─ upload/+server.ts
      └─ search/vector/+server.ts
```

---

## 7) Performance & Observability
- **Indexing:** maintain `ivfflat` params and analyze after bulk ingestion. Store metadata to help filter before vector queries.
- **Caching:** Redis for hot searches; use HTTP caching for thumbnails.
- **Tracing:** instrument workers & endpoints; surface a debug `DebugPanel` in dev with job latencies.
- **Loki.js TTLs:** sync the client DB with server only changed sets to avoid bloat.

---

## 8) Accessibility & UX considerations
- Use ARIA roles on Card/Dialog components (you’ve included `aria-label` in EvidenceCard — good).
- Keyboard navigation for Board drag/drop (a11y fallback) and Dialogs.
- Provide clear state for AI confidence (color + text) and alt text for thumbnails.

---

## 9) Next steps & deliverables I can produce for you
- ✅ A rendered **SVG/PNG diagram** of this component tree and integration flows.
- ✅ A **detailed route + endpoint spec** (OpenAPI-style) for all API surfaces mentioned.
- ✅ Ready-to-drop **Svelte 5 templates** for: EvidenceCard, FileUploader, Board, and SearchInput wired to the server endpoints.

Pick one and I’ll produce it next. If you want the visual diagram (SVG/PNG), tell me the preferred format and whether you want the diagram as a single-page poster or split into Component Tree + Integration Flow pages.

