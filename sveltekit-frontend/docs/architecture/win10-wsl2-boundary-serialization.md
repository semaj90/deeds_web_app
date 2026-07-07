# Win10 / WSL2 Boundary — Memory, Serialization & Load Architecture

> **Scope**: How heap/stack/binary data flows across the Windows 10 ↔ WSL2
> boundary in this app, what serialization format to use at each hop, and
> where GPU capabilities differ between the two sides.

---

## 1. The Boundary in One Picture

```
┌─────────────────────────── Windows 10 (native) ─────────────────────────────┐
│                                                                               │
│  Node.js / SvelteKit (vite dev :5173)                                        │
│  ├── tensorrt_bridge.node   ← C++ N-API, Windows DLL, cuBLAS, LibTorch 2.9  │
│  ├── simd_bridge_rs.node    ← Rust NAPI-RS, Rayon parallel parser            │
│  ├── src/lib/workers/*.ts   ← Web Workers (in-process, SharedArrayBuffer)    │
│  └── static/sw.js           ← Service Worker (browser, IndexedDB/CacheAPI)   │
│                                                                               │
│  VHDX  ←──────────────────  WSL2 kernel bridge  ──────────────────────────→  │
│                                                                               │
└────────────── \\wsl$\Ubuntu  ←  /dev/dxgkrnl (CUDA passthrough) ────────────┘
       │
       ▼
┌─────────────────────────── WSL2 (Linux) ───────────────────────────────────┐
│                                                                              │
│  Docker containers (GPU-capable via /dev/dxgkrnl + libnvidia-container):    │
│  ├── legal-ai-postgres   :5432   ← pg18, pgvector, JSONB + GIN indexes     │
│  ├── legal-ai-valkey     :6379   ← valkey-cli, RESP3, binary-safe strings   │
│  ├── legal-ai-qdrant     :6333   ← gRPC :6334, FP16/BF16 HNSW               │
│  ├── legal-ai-neo4j      :7687   ← Bolt protocol (binary framing)           │
│  ├── legal-ai-rabbitmq   :5672   ← AMQP 0-9-1, persistent queues, DLX      │
│  ├── legal-ai-seaweed-s3 :8333   ← S3-compat, multipart binary blobs        │
│  └── ollama / llama-server       ← model inference, can use cuDNN here      │
│                                                                              │
│  Available in containers but NOT in Windows native process:                  │
│  ├── cuDNN 9              ← apt-get libcudnn9-dev-cuda-12                   │
│  └── cuVS (RAPIDS)        ← conda install -c rapidsai cuvs-cu13  [TODO]    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key asymmetry**:
- `tensorrt_bridge.node` runs in the Windows process → cuBLAS ✅, cuDNN ❌
- Docker containers run on the WSL2 Linux kernel → cuBLAS ✅, cuDNN ✅
- The VHDX pipe is **the only data path** between them — every byte crosses
  via TCP socket, Unix socket (mapped), or shared NTFS mount. There is no
  shared memory between Windows user-space and WSL2 containers.

---

## 2. GPU Capability Matrix by Process Boundary

| Capability | Windows Node.js | WSL2 Container | Notes |
|---|---|---|---|
| CUDA compute | ✅ CUDA 13.0 | ✅ CUDA 12.x | Passthrough via dxgkrnl |
| cuBLAS / cuBLASLt | ✅ | ✅ | LibTorch 2.9 on Windows, system on Linux |
| cuDNN 9 | ❌ | ✅ | Needs `libcudnn9-dev-cuda-12` in container |
| cuVS / CAGRA | ❌ | 🔲 TODO | `conda install -c rapidsai cuvs-cu13` |
| CUTLASS | ❌ | 🔲 TODO | `git clone https://github.com/NVIDIA/cutlass` |
| FP16 GEMM | ✅ `batchCosineSimilarityFp16` | ✅ via PyTorch | N-API on Win, Python on Linux |
| NVLink / peer mem | ❌ | ❌ | Single GPU, no peer transfers |
| SharedArrayBuffer | ✅ Web Workers | N/A | Browser/Node only |

---

## 3. Serialization Format Decision Matrix

Each hop between Windows ↔ WSL2 ↔ containers has a correct format choice.
Picking the wrong one adds unnecessary copies or conversion overhead.

