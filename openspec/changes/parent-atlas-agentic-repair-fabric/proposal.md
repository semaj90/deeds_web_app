## Why

Parent Atlas has real, separately-owned pieces for retrieval (Go Retrieval/SearchRuntime), concept
resolution (the OAKLIB TypeScript resolver + the live `:8095` OAK kernel, both landed this session
under `parent-atlas-ontology-oaklib-fanout-bitmap`), n-ary evidence (`HyperedgeV1`,
`hyperedge-contract.ts`), and graph/DAG execution (`kag-dag-runner.ts`). None of these are wired
into a single agentic error-repair/recommendation fabric with a typed action vocabulary, a bounded
DAG, and canonical execution receipts. The operator supplied a full 17-section architecture
specifying exactly this fabric, with an explicit ownership-freeze list (Postgres = identity,
Go Retrieval = fusion entry point, OAK = deep concept resolution, TS resolver = cheap local
fast-path, HyperGraphRAG = n-ary expansion, DSPy/GEPA = offline-only, ACE/BitFrost = admission/
residency, GPU executors = compute-only, DAG runtime = scheduling, LLM = synthesis only — never
canonical identity).

## What Changes

- Record the full 17-gate (AR-01..AR-17) architecture as a durable, tracked plan — this proposal
  captures the operator's complete specification even for gates not implemented in the first pass.
- Implement AR-01 (OAK client capability census + typed `OakResolutionEvidenceV1` client) and AR-03
  (`AgenticActionV1` contract + a seed action registry) as the first concrete, bounded, read-only/
  code-only deliverables.
- Explicitly do NOT implement AR-02, AR-04 through AR-17 in this pass — recorded as pending tasks,
  not silently dropped.
- Freeze ownership: no new ontology service, no new retrieval-fusion owner, no new cache authority,
  no new workflow engine. OAK (`:8095`) and the TypeScript resolver (`parent-atlas-ontology-oaklib-
  fanout-bitmap`) become two-tier resolvers, not competing owners. `HyperedgeV1` stays the canonical
  n-ary contract; `AgenticHyperEdgeV1` (a later gate, not built here) will wrap it rather than
  replace it, since it needs a `resolutionState`/nullable-`canonicalId` shape `HyperedgeV1` doesn't
  have today.
- Ewin Tang-inspired recommendation work is scoped, per the operator's own framing, as an isolated,
  non-canonical challenger (AR-10) requiring a CPU exact-scoring oracle comparison before any
  promotion claim — not started this pass.
- DSPy/GEPA remain explicitly out of the canonical identity/retrieval path, confirmed consistent
  with this workstation's standing "not a P0 dependency" rule — scaffold only (AR-11/AR-12), not
  started this pass.

## Capabilities

### New Capabilities
- `oak-resolution-evidence-client`: typed TypeScript client wrapping the live `:8095` OAK kernel
  (lookup/search/ancestors), fail-closed, never mints a `concept:<raw-label>` on failure.
- `agentic-action-registry`: typed vocabulary of legal "moves" (`AgenticActionV1`) an agentic
  repair/recommendation loop may select from, with mutability/approval metadata — an explicit
  alternative to letting an LLM invent tool semantics.

### Modified Capabilities
- (none — this pass is additive only; the 17-gate architecture's later phases will modify
  `HyperedgeV1` consumers, `CandidateFeatureMatrixV1`, and the DAG runtime, but none of those
  changes happen in this pass)

## Impact

- Affected (this pass): new files under `sveltekit-frontend/src/lib/server/atlas/agentic/`
  (client + contracts + tests). No schema migration, no production write path, no new service.
- Affected (recorded, not implemented): Go Retrieval adapter, HyperGraphRAG action expansion,
  CandidateFeatureMatrix action features, Tang challenger, DSPy/GEPA scaffold, DAG synthesis,
  ParameterResolver wiring, bounded repair-loop fixture, ExecutionReceipt→HyperEdge projection,
  ContextManifest/PromptPlan integration — all recorded as tasks 4-17 for a future pass.
