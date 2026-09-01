## 1. Lineage and semantic reader

- [ ] LINEAGE-01 — Prove full source namespace and source-revision authority;
  retain fail-closed behavior for missing or placeholder lineage.
- [ ] LINEAGE-02 — Prove the bounded `15128/768` exact-candidate lineage gate;
  do not substitute repaired Qdrant metadata for source qualification.
- [x] RETRIEVAL-01A — Canonical `semantic_768` execution ownership was proven
  for the bounded B/D oracle cohort; retain scope limits.
- [x] RETRIEVAL-01B — `_768_v2` reader canary and exact PostgreSQL hydration were
  proven for the bounded cohort.
- [x] RETRIEVAL-01C — Projection result and canonical content hydration were
  separated through `ProjectionCandidateV1`.
- [x] RETRIEVAL-01D — Read-only reader replay was proven on the bounded cohort.
- [x] RETRIEVAL-01E — Named-vector execution and 50-query reader canary were
  corrected/proven within recorded scope.
- [ ] RETRIEVAL-01G — Audit historical impact of pre-existing empty Qdrant
  results across all live readers.
- [ ] RETRIEVAL-01H — Freeze narrow semantic reader ownership only.
- [ ] RETRIEVAL-01I — Define `ProjectionRegistryV1` for canonical identity,
  representation, collection, vector name, physical point, and revisions.
- [ ] RETRIEVAL-01J — Dry-run stale bridge reconciliation with zero ambiguous or
  missing targets.
- [ ] RETRIEVAL-01K — Run a tiny separately-authorized reconciliation canary and
  read back exact projection identity; no legacy point deletion.
- [ ] RETRIEVAL-01L — Freeze full Qdrant projection ownership only after rollback
  and parity proof.
- [ ] RETRIEVAL-02 — Census every Qdrant query for explicit named-vector
  selection; do not mass-edit callers.

## 2. OaK DAG runtime convergence

- [x] DAG-RUNTIME-01A — Repair the semantic owner contract with an exact callable
  implementation reference for `searchQdrantCodeStrictV1`. It does not alias
  `search_hybrid`, and preserves Qdrant, `semantic_768`, `_768_v2`, and named
  vector `content` lineage. Package build and focused semantic handler tests passed.
- [x] DAG-RUNTIME-01A.1 — Resolve the bounded replay subset to exact callable
  implementation references for AST evidence, graph expansion, PostgreSQL FTS,
  semantic Qdrant, KAG neighbor reads, and ACE ContextManifest compilation.
  The references are statically registered; no dynamic import or coarse action-kind
  fallback is used. Package build and focused owner tests passed.
- [x] DAG-RUNTIME-01B.1 — Added the exact KAG neighbor-read contract
  `parent-atlas.kag.neighbor-read.strict.v1` for canonical-ID neighbor reads.
  It is not an alias for packet lookup or generic BFS. Package build and focused
  KAG handler tests passed.
- [x] DAG-RUNTIME-01B — Register strict read-only owners for semantic Qdrant,
  PostgreSQL/KAG, AST evidence, graph expansion, and context compilation in the
  exact-reference runtime registry. Registry tests passed; live replay remains open.
- [ ] DAG-RUNTIME-01C — Retain bound arguments and require parameter-checksum
  equality at execution admission.
- [x] DAG-RUNTIME-01C.1 — Added the exact ACE ContextManifest adapter
  `parent-atlas.context-manifest.ace.v1`. It validates an assembled ACEContext,
  accepts the actual compiler options, and performs no retrieval or persistence.
  Package build and focused context-handler tests passed.
- [ ] DAG-RUNTIME-01D — Execute a frozen bounded plan twice and compare normalized
  outputs, evidence, statuses, and deterministic receipt checksums.
- [x] DAG-RUNTIME-01D.1 — Proved the registered lexical and semantic owners on a
  bounded mocked read-only replay. Two runs produced the same deterministic
  execution checksum, both actions succeeded, and all writes remained false.
  This is fixture proof only; live dependency replay remains open.
- [ ] DAG-RUNTIME-01D.2 — Run the frozen replay against explicitly configured
  read-only live owners after exact source, candidate, graph, and representation
  revisions are available. WSL2 RAPIDS FastAPI runtime is now reachable at
  `127.0.0.1:8098` in `atlas-rapids-cu13` with HTTP 200 health, RTX 3060 Ti,
  cuVS/cuGraph 26.06, and no writes. This proves runtime availability only;
  the frozen OaK replay remains open because exact source/candidate/graph/
  representation inputs and live owner execution have not yet been proven.
- [ ] DAG-RUNTIME-01E — Link the execution receipt to ContextManifest and
  validation receipts while preserving zero-write/non-canonical semantics.

## 3. Representation and learned AE

- [ ] NESTED-TRAIN-02 — Retrain the nested AE from an immutable source snapshot,
  grouped train/eval split, frozen seeds, CUDA receipt, and new checkpoint hash.
- [ ] NESTED-REP-01 — Compare `semantic_768`, native `semantic_mrl_128`, learned
  `latent_128`, and learned `latent_64` on the same CandidateOrdinal cohort.
  Record recall@K, MRR, overlap, bytes, latency, projection checksums, and replay.

## 4. Promotion safety

- [ ] PROMOTION-01 — Keep source lineage, graph identity, feature layout,
  projection ownership, and migration baseline as independent blockers.
- [ ] PROMOTION-02 — Permit writes only through an explicit target list,
  rollback plan, readback receipt, and human authorization.

## Validation record

- [ ] OpenSpec validation passes for proposal/design/tasks/spec consistency.
- [ ] All completed items above have linked reports, not merely code existence.
- [ ] No database, Qdrant, graph, cache, or production mutation occurs during
  read-only gates.
