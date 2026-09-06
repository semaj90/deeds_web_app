# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## Response rules

- Answer directly and concisely. Do not plan aloud before answering.
- For short/simple inputs, respond immediately — do not run audits or checklists unless explicitly asked.
- Use `rg` (ripgrep) to search before opening files. Never load an entire `.md` into context.

## Search first — never read whole files

Before opening any file, search with `rg` (ripgrep):
```bash
rg -l "keyword"                    # find files containing keyword
rg "keyword" src/ --type ts        # search TypeScript files
rg --no-ignore "keyword"           # include gitignored files (NES/CHROM packets)
```
Only `Read` a file if `rg` confirms it contains what you need. Never load an entire `.md` into context to find one fact.

## Parent Atlas Workstation (Production-Ready)

**Status**: Stage 0 gate VERIFIED ✅ (July 23, 2026)

**Infrastructure**: All 7 critical services online (Postgres, Qdrant, Neo4j, Valkey, EmbeddingGemma, llama-server/Ornith, Go Retrieval)

**Execution Pipeline**: Ready for Graphify Stage 1 (Incremental File Inventory)

**Key Rules**:
- **Archival, Not Deletion**: Files are moved to `deeds_labs/archive/YYYY-MM-DD/` with SHA-256 + reason + recovery instructions
- **Embedding Contracts**: 768-dim CANONICAL_NATIVE and CANONICAL_RETRIEVAL_CONTRACT, 384-dim LEGACY_COMPATIBILITY only, 64-dim ROUTING_FEATURE
- **Retrieval Lanes**: 7 independent lanes (lexical, dense, sparse, topology, documentation, centroid, temporal) with RRF fusion
- **Pipeline Stages**: 0-14 sequential, no skipping, deterministic outputs (sorted NDJSON)

**Reference**: `memory/parent-atlas-workstation.md` (infrastructure status), `memory/STAGE-1-INCREMENTAL-FILE-INVENTORY.md` (Stage 1 execution)

---

## Critical constraints

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- Bits UI uses namespace imports from `bits-ui`; prefer the `child` snippet pattern.
- Drizzle server code: `$lib/server/db/client`, keep `.js` import extensions, use `migrate` not `drizzle-kit push` on live data.
- GET API routes must return stable JSON shape even on failure (same top-level keys, empty defaults).
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; do not hardcode `localhost` in app code.
- **Port 8888**: Reserved for SeaweedFS Filer. Do NOT bind SearXNG to 8888; use 8889.
- **No hidden thoughts**: Do not persist `hiddenThoughts`, `chainOfThought`, `kv_cache`, or `tensor` to any store.
- **Archive, never delete**: See Parent Atlas section above for archival rules

## OpenCode Skill Contract (Mandatory Addendum)
Every skill/subagent must conclude its execution by providing these structured fields:
*   **`likely_cause`**: A one-sentence summary of the root cause or primary trigger for the task.
...
## OpenCode Skill Contract (Mandatory Addendum)
Every skill/subagent must conclude its execution by providing these structured fields:
*   **`likely_cause`**: A one-sentence summary of the root cause or primary trigger for the task.
*   **`evidence`**: The specific data points, file paths, or concepts that informed the solution (e.g., `src/lib/foo.ts`, "User requested feature X").
*   **`patch_targets`**: A list of relative file paths that were modified or should be reviewed for changes.
*   **`safe_next_command`**: The recommended, non-destructive command to run next (e.g., a dry-run audit).
*   **`smoke_command`**: The final validation command to confirm the fix/feature works in a controlled environment.
*   **`report_path`**: A path where the detailed report of this skill's execution should be stored.
## 🧠 ACE/Atlas Context Editor Gate (Mandatory)

This gate is the canonical process for synthesizing a final, actionable context packet from raw retrieval hits. It ensures that the LLM receives a single, highly curated, and versioned source of truth, minimizing token waste and hallucination.

