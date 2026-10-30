# Parent Atlas / Legal-AI Agent Guide v2

This file is an additive workflow guide for repository indexing, retrieval ranking, topology/GraphRAG, and representation-training work. It supplements the root `AGENTS.md`; it does not replace its security, ownership, migration, archival, or framework rules. If instructions conflict, follow the stricter root or directory-scoped instruction.

## Mission

Build a production-hardened workstation and legal-AI retrieval system by indexing a deliberately selected, revision-qualified code corpus—not every filesystem entry—and by preserving a traceable chain from source bytes to ranked result. PostgreSQL 18 is canonical for source/chunk identity, eligibility, and approved embedding rows. Qdrant, graph stores, caches, and GPU artifacts are derived projections.

## Authority and evidence

Keep these concepts distinct and label findings as `PROVEN`, `OBSERVED`, `UNKNOWN`, or `BLOCKED`:

1. **Source identity:** repository/workspace revision, tracked source reference, and source digest.
2. **Chunk identity:** canonical chunk/packet key, exact source span, and chunk-content digest.
3. **Embedding identity:** verified model artifact, tokenizer, input recipe, representation revision, dimension, normalization, and vector checksum.
4. **Projection identity:** stable Qdrant point ID and exact PostgreSQL owner, plus payload/vector readback parity.
5. **Retrieval evidence:** authorized candidate set, lane, original source rank/score semantics, deduplication, fusion, rerank signals, and final bounded result.

A matching path, packet key, model label, checksum-shaped string, or point count is not sufficient by itself to establish canonical identity, freshness, or producer provenance. Missing lineage remains missing; never infer or backfill it from filenames, tags, timestamps, or similarity.

## Index scope: eligible source before embedding

- Never embed a raw filesystem census. Begin with the existing scanner roots, ignore rules, extension allowlist, and tracked-worktree revision.
- Treat the scanner output as candidates, not authorization. Produce a versioned source manifest with one row per path and a reason: `ELIGIBLE_REVIEW`, `EXCLUDED_DEPENDENCY`, `EXCLUDED_GENERATED`, `EXCLUDED_MODEL_OR_DATA`, `EXCLUDED_ARCHIVE`, `UNTRACKED_REVIEW`, or `UNKNOWN`.
- Default exclusions include dependency trees, build outputs, caches, generated reports/indexes, model weights, uploads, snapshots, vendored copies, and duplicate exports. Preserve source documentation, tests, schemas, migrations, service code, and operational configuration for review; do not assume every such file deserves an embedding.
- Record root, path, extension, tracked status, byte size, content digest, owning product (`PARENT_ATLAS`, `LEGAL_AI`, `SHARED`, `UNKNOWN`), and eligibility rule revision. Keep legal case evidence and repository-code indexing as separate authorization/corpus domains.
- Do not remove files or existing vectors because they are excluded from a future indexing plan. Archive/reprojection/deletion decisions require exact ownership, consumer analysis, recovery evidence, and explicit authorization.
- Reuse the existing corpus-policy and indexer owners. Do not introduce a second scanner or writer to avoid an unresolved collection/identity contract.

## Ranking: retrieval Top-K is not corpus selection

Keep three controls separate:

- **Eligibility policy** decides which source files/chunks may enter a corpus.
- **Candidate K** bounds each retrieval lane's candidate pool.
- **Final K** bounds results returned after normalization, deduplication, fusion, and reranking.

Trace the actual caller before changing defaults. `hybridSearch` is the application search path identified by the current codebase; verify current values and callers in source before claiming it is the sole production ranker. Preserve one logical vote per candidate/lane and use the existing single fusion owner. Do not equate Qdrant RRF/DBSF fused scores with cosine similarity or calibrated relevance. Never substitute the query vector for a missing candidate vector. Cosine requires finite, nonzero vectors with compatible verified model, recipe, representation, and dimension; otherwise preserve source rank/fused-score semantics or exclude the invalid signal.

Before changing K, filters, corpus scope, or reranker weights, establish a reviewed query set with expected source spans and revision. Measure at least Recall@K, MRR, nDCG@10, precision of revision-qualified candidates, duplicate rate, p50/p95 latency, fallback/error rate, and per-lane contribution. Separate measured results from unjudged traffic observations. Tune candidate K and final K independently and retain a rollbackable shadow comparison before promotion.

## GraphRAG, feature labels, and topology