```
Win10 Node.js
    │
    │  (A) Redis RESP3  ──────────────────►  Redis :6379
    │  (B) Postgres wire (pgwire)  ─────────►  PG :5432
    │  (C) AMQP 0-9-1 + Protobuf  ──────────►  RabbitMQ :5672
    │  (D) gRPC / HTTP2 + Protobuf ──────────►  gRPC services :50051/:50053
    │  (E) Qdrant gRPC  ─────────────────────►  Qdrant :6334
    │  (F) Bolt 4.x  ────────────────────────►  Neo4j :7687
    │  (G) SharedArrayBuffer  ───────────────►  Web Workers (same process)
    │  (H) FlatBuffers in Redis  ────────────►  Redis binary string keys
    │
    ▼
Win10 Browser (sw.js / IndexedDB / CacheAPI)
    │
    │  (I)  MessageChannel + Transferable ArrayBuffer  ──►  ONNX worker
    │  (J)  IndexedDB (structured clone of Float32Array)  ─►  client cache
```

### Format rules

| Hop | Format | Why |
|---|---|---|
| **Node → Redis** (embeddings, Karpathy scores) | RESP3 bulk-string, CSV Float32 | ioredis serialises strings natively; no framing overhead. Float32Array → `Array.from(v).join(',')` on write, split+map on read. |
| **Node → Postgres** (JSONB columns) | Postgres wire + Drizzle `jsonb` | JSONB stores binary-parsed JSON; GIN indexes work on the binary form. Never stringify twice. |
| **Node → RabbitMQ** (job dispatch) | AMQP 0-9-1 + JSON body | Payloads are small (IDs + metadata); JSON is fine. For bulk vectors use Protobuf payload (see §4). |
| **Node → gRPC services** | Protobuf binary | Already implemented via `legal_api_pb.js`. Mandatory for all Go services. |
| **Node → Qdrant** | Qdrant REST/gRPC | Use gRPC `:6334` for search (binary framing); REST for CRUD (easier). |
| **Web Worker ↔ main thread** (embeddings) | Transferable `Float32Array` | Zero-copy. Pass `ArrayBuffer` in `transfer[]`. Never JSON-encode a vector for a Worker. |
| **Service Worker ↔ page** (offline cache) | Cache API (Response clone) | Use `Cache.put(url, response.clone())`. ONNX `.wasm` blobs stored as opaque responses. |
| **Future: cuVS bulk index** | FlatBuffers (in-process) | cuVS expects contiguous float arrays; FlatBuffers vectors are already contiguous — no copy into CUDA. |

---

## 4. Binary Serialization Paths — ff1 Memory / JSONB / Protobuf / FlatBuffers

### 4a. JSONB + GIN (Postgres — authoritative storage tier)

JSONB is the canonical storage format for structured but schema-flexible data:

```sql
-- GIN index on JSONB columns (already used for agent_context_files.rules,
-- synthesis_logs.source_refs, etc.)
CREATE INDEX CONCURRENTLY idx_agent_context_files_tags_gin
  ON agent_context_files USING gin(semantic_tags);

CREATE INDEX CONCURRENTLY idx_synthesis_logs_source_refs_gin
  ON synthesis_logs USING gin(source_refs jsonb_path_ops);

-- Fast JSONB path query (avoids full table scan):
SELECT * FROM synthesis_logs
WHERE source_refs @> '["src/lib/server/db/client.ts"]'::jsonb;
```

**When to use JSONB + GIN vs flat columns:**
- Use JSONB when the shape evolves frequently or varies per row (AGENTS.md
  rules, synthesis payloads, hyperedge metadata).
- Use flat columns + B-tree when you sort or range-query (timestamps, scores,
  counts). GIN does containment/existence, not inequality.
- GIN `jsonb_path_ops` is ~30% smaller than `jsonb_ops` and faster for `@>`
  queries; use it unless you need `?` (key exists) checks.

### 4b. Protobuf (gRPC wire + persistence tier)

Protobuf is used for cross-language contracts (TypeScript ↔ Go services):

