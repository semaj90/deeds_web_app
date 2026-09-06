# Parent Atlas Workstation Phases 11–17 Implementation Plan

Updated: 2026-09-05

## Role

This is an implementation planning projection. It does not own OpenSpec task
status, authorize datastore writes, or create a competing control plane. The
owning OpenSpec change and its `tasks.md` remain authoritative.

## Dependency order

Current P0 gate: `CURRENT-SOURCE-OWNER-RECONCILIATION-01`.

Open: stable source identity owner and repository/source namespace authority.
Proven bounded: source-to-chunk materialization binding for the recorded
physical cohort. Not authorized: chunk `source_ref` mutation, semantic
promotion, graph projection, or GPU residency expansion.

```text
CURRENT SOURCE AUTHORITY
  → QUALIFIED SOURCE / PACKET / CHUNK COHORT
  → CANDIDATE ORDINAL MAP
  → SEMANTIC_768 ADMISSION
  → CURRENT GRAPH SNAPSHOT + GRAPH ORDINAL MAP
  → AST / GRAPH / RETRIEVAL FEATURES
  → LATENT_256 → LATENT_128 / LATENT_64
  → CANDIDATE FEATURE MATRIX
  → ACE / BITFROST RESIDENCY POLICY
  → DAG PARAMETER MATERIALIZATION
  → CONTEXT MANIFEST → PROMPT PLAN
  → BOUNDED AGENT EXECUTION → OUTCOME / EXECUTION RECEIPT
```

## Phase plan

### Phase 11 — Engram / model memory wiring

Status: `PARTIAL`

Owner boundaries:

- Ornith `ornith-1.5-9b` via llama-server `:8090` owns synthesis and tool use.
- Ollama remains only the EmbeddingGemma embedding lane.
- Engram/analysis receipts remain append-only observations; `analysis_pass_results`
  is the existing receipt owner.

Implementation sequence:

1. Complete the bounded analysis-pass caller census.
2. Route active synthesis/NLP fallback calls through the shared Ornith resolver.
3. Persist only revision-qualified, grounded receipts; never hidden thoughts or KV data.
4. Prove replay and current-pass selection before any supersession operation.

Gate: `ORNITH-ANALYSIS-ADAPTER-01` → `ANALYSIS-PASS-CURRENT-SELECTION-01`.

**Step 1 caller census, completed 2026-09-05 (same day, via targeted rg, no writes)**: neither
named gate above has an owning OpenSpec change yet (`grep -rli "ornith.*analysis\|ORNITH-ANALYSIS"
openspec/changes/` returns zero hits) — this plan document is currently unowned by any tracked
change, contrary to its own "Role" statement that an owning change remains authoritative.

Real files found under `sveltekit-frontend/src/lib/server/analysis/`:
- **`analysis_pass_results`/`AnalysisPassResult` touchpoints (16 files)**: canonical trio appears
  to be `analysis-pass-results.ts` (writer), `analysis-pass-current.ts` (current-pass selector),
  `analysis-pass-boundary.ts` (caller boundary) — plus `worker.ts`, `nlp-feature-compiler.ts`,
  `source-pos-concept-packet.ts`, `code-evidence-readback.ts`, `code-feature-registry-enqueue.ts`,
  `../nlp/miniforge-nlp-sidecar.ts`, and matching `.spec.ts` files. Not independently verified
  which of these three is actually canonical vs. a duplicate this pass — read before extending.
- **Files still referencing `gemma4`/`ollama`/`llama-server`/model ports directly (12 files)**:
  `worker.ts`, `summarizer.ts`, `holistic-synthesizer.ts`, `entity-extractor-unified.ts`,
  `gemma4-nlp-reranker.ts`, `ast-langextract-bridge.ts`, `vlm-evidence-analyzer.ts`,
  `granite-docling.ts`, `evidence-analysis-pipeline.ts`, `agentic-fix-proposal.ts`,
  `hmm-error-classifier.ts`, `batch-error-analysis.ts`.