- Use GraphRAG/TRACE retrieval for bounded discovery of module/function relationships and candidate evidence. Resolve each returned source to canonical PostgreSQL identity and current source/workspace revision before it can affect ranking or agent context.
- Feature labels and taxonomy IDs are routing/classification evidence, not identity, authorization, relevance labels, or extra retrieval votes. `.okf` and other manifests must pass schema and semantic validation, canonical serialization, and checksum checks before use.
- Topology edges require qualified endpoint identities and a graph snapshot/revision binding. Missing `graph_snapshot_hash`, source revision, or exact endpoint ownership makes topology stale/unqualified; do not silently join by path or display label.
- Graph expansion must be bounded by depth, fan-out, candidate count, and time budget. Report truncation and unavailable lanes explicitly. Do not turn an empty graph lane into fabricated dense hits or silently suppress dense-lane failures.
- Follow the ACE gate in root `AGENTS.md`: raw retrieval is never sent directly to a model. Selected candidates must pass canonicalization, reranking/selection, authorization, and a revision/checksum-bound ContextManifest. Keep ACE fail-closed until independent readback proves the full chain.
- Do not create a parallel OAK/ontology owner for ts-morph or other LSP output. Map structural observations into existing registries as non-identity evidence, retaining exact source spans and tool/parser revisions.

## Feature-envelope summaries and recommendation inputs

- Treat `atlas.feature_envelope.v1` as structured evidence input, not as a completed prose summary or a recommendation. A populated `feature_id`, `domain_class`, or envelope does not prove source freshness, reviewed domain prediction, or useful summary coverage.
- Keep the summary stages distinct: (1) LangExtract produces source-grounded facts/entities and spans; it is not the prose summarizer. (2) A deterministic roll-up may describe validated AST, lexical, graph, ontology, and classification fields from the canonical envelope. (3) Optional Ornith prose is a derived proposal, never canonical evidence.
- Define DAG roll-ups bottom-up: symbol/chunk → packet/file → directory → feature → domain. Each parent must name the exact child summary hashes/revisions and source/workspace snapshot it consumed; any changed child, source revision, envelope, or classifier revision invalidates the parent.
- A summary proposal must carry packet/chunk identity, source and workspace revisions when proven, input-envelope checksum, classification source/revision/confidence, child references, producer/prompt/model revisions when generative, output checksum, and evidence references. Missing lineage stays null/unqualified; do not manufacture a revision to fill coverage.
- Do not key a packet summary by `feature_id` alone; it is not unique. Resolve the existing exact packet/chunk owner and summary destination before writes. The known `atlas_summary_layers` duplicate-key/`ctid` issue makes it unsafe to assume `(packet_key, effective_layer)` is a durable row key.
- Keep summary and recommendation generation proposal-only until the current owner, idempotency key, stale-revision rule, persistence destination, and independent readback are established. Inspect existing summary-envelope and summary-proposal owners before creating a new table, writer, or MCP tool.
- Review `scripts/atlas/generate-feature-todos.mjs` before running its apply mode: the `missing_summary` recommendation currently points at the LangExtract entity-extraction command, so it is not a valid summary action. Do not use that recommendation as authorization to invoke LangExtract or write summaries.

## `ae:train`, low-rank, and accelerator experiments

- Treat autoencoder/SVD/PCA/low-rank training as an experimental representation lane, not a new canonical embedding writer or source of truth. `low_rank.py` is an experiment unless current ownership is independently confirmed.
- Train/evaluate from a frozen, revision-qualified cohort of canonical `semantic_768` PostgreSQL vectors using bounded keyset/cursor batches. Do not load the full corpus into Node/Python memory; do not use lossy Qdrant quantized vectors as training ground truth.
- Pin dataset manifest, source/chunk IDs, model and recipe revisions, dimensions, normalization, train/validation split, random seed, code/environment digest, and output artifact checksum. Prevent chunk/source leakage across evaluation splits.
- Compare against an identity/no-op and CPU reference; report reconstruction error, retrieval Recall@K/MRR/nDCG, ranking agreement, latency, peak RSS/VRAM, and batch size. A lower-dimensional reconstruction is a challenger, not interchangeable with `semantic_768` without a promotion receipt.
- Capability-check the actual runtime before CUDA/cuVS/PyTorch/TensorRT work. Respect the workstation's VRAM budget and active model services. Do not start or stop GPU/model services, launch training, or rebuild native addons without explicit authorization.
- Keep SIMDJSON/CMake/N-API and gRPC/protobuf boundaries intact. Native parsing/transport can reduce overhead but cannot confer identity or admission. Use bounded batches and transferable/raw binary formats only where measured; do not add WASM/N-API/C++ layers without a profiled bottleneck and parity test.
- MessagePack descriptor transport already exists for `ComputeDescriptorV1` (`atlas.compute-descriptor.v1`) with schema validation, logical-JSON checksum verification, and `canonicalAuthority: false`; reuse and test that owner instead of adding a parallel descriptor codec. This transport proof does not prove that a proposed AST FeatureStore or every gRPC/Protobuf boundary is wired to it.
- NES domain LUT encoding exists as a palette/feature helper. AVX2 LUT filtering is not established as an active production path. Treat it as an optional CPU optimization only after profiling shows the filter is a bottleneck; preserve a scalar oracle, identical selection/parity tests, CPU-feature dispatch/fallback, and benchmark evidence. It is never a correctness or identity gate.

