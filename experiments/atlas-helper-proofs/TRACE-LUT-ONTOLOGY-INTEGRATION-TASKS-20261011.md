# TRACE MCP / LUT / agentic error fixing — review-only integration backlog
Status: PROPOSAL_ONLY. Do not overwrite dirty Windows tasks.md. Review and merge with existing owners.

## P0: Authorization before LLM tool routing
- [ ] TRACE-AUTH-01: inventory all **19 visible ops.*** tools; classify effects and server-side checks. Four named gated tools are only a subset.
- [ ] TRACE-AUTH-02: replace nonblank requireToken check with server-verified operator identity and scoped, short-lived approval (audience, tool ID, parameter digest, expiry, nonce/replay protection). Never trust model-supplied strings as approval; fail closed.
- [ ] TRACE-AUTH-03: omit all ops.* from LLM-visible discovery, Viterbi profiles and executor allowlists until independent authorization proof. Enforce twice: discovery/dispatcher and handler.
- [ ] TRACE-AUTH-04: mock-only tests for empty, forged, expired, wrong scope, wrong args and replayed approval; assert no handler side effects.

## P0: User-query to tool to diagnosis
- [ ] MCP-LUT-01: reconcile current live tools/list and registry-owned identities, permission effects, schema digests and server authority IDs. Prior live observation: 188 visible, 120 TRACE static, 68 from other registries, file.read_window invoked successfully.
- [ ] MCP-LUT-02: consume QueryClassificationV1 and *registry-owner supplied* profiles in buildMcpToolViterbiFramesV1; abstain on unknown workspaceRevision, schema digest or policy revision. Use experiments/atlas-helper-proofs LUT preflight only as optional proposal; never trust profiles authored by LLM.
- [ ] MCP-LUT-03: dispatch one read-only exact tool via canonical MCP registry, log tool-call begin/completion and result checksum with existing telemetry owner.
- [ ] MCP-LUT-04: pass evidence-bounded diagnostics to scripts/atlas/run-agentic-error-fixing-v1.mjs with --report .tmp/atlas/...; mutationAllowed=false, canonicalAuthority=false. Its default docs/reports path is a filesystem write despite writesPerformed:false metadata.
- [ ] MCP-LUT-05: frozen full-path fixture: query -> registry -> LUT/frames -> read-only MCP invoke -> verified source span -> proposal -> receipt; negative fixtures for wrong revision, missing bindings, unauthorized tools.

## P1: Retrieval, ontology, CPU proof
- [ ] RETR-TOPK-01: separate top-k tool selection from semantic_768 retrieval and dense matrix rerank. Keep lexical, semantic, AST and graph logical lanes distinct; cuVS/Qdrant executors cannot inflate RRF votes.
- [ ] RETR-KMEANS-01: KMeans clusters and ontology/domain labels are advisory features; evaluate Recall@K, abstention, reproducibility, latency on frozen corpora, no canonical packet IDs minted.
- [ ] ONTOLOGY-LIVE-01: audit feature_ontology_tuples separately from atlas_ontology_linked_tuples. The reported 539,124 legacy rows have no proved lineage/admission.
- [ ] ONTOLOGY-LIVE-02: require relation -> role-preserving participants, source span, packet/source/workspace/ontology/representation revisions, content checksums and authorizing receipts before promotion.
- [ ] GRAPH-CONTEXT-01: admitted source -> tuple -> directed incidence graph -> CandidateOrdinalMapV1 -> ContextManifest readback. Keep NetworkX/PyTorch operator proof fixture-only until one live source-authorized snapshot exists.
- [ ] CPU-EVAL-01: run existing NetworkX CPU fixture, then optional Boost.Graph challenger on same frozen directed graph; GPU resource lease + exact parity later.

## P1: Telemetry and governance
- [ ] TRACE-RECEIPT-01: recapture health/tools/list and tool invocation receipt; Oct-11 liveness is not permanent.
- [ ] TRACE-RECORDER-01: explain historical 109 pending/136 tool events; do not treat pending as success or train Baum-Welch on the ~27 completed outcomes.
- [ ] TRACE-MIGRATION-01: inspect deployed 0111/0112 against migration ledger read-only; no DB migrations.
- [ ] ROUTE-EVAL-01: deterministic ranker vs offline Viterbi on frozen traces; no production promotion before sufficient diverse completed RouteTrace cohort (checkpoint 160+) and explicit reviewer gate.

No secrets, store writes, autonomous patches, model calls, GPU execution, or new canonical identities authorized by this addendum.