```
proto/active/
├── embedding.proto      — EmbeddingService gRPC :50051
├── retrieval.proto      — RetrievalService gRPC :50053 / HTTP :8100
├── chat_assistant.proto — ChatAssistantService (RAG queries)
├── codeintel.proto      — Code intelligence service
└── tool_calling.proto   — Tool invocation schema

Generated:
src/proto/legal_api_pb.js     — pbjs/pbts static module
src/proto/legal_api_pb.d.ts
proto/generated/yorha_metadata.proto  — auto from `npm run proto:from-zod`
```

**Rule**: Protobuf is for *cross-process, cross-language* communication only.
Don't use it for in-process data. Don't store raw Protobuf bytes in Postgres
(store JSON/JSONB instead so you can query it). Generate from Zod schemas via
`proto:from-zod` — never hand-edit generated `.proto` files.

**RabbitMQ + Protobuf** (when payloads exceed ~4KB): encode the message body
as Protobuf, set `contentType: 'application/octet-stream'` in AMQP headers:

```typescript
// Publishing a vector batch to RabbitMQ using Protobuf encoding
import { EmbeddingBatch } from '$lib/proto/legal_api_pb.js';

const batch = new EmbeddingBatch();
batch.setVectorsList(chunkEmbeddings.map(v => ({ valuesList: Array.from(v) })));
const bytes = batch.serializeBinary();   // Uint8Array, no JSON overhead

channel.publish(
  'vector.updates',
  'vector.index',
  Buffer.from(bytes),
  { contentType: 'application/octet-stream', persistent: true }
);
```

### 4c. FlatBuffers (zero-copy GPU path — future / cuVS lane)

FlatBuffers schema lives at `deeds_labs/infra/cuda-binaries/flatbuffers/precedent_graph.fbs`.
This is the correct format for **bulk float arrays that go directly into CUDA**,
because FlatBuffers vectors are contiguous in memory — you can pass a raw
pointer to cuVS/CUDA without an intermediate copy:

```
FlatBuffer ByteArray
  └── PrecedentGraph
        ├── nodes: [Node]   ← each Node has an `embedding: [float]` field
        └── edges: [Edge]   ← typed relation graph

cudaMemcpy(d_embeddings, flatbuf.nodes()[i].embedding()->data(), bytes, H2D);
// ↑ zero-copy: FlatBuffers data() returns a pointer to the already-aligned bytes
```

**When to activate the FlatBuffers path:**
1. cuVS CAGRA index is available in a Docker container (conda install).
2. Bulk-indexing > 100K vectors in one shot (embed-pipeline or nightly
   backfill job).
3. The Python sidecar needs to pass float arrays to the N-API addon without
   going through JSON.

Until cuVS lands, FlatBuffers is deferred. Keep the schema at
`deeds_labs/infra/cuda-binaries/flatbuffers/precedent_graph.fbs` and the
`flatbuf:generate` npm script ready to activate.

### 4d. ff1 Memory Binary (in-process KV — NES architecture)

`gpu:karpathy:encoded` and `ace:engram:vec64:*` are the current binary
memory paths — 64-dim Float32Array stored as CSV in Redis. This is the
**L1 engram cache layer**. It works but CSV is ~5× larger than raw binary.

When throughput demands it, the upgrade path is:

```
Current:  redis.hget(key) → "0.12,0.33,..." → split+map → Float32Array(64)
Upgrade:  redis.hget(key) → Buffer → new Float32Array(buf.buffer) [binary]
```

To flip to binary storage:
```typescript
// Write: Float32Array → Buffer (64 * 4 = 256 bytes vs ~400 chars CSV)
const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
await redis.hset('gpu:karpathy:encoded', filePath, buf);

// Read: Buffer → Float32Array (zero-copy if Buffer is exactly 256 bytes)
const buf = await redis.hgetBuffer('gpu:karpathy:encoded', filePath);
if (buf && buf.byteLength === 64 * 4) {
  const vec = new Float32Array(buf.buffer, buf.byteOffset, 64);
}
```

ioredis `hgetBuffer` / `getBuffer` return `Buffer` directly (no UTF-8
decode). This keeps the 64-dim vector as a contiguous binary region that
can be passed directly into `batchCosineSimilarityFp16` without conversion.

---

