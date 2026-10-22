# Parent Atlas Recommendation Control-Plane Inventory

Captured 2026-10-21. This is a bounded ownership and evidence inventory, not a claim of end-to-end production readiness. Existing implementations are preserved; none were removed or consolidated.

## Baseline and audit scope

- Git baseline: `3376feb172cdb41c86c764f6c6cbcb153f199889`; working tree was already modified. Baseline metadata and input checksums: `.tmp/atlas/recommendation-control-plane-baseline-20261021.json`.
- Baseline was captured before running gates. The repository-wide index refresh was not run: `sveltekit-frontend/scripts/index-codebase-fast.mjs` can write Valkey cache/checkpoint state and its probe files. The required canonical graph is stale, so graph-dependent G1–G55 deep-audit results are **BLOCKED**, not inferred from an older graph.
- No GPU jobs, training, migrations, canonical database writes, Qdrant writes, Valkey writes, ACE injection, or Graphify promotion were performed. MCP `tools/list` is a read-only discovery call; no tool was invoked.
- Evidence levels used here: **PRESENT** (file/schema exists), **WIRED** (a caller reaches it), **RUNTIME-OBSERVED** (bounded live call/read), **PROVEN** (specific contract gate passed), **PRODUCTION-READY** (end-to-end operational, lineage, authorization, monitoring, rollback and independent readback all proven). These statuses are not interchangeable.

## Focused audit gates

| Gate | Result | Evidence and limit |
|---|---|---|
| G56 adversarial fixtures | `ADVERSARIAL_FIXTURES_PROVEN` | 16/16 probes passed, including deliberate-broken-probe self-tests. Receipt: `.tmp/atlas/gan-adversarial-proof-v1-20261021-recommendation-audit-2349.json`. Fixture proof only. |
| G57 live read-only census | `LIVE_READ_ONLY_PROVEN` | 61,718 PostgreSQL rows read in the runner's read-only transaction; 0 writes; 5 hard source-ref failures; legacy schema columns are absent. Receipt: `docs/reports/gan-readonly-live-proof-v1-20261021T235135Z.json`. The explicit lineage receipt covers 1,059 chunks from a September snapshot and reports semantic embeddings missing; it is not current full-corpus lineage proof. |
| G58 recommendation outcome contract parity | `ZOD_PYDANTIC_PARITY_PROVEN` | Exact contract `atlas.recommendation-outcome-receipt.v1`, version 1; 15 sealed fixtures; TypeScript/Python parity and self-tests passed. Bundle and Python receipt: `.tmp/atlas/contract-parity-v1/20261021-recommendation-audit-2349/`. This proves schema parity, not a production learning loop. |
| G59 index freshness | `BLOCKED_STALE_CANONICAL_GRAPH` | Canonical graph mtime 2026-08-30; newer probe 2026-10-21. A probe is not canonical. |
| G60 Valkey namespace census | `LIVE_READ_ONLY` | `SCAN`/`TTL` only: `code:index:*` 85,314 (all TTL-positive); `wiki:note:dir:*` 1,667 (all TTL-positive); `code:ts:*`, `bitfrost:*`, `gpu:*`, and `atlas:centroid:*` each 0. No cache writes. This sampled the named prefixes, not every possible namespace. |
| G61 centroid cache owner | `PARTIAL` | No `atlas:centroid:*` cache keys were found. Canonical ownership was not independently queried from PostgreSQL; no centroids are promoted by this check. |
| G62 DAG-prefill status | `STATIC_ONLY` | Existing prefill helper is present; its OpenSpec has 6 checked and 56 open tasks. A checked task/file is not runtime proof. |
| HLL deep-audit telemetry | `EXACT_SET_RECEIPT_REUSED` | Exact-set (not HyperLogLog) receipt matches the 2026-10-21 graph-probe SHA-256 and reports 6,339 files, 962 server routes, 43 routes without auth, 152 without tests, and 0 body parsers without Zod. A fresh invocation collided with the existing exclusive receipt path (`EEXIST`); the existing receipt was preserved. Receipt: `reports/deep-audit/telemetry/telemetry-2026-10-21-18a98f5a4d.json`. |
| MCP discovery | `RUNTIME_DISCOVERY_OBSERVED` | TRACE `:8788/mcp` returned HTTP 200 and 200 tools with input schemas/descriptions. This does not prove per-tool permissions, effects, execution, idempotency, or production readiness. |

The read-only census used the explicitly named source-ref inventory `docs/reports/source-ref-inventory-v1-20260926T180602Z.json` and lineage readiness receipt `docs/reports/mapreduce-chunk-readiness-v3-20260928T185744Z.json`; no receipt was selected as “latest.”

## Pattern and owner inventory

