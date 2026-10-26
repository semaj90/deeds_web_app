# Parent Atlas Graph, GPU, Ontology, and ACE Progress

**As of:** 2026-10-14  
**Status:** `PARTIAL_DIAGNOSTIC_ONLY_NOT_PROMOTABLE`

This report separates owner presence, fixture evidence, live component evidence, and a connected vertical proof. It does not claim a single end-to-end production pipeline.

## Evidence matrix

| Boundary | Current owner/evidence | Status | First remaining proof |
| --- | --- | --- | --- |
| PostgreSQL packet/vector authority | `atlas_packets`, `codebase_chunk_index`; read-only inventory in `parent-atlas-vector-index-inventory-2026-10-14.json` | `LIVE_INVENTORY_OBSERVED` | Reconcile packet/chunk IDs, source/workspace revisions, and projection IDs before fanout |
| pgvector/Qdrant inventory | PG: 274,465 chunk rows; 219,998 `content_embedding_768` rows, `vector(768)`; valid HNSW (`m=16`, `ef_construction=64`). Qdrant `codebase_chunks_768`: 328,348 points; `vectors_count` unavailable; 328,386 indexed vectors; `content`, `error`, `signature` are 768-D cosine, HNSW `m=16`, `ef_construct=200`, INT8 quantization | `LIVE_METADATA_OBSERVED / CROSS_STORE_PARITY_UNPROVEN` | Reconcile the 53,883 point-count difference by canonical IDs/revisions; do not infer vector count from indexed count |
| Canonical graph snapshot | `atlas_graph_snapshots_v2`; read-only preflight receipt `atlas-graph-snapshot-traversal-preflight-20261014.json` | `LIVE_SCHEMA_GAP_CONFIRMED / NO_ACTIVE_SNAPSHOT` | Resolve missing revision columns and authoritative graph-revision source; DDL draft is un-applied and requires separate approval |
| NetworkX mirror | `python/atlas_compute/atlas_graph_networkx_mirror_v1.py`; live read-only export receipt `networkx-graph-mirror-live-readonly-v1.json` | `LIVE_READ_ONLY_EXPORT_AND_REVISION_BOUND_PARITY_PROVEN / NOT_PROMOTED` | Bind the graph revision to a current admitted PostgreSQL snapshot; validate canonical ontology entities and typed relationships before GraphRAG/ACE consumption |
| `.okf` and ontology | Manifest inventory 26/26; predicate YAML validates; capability contract validates; Python/Zod domain fixture parity 10/10 with 9 invalid cases rejected | `STRUCTURAL_AND_FIXTURE_CONTRACTS_PROVEN / LIVE_TERM_RESOLUTION_OPEN` | Keep model assertions as proposals; resolve canonical terms, participant identities, and evidence revisions independently |
| Hypergraph incidence | Existing N-ary proposal/NetworkX helpers; admitted-proposal adapter verifies proposal checksum, schema fields, evidence, and expected graph revision before role-labeled projection; one TypeScript→Python fixture replay passed | `FIXTURE_PROVEN / LIVE_OWNER_RESOLUTION_NOT_PROVEN` | Resolve participants to canonical owners and bind a real tuple batch to an independently proven live graph snapshot |
| DuckDB/Arrow preparation | Existing analytics and graph export owners | `OWNER_PRESENT / FROZEN-JOIN-NOT-PROVEN` | Produce a bounded, checksum-bound node ordinal and incidence matrix from one admitted snapshot |
| RAPIDS/cuGraph/cuVS | WSL2 interpreter currently imports PyTorch 2.13.0+cu130, cuVS, cuDF, cuGraph, DuckDB, and NetworkX; CUDA reports RTX 3060 Ti | `RUNTIME_AVAILABLE / GRAPH-PARITY-NOT-RUN` | Compare an immutable, identity-mapped snapshot against the NetworkX oracle before GPU traversal or Leiden |
| MRL / autoencoder | MRL diagnostic receipt exists; autoencoder gate report is `BLOCKED_NO_REVISION_QUALIFIED_COHORT`; zero rows met all required bindings | `DIAGNOSTIC_ONLY / TRAINING_BLOCKED` | Obtain a canonical `semantic_768` cohort with row-level lineage and immutable model/recipe identity; evaluate retrieval metrics separately from reconstruction |
| ACE / BitFrost / centroids | ACE/BitFrost report records replay tests but no admitted revisioned production caller; agent execution receipt is `PARTIAL`, cache is dry-run, physical residency false | `TESTED-PIECES / LIVE-HANDOFF-PARTIAL` | Supply a production feature-snapshot bundle and prove the same request through SearchRuntime, ContextManifest, approved cache write, and independent readback |
| MapReduce/CouchDB, packet materialization, SIMDJSON | Existing source owners and focused contracts are present | `OWNER_PRESENT / CONNECTED-PROOF-NOT-FOUND` | Bind their outputs to the same canonical packet/source revisions in a single replay receipt; SIMD/AVX is parsing acceleration, not an identity or index layer |
| TurboVec/384 retirement | Retirement policy rejects several in-repo query/build paths; PostgreSQL still has 58,109 historical `content_embedding_384` packet values in the prior live readback | `CONTAINMENT_PARTIAL / RETIREMENT_BLOCKED` | Finish producer/consumer census and approve disposition of stored legacy values; do not reinterpret or rewrite them as 768-D |

