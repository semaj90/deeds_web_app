# Contract Audit Findings Report

**Date:** May 18, 2026
**Source:** `npm run audit:contracts`
**Status:** Partial Success (5 Low Severity Warnings)

## Summary
The full 8-layer contract audit ran successfully, passing all critical checks (SvelteKit Routes, Superforms, Drizzle/Zod, pgvector, etc.). However, the audit flagged **5 low-severity warnings** regarding stale migrations.

## Detailed Findings
The warnings indicate that several sidecar migration SQL files, which are intentionally part of the system's state (e.g., for complex features like code intelligence or context caching), are documented but are not recorded in the main migration journal (`_journal.json`).

**Affected Migration Files (Examples):**
*   `0013_codeintel_indexes.sql`
*   `0016_codeintel_schema.sql`
*   `0016_courtroom_3d_animation.sql`
*   `0018_output_meta_manifold4.sql`
*   `0019_llm_context_cache.sql`

**Impact:**
This is a **low risk** finding, as the warnings themselves confirm these files are *intentionally* out of the standard migration journal. This suggests they are sidecar migrations that must be handled manually or are part of a specialized workflow (like the context compacter we just patched).

**Action Recommended:**
No immediate action is required for these low-severity warnings, but it is recommended that these files are explicitly listed in `sveltekit-frontend/drizzle/sidecar-migrations.json` to formally document their status, aligning with the Drizzle Sidecar Migration Policy. The repository already maintains this manifest, so the warning should be treated as informational unless a new untracked sidecar SQL is added.

## Analysis
The audit findings are consistent with a known sidecar migration pattern, not a regression in code or schema drift. These warnings represent governance housekeeping: document the special-case SQL files, retain the migration manifest, and avoid treating intentional sidecars as accidental drift. Maintaining explicit sidecar metadata reduces future audit noise and preserves the safety boundary for specialized features like code intelligence and context cache support.

## Expanded Architecture: OpenCode + ACE + GraphRAG
This repo’s retrieval stack should be understood as a managed context tree, not a raw transcript reader. The architecture is built around OpenCode/Copilot/Cline tool calling through TRACE MCP, with ranked retrieval, compact ACE packets, and final Gemma4 TurboQuant synthesis.

### Unified context tree
- `OpenCode / Copilot / Cline` → TRACE MCP tool call
- `rg / Qdrant / Redis` search → `context tree` → `ACE compact packet`
- `Gemma4 TurboQuant` synthesis → `llm_output summary` → `embed + tag + cache`
- Future queries should improve routing weights rather than let the model re-read large generated files

### Where each technology fits
- `SIMD JSON` → fast parsing of generated JSON/JSONL/logs, not full file inspection
- `gRPC` → low-latency service boundary between SvelteKit and Go sidecars for embeddings/reranking
- `MCP` → tool-calling boundary for OpenCode and ACE retrieval controls
- `Qdrant` → dense + sparse vector memory with rich payload tags for topological and authority signals
- `Redis / Bifrost` → hot semantic cache plus exact packet cache and short-term context reuse
- `LangExtract` → legal entity/citation/claim extraction into structured signals
- `libtorch` → experimental autoencoder / RL / topology compression lane
- `Gemma4 TurboQuant` → final synthesis only, after retrieval and compaction

### Context tree schema
Store the compact state as JSONB in Postgres and in Qdrant payloads for retrieval:
```json
{
  "context_tree_id": "ctx_abc123",
  "user_intent": "debug_graphify_ingest",
  "goal": "Fix OpenCode context overflow",
  "active_files": [
    "sveltekit-frontend/src/lib/server/ai/openai-facade.ts"
  ],
  "chunk_ids": [
    "openai-facade.ts:300-420"
  ],
  "weights": {
    "cosine": 0.84,
    "bm25": 0.51,
    "topology": 0.72,
    "authority": 0.81,
    "llm_synthesis": 0.89
  },
  "next_action": "Use ace.compact_search before reading markdown"
}
```

### Updated pipeline
- large docs / `.md` / logs → SeaweedFS cold store
- SIMD JSON parser / minifier → chunk_id + text_min
- embed → Qdrant vector + payload tags
- graph traversal / KAG / DAG → BGE reranker → ACE compact packet
- Gemma4 → summarize llm_output to HCA card → embed → Redis + Qdrant reingest