## 5. Service Worker — Load/Heap Flow (Browser ↔ Win10 Node)

The Service Worker (`static/sw.js`) sits between the browser and the
SvelteKit dev server. Its role in the binary flow:

```
Browser Tab
  │  fetch('/api/embed')
  ▼
Service Worker (sw.js — same Win10 process as browser)
  ├── Cache API hit?  → return cached Response (no network)
  │     └── Cached response body contains JSON {"embedding": [...768 floats]}
  │         → 768 * ~18 chars = ~13KB per vector. Expensive to clone.
  │
  └── Cache miss → pass through to SvelteKit :5173
        └── SvelteKit → Ollama → 768-dim Float32Array
              → JSON.stringify → HTTP response → sw.js caches it
```

**Heap pressure problem**: JSON-encoding 768 floats for every embedding
response creates a large string allocation on the Service Worker heap. The
SW shares a V8 isolate with the page (different from a Web Worker), so
large responses bloat the browser's renderer heap.

**Fix path** (when embedding throughput becomes a bottleneck):
1. Store embeddings in the SW cache as `application/octet-stream`
   (`Float32Array.buffer` → `Blob`), not JSON.
2. The page fetches, reads `.arrayBuffer()`, wraps as `Float32Array(768)`.
3. This reduces SW cache size ~6× (768 * 4 = 3072 bytes vs ~13KB JSON).

Current status: the SW caches embedding JSON responses — acceptable for
the current load. Binary upgrade deferred until ONNX client-side
inference volume justifies it.

---

## 6. RabbitMQ Queue Map — Binary vs JSON Payloads

All 20 queues on `rabbitmq-manager-fixed.ts`. Annotated with the correct
serialization for each queue's message body:

| Queue | Exchange | Body format | Payload size estimate |
|---|---|---|---|
| `cache.invalidate` | `cache.invalidation` | JSON | <1KB — key strings |
| `document.embed` | `document.processing` | JSON → Protobuf | ~4KB with chunk text |
| `chat.document.embed` | `document.processing` | JSON | <2KB |
| `evidence.process` | `document.processing` | JSON → Protobuf | ~4KB |
| `vector.index` | `vector.updates` | **Protobuf** | ~3KB per chunk × batch |
| `chat.context` | N/A | JSON | <2KB |
| `analytics.track` | `analytics.events` | JSON | <1KB |
| `codebase.index` | `codebase.indexing` | JSON | <4KB |
| `ace.evaluate` | N/A | JSON | <2KB |
| `error.embed` | N/A | JSON | <2KB |
| `synthesis.generate` | N/A | JSON | <2KB |
| `knowledge.backfill` | N/A | JSON | <2KB |
| `audio.process` | `audio.processing` | **binary blob ref** | S3 key only |
| `glyph.tile.rebuild` | N/A | JSON | <1KB |
| `qlora.distill` | N/A | JSON | <4KB |
| `media.download` | `media.processing` | JSON | <2KB |
| `media.transcribe` | `media.processing` | JSON | <2KB |
| `cards.refresh` | N/A | JSON | <1KB |
| `repair.workflow.run` | N/A | JSON | <4KB |
| `inference.log.flush` | N/A | JSON | <2KB |

**Rule**: queues whose payloads carry embedding vectors (`vector.index`,
`document.embed` bulk path) should move to Protobuf encoding. All others
stay JSON — the overhead is negligible and debuggability wins.

Dead-letter exchange: `dlx.dead-letter`. Every queue has a `.dlq` mirror.
Max retries before DLQ: 3 (per RabbitMQ manager `nack` logic).

---

## 7. Heap / Stack Flow — Windows ↔ WSL2

Understanding where allocations live determines where to put buffers.