**CORRECTION (2026-09-05, same day, later pass) — the "11 of 12 are real Step 2 rerouting
candidates" conclusion above was wrong, reached from grep-level string matching without reading
the actual call sites.** Read each of the 12 files' actual model-call code before concluding
anything, per this repo's own "grep first, but a name/mention is not evidence — check real
callers" rule. Corrected finding: **zero of the 12 files need functional rerouting.**

- `summarizer.ts`, `holistic-synthesizer.ts`, `entity-extractor-unified.ts`,
  `gemma4-nlp-reranker.ts` — all four already call `resolveLlamaInferenceTarget()`
  (`sveltekit-frontend/src/lib/server/llm/runtime-contract.ts`, the actual canonical live-discovery
  resolver — `GET /v1/models` authoritative, launcher config only a preference) and send
  `target.model` dynamically. Already correct; only the filename `gemma4-nlp-reranker.ts` and a
  cosmetic trace label (`modelSource: 'llama-server-8090'`, an error tag `gemma4-error-${status}`)
  are stale, with zero effect on what model is actually called.
- `worker.ts` and `ast-langextract-bridge.ts` only dynamically `import('./gemma4-nlp-reranker.js')`
  — they delegate to an already-correct file, nothing to reroute directly.
- `batch-error-analysis.ts` imports `runGemma4Agent` from `$lib/server/ai/gemma4-agent.js`, a
  one-line re-export barrel (`export * from '../features/ai/ai/gemma4-agent.js'`) pointing to the
  real 2,300+-line implementation, whose `PLANNER_MODEL = VLM_MODELS.legal`. Checked
  `VLM_MODELS.legal` at its source (`sveltekit-frontend/src/lib/server/ollama.ts:24`): already
  `'ornith-1.5-9b'`, with an explicit comment confirming the migration
  ("Legal text reasoning / chat / agentic tool-calling (llama-server :8090, TurboQuant canonical)").
  Already correct — only the on-disk filename `gemma4-agent.ts` is stale.
- `agentic-fix-proposal.ts`'s hit was a false positive: `/gemma|tool-calling|.../ .test(haystack)` —
  a regex classifying *text content*, not a model call at all.
