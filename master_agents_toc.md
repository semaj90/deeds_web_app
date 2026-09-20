# Parent Atlas Master Agents TOC

Status: read-only control-plane guide
Updated: 2026-09-19

This file is a navigation and operating guide for agents. It is not a second
OpenSpec ledger, identity store, task authority, or promotion mechanism.

## What the governed agent flow does

```text
OpenSpec controller report
  -> select ACTIONABLE task only
  -> validate completion envelope
  -> classify error
  -> create minimal repair plan
  -> run an allowlisted smoke profile
  -> emit CREATED / WIRED / PROVEN / DONE receipt
  -> reconcile against the refreshed controller
```

The workflow is plan-and-smoke only. It does not edit task checkboxes, apply
database changes, write Qdrant or Valkey, refresh Graphify, mutate source data,
merge worktrees, or authorize promotion.

## Expected timing

Times are operational estimates, not completion guarantees.

| Operation | Typical time | What it proves |
| --- | ---: | --- |
| Read controller and select a task | <1 second | Current report can be parsed and the task is ACTIONABLE |
| Completion-envelope validation | <1 second | Scope, gates, fallbacks, and budget are safe |
| One allowlisted local smoke | seconds to a few minutes | The selected proof command ran |
| Focused SvelteKit tests | about 30–60 seconds | API/controller behavior in the local test environment |
| OKF freshness audit | seconds | Derived claims are complete, stale, or unresolved |
| Directory/Graphify awareness audit | seconds to minutes | Navigation and topology evidence only |
| Full live lineage, vector, GPU, or promotion gate | not bounded by this workflow | Requires external authority, services, readback, or operator approval |

A successful smoke does not automatically make a task `DONE`. The controller
must independently report `PROVEN_CURRENT`.

## What agents can do now

### Controller and repair lane

- Select from the full `allTasks` controller population.
- Reject waiting, deferred, superseded, stale, or authority-gated tasks.
- Validate the selected completion envelope.
- Produce a bounded repair plan.
- Run only server-registered smoke profiles.
- Suppress retries when the failure fingerprint and relevant receipts are unchanged.
- Emit a reconciliation status: `PROVEN_CURRENT`, `WAITING_ON_DEPENDENCY`,
  `WAITING_ON_AUTHORITY`, `SMOKE_FAILED`, or `REVIEW_REQUIRED`.

Primary files:

- `sveltekit-frontend/src/routes/api/ai/error-agent/+server.ts`
- `sveltekit-frontend/src/lib/server/ai/error-agent/openspec-controller.ts`
- `sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop.ts`
- `sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop-langgraph.ts`

### Documentation and claim lane

- Audit existing OKF/OpenWiki-derived artifacts.
- Report missing claim identity, source/workspace revision, evidence refs,
  evidence checksum, and producer revision.
- Detect stale source/workspace revisions when reference revisions are supplied.
- Produce deterministic claim and index checksums.

Primary command:

```text
npm run atlas:docs:okf-claim-freshness
```

The OKF lane remains derived. It cannot create packet identity, ontology
identity, CandidateOrdinal, retrieval authority, or canonical writes.

## Authority map

| Concern | Owner | Agent relationship |
| --- | --- | --- |
| Source bytes and workspace admission | PostgreSQL/lineage owner | Read and verify only |
| Packet/chunk identity and revisions | Canonical packet writer | Consume receipts; never synthesize authority |
| AST/CST and spans | 8095 structural lane | Derived evidence after source admission |
| Semantic vectors | `semantic_768` canonical contract | Compare executors; do not create extra votes |
| Qdrant | Rebuildable semantic projection | Readback/challenger only until parity |
| Valkey/BitFrost | Revisioned metadata and ACE cache | Cache manifests and packets, never truth/KV tensors |
| Graphify/Neo4j/cuGraph/NetworkX | Derived graph projections | Navigation, analysis, and parity receipts |
| OpenSpec | Task and completion ledger | Controller reads it; agents do not silently rewrite it |
| llama-server `:8090` | Ornith chat/synthesis owner | Final synthesis only after canonical ACE context |
| Ollama `:11434` | EmbeddingGemma lane | Embeddings only; not chat authority |

## OpenSpec progression

1. Tasks census and implementation-order projection.
2. Completion envelopes and execution controller.
3. Blocker ownership and retry suppression.
4. Read-only audits and fixture proofs.
5. Source/workspace/packet/chunk/AST lineage closure.
6. CandidateOrdinal and semantic snapshot freeze.
7. Exact-vs-ANN and executor parity.
8. ACE ContextManifest and PromptPlan readiness.
9. Operator approval and independent readback.
10. Promotion, only after all authority gates pass.

Current critical path:

```text
execution/source authority
  -> packet materialization and digest
  -> PacketRevisionOwnerV1
  -> packet/chunk closure
  -> packet/AST/span closure
  -> CandidateOrdinalMapV1
  -> semantic snapshot and ANN parity
  -> ACE/prefill readiness
  -> promotion authorization
```

## Current findings

- The controller population is 9,143 tasks; the current report records 5,816
  proven, 2,309 actionable, 912 waiting, and 106 deferred.
- P10 remains waiting because current lineage, candidate freeze, live ANN parity,
  and promotion authorization are not proven.