### The 5-Step Data Flow
1. **Raw Retrieval**: Initial search (e.g., `trace_kag_search`) returns raw, un-ranked hits.
2. **Filtering & Scoring**: Hits are filtered by relevance, authority, and recency, generating a preliminary score.
3. **Context Assembly**: The system uses `atlas-tools_build_agentic_rag_context` to select the top-K, most relevant chunks.
4. **Canonicalization**: The selected chunks are passed through a final scoring/reranking layer (e.g., `turbovec_turbovec_rank_chunks`) to determine the single best source of truth.
5. **Injection**: The final, compressed context is written to Redis (`ace:packet:{runId}`) for the current session's use.

### Required Data Structures
*   **`sourceRef`**: The primary identifier, linking the context to the source file/chunk.
*   **`ConceptID`**: The high-level topic or feature ID that anchors the context.
*   **`ConfidenceScore`**: A calculated score (0.0 to 1.0) representing the system's certainty in the provided context.
*   **`ContextBlob`**: The final, serialized, and token-budgeted context payload.

**Actionable Rule**: Never pass raw search results directly to the LLM. Always pass the result of the final, canonicalized context injection.

Example:
```yaml
likely_cause: The existing context building process lacked a centralized, versioned contract for defining new features and their associated data sources.
evidence: [intent:qdrant_payload_enrichment, file:scripts/atlas/build-implementation-intent-aliases.mjs]
patch_targets: ["src/lib/server/db/qdrant-sync.ts"]
safe_next_command: "npm run atlas:concept-evidence:backfill:dry"
smoke_command: "npm run atlas:concept-evidence:audit"
report_path: "docs/reports/atlas_context_build_run_{timestamp}.json"
do_not_do: ["src/lib/server/db/qdrant-sync.ts"]
```

## Repo map
- `sveltekit-frontend/` — main app root
...

## Repo map
- `sveltekit-frontend/` — main app root
...
- `services/` — standalone Go/Python services
- `docker/` — compose/runtime stacks
- `drizzle/` — migrations and schema assets
- `scripts/` — repo-level tooling
- `docs/` — architecture docs and reports

## Commands

```bash
cd sveltekit-frontend && npm ci
cd sveltekit-frontend && npm run dev
cd sveltekit-frontend && npm run check
cd sveltekit-frontend && npm run test:run
npm run audit:contracts          # full 8-layer audit
npm run audit:drizzle            # Drizzle ↔ Postgres drift
npm run services:health          # TCP health gate
```

## Engram-only mode (current)

```
ENGRAM_ONLY=true  REDIS_ENABLED=false  QDRANT_ENABLED=false
NEO4J_ENABLED=false  GRAPHIFY_STARTUP_ENABLED=false
```

Startup does NOT require Redis/Qdrant/Neo4j. Engram MCP at `:8792` is the only required memory lane.

## Gotchas

- User IDs are mixed across tables; check schema before querying.
- SeaweedFS is the primary S3 gateway; ignore MinIO stubs.
- UnoCSS is the styling baseline; do not assume default Tailwind classes exist.
- `drizzle/meta/` must contain only JSON snapshot/journal files — no `.md` or `.txt`.
- Sidecar migrations in `drizzle/` that are not in `_journal.json` must be listed in `drizzle/sidecar-migrations.json`.

## Parent Atlas verified retrieval and analysis fabric (2026-08-29)

The repository contains several analysis representations, but they share one authority order:

```text
source bytes / workspace revision
        ↓
8095 Tree-sitter CST + AST-grep structural observations
        ↓
canonical identity, source/content revisions, packet/chunk bindings
        ↓
PostgreSQL 18 canonical eligibility and evidence state
        ↓
PostgreSQL planner (FTS/GIN/B-tree/pgvector; AIO and bitmap scans are planner behavior)
        ↓
semantic_768 / EmbeddingGemma representation
        ↓
rebuildable projections: Qdrant, Go Retrieval, GPU/topology artifacts
        ↓
SearchRuntime lane normalization and single fusion owner
        ↓
ACE cards → ContextManifest → bounded agent/DAG execution
```