- `vlm-evidence-analyzer.ts`, `granite-docling.ts`, and `evidence-analysis-pipeline.ts`'s
  `synthesizeWithLLM()` all correctly use the **separate VLM lane** (`LOCAL_VLM_MODEL`/
  Granite-Docling document-vision model on the `:8085`/mmproj path). **CORRECTED same day
  (web-verified)**: this was written as a permanent architectural boundary ("Ornith cannot do
  vision") — that's wrong. Ornith 1.5 9B is upstream vision-capable
  (`ornith-ai/Ornith-1.5-9B-GGUF` on Hugging Face ships a real `mmproj-Ornith-1.5-9B-BF16.gguf`
  projector); the local `:8090` deployment simply has never loaded it (`GET :8090/props` →
  `modalities: {vision: false}` describes the current text-only profile, not a model limit).
  Rerouting these files to Ornith today would still be premature (no local Ornith-VLM profile is
  proven yet), but the reason is "unproven locally," not "impossible." See the new
  `ORNITH-VLM-MMPROJ-01` gate opened in `openspec/changes/parent-atlas-analysis-pass-ornith-adapter/`
  to acquire the real projector and prove a working local vision profile — only after that proof
  should any retirement of the old Gemma4 VLM path be considered.
- `hmm-error-classifier.ts` has one genuinely stale item, but it's cosmetic only: a hardcoded
  human-readable suggestion string ("Increase AbortSignal.timeout; check Gemma4 :8090 health...")
  inside an error-remediation-hint table — never executed as a model call, just displayed text. Low
  priority to fix, zero functional impact either way.

**Revised Phase 11 step 2 conclusion**: the "route active synthesis/NLP fallback calls through the
shared Ornith resolver" work is **already effectively done** across every real call site checked in
`sveltekit-frontend/src/lib/server/analysis/` — the shared resolver already exists
(`resolveLlamaInferenceTarget`) and every synthesis call site in this directory already uses either
it or the correctly-separate VLM lane. What remains is purely cosmetic (stale filenames/labels/one
error string) — not a blocking gate. This session did not check call sites outside
`src/lib/server/analysis/` (e.g. `src/mcp/`, other server directories referenced in root
`CLAUDE.md`'s "Ollama vs llama-server Boundary" 20-file sweep list) — that list may still contain
real gaps and was not re-audited this pass.

**Adjacent finding, not part of Phase 11's own scope but relevant caution**: `docs/
LANGGRAPH-KANBAN-ERROR-FIXING-INTEGRATION.md` (June 28, 2026) claims a separate "agentic error
fixing" LangGraph workflow is "✅ FULLY IMPLEMENTED — Ready for production." Verified `DORMANT_BUT_
INTACT`: the code exists (`packages/atlas-core/src/langgraph/kanban-error-fixing-agent.ts`) but has
zero real callers (only a manual npm script), never writes to the real `kanban_tasks` Postgres
table despite that table existing, and its "synthesis" node is a hardcoded placeholder string,
never calling any model. The June 28 "production-ready" claim was inaccurate even at the time it
was written. Cited here as a concrete cautionary precedent for Phase 11's own step 4 ("prove
replay... before any supersession operation") — don't let this phase repeat that pattern.

**Closed out (2026-09-06)** via `openspec/changes/parent-atlas-analysis-pass-ornith-adapter/`
(29/29 tasks done, `openspec validate --strict` passes):
- `ORNITH-ANALYSIS-ADAPTER-01`: `ALREADY_SATISFIED` — all 12 `analysis/` files plus 16 more from
  CLAUDE.md's wider 20-file sweep list were read in full. 13 of the 16 needed nothing; 2 needed
  nothing beyond a pre-existing shim already covering them (`whisper/transcribe/+server.ts`, saved
  by `ollamaFetch()`'s own TurboQuant intercept for non-streaming calls); **1 was a genuine live
  bug, now fixed**: `src/routes/(app)/chat/[id]/+page.server.ts`'s message-send action called
  Ollama's native `/api/generate` with `stream: true` and a llama-server model identifier as the
  Ollama model name — that streaming call bypassed the intercept (which only covers non-streaming
  requests) and had no safety net. Rewritten to call `resolveLlamaInferenceTarget()` +
  llama-server's `/v1/chat/completions` directly with real SSE parsing.
- `ANALYSIS-PASS-CURRENT-SELECTION-01`: the `DISTINCT ON` selection logic itself is proven correct
  via live replay (two real scenarios, both passed) — but a real, separate finding surfaced along
  the way: the **deployed** `analysis_pass_current` view does not match its own source file
  (`drizzle/manual/analysis_pass_current.sql`) — different status-literal filter (`'success'` live
  vs `'succeeded'` in the file) and a missing `id DESC` tiebreak, meaning ~99.8% of the table
  (rows written under the older `'success'` convention) are the only ones currently visible as
  "current," while the 19 rows written under the current typed contract (`'succeeded'`) are
  entirely invisible to it. Not fixed — reconciling the two status conventions needs an explicit
  operator decision, not a same-pass `CREATE OR REPLACE VIEW`. Full receipt:
  `docs/reports/parent-atlas/analysis-pass-current-selection-v1.json`.
- Engram ingestion "deferred" was investigated, not assumed: the read side
  (`LocalEngramMemoryAdapterImpl.getRoutingHints()`) is genuinely wired to 2 live callers. What's
  actually deferred is a producer for `recordWorkflowMemory()` (zero callers anywhere — the
  intended "validated lesson" ingestion path was fully built but nothing ever calls it), plus a
  **three-way duplication finding**: a second, independently-coded bigram writer
  (`search/engram-bigram.ts`, the one actually in live use) and a third, fully separate write path
  in a standalone script (`scripts/atlas/sync-engram-memory.mjs`) both share the `ace:engram:`
  prefix with the unused adapter but were never reconciled. Left open pending an operator decision
  on which bigram writer is canonical and what should trigger a workflow-lesson write.
- `ORNITH-VLM-MMPROJ-01` also closed in the same change (see the VLM correction note above this
  one): the real Ornith-specific mmproj was acquired, sha256-verified, wired into
  `launch-turboquant.ps1` behind family-keyed resolution, and live-proven (`modalities.vision:
  true`, 4/4 smoke tests including a real, semantically accurate image description).

### Phase 12 — Parent Atlas codebase index

Status: `PARTIAL`

Implementation sequence:

1. Keep source identity and byte-span ownership in the existing Atlas contracts.
2. Complete canonical directory/chunk segmentation for code, Markdown, JSON, and YAML.
3. Require exact `sourceRef`, `sourceRevision`, `workspaceRevision`, and chunk preimage.
4. Mark validated chunks eligible for PostgreSQL admission; the owning bounded
   admission gate performs any write before derived projections.

Current evidence: a bounded physical cohort covers 50 sources and 434 chunks;
source-to-chunk materialization binding is proven for that recorded scope.
Stable source-registry/repository-namespace authority remains unresolved, and
full current source authority remains blocked.

Gate: `DIR-INDEX-02C/02D` → `DOC-06A` → `DOC-27` where applicable.

### Phase 13 — Feature-gap registry

Status: `PARTIAL`

Implementation sequence:

1. Scan the current workspace through the existing registry owner.
2. Classify each feature as implemented, partial, missing, eval-only, or blocked.
3. Attach owner, evidence receipt, validation command, and next gate.
4. Keep registry state descriptive; it cannot promote identity or authorize writes.

Gate: live workspace scan plus evidence-resolution replay.

### Phase 14 — Redis exact-card / BitFrost policy

Status: `IMPLEMENTED_BOUNDED`

Implementation sequence:

1. Keep canonical invalidation/key constructors centralized.
2. Treat BitFrost/Valkey as derived residency and cache only.
3. Verify revision-qualified cache keys before consumption.
4. Add live residency adoption only under a separate bounded gate if required by workload.

Do not reopen the completed invalidation primitive or collapse packet/query cache
namespaces. No live writer is required by the current runtime.

### Phase 15 — Qdrant semantic lane

Status: `PARTIAL`

Implementation sequence:

1. Establish a non-empty current packet/chunk cohort.
2. Use the admitted canonical `semantic_768` representation from its existing
   owner. EmbeddingGemma is a model/runtime detail only where the owning
   representation receipt binds it to that representation revision.
3. Project named Qdrant vector `content` only after identity and revision checks.
4. Prove exact readback and bounded replay before scaling 15 candidates → 128
   candidates → 768 candidates.

`384` remains legacy/compatibility only. No new 384 writer is permitted.

Gate: source authority → packet eligibility → semantic projection parity.

### Phase 16 — Graph / KAG / DAG refresh manifest

Status: `PARTIAL`

Implementation sequence:

1. Keep the completed Graphify coordinator canary as execution evidence.
2. Establish a current completed source authority for the live workspace.
3. Bind an execution-bound graph snapshot to `GraphOrdinalMapV1`.
4. Build NetworkX interchange and GPU/topology projections from that same frozen
   snapshot, binding workspace, graph, source-population, node, edge, and
   ordinal-map checksums into the receipts.
5. Bind graph, feature, and parameter checksums into ContextManifest/PromptPlan.

Graph, KAG, NetworkX, cuGraph, and centroid outputs remain derived projections.
The stale `codebase-graph.json` warning does not authorize a broad refresh.

### Phase 17 — PyTorch feature extraction
4d topology manifold coordinates networkx python ontology linked tuples json graphs link concepts domain classifications nlp passes pytorch classifier ast cst semantic rpc grpc mmap[] from rtx cuda gemm primitives indexed ulid uuid v4-v*
Status: `PARTIAL`

Implementation sequence:

1. Consume only an admitted `semantic_768` candidate population.
2. Produce `latent_256` as the learned representation artifact.yes 
3. Derive `latent_128` and `latent_64` only with explicit parent revision and checksums.
4. Prove the currently registered RAPIDS/cuVS/cuGraph endpoint and capability
   revision, recording the resolved endpoint in the receipt.
5. Keep GPU ordinals reattached to canonical identities before export or caching.

Every representation receipt must bind `parentRepresentationRevision`,
`modelRevision`, `normalizationContract`, `populationChecksum`, and
`artifactChecksum`:

```text
semantic_768@R
  → trained model revision M
  → latent_256@L256
       ├→ latent_128@L128
       └→ latent_64@L64
```

Gate: current candidate/ordinal snapshot → representation ledger → GPU parity.

## Immediate execution queue

1. Complete `CURRENT-SOURCE-OWNER-RECONCILIATION-01`: identify the stable source
   identity and repository namespace owner without rewriting historical Graphify
   rows.
2. Re-run `SOURCE-EVIDENCE-AUTHORITY-01` and require a current completed bound owner.
3. Re-run the bounded packet preflight; do not authorize an empty candidate set.
4. Execute packet-membership 08A-07/08 only after a non-empty exact target exists
   and separate mutation authorization is present.
5. Resume semantic_768 expansion only after packet eligibility is proven.
6. Defer latent/GPU, centroid warming, and broad Qdrant work until those gates pass.

## Upstream execution API map

Upstream APIs are execution mechanisms only; the local OpenSpec contracts,
receipts, and admission gates remain authoritative.

| Workstation lane | Existing execution boundary | Required proof boundary |
| --- | --- | --- |
| Ornith synthesis/tool use | llama-server `GET /v1/models`, `POST /v1/chat/completions` with Jinja/tools | resolved model and synthesis receipt; no hidden-thought persistence |
| Embedding | Ollama `POST /api/embed` for EmbeddingGemma | representation/model/dimension/normalization revision receipt |
| Source structure | Tree-sitter byte ranges and queries; ast-grep pattern observations | Tree-sitter remains structural identity owner; ast-grep is an adapter |
| Bounded PostgreSQL apply | one checked-out node-postgres client, `FOR UPDATE`, exact `UPDATE ... RETURNING` | proposal + authorization + exact preimage + transaction/readback receipt |
| BitFrost/Valkey | `GET` read proof; `SET`/`DEL` only in an explicitly mutating fixture | effect-accurate cache receipt; no canonical writes |
| Qdrant projection | named vector `content`, explicit query name, awaited visibility when required | admitted identity/revision and exact projection readback |
| CPU/GPU graph | NetworkX oracle ↔ cuGraph on one frozen graph and ordinal map | graph, node, edge, and ordinal-map checksums match |
| Neo4j relationship | existing driver owner with managed write transaction and constrained `MERGE` | bounded relationship receipt; separate DOC-14 gate |
| Learned representations | PyTorch encoder, then nested normalized latent views | parent representation, model, normalization, population, and artifact checksums |
| Vector challengers | cuVS brute-force exact oracle; CAGRA/IVF-PQ challengers | same candidate ordinal map and held-out recall/latency receipt |
| Execution telemetry | OpenTelemetry transport/database spans plus Atlas attributes | packet-attributed execution observations; `execution_utility` remains unavailable until real traffic exists |

This map does not authorize implementation or promotion. In particular, it does
not make Qdrant, Neo4j, cuGraph, Valkey, or an upstream model API a canonical
identity owner.

## Validation policy

Every phase tranche must provide:

- an owning OpenSpec task reference;
- a deterministic receipt or proof report;
- independent readback where writes occur;
- explicit mutation scope;
- replay behavior;
- a statement of what remains unproven.

No phase label in this plan is a promotion authorization.
