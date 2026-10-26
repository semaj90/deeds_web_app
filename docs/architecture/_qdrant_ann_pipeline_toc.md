# Qdrant ANN Projection Pipeline (gRPC + REST) — Index

**Status**: index only; no canonical authority | **Date**: 2026-10-17 | **Tracking**: `openspec/changes/legal-corpus-california-codes/tasks.md` (QDRANT-GRPC-01, REPR-MANIFEST-01, KMEANS-REBUILD-01)

---

## TL;DR

Postgres is truth; Qdrant is a rebuildable projection. gRPC (`:6334`) is open and the client libraries (`@qdrant/js-client-grpc`, `@grpc/grpc-js`) are already installed. The gRPC client previously supported `scroll` and `setPayload` only; `upsertPoints` (named vector `content`, 768-d) was added with a fail-closed request builder. It has **not** been sent to a live collection.

## Pipeline stages and owners

| # | Stage | Owner (existing — do not duplicate) | Transport | State |
|---|---|---|---|---|
| 1 | Canonical vectors + identity | PostgreSQL `codebase_chunk_index.content_embedding_768` / `content_embedding`, `atlas_packets` | SQL | recipe not frozen (raw vs task-prefix) |
| 2 | Recipe / representation manifest | REPR-MANIFEST-01 | — | NOT_PROVEN (not built) |
| 3 | Coarse partition | `atlas_cluster_models` id 3 (K=256), writer `sveltekit-frontend/scripts/atlas/kmeans-chunk-cluster.py` | SQL | STALE vs current vectors (81.25% replay) |
| 4 | Projection build + gates | `scripts/atlas/apply-lineage-qdrant-projection-from-postgres-v1.mjs`, `sveltekit-frontend/scripts/atlas/atlas-qdrant-projection-worker.mjs` | REST | WIRED; lineage-gated |
| 5 | Payload update | `scripts/atlas/upsert-qdrant-packet-payload.mjs` (`--dry-run` / `--apply`) | gRPC client (`qdrant-grpc-payload-client.mjs`) | WIRED |
| 6 | Vector upsert over gRPC | `buildUpsertPointsRequest` / `upsertPoints` in `qdrant-grpc-payload-client.mjs` | gRPC | CREATED; 9/9 offline tests; not sent to Qdrant |
| 7 | Readback / parity | `audit-qdrant-*` scripts, `audit-qdrant-representation-parity-v1.mjs` | REST | exists; rerun after any write |
| 8 | Retrieval | `retrieval/search-runtime.ts::fuseSearchRuntimeCandidates` (single RRF owner) | — | one semantic lane = one vote |
| 9 | Context | `ace-packet-v3-context-manifest-bridge-v1.ts` → PromptPlanV1 → Ornith `:8090` | — | proven on a 200-packet cohort; stale for files changed since |

## Rules

- Qdrant point IDs are projection IDs; never packet, source or ordinal identity. Join back to Postgres by `packet_key` + `source_ref`.
- Named vector `content` = `semantic_768`; exactly 768 finite numbers; payload must carry `packet_key` and `source_ref` (the request builder rejects otherwise).
- Executors (Qdrant HNSW, exact cuVS, CAGRA) are alternatives inside one lane: no extra RRF votes.
- Do not mix raw and task-prefix vectors in one collection or cluster model; do not write before the recipe decision.
- Qdrant's ANN index is HNSW; treat DiskANN-style indexes as challengers to verify, not as an existing Qdrant index type.
- Batches go through the projection owner's gated apply path; building a gRPC request is not authorization to send it.

## Protobuf boundary

- Qdrant's gRPC message schemas are supplied by the installed `@qdrant/js-client-grpc` package and imported by `scripts/atlas/qdrant-grpc-payload-client.mjs`; there is no repository-owned Qdrant `.proto` to edit for `UpsertPoints`.
- `proto/active/retrieval.proto` is Parent Atlas' own retrieval-service contract, not Qdrant's wire contract. Its `packet_key`, `source_ref`, `source_revision`, `workspace_revision`, and `representation_id` fields describe application-level evidence/identity and do not make the Qdrant point ID canonical.
- Keep Qdrant SDK messages, Parent Atlas retrieval protobufs, and generated Go/TypeScript bindings as distinct protocol surfaces. Do not copy Qdrant messages into a new local proto or treat the presence of a local vector-service proto as a Qdrant caller.
- The current gRPC adapter's `upsertPoints` is not called by the existing payload-update path; that caller uses `findPointIds` and `setPayload`. The projection worker still uses REST. Any transport migration must happen inside that existing owner and preserve its identity/revision gates.

## End-to-end Parent Atlas path and readiness

This is the intended composition of existing owners, not a claim that the whole live pipeline is wired or production-ready.

