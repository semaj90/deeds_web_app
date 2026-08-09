# Parent Atlas Open Lane Work Todo

This is the active open-lane work list for Parent Atlas. It is a proof-gated ladder, not a runtime enablement plan.

## Open proof lanes

- [ ] Replay breadth: prove the replay path on bounded evidence before any new lane promotion.
- [ ] Cache proof: keep hot-cache and supersedence behavior observable before depending on it.
- [ ] Provenance tree: preserve canonical identity and packet lineage through every candidate path.
- [ ] Retrieval benchmark: keep E2E retrieval measurements separate from feature enablement.
- [ ] Feature envelope enrichment: finish the envelope fields only where the evidence chain is already stable.
- [ ] Startup analysis routing: keep startup routing checks separate from retrieval scoring changes.

## Open lane backlog

- [ ] Stage the bundle in a temporary integration area only.
- [ ] Prove one real failing-test repair loop end to end.
- [ ] Replace JSON-only localization inputs with `trace_dynamic_context`.
- [ ] Keep semantic `768` canonical; treat `384` as legacy evidence only.
- [ ] Decide one canonical owner for RRF fusion before wiring anything else.
- [ ] Keep RRF candidate fusion separate from RFF-derived geometry.
- [ ] Establish `FeatureRowV1` with a small, explicit field set.
- [ ] Add RFF only as an experimental projection with deterministic seed and revision.
- [ ] Use PageRank authority as one normalized field with provenance.
- [ ] Run oracle parity in order: NetworkX → Neo4j GDS → cuGraph → cuVS.
- [ ] Defer cuGraph / cuVS promotion until parity and value are proven.
- [ ] Close the repair loop only after repeated real failures validate the spine.

## Mirror-derived open lane audit

- [ ] HyperRAG fusion wiring: keep it behind proof gates; do not expand telemetry-first work into runtime ownership.
- [ ] Qdrant tag mirroring: verify payload mirroring stays aligned with canonical packet identity.
- [ ] Retrieval E2E benchmark + telemetry: wire only after the benchmark contract is stable.
- [ ] Artifact tiering: keep tier promotion explicit and reversible.
- [ ] TurboVec compression / large-memory ingestion: prove the contract before using it on larger corpora.
- [ ] Redis/Bifrost mirrors as query-time cache: treat as cache, not truth.
- [ ] Phase 20 training readiness / GPU sidecar readiness: keep it gated by explicit training evidence.
- [ ] Semantic top-K feature views: expose only the fields needed for the current lane.
- [ ] MCP / Zod tool-call alignment: finish schema alignment before routing more tool calls through it.
- [ ] Qdrant semantic cuVS sidecar + recommendation engine: leave disabled until parity and value are proven.
- [ ] Subgraph v1/v2 runtime wiring: keep graph runtime changes isolated from retrieval ranking.
- [ ] Phase 21 evaluation harnesses and agent-learning gates: wire tests and learning gates before promotion.
- [ ] Structured lexical / Python classifier fan-out: keep classifier fan-out a separate lane.
- [ ] Cold-storage restore verification: prove restore behavior before any archival dependency.
- [ ] Phase 17 runtime recovery: keep Go Retrieval-only recovery in the recovered state.
- [ ] `next_steps` markdown → issue-pack materialization: use it as a planning output, not runtime logic.

## OpenSpec review queue

- [ ] Immutable graph snapshot persistence: materialize the snapshot from canonical Postgres identities.
- [ ] Persisted live NetworkX/GDS parity: run parity on the same immutable snapshot only.
- [ ] Snapshot-aware bounded traversal: add hop/fanout bounds plus canonical identity resolution.
- [ ] Durable error-resolution loop: close the issue/run/validate/rollback evidence chain.
- [ ] Package ownership enforcement: add a machine-enforced boundary check and mirror inventory.
- [ ] Stage 4 Graphify output: wait for the required stage output before advancing 4b / 5.
- [ ] Verify the OpenSpec review states remain proof-based, not promotion-based.

## Missing items audit

- [ ] Immutable graph snapshot materializer: no canonical snapshot table/materializer is proven yet.
- [ ] Live NetworkX/GDS parity on a frozen snapshot: still not demonstrated end to end.
- [ ] Snapshot-aware bounded traversal contract: hop/fanout bounds and canonical identity resolution still need a live proof.
- [ ] Closed error-resolution loop: episode capture, validation, and rollback evidence are still partial.
- [ ] Frozen repair replay corpus: required before learned promotion, still absent.
- [ ] `latent_128` byte-contract proof: representation lineage and decoder contract still unproven.
- [ ] OpenWiki source lane: `docs/openwiki` is currently empty, so the local lane has no material to index.
- [ ] Crawler auto-discovery: source manifests are still curated manually.
- [ ] Canonical persistence target for the library-module index: file-based OKF output exists, but no DB-backed registry exists yet.
- [ ] Conflict review queue for stale/partial library rows: missing.
- [ ] General PATH-based global tool resolver: `rg`/`jq`/other binaries are only handled as curated entries, not via a shared resolver.
- [ ] `cuvs` authoritative source resolution: PyPI lookup returned 404 and needs a better source mapping.

## Master ladder reference

The detailed execution order, G0–G28 ladder, and do-not list live in `parent-atlas-workstation-todo.md`.
Keep this board compact: it tracks open lanes, openSpec gaps, and missing items only.

## Relevant files

- `sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts`
- `sveltekit-frontend/src/lib/server/atlas/master-feature-map.schema.ts`
- `sveltekit-frontend/src/lib/server/atlas/master-feature-map.test.ts`
- `sveltekit-frontend/src/lib/server/atlas/context-for-file.ts`
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
- `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
- `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`
- `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts`
- `sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts`
- `sveltekit-frontend/src/lib/server/retrieval/identity-resolution.ts`
- `sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts`
- `sveltekit-frontend/src/lib/server/hypergraph/hypergraph-search.ts`
- `docs/atlas/phase-20-training-readiness.md`
- `packages/parent-atlas/docs/atlas/phase-20-training-readiness.md`
- `docs/atlas/xgboost-reranker-contract.md`
- `packages/parent-atlas/docs/atlas/xgboost-reranker-contract.md`
- `docs/reports/parent-atlas-training-readiness.md`
- `docs/reports/parent-atlas-training-readiness.json`
- `docs/reports/parent-atlas-open-lanes-todo.md`
- `reports/parent-atlas-open-lanes-todo.md`
- `docs/reports/parent-atlas-workstation-openspec-task-board.md`
- `docs/reports/parent-atlas-workstation-openspec-task-board.json`
- `openspec/changes/parent-atlas-runtime-ownership-precall/.openspec.yaml`
- `openspec/changes/parent-atlas-deep-research-ingestion/.openspec.yaml`
- `openspec/changes/atlas-hot-vector-schema-decision/.openspec.yaml`
- `sveltekit-frontend/openspec/changes/parent-atlas-graph-retrieval-proof/.openspec.yaml`
- `sveltekit-frontend/openspec/changes/add-packet-ontology-registry/.openspec.yaml`
- `sveltekit-frontend/openspec/changes/phase1-rrf-semantic-fusion/.openspec.yaml`

## Notes

- The master board remains the source of truth for sequencing.
- This list is the compact work queue for the remaining open lanes.
- Do not turn on every lane at once.