- The current controller completion envelope has eight required gates and a zero
  expansion budget: no new blockers, no new owners, and no architecture expansion.
- The error-agent integration is proven only in read-only fixture mode. Its GAN
  state is `CREATED`, `WIRED`, `PROVEN`, and not `DONE`.
- The OKF freshness audit found 34 derived artifacts and 0 fully valid claims.
  Existing pages are useful documentation, but they lack complete revision and
  evidence metadata for promotion.
- OpenWiki is optional and derived. Installing it is not required for the
  governed error-agent path.
- Chat ownership is now independently live-proven: `llama-server` at `:8090`
  advertises `ornith-1.5-9b` through `/v1/models` and passes `/health`.
  Ollama raw `/api/chat` and `/api/generate` callers are prohibited; the
  current static guard reports zero prohibited callers. Ollama remains the
  EmbeddingGemma-only lane at `:11434`.
- The live chat receipt is
  `docs/reports/llama-server-chat-ownership-v1.json`; it is read-only evidence
  and does not prove the full synthesis, vision, or ACE end-to-end path.
- Durable agent-work receipts remain owned by the existing
  `outcome_ledger`/Drizzle receipt boundary. Contract and injected replay/
  conflict behavior are proven; live PostgreSQL readback and operator
  acceptance of tournament receipt policy remain deferred. LangGraph
  checkpoints remain separate and opt-in, keyed by `thread_id`.
- The existing `PatchTournament` owner remains the only tournament owner.
  Planner and fixture evidence are proven; isolated candidate execution,
  candidate verification, deterministic survivor ranking, ACE comparison, and
  human approval remain deferred. No second tournament implementation is
  permitted in the agentic-completion change.
- Current replay evidence is deterministic for three fixture candidates
  (`replayEqual=true`), and the worktree seam plans three candidate slots.
  The next gate is `AUTHORIZED_ISOLATED_CANDIDATE_EXECUTION`; the replay does
  not authorize worktree creation, patch application, merge, or training.
- Tournament planning and fixture replay are proven, but live execution remains
  deferred to the existing graph-retrieval-proof owner. The current owner audit
  identifies the remaining seams as candidate generation, isolated worktree
  execution, candidate static/focused verification, and human approval. No
  second tournament implementation is allowed here.
- Capability census currently reports 31 proven capabilities, 7 waiting, 4
  unproven, and 1 contract-only capability across the bounded repository
  inventory. Awareness reports are written to `docs/reports/staging/` and are
  read by the SSR board as a derived snapshot; they are not authority.
- Runtime readiness currently reports 4 proven, 1 partial, 5 waiting, and 4
  unproven gates. Packet readiness, prefill readiness, and live promotion are
  false.
- The selected Graphify execution `74d50c86-8194-45ea-8c3d-61aab737ef83` now
  resolves as the current execution-owner candidate under the admitted
  workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
  Source authority is still not promotable because the worktree is dirty and
  its current inventory differs from the sealed 25,542-source workspace
  manifest.
- The receipt schema audit observes 3 existing agent-work receipts with
  receipt IDs and completion checksums. New receipt writes remain deferred.

## Recommended agent loop

```text
1. Run the controller audit.
2. Run the blocker audit.
3. Select the nearest ACTIONABLE task.
4. Validate its envelope and required receipts.
5. Run the allowlisted smoke.
6. Re-read the controller.
7. Record PROVEN_CURRENT or the stable blocker.
8. Stop retrying until relevant evidence changes.
```

Recommended commands:

```text
npm run atlas:docs:execution-controller
npm run atlas:docs:execution-controller:direct
npm run atlas:docs:blocker-audit
npm run atlas:docs:governed-audit
npm run atlas:docs:okf-claim-freshness
npm run atlas:tournament:owner-audit
npm run atlas:tournament:seam-preflight
npm run atlas:agentic:receipt-owner-audit
npm run atlas:agentic:receipt-schema-audit
cd sveltekit-frontend
npx vitest run src/lib/server/ai/error-agent src/routes/api/ai/error-agent --reporter=dot
```

## Explicitly out of scope for this agent lane

- Database migrations or packet backfills.
- Qdrant collection mutation or Valkey canonical promotion.
- CUDA/RAPIDS/TensorRT upgrades.
- Hidden thoughts, KV tensors, recurrent state, or raw tensor persistence.
- Automatic OpenSpec checkbox changes.
- Automatic worktree merge, training, or model promotion.
- Treating KMeans, SOM, PageRank, HyperGraphRAG, or learned rankers as identity
  or source authority.

## Evidence reports

- `docs/reports/openspec-execution-controller-v1.json`
- `docs/reports/openspec-blocker-audit-v1.json`
- `docs/reports/okf-claim-freshness-v1.json`
- `docs/reports/agentic-error-fixing-openspec-alignment-v2.json`
- `docs/reports/patch-tournament-owner-audit-v1.json`
- `docs/reports/patch-tournament-worktree-seam-v1.json`
- `docs/reports/agentic-receipt-owner-audit-v1.json`
- `docs/reports/agentic-receipt-live-schema-v1.json`

The reports are projections. PostgreSQL/lineage receipts and independent
readback remain authoritative for live promotion.