## Receipt qualification notes

- `docs/reports/function-registry-live-proof-v1.json` reports exact source-byte readback for `computePacketKeyV2`. It is a useful function seed, not proof of an exported graph snapshot.
- `docs/reports/candidate-expansion-receipt-v1.json` and `docs/reports/agent-retrieval-execution-receipt-v1.json` carry `graphRevision=sha256:000...001`. No authoritative revision binding is demonstrated in those files; treat the value as unqualified and do not use these receipts as graph-revision proof.
- `docs/reports/ace-warm-plan-receipt-v1.json` is `PROVEN_DRYRUN`; it explicitly says `writesPerformed=false`. This is not physical BitFrost residency.
- The MRL GPU evaluation used a 55,169-row historical artifact whose source column/ordinal map do not establish canonical packet and row-level source/workspace lineage. Its overlap metrics are diagnostic, not judged relevance or production recall.
- Session 121's historical Gate 4 remains failed. The audit corrects the interpretation: it establishes metric-threshold failure for that benchmark, not corrupt/random weights, wrong producer model, or general model failure.
- OpenWiki MCP retrieval tools are unavailable in this session. The repository quickstart is local, generated documentation with a 2026-10-07 verification stamp; it is navigation context, not fresh runtime evidence.

## Completion accounting

Fresh read-only command: `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only` (exit 0), run `20261015010733427-82610febd68a`, workspace revision `sha256:82610febd68a3a58a1c0e33d858dcc97595d4603b7529d8d30f7668a6969b811`; `outputs: []`.

- 12,812 task boxes across 128 changes (118 active, 10 archived): 7,821 checked, 4,991 unchecked (61.06%, rounded to 61.1% checkbox coverage).
- 0 checked tasks had qualifying linked evidence; all 7,821 checked tasks remain without proof under this audit's evidence schema.
- Receipt diagnostics: 1,241 indexed receipts, 937 orphan/missing-task bindings, 1,147 missing-revision receipts, 398 ambiguous task identities, 52 stale evidence candidates; categories may overlap.
- Census remains `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`, `promotionEligible=false`, and wrote no artifacts. Thus 61.1% is **not** a completion percentage; there is no defensible portfolio-wide 0–100% capability score.

## Next gates

1. Resolve one `.okf` ontology tuple to canonical PostgreSQL terms and exact evidence revisions; keep directed code edges and N-ary incidence separate.
2. Bind the proven read-only graph export to a current admitted PostgreSQL snapshot; the current database snapshot rows lack graph/workspace revision bindings.
3. Freeze one qualified node ordinal map and verify CPU NetworkX ↔ GPU cuGraph parity before GPU or learned-feature promotion.
4. Reconcile that same snapshot and candidate identity through SearchRuntime → ContextManifest → ACE/BitFrost, including cold/warm readback; no production caller is proven by the current dry-run receipts.
5. Keep TurboVec/legacy 384 retirement and autoencoder training blocked until their own lineage and disposition gates pass.

No schema, graph, vector, Qdrant, Redis/Valkey, cache, or source data was modified for this report.

## Scoped proof-gate score

`docs/reports/parent-atlas-graph-analysis-proof-gates-v1.json` records a fixed 9-gate checklist: 3 `PROVEN`, 1 `PARTIAL`, and 5 blocked/unproven (**33.3% explicitly proven within this checklist**). This is a scoped evidence ratio, not overall Parent Atlas completion. The cuGraph gate is blocked pending operator-approved GPU preparation: `:8090` is listening, its slot retains a task, and Ubuntu WSL is stopped. No service was stopped or GPU job launched.

## Validation refresh — graph mirror and `.okf` inventory (2026-10-14)

