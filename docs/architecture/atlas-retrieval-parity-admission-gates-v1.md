# Parent Atlas retrieval, embedding, ORF and KAG proof gates (proposal)

> **Status:** TODO inventory; not production evidence. These gates complement the owning OpenSpec ledgers and do not supersede them. Historical fixture passes do not imply current live readback.

## Execution order and acceptance criteria

- [ ] **ENV-01 Windows-native NumPy runtime.** Locate an existing isolated Python 3.13 environment and assert NumPy import, version, interpreter path, bitness and `float32` dot sanity. **Missing:** recorded interpreter and dependency-lock parity with the actual selected-symbol runner. **Evidence:** scratch environment receipt. **Do not:** install globally or disturb the sidecar.
- [ ] **CPU-01 frozen-vector oracle.** Reuse `python/atlas_numpy_cpu_reference_v1.py`; compare fixed query and row-identity order, reject duplicates, NaN, infinities and zero norm, measure tolerance. **Missing:** real frozen corpus/query vectors and independent readback; current tests are synthetic. **Proof:** stable Top-K and score comparisons in a scratch receipt.
- [ ] **SPACE-01 embedding recipe identity.** Verify both query and index model artifact SHA-256, tokenizer SHA-256, prompt, pooling, Dense projection, normalization, dimension, metric, and effective runtime/model revision. **Missing:** confirmed descriptor from live embedding server and persisted vector cohorts. **Do not:** equate two 768-dimensional spaces.
- [ ] **ONNX-01 full-pipeline CPU parity.** Use matching source/ONNX framework versions, inspect tokenizer→encoder→pooling→Dense→normalization tensors, check shape/value differences and source-version model manifests under memory preflight. **Missing:** matched artifacts and bounded successful diagnostic. **Status:** NOT_ADMITTED; no existing vectors rewritten.
- [ ] **ORF-REG-02 reviewer authority.** Have an independent trusted reviewer approve the exact five feature definitions, producer semantics and artifact checksum. **Missing:** externally verifiable signed or authenticated review binding. **Do not:** promote historical AST labels or infer approval.
- [ ] **ORF-REG-03/04 immutable artifact and loader.** Derive deterministic ordinals and checksum via existing registry builder; loader must reject mismatched checksum/revision/approval or unknown producer mappings. **Missing:** approved production artifact and runtime consumer. **No registry table required by default.**
- [ ] **AST-01 producer linkage.** Connect the existing structural provider / ast-grep adapter to root prefill with verified packet key, source revision, exact byte offsets and matched-text hash. **Missing:** a current receipt-qualified end-to-end observation. **Do not:** invent `workspace:0` or infer source revision from chunk hashes.
- [ ] **KAG-01 typed grounded relation.** LangExtract extraction must be a typed relation with participants, roles, exact supporting byte span and source revision; a verified concept mention alone remains an observation. **Missing:** a live typed relation passing independent validation. **No tuple writes until admission.**
- [ ] **KAG-02 persisted admission/readback.** Use the existing ontology-linked tuple persistence authority with task/evidence receipt binding, revision and independent readback. **Missing:** admitted tuple; currently observed live table had zero rows. **Do not:** promote resolved `feature_ontology_tuples` hints.
- [ ] **RETR-01 live search identity.** Traverse QueryClassification→logical lanes→dedup/RRF→exact promotion→ContextManifest; preserve one semantic lane vote, canonical packet identity and source revision. **Missing:** one verified live request receipt.
- [ ] **PGV-01 pgvector/Qdrant readback.** Inventory actual Drizzle schema, pg_indexes, HNSW, vector row identities and embedding recipe revisions with read-only SQL before judging parity. **Missing:** live `DATABASE_URL` / `POSTGRES_URL` and revision-qualified cohort. **No index migrations or re-embeddings.**
- [ ] **CENTROID-01 cache revision guards.** Integrate a manifest-scoped embedding-space, taxonomy, cluster snapshot and centroid checksum with existing Redis/Valkey centroid cache. **Missing:** actual cache-owner integration and stale-key rejection in request execution. **Cache is a routing hint, not canonical evidence.**
- [ ] **DOMAIN-01 taxonomy and abstention.** Keep domain taxonomy, ORF registry and embedding-space revisions distinct. Verify unknown-domain abstention and query taxonomy mapping before compiling retrieval lanes. **Missing:** real request-to-retrieval proof; `general` is not verified classification.
- [ ] **GRAPH-01 NetworkX reference.** Project admitted typed/N-ary facts into bounded CPU reference graph with immutable fact IDs, role labels and hop budget. **Missing:** admitted fact inputs, not CPU operator fixtures.
- [ ] **GPU-01 cuVS/cuGraph challenger.** Compare to CPU exact Top-K/NetworkX on the same frozen embedding space/graph snapshot; capture recall, latency, VRAM, backend identity, and nondeterminism. **Missing:** real parity receipt. **Do not:** launch CUDA in an occupied GPU slot.
- [ ] **SYNTH-01 admitted-context summary.** Build ContextManifest from verified facts/bytes and execute Ornith summary with model/prompt revision and receipt. **Missing:** admitted ContextManifest; no model synthesis can be called admitted without it.
- [ ] **ACE-01 packet/cache routing.** Validate descriptors, leases/generation, source and representation revisions, checksum and bounded transfer; use BitFrost/Valkey only as projections. **Missing:** live packet-to-cache-to-context readback.
- [ ] **BATCH-01 eligible Graphify batch.** Select up to 500 files by bytes as well as count, exclude `.tmp`/snapshots from task candidates, issue immutable batch checksum, qualify each packet and replay deterministically. **Missing:** a completed canonical admitted batch and Graphify readback.

## Source ownership

- Pure CPU helpers: `python/atlas_numpy_cpu_reference_v1.py`, `python/atlas_frozen_vector_parity_v1.py`.
- Pure descriptor checks: `scripts/atlas/lib/atlas-retrieval-identity-guard-v1.mjs`.
- Real cache owner: `sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts`.
- Real query router: `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-classifier.ts`.
- Real retrieval orchestrator: `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`.
- ORF registry builder: `packages/parent-atlas/src/core/observation-feature-compiler.ts`.
- Main ledger: `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md` (local checkout is ahead; do not overwrite).

## Fail-closed semantics

`FIXTURE_PROVEN` is not `LIVE_ADMITTED`. A successful checksum or source span proves identity/mention only, not the truth of a typed relation. Review receipts and task-bindings must be checked independently. Do not create new authority tables, alter persisted vectors, write to DB/Redis/Qdrant, or run a full model comparison without a memory preflight and explicit authorization.