## PostgreSQL 18, Drizzle, and schema/index hardening

- PostgreSQL 18 plus pgvector is the database/storage contract; Drizzle is the TypeScript ORM/schema representation. Keep the canonical dense lane at `semantic_768` / `vector(768)`; do not introduce a 384-D fallback.
- Export a read-only schema inventory before proposing consolidation: table/column types and nullability, primary/foreign/unique constraints, indexes and definitions, row/table/index sizes, vector dimensions/population, ORM owner, migration owner, and application/script references. Distinguish live catalog facts from Drizzle declarations and historical migration SQL.
- Do not infer that a table is ORM-owned from a generated schema file. Reconcile active Drizzle exports, migration journal/manual sidecars, live catalog, and readers/writers. Preserve unknown and archival tables until an owner decides their lifecycle.
- Index proposals must prove semantic equivalence, constraint dependencies, name-based operational/script dependencies, and representative query-plan behavior. Do not use `ctid` as durable identity or restore a composite key when duplicates exist.
- PostgreSQL AIO and bitmap scans are planner/executor behavior, not an application abstraction. Use `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` for authorized representative performance tests; never require a particular plan node for correctness.
- Prepare numbered, additive, rollback-tested migration artifacts. Use the project's migration workflow, never `drizzle-kit push` on live data. `DROP INDEX CONCURRENTLY` must be run outside transaction blocks. Production DDL, backfills, index drops, and writes require explicit approval and a preflight/readback plan.
- For any future vector write, use bounded batches, exact canonical IDs, revision/representation checks, idempotency, and unchanged-value guards. Avoid speculative batch sizes or session memory settings until measured on the actual PostgreSQL 18 setup.

## Docker and shared image layers

- Inventory running/stopped containers, exact image IDs/digests, Compose project/service/profile, mounts, health, resource use, and image/volume/build-cache accounting. Never match usage by mutable image tag alone; compare immutable image IDs/digests and all container references.
- Shared layers are content-addressed and deduplicated by Docker; “merge containers” is not a safe disk strategy. Consolidate services only when ownership, dependency graph, independent scaling, failure isolation, security, and persistence needs support it. A shared base image can reduce duplicated layers without combining runtime services, but verify build context and resulting layer reuse.
- Separate images, writable container layers, named/anonymous volumes, snapshots, build cache, and Docker Desktop's virtual disk. `docker system df` apparent/reclaimable figures do not guarantee Windows host-space recovery; compare allocated bytes inside mounts with Docker/host accounting.
- Identify unused images by immutable IDs and check Compose/profile, scripts, CI, and rollback references. A stopped container still pins its image. Orphan volumes and snapshots are protected data until individually inventoried and recovery-tested.
- Never run prune, remove images/volumes, stop services, move snapshots, compact VHDX, or alter Compose as part of an audit. Present exact candidates, risks, expected reclaim, and rollback/rebuild path for separate approval.

## Dependency and module ownership map

For each proposed feature, trace a compact caller/owner map before adding libraries or services:

`entry point → exported function/module → callers → data contract → canonical owner → projection/consumer → tests/evidence`

Record package and runtime versions from lockfiles/images, not assumptions. Reuse existing providers (Tree-sitter, AST-grep, LSP/Graphify, PostgreSQL, Qdrant, TRACE/Atlas, LangExtract) where their contract fits. Do not add overlapping frameworks or a second ranker, graph, ontology, queue, or embedding writer without an explicit gap and migration plan. MCP tools may discover bounded context or format recommendations; they are not automatically the application ranker or authority. Call only tools actually available and authorized in the current session, and never use a mutating tool for a read-only audit.

## Required implementation and evidence gates

1. **Inventory:** read-only owner/caller/dependency map and versioned source-eligibility proposal.
2. **Contract:** typed inputs/outputs, authority, revisions, failure behavior, bounds, and idempotency defined; no parallel canonical owner.
3. **Unit/fixture proof:** exact identity, stale/missing/conflicting lineage, invalid vectors, limits, deduplication, failure visibility, and replay tests.
4. **Quality proof:** reviewed retrieval labels and metrics, or explicitly mark quality `UNKNOWN`; performance claims need reproducible workload, warm/cold conditions, resource measurements, and baselines.
5. **Isolated integration:** disposable PostgreSQL/Qdrant or mocks with exact independent readback; never imply live proof from mocks.
6. **Promotion:** explicit approval, preflight, bounded apply, readback, rollback/restore evidence, and receipts. Stop before this gate unless authorized.

For each task report `likely_cause`, `evidence`, `patch_targets`, `safe_next_command`, `smoke_command`, and `report_path`. State whether operations were read-only, fixture-only, isolated integration, or live. Include exact test counts and unresolved blockers. Do not claim “production-ready” from source inspection, a health endpoint, a mocked test, or an unreviewed `[x]` task alone.