- The live read-only export and revision-qualified NetworkX comparison are recorded in `docs/reports/networkx-graph-mirror-live-readonly-v1.json`: 48,339 nodes, 32,226 directed edges, expected workspace and graph revisions matched, and parity status `PARITY_PROVEN`. This is a local derived mirror, not an active PostgreSQL graph snapshot or production GraphRAG input.
- `py -3.13 scripts/atlas/audit_okf_manifest_coverage_v1.py --root .` — exit **0**; 26/26 references resolve, 9 registries, no missing/unsafe/unregistered structured files, manifest SHA-256 `16674046414fb2d279e18cba340fa770abf395535f6848669391601ab6a98a9d`.
- `py -3.13 scripts/atlas/validate-okf-yaml-schema-v1.py` — exit **0**, predicate document `VALID`, zero errors, document SHA-256 `243dae1b3520655aa6a88ea60c9fa56ee83de3df5259347b367ff837d87028fd`, schema SHA-256 `2b50f8ced271efd34a49920cdc73f07f605f63962112e101322a2dc348d012cf`.
- These checks prove manifest inventory and one schema-bound predicate document only. They do not prove all `.okf` corpus documents, live ontology term resolution, graph tuple admission, GPU parity, or ACE/BitFrost consumption. No persistent stores or caches were written.

## Implementation update — admitted N-ary proposal bridge

`python/atlas_compute/nary_networkx_alignment_v1.py` now accepts the existing `atlas.nary-fact-proposal.v1` envelope through `build_snapshot_from_admitted_proposals`. It rejects non-ADMITTED proposals, canonical-authority claims, stale graph revisions, missing lineage/evidence, invalid strict-schema fields, and checksum tampering. Participant entity types are part of projection node keys and role labels remain on fact-to-entity incidence edges. Proposal checksums identify projection fact nodes only; they do not assert canonical identity or source truth.

Validation: `PYTHONPATH=python .venv/Scripts/python.exe -m pytest -q python/tests/test_nary_networkx_alignment_v1.py python/tests/test_atlas_graph_networkx_mirror_v1.py` — **21 passed**, exit 0. A TypeScript producer/admission call was then piped in memory into Python: 4 nodes, 3 role-labeled incidence edges, 1 evidence row, output checksum `8016eb5b7977fc6c330c6e193172fa3f441bb3a4ffd1d9302fe153753c8c74ad`, exit 0. Deterministic role-separated CSR generation binds shared ordinals and the source snapshot checksum; it now rejects modified or structurally inconsistent snapshots. This CSR output is not the semantic `E`, ontology `T`, PyTorch tensor, or GPU parity proof. Scoped `git diff --check` — exit 0. Real canonical participant resolution, live graph snapshot proof, `.okf` document-schema admission, DuckDB/GPU feature parity, and ACE/BitFrost end-to-end execution remain unproven.

## Implementation update — `.okf` proposal schema parity

Added `.okf/schemas/nary-fact-proposal-v1.schema.json` matching the existing Zod contract and added an additive `graph_fact_contracts` registry entry in `.okf/manifest.yaml`, preserving the pre-existing language-catalog edits. The Vitest parity test compares the checked-in schema with `z.toJSONSchema(NaryFactProposalV1Schema)`; Python tests validate Draft 2020-12 structure and reject authority claims/extra keys. Results: TypeScript proposal/admission tests **7/7**, Python graph/CSR tests **22/22**. A fresh read-only manifest audit exits 2 with 21/28 references resolved, 7 missing references, a missing `symbols/` directory, one unregistered pipeline file, three additional structured files, and zero unsafe references; new schema reference resolves. Manifest SHA-256: `705a6e33d23b9111b2b3aee89d414d33dfcb0e9d01a71d47db7fa017372fdc66`; no audit writes. This is structural schema proof only; ontology term resolution, canonical participant ownership, and live graph lineage remain unproven.

### Manifest inventory follow-up

The existing `.okf/domains/structured-value.yaml`, `.okf/indexes/parent-atlas-code-explore.yaml`, and `.okf/pipelines/ast-entity-prefill.yaml` are now registered in their corresponding manifest sections. A fresh read-only audit reports `OKF_MANIFEST_REFERENCES_STALE` (exit 2), 0 unregistered structured files, 0 unsafe references, and the same 7 unresolved declared files listed in `tasks.md`. Updated manifest SHA-256: `1bbf791a307d3befc5fcbb6cbd953405494f7f16b0407812fcac8a2e72c93003`. The `.okf/symbols/` directory and seven declared files remain absent; no content was fabricated. This inventory reconciliation does not qualify the files semantically or establish graph/ontology lineage.

Follow-up: corrected the active manifest to describe the existing inventory rather than dangling planned references. Removed the seven nonexistent file declarations and the absent `symbols/` registry declaration; the absent domain, symbol, tool, and predicate contracts remain open work in `tasks.md`. Registered the existing language-profile schema, and generalized the schema registry name to `schemas`. The read-only audit now returns `OKF_MANIFEST_REFERENCES_PROVEN`, 25/25 declared references resolved, zero missing directories, zero unregistered structured files, and zero unsafe references (exit 0). Manifest SHA-256: `b0dee666a0d99b7df7e0cbc7a96dc5186731a4da1167f20e200cf86a4eefb90a`. This proves only manifest-to-file inventory consistency; it does not validate all corpus semantics or live graph/ontology joins.

