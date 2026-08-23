# Phase alignment audit: HMM/Viterbi → MCP/DAG → prefill/decode

Date: 2026-08-22  
Status: `PARTIAL_PROVEN / TRAINING_ALIGNMENT_BLOCKED`

## Result

The repository already contains the individual lanes:

- HMM/tool selection and a generic k-best Viterbi implementation in SvelteKit;
- bounded MCP tool dispatch and OpenCode `hforf.gguf` protocol compatibility;
- Parent Atlas contextual prefill, Valkey metadata caching, and runtime KV reuse
  contracts;
- bounded DAG policy and Mastra workflow compilation fixtures.

The missing boundary was a single revision-qualified receipt connecting the
observed HMM state path, selected tool/DAG edge, exact-evidence gate, prefill
identity/cache state, decoder runtime, and encoder input. That boundary is now
implemented as a pure package contract:

`packages/parent-atlas/src/core/phase-alignment-runtime.ts`

It only returns a decision/receipt. It does not call MCP, execute a model, write
Valkey/Postgres/Qdrant/Neo4j, or admit training data.

The existing SvelteKit bounded-tool caller and LangGraph synthesis node now
accept this receipt as an
opt-in gate. `BLOCK` and `PREFILL` stop dispatch; `RETRIEVE`, `EXPAND_GRAPH`,
`VALIDATE`, and an admitted `DECODE` continue through the existing registry.
The adapter carries the receipt on the normalized tool result and does not
replace the registry or create a second tool executor.

The package also exposes `runPhaseAlignedExecution()`, a dependency-injected
bounded runner. It compiles a miss once, re-checks the phase receipt, and then
decodes once; a hit skips compilation. Adapters still own all side effects.

`buildValkeyPhaseDeps()` now binds that runner to the existing Valkey adapter
contract: lookup → compile only on miss → immutable `SET NX` metadata record →
validated readback. The wrapper never stores KV tensors or model hidden state.

## New gates

`PhaseAlignmentReceiptV1` now proves, at contract level:

1. HMM quarantine blocks tool and model execution.
2. Exact evidence must be promoted before prefill.
3. A cache miss/stale/corrupt prefill selects `PREFILL`, never `DECODE`.
4. `DECODE` requires exact evidence, a reusable prefill, a prefill identity,
   and a decoder runtime revision.
5. `training_example_admitted` is explicitly `false`; inference reuse is not
   silently converted into encoder-training evidence.
6. Workspace, source, graph, representation, HMM, tool-schema, and context
   revisions remain attached as evidence references.

## Validation

- Parent Atlas TypeScript build: passed.
- Parent Atlas phase-alignment fixtures: `7/7` passed, including quarantine
  blocking and zero-dispatch behavior.
- Complete Parent Atlas Node suite: `259/259` passed. The suite now includes
  canonical package exports, graph snapshot V2, retrieval executor policy,
  temporal indexing, ACE cache branching, claim-verification contracts, and
  the encoder-training receipt fixture.
- SvelteKit HMM/prefill/DAG/Mastra fixtures: `19/19` passed.
- LangGraph temporal regression plus phase-gated tool caller tests: `6/6`
  passed. Existing temporal alternative behavior remained unchanged.
- Live MCP JSON-RPC verification: passed; TRACE exposed `175` tools and
  rejected invalid arguments through the schema path.
- Live 8090 `hforf.gguf` smoke: `5/5` passed. System-role capability,
  advertised tool support, exact system-prompt handling, an actual structured
  `rg_search` tool call with valid JSON arguments, and streaming all passed.
  This proves local facade protocol compatibility, not durable MCP/DAG
  business replay or production promotion.
- Live bounded phase replay: passed. `hforf.gguf` emitted `rg_search`, the
  phase runner admitted `RETRIEVE`, the injected tool executed once, and the
  replay proved `training_example_admitted=false` and
  `canonical_write_attempted=false`. This is a dry-run execution proof; it
  does not authorize a real MCP mutation or durable receipt write.
- Encoder-training dataset receipt fixture: `2/2` passed. The receipt binds
  dataset/evidence/matrix/representation/encoder/prompt/label revisions and
  fails closed for shadow admission without verified examples. It always
  carries `training_example_admitted=false` and
  `canonical_writes_allowed=false`; no real dataset or training run occurred.