| Pattern | Existing owner/evidence | Current maturity and boundary |
|---|---|---|
| MCP discovery and invocation | TRACE MCP server and live `tools/list`; tool schemas are discoverable | Discovery is runtime-observed. The live registry has 200 tools, including both read and mutating descriptions. There is no verified, unified manifest here binding capability, schema revision, auth, side effects, idempotency, environment constraints, cost, and evidence requirements. Do not rank from descriptions alone or call tools without an independent eligibility gate. |
| Recommendation ranking | `low-rank-helper-recommender-v1.ts`; `contextual-candidate-ranker-v1.ts` and evidence-bundle compiler | Components are present; earlier caller trace found no non-test caller for the contextual ranker/evidence compiler. Advisory output is not wired into production SearchRuntime and does not authorize execution. |
| Search, ACE, and prefill | SearchRuntime workflow; optional ContextManifest shadow bridge; `retrieval-dag-prefill-lut-v1.ts` | Search path exists. Public search caller does not configure the feature-source resolver needed by the shadow bridge. Prefill functions are present, but full ACE/ContextManifest → Ornith production handoff remains unproven. |
| DAG/FSM orchestration | Existing orchestration and prefill modules; OpenSpec pipeline | Static pieces exist. Dependency-aware execution, cancellation, replay/idempotency, tool authorization, and end-to-end receipts are not proven as one recommendation control plane. |
| Outcome feedback and backpropagation | `atlas.recommendation-outcome-receipt.v1` contract | Contract parity passed. No evidence here of a production outcome collector, reviewed training set, gradient-checked model, calibration, held-out evaluation, or promoted policy/value model. A reward receipt is not itself a model update. |
| HLL | Atlas HLL telemetry client is used by two cache-warming scripts; the deep-audit wrapper uses an in-memory exact-set adapter | Helper and callers exist, but the deep-audit receipt is not an HLL execution. HLL is approximate telemetry only, never an exact taxonomy/corpus census. The current wrapper's exclusive output path collided with an existing receipt, which was preserved. |
| PCA/SVD and low-rank ranking | `python/atlas_compute/rapids_matrix.py`, `representation_compare.py`, existing PCA/SVD OpenSpec | Numerical helpers and earlier bounded comparison artifacts exist. Prior comparison was not source-lineage-qualified and lacked judged retrieval outcomes. No CUDA or training run occurred here; reduced variance is not retrieval utility proof. |
| Centroids/KMeans | Existing CPU/GPU clustering helpers and centroid artifact contracts | Candidate routing/challenger only. G60 found no `atlas:centroid:*` live cache entries; no fresh canonical centroid authority or retrieval-utility evaluation was established. |
| NES LUT | Existing 10-row LUT and multiple palette implementations referenced by OpenSpec | Meaning/owner is unresolved; the table is not canonical (`canonical=false` in prior audit). Do not expand to 256/512 entries, hash-route concepts, or map domains until purpose, byte encoding, collisions, versioning, and authority are approved. |
| PostgreSQL indexing | `.okf/indexes/feature-intelligence.yaml`; PostgreSQL owns identity/evidence; existing SQL and Drizzle owners | Policy is present. No query-specific `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` or index benchmark was run in this audit. Typed identity/revision columns remain authoritative; JSONB indexes do not confer semantic validity. |
| Valkey/cache | Existing BitFrost and Redis clients; G60 live read-only prefix census | Runtime keys were observed in two named prefixes and all had TTLs. This is not a complete key-registry audit; no cache warming, cache writes, KV-state persistence, tensor persistence, or invalidation proof was performed. |
| Semantic ANN and topology | Qdrant HNSW, cuVS/CAGRA and TurboVec references in `docs/architecture/_qdrant_ann_pipeline_toc.md` and `docs/repo-analysis/qdrant-turbovec-alignment.md` | They are distinct candidate executors/projections under one SearchRuntime semantic vote. DiskANN is a challenger, not an established Qdrant index here. TurboVec is documented as CPU/SIMD ANN; no new alignment, GPU embedding, or pointwise parity was verified. |
| SIMDJSON / binary transport | Existing simdjson bridge and NDJSON helpers | File/API presence is not proof the recommendation flow uses the native bridge. No binary tensor or MCP transport test was run; keep ACE JSON compact and use a separately versioned binary artifact contract for bulk numeric data. |
| LangExtract/KAG/HypergraphRAG | Existing sidecar, graph and KAG tools | Optional evidence providers/candidate expansion. Their results require source/revision grounding; they cannot create identity, taxonomy truth, extra SearchRuntime votes, or unreviewed DAG edges. |
| 140-language audit | Parser/chunker/package inventories and language toolchain references | “140” is a target, not verified supported coverage. Need a source-file denominator, language detection, parser/compiler version, ABI/runtime evidence, and per-language success/unsupported/unknown counts. |

## Recommendation control-plane gap

The critical missing component is the verified control plane—not another model or accelerator. It must join: (1) live MCP manifest/schema snapshot; (2) hard permission/effect/environment eligibility; (3) existing retrieval and advisory ranking with calibrated abstention; (4) bounded, dependency-aware execution; (5) source-byte and evidence validation; (6) outcome attribution; (7) revision-aware cache rules; and (8) immutable receipts and audit. Existing SearchRuntime remains the only fusion owner; ACE remains the only ContextManifest owner; PostgreSQL remains canonical. Tool discovery and ranking never imply permission to execute.

## Next safe sequence

1. Refresh the canonical graph only through a separately reviewed, side-effect-aware index path; do not run the current cache-writing fast indexer as a supposed read-only gate.
2. Build an inventory schema/receipt for MCP tools that snapshots schema hashes and records capability, permission, effects, idempotency, environment, cost, and evidence prerequisites. Keep unknown fields explicitly unknown; do not execute tools during census.
3. Reconcile MCP config, live `tools/list`, and in-process registries; test schema drift and mutating-tool refusal.
4. Connect candidate retrieval → eligibility → advisory rank → typed approval decision → bounded executor → verified outcome receipt, while preserving existing owners and a no-op shadow mode first.
5. Add deterministic tests for timeout/partial results, permission rejection, schema drift, idempotency, stale revisions, abstention, receipts, and cache invalidation. Only then benchmark CPU/GPU challengers on an immutable, judged cohort.

## Explicit non-claims

This report does not claim the full deep audit passed, all 140 languages are supported, the MCP recommendation path is production-ready, a neural ranker was trained, the NES LUT is semantically authoritative, PCA/SVD improves retrieval, HLL gives exact counts, TurboVec is GPU embedding, or any new production write is authorized.