## Implementation update — schema-backed predicate registry

Added `.okf/schemas/feature-relationships-v1.schema.json` for the current predicate registry and registered it under the existing `schemas` section. The read-only validator at `python/parent_atlas_ontology/okf_yaml_schema_validation_v1.py` validates the current YAML against Draft 2020-12, rejects duplicate keys and invalid UTF-8, and returns input checksums without writes. The command `python scripts/atlas/validate-okf-yaml-schema-v1.py` reports `VALID`; the predicate document checksum is `1d552621fd67aaa39d9032f6747c513863a721bfe2aaba8e2b79f13041861370` and schema checksum is `2b50f8ced271efd34a49920cdc73f07f605f63962112e101322a2dc348d012cf`. The focused Python suite passed **18/18**. Manifest audit now resolves **26/26** references with no missing/unsafe/unregistered items, exit 0; manifest SHA-256 `16674046414fb2d279e18cba340fa770abf395535f6848669391601ab6a98a9d`. This is a structural contract proof: live PostgreSQL ontology term resolution and N-ary admission integration remain unproven.

## Implementation update — tuple relation type parity

Audited the TypeScript N-ary adapter against `python/parent_atlas_ontology/semantic_bridge.py`. The Python owner maps `OntologyLinkedTupleV1.label` to `NarySemanticRelation.relation_type` and explicitly documents that `labelKind` (`pos`/`tag`/`ontology`) is not a relation type. The TypeScript adapter previously synthesized `ONTOLOGY_${labelKind}`, which could turn a category into a graph predicate. It now passes through `tuple.label`, with regression coverage. TypeScript focused tests: **10 passed**; Python snapshot/N-ary tests: **25 passed**. Mapping parity is established at unit-test level only; live tuple readback, OAK term validation, and policy-approved graph traversal remain open.

## Existing OAK/readback fixture retest

The existing offline OAK kernel suite passed **15/15** (`python/test_atlas_oak_kernel.py`), including mocked bounded SELECT behavior and fail-closed typed assertion outcomes. The existing tuple source-readback tests passed **2/2** (`scripts/atlas/lib/ontology-tuple-source-readback-v1.spec.mts`); the matching fixture deliberately remains `SOURCE_BYTES_AND_SPAN_MATCH_NOT_ADMITTED`. No live PostgreSQL or OAK service was contacted. This adds no live lineage proof; one real canonical tuple/source binding and explicit admission remain prerequisites for graph consumption.

## Continuation evidence — OpenSpec, SvelteKit worker scheduling, and RPC cache (2026-10-15)

Fresh read-only census: `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only`; run `20261015061303352-bbc37b0463c2`, workspace revision `sha256:bbc37b0463c2a5b0dfd1a9862448e0bdc33ae49be27926d55f021fa64b52d745`, output artifacts `[]`. It found **12,941** task checkboxes across **129** changes (119 active, 10 archived): 7,852 checked and 5,089 open, or 60.7% checkbox coverage. This is not a completion percentage: 0 checked tasks had linked evidence qualifying under the census schema; status remains `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`. The earlier 61.6%/4,501-open figures are stale and must not be quoted as current.

The existing SvelteKit GPU `worker_threads` pool now tracks busy worker slots, selects an available slot round-robin, drains queued work into idle capacity, removes expired queued jobs, rejects duplicate task IDs, and ignores late results for timed-out work. The existing RPC cache now canonicalizes argument-object keys, uses full SHA-256, and increments its namespace to v2. Focused command `cd sveltekit-frontend && npx vitest run src/lib/gpu/tensorrt-worker-pool.spec.ts src/lib/server/cache/rpc-cache.spec.ts` passed **6/6**. This validates local scheduler and hash contracts only; it does not prove a real two-worker RPC request, GPU parallel speedup, Valkey cache hit/readback, revision admission, or the seven-layer cache path. Those gates remain open. Full `svelte-check` was interrupted after a prolonged run and is unverified.

No database schema/data, graph snapshot, vector index, Qdrant, Redis/Valkey, cache contents, or live service was modified. The RPC task ledger records the local implementation evidence; no implementation task is checked complete based only on these unit tests.

### RPC cache envelope integrity follow-up (2026-10-15)

Subsequent to the census above, `rpc-cache.ts` now stores the typed v3 envelope rather than only its payload. Cache reads verify transport/method, canonical argument digest, exact key, expiry, and payload SHA-256; invalid entries are discarded and recomputed, with Redis failures remaining fail-open. The RPC key namespace is v3 (not v2). Updated focused validation `npx vitest run src/lib/gpu/tensorrt-worker-pool.spec.ts src/lib/server/cache/rpc-cache.spec.ts` passed **10/10**. No live Redis/Valkey readback was run; warm-cache proof here is a deterministic in-memory store fixture only.