### Ownership rules

- **PostgreSQL 18** owns packet/chunk identity, source and workspace revisions, eligibility, evidence, feature metadata, FTS state, and canonical `content_embedding_768` rows.
- **PostgreSQL AIO/bitmap scans** are execution-plan optimizations. Do not create an application “AIO bitmap” abstraction or require a particular scan type for correctness; record `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` when performance is being evaluated.
- **8095** owns Tree-sitter CST/AST observations, AST-grep structural matches, bounded NLP/extraction observations, and exact source spans. It does not own CandidateOrdinal, canonical ontology promotion, or GPU execution.
- **Go Retrieval** is a read-only retrieval executor. It may query PostgreSQL, pgvector, Qdrant, cache, and the embedding service, and it may stream raw evidence/chunks. It must return revision/identity metadata and must not become the canonical writer or final RRF owner.
- **Qdrant** is a rebuildable retrieval projection. Qdrant point IDs are projection IDs; they are never packet identity, source identity, or CandidateOrdinal. The logical `semantic_768` vector is stored under the Qdrant vector key `content`.
- **SearchRuntime** owns cross-executor normalization, same-lane deduplication, and production fusion/RRF. Multiple executors for one logical lane produce one vote.
- **8098** is the WSL2/Linux RAPIDS/cuVS/cuGraph executor lane. It is not a canonical store. Native-Windows TensorRT/LibTorch experiments are a separate lane. Current fixture ABI proofs do not imply that the live RAPIDS environment is installed or reachable.
- **Neo4j/cuGraph/topology** are derived structural traversal and routing projections. SOM, latent, manifold, PageRank, and graph coordinates cannot create identity or an additional retrieval vote.

### Ornith, adapters, and agentic memory boundary

- **Ornith** is the active synthesis and tool-use model served by the live llama-server endpoint. Resolve its model ID from `/v1/models` or the environment-backed model resolver; do not treat a hard-coded Gemma4 name as the active model authority. The current workstation runtime reports `ornith-1.5-9b`.
- **Gemma4 lineage** describes the base/model family relationship, not a second active embedding or synthesis owner. The canonical dense embedding contract remains `EmbeddingGemma` → `semantic_768`; Ornith is not the embedding writer.
- **Legal adapters and QLoRA merges** are future, revisioned artifacts. A legal/domain adapter may be proposed, evaluated, and merged only under a new model/adapter/parameter revision with immutable checksums, held-out evaluation, replay evidence, rollback metadata, and an explicit promotion receipt. Do not imply that an adapter is merged merely because it is available on disk.
- **BitFrost/Valkey** caches revision- and checksum-addressed manifests, candidate lists, ACE cards, residency descriptors, and context plans. It must not become canonical storage for source truth, hidden thoughts, KV cache, tensors, or unvalidated adapter state.
- **HyperGraphRAG and ontology links** consume evidence-qualified, revision-bound tuples and graph projections. Domain classification can route a request and choose bounded context/memory budgets, but it cannot promote identity, invent graph revisions, or add a retrieval vote.
- **Agentic error fixing** must follow `verified claim → KernelDagCandidate → schema/lineage/authorization admission → bounded execution → independent readback`. A verified claim is not authorization to mutate.
- **Memory swaps** are bounded residency/context decisions keyed by model, adapter, candidate snapshot, representation, graph/feature revisions, and artifact checksums. Swap only approved descriptors or evidence cards; never persist hidden reasoning or silently replace canonical evidence.

### Structural and domain analysis

Use the existing providers in this order:

```text
Tree-sitter CST
  → exact node type, parent/field path, byte range, syntax facts
AST-grep
  → structural patterns, metavariables, syntax-aware matches
compiler/LSP/Graphify
  → symbols, definitions, references, typed/relationship observations
.okf YAML/JSON manifests
  → validated rule/artifact inputs, never direct executable authority
LangExtract/Ornith
  → structured proposals and grounded text spans, never invented byte identity
```