| Order | Stage | Owner / artifact | Admission rule | Current state |
|---|---|---|---|---|
| 0 | Source and identity | PostgreSQL packets/chunks + source bindings | Exact packet/source identity; do not infer identity from paths, point IDs, or ordinals | Existing records have unresolved lineage cohorts; use the owning admission planner |
| 1 | Structural evidence | 8095 Tree-sitter / AST-grep, then canonical packet/chunk join | Exact source bytes and spans; parser observations remain proposals until joined | Provider available; this does not establish complete lineage |
| 2 | Taxonomy and labeling | `.okf/domains/atlas-domain-taxonomy.yaml`, review draft v2, existing domain-classifier evaluator | Taxonomy YAML is a noncanonical vocabulary; only human `reviewedGroup` is gold | 520 review candidates, zero gold labels; classifier trust floor unmet |
| 3 | Semantic recipe | PostgreSQL `semantic_768` owner + `REPR-MANIFEST-01` | Freeze model, input recipe, dimension, normalization, row identity, and checksum | Raw/task-prefix recipe and representation manifest are not reconciled |
| 4 | Coarse partition | Existing KMeans owner (`kmeans-chunk-cluster.py`); optional native/CUDA bridge | Fit on one frozen recipe; deterministic replay and held-out stability before use | Stored K=256 assignments replay at 81.25%; do not reuse or extend them |
| 5 | Exact KNN oracle | Canonical vectors + deterministic exact Top-K evaluator | Freeze query/candidate cohort; calculate Recall@10 before ANN comparison | `SEARCH-GOLDEN-01` remains open |
| 6 | ANN projection | Existing Qdrant projection owner; gRPC request builder is an adapter | Scratch collection first; identity/revision payload, independent readback and parity; never treat Qdrant as canonical | gRPC request builder is tested offline but not integrated into the projection owner's gated apply path or sent live |
| 7 | Candidate fusion | `SearchRuntime::fuseSearchRuntimeCandidates` | Qdrant/cuVS/CAGRA are executor alternatives within one semantic lane and one RRF vote | Owner exists; production-qualified candidate cohort remains gated |
| 8 | Graph expansion | Qualified GraphV2/hypergraph readers | Expand only revision-qualified edges; requalify hydrated evidence before final Top-K | Live admitted N-ary code-fact cohort and final Top-K proof remain open |
| 9 | Context and synthesis | ACE / ContextManifest → PromptPlan → Ornith | Admit only qualified evidence with stable identity, checksum, and token-budget receipt | Separate end-to-end live proof is still required |
| 10 | Learning loop | Reviewed labels and accepted/checked outcomes → offline challenger | Keep human label truth separate from agent reward; held-out evaluation and explicit promotion | No classifier or ranker promotion is authorized |

### Do not conflate these lanes

- Keyword corpus terms, taxonomy tags, and domain labels are not interchangeable. The checked-in `.okf` keyword corpus has 90 terms and is reference-only; the larger `ontology_keywords` database inventory is a separate owner and needs its own current census before use.
- KMeans proposes coarse partitions. KNN/ANN retrieves candidates. SearchRuntime fuses normalized candidates. None of those establishes label correctness or canonical identity.
- CUDA GEMM, cuVS/CAGRA, SIMDJSON, and TensorRT are compute/transport executors. They do not bypass source, representation, reviewer, or projection admission gates.
- Keep the CPU exact oracle first. Schedule GPU work only through the existing GPU lease/headroom owner; never overlap an authorized GPU run with the `:8090` model owner.

### Safe next gate

1. Finish the human review of the 520-row candidate sheet and export reviewer decisions without changing the source draft.
2. Run the existing read-only classifier evaluator; require at least 200 gold rows and 30 per target class after non-gold outcomes are excluded.
3. Resolve taxonomy crosswalk decisions and the selected cohort's canonical packet/source lineage through the existing admission owner.
4. Freeze the embedding recipe and representation manifest, then refit/replay KMeans and establish exact KNN Top-K ground truth.
5. Only after those gates, wire the gRPC adapter through the existing Qdrant projection owner for a scratch-collection write/readback and Recall@10 comparison. Do not upsert into the production collection from this document or the generic client directly.

## Verification

- `node --test scripts/atlas/qdrant-grpc-upsert-request.test.mjs` — 9/9 (no network).
- `:6333` and `:6334` TCP open (checked 2026-10-17); a live gRPC upsert is unproven.

## Next steps

- `EMB-RECIPE-01` → `KMEANS-REBUILD-01` → `REPR-MANIFEST-01`, then a dry-run gRPC upsert into a scratch collection with scroll readback and Recall@10 against exact KNN (`SEARCH-GOLDEN-01`).
- After adding this file run `npm run atlas:docs:toc:v2` and `npm run atlas:docs:toc:check:v2` (not run here) so `docs/MASTER-TOC-v2.md` links it.

## Related

[`_taxonomy_oak_graphrag_index.md`](./_taxonomy_oak_graphrag_index.md) · [`_cuda_rtx_toc.md`](./_cuda_rtx_toc.md) · [`ARCH-TOC-v2.md`](./ARCH-TOC-v2.md)
