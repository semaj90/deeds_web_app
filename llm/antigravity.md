# Antigravity.md — Coding Assistant Guidelines

This document establishes the guidelines, constraints, and standard operating procedures for **Antigravity**, the coding assistant agent.

---

## 1. Redis/Valkey Password Configuration Pattern

> [!IMPORTANT]
> **CRITICAL HARD RULE:** Under no circumstances should any Redis client (`ioredis` or SvelteKit client) be instantiated without authentication credentials, nor should `REDIS_URL` strings be manually parsed/interpolated with inline passwords.

- **Mandatory Environment Helpers:** Always use environment helpers (e.g. SvelteKit's `$lib/server/env.server.js` or `process.env` parsing with options objects) to configure the connection.
- **Mandatory Error Event Handlers:** You **must** attach a `redis.on('error', () => {})` handler immediately upon creating a Redis instance to prevent the Node.js runtime from throwing an unhandled `NOAUTH` or `ECONNREFUSED` exception and crashing.
- **Fallback Password:** If `process.env.REDIS_PASSWORD` or `process.env.REDIS_PASS` is not provided, default to `'redis'` if authentication is required by the environment.

### Canonical Implementation Pattern
```javascript
const redis = new Redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: parseInt(env.REDIS_PORT || '6379', 10),
  password: env.REDIS_PASSWORD || env.REDIS_PASS || 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', (err) => {
  // Gracefully log or suppress background connection errors
});
```

---

## 2. Web Application Development Constraints

- **Svelte 5 Runes Only:** Never use `export let`, `$:`, `on:click`, or `<slot>`. Use `$state`, `$derived`, `$props`, `onclick`, and modern snippets.
- **Vanilla CSS Baseline:** Maximize flexibility using curated, premium color palettes (e.g. HSL tailored colors, sleek dark modes, glassmorphism gradients, micro-animations). Avoid simple boilerplate.
- **No Placeholders:** Use `generate_image` or clean Mockups for actual visual assets.
- **Stable JSON Outputs:** API endpoints must return stable JSON schemas even on error.

---

## 3. Model & Retrieval Architecture Execution Roles

### A. Model Authority Division
- **EmbeddingGemma (`semantic_768`)**: Exclusively reserved for canonical 768-dimensional dense embeddings. Never call EmbeddingGemma for chat, text generation, or synthesis.
- **Ornith (`ornith-1.5-9b` at `:8090`)**: The live synthesis, chat, tool-calling, and reasoning engine served via llama-server. Model identity must be dynamically resolved from `/v1/models` or environment configurations.

### B. Redis / Valkey Non-Canonical Caching Boundary
- **Role**: High-speed transient cache for centroid partitions (`atlas:centroids:{workspaceRevision}`), candidate ordinal crosswalks (`atlas:candidate-map:{workspaceRevision}`), and session-scoped ACE context packets (`ace:packet:{runId}`).
- **Authority Rule**: Redis/Valkey is **non-canonical** (`canonicalAuthority: false`). Canonical truth belongs strictly to PostgreSQL 18, immutable source spans, and Parent Atlas ledger receipts.
- **Forbidden Payloads**: Never persist `hiddenThoughts`, `chainOfThought`, `kv_cache`, or raw model tensors to Redis/Valkey.

### C. State Machine & Worker Pipeline
- **XState v5 (`^5.24.0`)**: All candidate qualification and centroid generation lifecycles must be governed by typed XState v5 state machines (`setup`, `createMachine`, `createActor`) transitioning through deterministic states (`IDLE` -> `VALIDATING` -> `CHECKING_CACHE` -> `COMPUTING` -> `COMMITTING` -> `PROVEN_OR_BLOCKED`).
- **CPU Workers**: Offload heavy geometric clustering (K-Means), cosine scoring, and checksum hashing to worker threads / batched CPU worker pools. Never perform unconstrained 100k+ row nested loops in single-threaded application code or PostgreSQL joins.

---

## 4. Cross-Runtime Serialization & Transport Tiers (Python FastAPI, simdjson, OakLib, gRPC, tRPC)

### A. `simdjson` N-API vs. V8 `JSON.parse` Threshold
- **Threshold Rule:** For payloads $< 1\text{ KB}$, use native V8 `JSON.parse()`. The overhead of crossing the V8 $\leftrightarrow$ C++/Rust N-API FFI boundary exceeds parsing savings on small payloads.
- **Batch / NDJSON ($\ge 1\text{ KB}$):** Dispatch to the native N-API addon (`simd_bridge_rs.node` / `tensorrt_bridge.node`) using `parseNdjsonTypedEvidence`.
- **Validation Invariant:** Never treat raw `simdjson` parsed objects as canonical identity. All outputs must pass through strict Zod schemas before wrapping in `TypedEvidenceEnvelopeV1`.

### B. Python Tuples `()` $\leftrightarrow$ TypeScript Arrays `[]` (OakLib Integration)
- **Wire Serialization:** Python `Tuple[str, str, str, float]` (OakLib triples) serializes strictly as JSON arrays `[s, p, o, conf]`.
- **TypeScript Adaptation:** Type as positional `RawOaklibTuple = readonly [subject: string, predicate: string, object: string, confidence?: number]` and convert into structured `OntologyLinkedTupleV1`.
- **Persistence Discipline:** Tuples must be committed to PostgreSQL `atlas_ontology_linked_tuples` before writing to Valkey cache via `buildOntologyLinkedTupleCachePlan`.
- **Centroid Cache Keys:** Address cache plans by geometric and domain centroids:
  - `atlas:centroid:domain:{domainClass}`
  - `atlas:centroid:feature:{featureId}`
  - `atlas:centroid:kmeans:{clusterId}`
  - `atlas:centroid:som:{somCluster}`
- **Fail-Open Candidates:** Derive review candidates via `deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1` only from verified persisted tuples.

### C. Transport Matrix
- **Browser $\leftrightarrow$ SvelteKit UI:** `tRPC` (typed RPC, runes reactivity, batching).
- **SvelteKit $\leftrightarrow$ Python OakLib / NLP Sidecar:** `FastAPI` HTTP endpoints (JSON / NDJSON).
- **SvelteKit $\leftrightarrow$ Go Retrieval:** `gRPC` (protobuf / streaming chunk candidate pipeline).
- **SvelteKit $\leftrightarrow$ Valkey / Redis:** `RESP3` (`ioredis` with mandatory error handler and options-object credentials).

---

## 5. Parent Atlas Adaptive Multi-Resolution Retrieval and Cache Fabric

### A. Executive Summary (Ornith 1.5 Llama-Server :8090)
- **Active Synthesis & Tool-Calling Model**: **Ornith 1.5** (`ornith-1.5-9b` at `http://localhost:8090`). Models binary location: `models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf` (5.92 GB, gitignored via `models/.gitignore: *.gguf`).
- **Dense Embedding Model**: **EmbeddingGemma** is strictly reserved for 768-dimensional dense embeddings (`semantic_768`). Never use EmbeddingGemma for chat, reasoning, or prompt engineering.
- **Cache & Storage Hierarchy**:
  - **Valkey / Redis (`:6379`)**: Hot exact cache layer (`intent_hash`, `repo_revision`, `model`, `packet_version`).
  - **PostgreSQL 18 (`:5434`)**: Durable ground truth for packet identity, lineage, source revisions, and metadata.
  - **Qdrant (`:6333`)**: Rebuildable projection for dense vector similarity.
  - **SearXNG (`:8889`)**: Local fallback research engine (Port `8888` is strictly reserved for SeaweedFS Filer).

### B. Immediate Priority Order & Execution Discipline
- **0. Stabilize Script Repair Discipline**:
  - Keep `opencode/skills/project-manager.md` as execution governor and `opencode/skills/error-inference-research.md` as repair inference skill.
  - **Rule**: Never assume a failed edit succeeded.
  - **Rule**: After editing any `.js`/`.mjs` script, always run `node --check <file>`.
  - **Rule**: On repeated patch failures, restore and rewrite by whole section instead of brittle multi-line string replacements.
- **1. Valkey ACE Hot Cache**:
  - Cache compact validated ACE packets keyed by `(intent_hash, repo_revision, model, packet_version)`.
  - Never store raw oversized files or KV tensors in Valkey.
  - TTL policy: Active repair context & validation errors = 1 day; Hot sourceRefs & feature labels = 7 days; ACE packet hot cache = 1–7 days; Weekly project summary = 30 days.
- **2. Intent Memory Key Contract**:
  - Schema shape: `intent:{intent_hash}` tracking `user_intent`, `sourceRefs`, `featureLabels`, `domain`, `subdomain`, `acePacketId`, `cacheKey`, `lastAccessedAt`, `hitCount`.
  - Use exclusively for session personalization and grounded prompt engineering, never for direct model weight mutation.
- **3. Feature Labeling Pass**:
  - Turn ranked cards into feature map cards with schema: `sourceRef`, `domain`, `subdomain`, `feature_label`, `owner_area`, `status` (`implemented` | `partial` | `missing` | `duplicate`), and `signals`.
- **4. Domain Topology Graphify Lane**:
  - Build advisory domain graph edges: `IMPLEMENTS`, `DEPENDS_ON`, `MENTIONS`, `DUPLICATES`, `BLOCKED_BY`, `BELONGS_TO_DOMAIN`.
  - Graph remains advisory until independently validated against PostgreSQL source spans.
- **5. Phase 10B TurboVec Rerank**:
  - Observability-only rerank trace inserted before Ornith 1.5 synthesis.
  - Rule: Never mutate Qdrant or canonical graph state. Fallback to local ranking if TurboVec fails; do not block ACE assembly.
- **6. Prompt Engineering: Ornith 1.5 Tool-Calling Agent**:
  - Generate deep processing prompts for subagents based on user intent.
  - Packet shape: `goal`, `intent`, `context`, `sourceRefs`, `featureLabels`, `constraints`, `tools` (`rg`, `ace`, `valkey`, `qdrant`, `searxng`), `fallbacks`, `safe_next_command`.
  - Invariant: Exclude raw code dumps from prompt prefixes. Return compact, deterministic task plans.
- **7. Nightly / Weekly Summary**:
  - Nightly project summary: `opencode/summaries/nightly-YYYY-MM-DD.md`.
  - Weekly cold summary: `opencode/summaries/weekly-YYYY-WW.md`.
- **8. Later Kernel / Unsloth Attention Experiments**:
  - Decoupled from live retrieval critical path. Export training candidates offline from stable intent cache logs.

### C. Architectural Separation: PDS vs. ARC
- **Packet Dense Search (PDS)**: Production deterministic retrieval primitive governed by 13 proof gates (`PDS-00` through `PDS-12`). Establishes canonical Postgres $\leftrightarrow$ Qdrant identity bridge, frozen query representation contracts, parameterized structural prefiltering, dense executor selection (`AUTO` / `EXACT` / `HNSW` / `CUVS`), and revision-qualified join-backs with typed degradation receipts.
- **Adaptive Retrieval & Cache Fabric (ARC)**: Multi-resolution shadow optimization layer governed by 13 gates (`ARC-00` through `ARC-12`). Manages `AtlasSampleFieldV1` (`NEAREST`, `LINEAR`, `KERNEL`, `CUBIC`, `GRAPH_DIFFUSION`, `EXACT`), versioned low-rank projections (128/64), cache tier residency (`VRAM_HOT`, `RAM_WARM`, `NVME_WARM`), and shadow grouped-relative policy comparison.
- **Inviolable Boundary**: The ARC policy may learn where to spend compute, what to cache, which executor to use, and when to promote evidence; it may **never** learn or redefine what canonical identity, source revision, or factual evidence is true.

### D. GPU Quantization & Workstation Resource Invariants
- **NF4 (NormalFloat4) & QLoRA Usage Contract**:
  - Official Hugging Face / bitsandbytes specification supports NVIDIA Pascal (SM60) and newer; the workstation's RTX 3060 Ti (Ampere SM86) comfortably meets hardware capability.
  - NF4 is an asymmetric 4-bit quantile quantization designed for normally distributed neural weights. Theoretical weight compression vs. baseline (e.g. 3B model: FP32 ~12 GB, FP16/BF16 ~6 GB, NF4 ~1.5 GB).
  - Actual NF4 runtime memory demands are higher due to double-quantization constants, LoRA adapter parameters, optimizer states, activations, and CUDA workspaces.
  - **VRAM Contention Rule**: The RTX 3060 Ti (8 GiB VRAM) can run QLoRA training on small adapter models (e.g. 1B–3B parameter classifiers), but **cannot concurrently train Ornith 1.5 (9B)** while Ornith's live llama-server inference process (`:8090`) occupies VRAM.
  - **Operator Boundary**: Use PyTorch + `bitsandbytes` exclusively for offline QLoRA training; keep LibTorch and TensorRT as independently tested inference backends (do not assume custom LibTorch/TensorRT operators natively support NF4).
- **Critical Workstation Storage & Memory Pressure Alert**:
  - **Host C: Drive Free Space**: **9.42 GB (10,113,802,240 bytes) — Stabilized from 3.1 GB** via ClickHouse system log partition drops and Qdrant snapshot pruning.
  - **Free System RAM**: **0.8 / 31.9 GB** — severe memory pressure requiring active process hygiene.
  - **Docker AppData Footprint**: **~145 GB** (reclaimed ~27 GB from Qdrant snapshot and ClickHouse trace log drops).
  - **Duplicate File Estimate**: **~59 GB** identified for canonical deduplication.
  - **Action Rule**: Block unreviewed model checkouts, container image pulls, or tensor weight downloads. Prefer NTFS hardlinks for identical model weights.

### E. Backend Table of Contents (TOC) Mappings for Agentic LUTs
To support agentic Look-Up Tables (LUTs) with deterministic routing, ontology and candidate tables are divided into distinct storage tiers, each with dedicated schema semantics, identity scopes, and admission gates:

| Backend Table | Primary Key / Index | Scope / Resolution | Agentic LUT Role | Admission / State Gating |
| :--- | :--- | :--- | :--- | :--- |
| **`feature_ontology_tuples`** | `packet_key`, `feature_key` | Feature-level (`USES_CONCEPT`, `IMPLEMENTS_FEATURE`) | High-granularity symbol/AST relation LUT | Non-admitted until `resolved_concept_id` and `resolution_state` are proven |
| **`registry_ontology_tuples`** | `packet_key`, `tuple_type` | Global registry relationships | Macro cross-packet lineage & corroboration | Tracks `corroboration_count` and `materialization_version` |
| **`ontology_domain_tuples`** | `packet_key`, `domain_class` | Domain routing (`backend`, `frontend`, `legal`) | Fast domain classification & sub-DAG dispatch | Routes requests and bounds context budgets without promoting identity |
| **`codebase_chunk_index`** | `chunk_id`, `source_ref` | Chunk-level (`CHUNK_LEVEL_ORDINAL_MATCH`) | Fine-grained text span and vector embedding index | Owns `content_embedding_768` for cosine distance queries |
| **`atlas_packets`** | `packet_id`, `source_ref` | Packet-level (`PACKET_LEVEL_ORDINAL_MATCH`) | Canonical identity authority across workspace | Governs workspace revision, source revision, and cold provenance |

#### Agentic LUT Invariants
1. **Ordinal Scope Discrimination**: LUT consumers must explicitly distinguish `PACKET_LEVEL_ORDINAL_MATCH` from `CHUNK_LEVEL_ORDINAL_MATCH` and `SYMBOL_VERSION_EXACT_MATCH`. A packet-level ordinal must never be passed to a kernel expecting chunk or symbol coordinates.
2. **Fail-Closed Resolution**: A tuple hit in `feature_ontology_tuples` is never an admitted relationship unless `resolved_concept_id` is populated and validated against the canonical ontology revision.
3. **No Cross-Table Mutation**: Agentic error fixing workflows and MCP tools may read all LUT tiers but can only submit mutation proposals via `promotion_outbox` under explicit schema gates.

---
*Maintained under Deeds Legal-AI Platform Guidelines.*