`.okf`, YAML, and JSON artifacts must pass schema validation, semantic validation, canonical serialization, and checksum generation before use. Large JSONL/NDJSON or Arrow IPC streams may be parsed in bounded batches; parsing/transport does not promote identity.

### Embedding and chunk-stream contract

Embed only after the canonical source/chunk eligibility join is established:

```text
exact source/chunk binding
  → CandidateOrdinalMapV1
  → canonical semantic_768 vector
  → vector/revision receipt
  → Qdrant or GPU projection
```

The canonical dense owner is `codebase_chunk_index.content_embedding_768` with `semantic_768`, 768 dimensions, and cosine distance. Qdrant and GPU vectors must be independently reconciled to that owner before promotion. Never fill a missing candidate with aliases, fuzzy paths, synthetic revisions, legacy 384 vectors, or an unrelated Qdrant point.

Go Retrieval streaming is progressive delivery, not authority transfer:

```text
StreamCodebase / StreamEvidence
  → bounded raw lane events
  → canonical identity/revision normalization
  → ACE eligibility and selection
  → ContextManifest
```

Every streamed event must remain bounded, revision-qualified where applicable, and safe to discard/replay. Do not pass raw streamed results directly to an LLM. Do not treat chunk order, Qdrant point order, or transport offsets as CandidateOrdinal.

### Current proof status

- Structural CST/AST and AST-grep provider surfaces: present; promotion still requires exact source/revision evidence.
- `.okf` documentation/analysis pipeline: present with schema-driven receipts; derived outputs remain non-canonical.
- PostgreSQL `semantic_768` ↔ Qdrant `content` parity: frozen 15-candidate proof passed after projection repair.
- CandidateFeatureMatrix manifest and graph A/B replay: proven for 15 candidates; graph features remain non-promotional.
- CandidateOrdinal executor ABI: fixture-proven; live 8098/cuVS ABI remains open until a WSL RAPIDS interpreter with `torch` and `cuvs` is actually reachable.
- Full-corpus source lineage, 128/768 scaling, learned sparse/classifier lanes, graph fan-out, and production mutation paths remain separate gates.

## Reference docs (load on demand, not at startup)

- `docs/architecture/` — layer boundaries, retrieval lanes, trace/karpathy rules
- `docs/ai-os/` — OpenCode context window, MCP atlas, skill routing
- `memory/` — architecture references, session history
- `CLAUDE.md` — full project instructions (loaded separately)

## Retrieval Abstraction Boundary (ENFORCED)

Retrieval boundary files:
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`

**Retrieval policy** (in order):
1. Filter first (payload conditions, topo_class, cluster prefilter)
2. Search compressed approximate semantic geometry (Qdrant ANN / quantized traversal)
3. Exact-rescore only the bounded candidate set when quality or telemetry requires it

**cuVS/CAGRA rule**: cuVS is an optional acceleration lane behind the same `SearchBackend<T>` interface (`search-backend.ts`). It is NOT the canonical store. Callers must never depend on Qdrant-specific client details directly — always go through `QdrantSearchBackend` or a conforming `SearchBackend` implementation.

**Canonical truth** remains: Postgres packet/ledger tables, `sourceRef` / cold-original provenance, and Parent Atlas joins. Qdrant is a mirror, not truth.

## LangGraph Boundary (ENFORCED)

LangGraph is **optional orchestration and testing only**.

**Allowed:**
- Validation workflows, planning graphs, subagent sequencing
- Ornith via llama-server / function-tool calling, dry-run reasoning

**Not allowed — hard block:**
- Direct writes to Postgres, Qdrant, Redis, Neo4j, DuckDB, or SeaweedFS from any graph node
- Archive, move, or delete operations

Durable mutations MUST go through: promotion queue → schema gates → validation reports → bounded apply scripts.