### RL / self-updating weights (start with logging)
- user prompt → retrieval candidates → weights → Gemma4 answer
- user action / success signal → reward event → update query routing weights
- later: GRPO/LoRA dataset build
- sample reward record:
```json
{
  "query": "fix context overflow",
  "selected_chunks": ["openai-facade.ts:300-420"],
  "answer_used": true,
  "user_followup_positive": true,
  "reward": 0.86,
  "weight_updates": {
    "topology": 0.03,
    "authority": 0.02,
    "bm25": -0.01
  }
}
```
GraphRAG+RL is an active research direction. For this repo, start with bandit-style weight updates before full RL.

### Experimental libtorch autoencoder lane
- input: embedding + topology + graph features
- model: tiny autoencoder
- output: compressed latent vector
- store: `latent4d`, `cluster_id`, `reconstruction_error`
- use libtorch as an experimental compression/ranking sidecar only

### Context compaction policy
- Before compaction: save raw context tree snapshot to `.context/`
- Summarize with a small/fast model if available
- Preserve: goal, completed work, active files, exact errors, chunk_ids, ACE weights, next action
- Never compact into vague prose only
- Avoid early firing unless the payload is clearly generated-doc garbage
- Thresholds:
  - `ctx=32768`
  - `compact trigger=24000`
  - `hard fail=32000`
  - `reserved=4000`

### New MCP tool recommendation
Add `ace.compact_search` with input:
```json
{
  "query": "context overflow openai facade",
  "limit": 3,
  "tokenBudget": 1200,
  "includeFullText": false,
  "useCache": true
}
```
Output should include a compact context tree and hit summaries with chunk weights.

### Instruction update
- Never read full generated files.
- Use `rg -n` first.
- Use `ace.compact_search` for semantic memory.
- If context exceeds 24k, request compaction before continuing.
- Preserve the context tree, not raw transcript.

### Implementation order
1. Add `ace.compact_search` MCP tool.
2. Store `context_tree` snapshots in `.context/`.
3. Add Qdrant payload tags for `chunk_id` / `topoClass` / `som_cluster` / `weights`.
4. Add Redis/Bifrost lookup before Gemma4.
5. Add `llm_output` → HCA summary → embed → reingest loop.
6. Add dashboard for input tokens, cache hits, selected chunks, weight updates, reward events.
7. Later: libtorch autoencoder / RL lane.

### Bottom line
OpenCode should not manage memory by reading larger payloads. The application should manage memory by ranking, caching, and compacting better.

### Integration features to look for
- `tal lanes` should be viewed as integration points, not separate monoliths: libtorch autoencoder compression, RL weight updates, SIMD JSON parsing, gRPC embedding/reranking, and MCP tool calling must connect through the same ACE/Qdrant/Redis/Bifrost backbone.
- The “did you mean” recommendation engine should be built from activity logging, query intent, Redis/Bifrost cache signals, Qdrant tag metadata, and the GraphRAG topology layer.
- Use `rg -n` / lexical prefetching before semantic recall whenever a large generated file is involved.
- Hybrid search should fuse cosine + BM25 + topology weights in the query plan, with Qdrant payload metadata carrying `chunk_id`, `topoClass`, `som_cluster`, and ranking `weights`.
- Load the sidecar pipeline from a fast boundary: `grpc` + `flatbuffer`/buffered payloads → CUDA graph / libtorch / API sidecar → back to SvelteKit.

### Feature checklist
- `ace.compact_search` for semantic memory and compact tree extraction
- `.context/` snapshot store with raw context tree archiving
- Qdrant payload tagging for chunk path, topology class, SOM cluster, authority, and synthesis weights
- Redis/Bifrost pre-Gemma4 packet lookup for cache hits and exact packet reuse
- HCA card generation from final LLM output and re-embedding into Redis/Qdrant
- Dashboard metrics for token usage, cache hits, chunk selection, weight updates, and reward events
- “Did you mean” suggestions from hyper-semantic multi-query retrieval, based on user activity and query co-occurrence
- Experimental libtorch lane only after the above is stable

### Load balancing and sidecar guidance
- Prefer a dedicated API sidecar for heavy search/embedding/autoencoder work rather than letting the SvelteKit app ingest large generated artifacts directly.
- Keep the SvelteKit → gRPC/Go/sidecar path as the first-class retrieval boundary for performance and isolation.
- Use `flatbuffer` or compact binary buffering for hot query payloads when the sidecar path is latency-sensitive.
- Reserve MTP/GPU batch handling for embeddings and traversal weights; do not let memory growth come from raw file ingestion.