- A real Postgres/DAG integration harness already exists at
  `sveltekit-frontend/src/lib/server/atlas/temporal/temporal-recommendation-outcome-dag.integration.spec.ts` and is correctly gated by
  `RUN_DB_INTEGRATION=1`. Its default-skipped invocation did not reach the
  skip summary because the SvelteKit import graph remained active; no database
  connection or write was attempted. Treat the live durable proof as open.
- The configured database resolves to `127.0.0.1:5434/legal_ai_db` and the
  active container is `legal-ai-postgres`. This is the shared workstation
  database, not an explicitly isolated integration target; the live receipt
  proof therefore remains blocked until a disposable database/container is
  named and approved.
- Read-only catalog inspection found only `legal_ai_db`, `langfuse`, and
  `postgres`; no disposable integration database is available. The configured
  application role is `legal_admin`, while the default `postgres` role is not
  present. No schema or data mutation was attempted.
- The durable integration harness is now fail-closed: it requires both
  `RUN_DB_INTEGRATION=1` and an explicit `ATLAS_INTEGRATION_DATABASE_URL`.
  Without both values, its three live tests skip without importing the DB
  client, so the shared `DATABASE_URL` cannot be used accidentally.
- Added a non-mutating preflight at
  `scripts/tests/preflight-temporal-integration.mjs`. It confirms all four
  manual migrations are present and rejects missing, malformed, or shared
  workstation database URLs before the live harness can be enabled.
- The preflight migration order is explicit: artifact transport first, then
  action events, then sequence alignment (which reads the action-event table),
  then recommendation-outcome receipts.
- LangGraph cache access is now behind
  `sveltekit-frontend/src/lib/server/cache/langgraph-cache-adapter.ts`;
  `langgraph-dag.ts` no longer owns a direct Valkey client. Temporal/LangGraph
  regression tests remain green (`6/6`).
- The legacy MCP dispatcher now has an opt-in phase-aware adapter for
  `kb.rg_atlas_search`. It validates and returns the phase receipt, blocks
  quarantine before the existing handler, and strips `phase_alignment` from
  domain input before dispatch. The existing dispatcher remains the executor.
- Read-only Valkey probe: `PONG`, Redis-compatible runtime `7.2.4`, and
  `0` keys under `atlas:prefill:v1:*`. Connectivity is proven; no cache
  record was written and the real read/write/readback gate remains open.
- The first attempt ran the Node TAP files through Vitest and reported “No test
  suite found”; this was a runner mismatch, not a test failure. The correct
  `node --test` run is recorded above.
- No live model execution, MCP business-tool replay, Valkey round trip,
  encoder-training run, or canonical store mutation was performed.

## Current proof classification

| Surface | Status | Remaining proof |
|---|---|---|
| HMM rule-based tool selection | `FIXTURE_PROVEN` | true sequence-model/Viterbi production receipt |
| Viterbi sidecar boundary | `CONTRACT/WIRED` | live sidecar health and deterministic replay |
| MCP tool-call protocol | `PROTOCOL_PROVEN` | per-tool business result receipts |
| DAG policy/Mastra compilation | `FIXTURE_PROVEN` | live bounded DAG harness |
| Parent Atlas prefill identity/cache | `RUNTIME_REACHABLE / FIXTURE_PROVEN` | non-production Valkey read/write/readback |
| HMM → DAG → prefill/decode phase receipt | `WIRED_FIXTURE_PROVEN` | live prefill adapter and durable replay |
| quarantine zero-dispatch gate | `FIXTURE_PROVEN` | live bounded DAG replay |
| hforf → bounded phase replay | `BOUNDED_LIVE_PROVEN` | real MCP business dispatch and durable receipt |
| legacy MCP phase envelope | `WIRED_FIXTURE_PROVEN` | live receipt persistence and business result receipt |
| encoder-training alignment | `RECEIPT_FIXTURE_PROVEN / TRAINING_BLOCKED` | real lineage-qualified dataset, baseline, and shadow evaluation |

## Next gates

- Persist the phase receipt and business result through the existing durable
  workflow/temporal owners once an isolated Postgres target exists.
- Run one bounded replay: `SEARCH_CODE → rg.search → exact promotion →
  prefill MISS → compile → decode`, then repeat with `prefill HIT` and verify
  no duplicate compile claim.
- Run a quarantine replay and assert zero MCP/model dispatches.
- Add a non-production Valkey round trip and persist only the receipt/artifact
  reference, never KV tensors or hidden model state.
- Generate a real, revision-qualified encoder-training dataset only from
  verified evidence; the phase receipt and dataset receipt must never by
  themselves authorize training.

No production promotion is claimed.