```
Windows Node.js V8 Heap
  ├── TypedArrays (Float32Array): allocated on V8 external heap
  │   └── Backing store: malloc'd by Node.js, NOT in V8 GC'd heap
  │   └── Can be passed to N-API addon as raw pointer (zero-copy)
  │
  ├── N-API / C++ (tensorrt_bridge.node):
  │   └── LibTorch tensors: CUDA device memory (separate from Node heap)
  │   └── CPU tensors: malloc, wrapped as Float32Array on return
  │   └── Stack: C++ call stack, separate from V8 stack
  │
  └── Web Workers (src/lib/workers/):
      └── SharedArrayBuffer: shared between main thread + workers (same process)
          Transferable ArrayBuffer: moves ownership, zero-copy

TCP socket (\\wsl$\Ubuntu:*)
  └── ioredis: Buffer (Node.js Buffer = Uint8Array subclass)
  └── amqplib: Buffer (AMQP frame bytes)
  └── @grpc/grpc-js: Uint8Array (Protobuf wire bytes)

WSL2 container (Linux address space)
  └── Completely separate virtual address space from Windows
  └── No shared memory with Windows process
  └── Data only crosses via TCP/Unix socket through the VHDX bridge
```

**Practical consequence**: to pass a 768-dim Float32Array from Node to Redis,
the minimum path is `Buffer.from(float32.buffer)` → ioredis writes the raw
bytes over TCP → Redis stores as a binary string. The reverse is
`hgetBuffer` → `new Float32Array(buf.buffer)`. This is the minimum-copy
path; JSON.stringify is always worse.

---

## 8. cuVS TODO — When to Activate

cuVS (RAPIDS Vector Search) replaces Qdrant's CPU HNSW with GPU CAGRA/IVF:

```
Current:  Node → Qdrant gRPC :6334 → CPU HNSW (float32, 768-dim)
Future:   Node → cuVS sidecar (Python :8792) → GPU CAGRA index
           └── cuVS reads FlatBuffers-encoded vectors directly from GPU memory
```

**Install (WSL2 or RAPIDS container)**:
```bash
conda install -c rapidsai -c conda-forge cuvs-cu13
# or Docker:
docker pull nvcr.io/nvidia/rapidsai/base:24.12-cuda12.5-py3.11
```

**Trigger criteria** (don't activate until all three hold):
1. `codebase_chunks_768` collection exceeds 500K points (current ~3K — no urgency).
2. Qdrant ANN latency exceeds 20ms p99 under concurrent load.
3. cuVS Python sidecar can be added to `docker-compose.yml` GPU profile without
   exceeding 8GB VRAM budget (Gemma4 + cuVS CAGRA at 768-dim = ~1.5GB extra).

**Wire path when ready**:
- New queue: `vector.cagra.build` (triggers nightly CAGRA index rebuild)
- New gRPC: `cuvs_retrieval.proto` → Python sidecar :50057
- FlatBuffers: activate `flatbuf:generate` npm script, use
  `precedent_graph.fbs` as the wire format for bulk index payloads

---

## 9. Summary — "What Format Goes Where"

| Data type | Windows Node | WSL2 Container | Wire across boundary |
|---|---|---|---|
| 768-dim embedding vector | `Float32Array` | Postgres `vector(768)` | Redis CSV (current) → binary Buffer (upgrade) |
| 64-dim Karpathy vec | `Float32Array` | Redis `gpu:karpathy:encoded` | CSV string (current) → `hsetBuffer` (upgrade) |
| JSONB metadata | JS object | Postgres JSONB + GIN | JSON over pgwire |
| Job dispatch | JS object | RabbitMQ AMQP | JSON body (small) / Protobuf (vectors) |
| Cross-service structs | Protobuf message | Go service | Protobuf binary over gRPC |
| Bulk float arrays (future) | FlatBuffers | cuVS GPU memory | FlatBuffers (contiguous, no copy) |
| Offline ONNX blobs | ArrayBuffer | N/A (browser only) | Cache API opaque response |
| Shared compute buffer | SharedArrayBuffer | N/A | MessageChannel transfer |

**One-line rule per boundary**:
- **Node → Redis**: binary Buffer for vectors, JSON string for metadata
- **Node → Postgres**: Drizzle ORM + Zod; JSONB for flexible shapes, typed columns for queryable fields
- **Node → RabbitMQ**: JSON for small payloads, Protobuf for anything with vectors
- **Node → gRPC services**: always Protobuf binary
- **Worker → Worker**: Transferable ArrayBuffer (never JSON for typed arrays)
- **Service Worker → Page**: opaque Response for blobs, JSON for metadata
- **Windows → cuVS (future)**: FlatBuffers over gRPC to Python sidecar in WSL2