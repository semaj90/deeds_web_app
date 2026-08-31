# Parent Atlas Adaptive DAG Fabric

## Goal

Freeze one adaptive-DAG contract for query answering that spans local retrieval
(Postgres/Tree-sitter/ast-grep/graph/Qdrant), structural extraction (ast-grep,
simdjson), and optional external evidence (web search), converging through a
single deterministic evidence→context→prompt chain before Ornith synthesis.
RabbitMQ is the work-execution broker for this fabric today; it does not
become, and does not need to become, a second canonical data store.

## Non-goals

- NATS JetStream does **not** become a second dispatcher for the same DAG
  actions RabbitMQ already dispatches (`AST_SCAN`, `EMBED`, `GRAPH_EXPAND`,
  `SYNTHESIZE`, ...). Two brokers owning one action class means duplicate
  delivery/dedup/retry semantics — never do this.
- Queue messages do not carry source trees, embeddings, AST JSON, evidence
  bodies, prompt text, or graph payloads. They carry ids, checksums, and
  artifact references (`ArtifactAddressV1`, per
  `parent-atlas-candidate-feature-execution-fabric/tasks.md` QUEUE-01/02).
- The DAG planner selects from a bounded `DagActionKind` catalog. It never
  generates or executes arbitrary planner-authored code.
- ast-grep match output is never treated as `stableSymbolId` directly — the
  registry/LSP resolution layer owns that promotion (matches the existing
  hard rule for ast-grep in this repo).
- External (web) evidence never receives `packetKey` / `stableSymbolId` /
  `CandidateOrdinal` identity unless an explicit, later ingestion-promotion
  step creates it. Web evidence starts and stays second-class until promoted.

## Frozen DAG shape

```text
REQUEST
  → QueryClassificationV1
  → AdaptiveDagPlanV1
      LOCAL:      FETCH_POSTGRES | GRAPH_EXPAND (Postgres, Qdrant, NetworkX/cuGraph, BitFrost)
      STRUCTURAL: AST_SCAN (Tree-sitter → ast-grep) | SIMDJSON_SCAN
      EXTERNAL:   WEB_SEARCH (optional, gated by QueryClassificationV1.externalEvidenceNeeded)
  → TypedEvidenceEnvelopeV1  (one per branch)
  → EvidenceManifestV1        (ordered, checksummed, deterministic fan-in)
  → CandidateFeatureDAG       (existing candidate-feature-execution-fabric contract)
  → ContextManifestV1 → PromptPlanV1
  → Ornith synthesis → SynthesisReceiptV1
```

The central rule: **the DAG passes ids, checksums, and artifact references.**
RabbitMQ/queue JSON is never the owner of the data those references point to.

## Contracts to define

- **`WorkflowActionEventV1`** — the queue message shape for every DAG node
  dispatch: `workflowRunId`, `actionId`, `parentActionIds`, `dagRevision`,
  `actionKind` (one of `DagActionKind`), `inputArtifactRefs`,
  `inputChecksum`, `parameterArtifactRef`, `parameterChecksum`,
  `producerRevision`, `attempt`, `maxAttempts`, `timeoutMs`, `failurePolicy`
  (`FAIL_CLOSED` | `SKIP_OPTIONAL` | `RETRY` | `FALLBACK`), `outputContract`.
- **`DagActionKind`** — bounded enum: `FETCH_POSTGRES`, `FETCH_QDRANT`,
  `FETCH_FILE`, `AST_SCAN`, `SIMDJSON_SCAN`, `GRAPH_EXPAND`, `WEB_SEARCH`,
  `RERANK`, `BUILD_CONTEXT`, `SYNTHESIZE`. Each has an input schema, output
  schema, timeout, retry rule, mutation policy, and receipt schema. The
  planner selects and parameterizes from this catalog; it never invents a
  new one at runtime.
- **`FetchParameterPlanV1`** — `queryId`, `requests[]` where each request is
  `{ requestId, provider: POSTGRES|QDRANT|FILE|GRAPH|WEB, operation,
  parameters, requiredRevision, maxResults, timeoutMs, orderingPolicy,
  dedupPolicy }`. Fan-in is **canonical sort + dedup by evidence identity
  checksum into `EvidenceManifestV1`** — never string concatenation of raw
  fetch results. Prompt text compiles last, after the evidence manifest is
  closed and token-budgeted into `ContextManifestV1`/`PromptPlanV1`.
  Concatenating before evidence-identity dedup produces nondeterministic
  prompts and is explicitly forbidden.
- **`AstGrepActionV1`** — `sourceRef`, `sourceRevision`, `sourceContentChecksum`,
  `ruleId`, `ruleRevision`, `observations[]` (`startByte`, `endByte`,
  `nodeKind`, `captures`), `producerRevision`, `canonicalAuthority: false`.
  ast-grep is a DAG **evidence** node (structural/relational rules: inside,
  has, precedes, follows — not merely regex matching), never an identity
  authority.
- **`WebSearchPlanV1`** — gated by `QueryClassificationV1.externalEvidenceNeeded`.
  Frozen limits: `reason`, `queries[]`, `allowedDomains`, `blockedDomains`,
  `maxQueries`, `maxResultsPerQuery`, `maxFetchedDocuments`, `maxBytes`,
  `timeoutMs`, `freshnessPolicy`, `canonicalAuthority: false`. Results
  become `ExternalEvidenceV1`, folded into the same `EvidenceManifestV1` as
  local evidence, with external-evidence ids — not local identity types.
- **simdjson placement** — for JSON/NDJSON artifacts: artifact bytes →
  simdjson On-Demand selected fields → Zod/JSON-Schema **typed validation**
  → `TypedEvidenceEnvelopeV1`. Never `simdjson-parsed field → canonical id`
  directly; simdjson's On-Demand model validates fields as consumed, so the
  typed adapter must actually touch every correctness-critical field, not
  assume upfront validation happened. `iterate_many` (lazy, non-copying) is
  the right primitive for NDJSON receipt/event/manifest streams.

## Broker ownership (today, frozen)

RabbitMQ = durable **service work dispatch**, not canonical data, not
canonical identity, not evidence storage. Postgres remains canonical
identity/provenance; Qdrant remains vector projection; Arrow/mmap remains
numeric-matrix storage; SeaweedFS/S3 remains immutable large-artifact
archive; RabbitMQ and (later, optionally) NATS JetStream carry only work
references and event references — never the data itself.

**Adopted option: A now, B eventual.**
- **Option A (now)**: RabbitMQ owns service work execution. JetStream is not
  active.
- **Option B (eventual target, not started)**: RabbitMQ stays the bounded
  compute-job queue; JetStream becomes a separate, replayable
  `PARENT_ATLAS_EVENTS` agentic event log (`atlas.workflow.*`,
  `atlas.receipt.created`, `atlas.artifact.created`,
  `atlas.validation.{passed,failed}`, all carrying `WorkflowActionEventV1`
  bodies) — an audit/observability fabric, never a second work dispatcher.
  JetStream's `WorkQueue` retention + durable-consumer + explicit-ack
  semantics fit an admin/audit event stream well; they must never be used to
  dispatch the same `AST_SCAN`/`EMBED`/`GRAPH_EXPAND`/`SYNTHESIZE` actions
  RabbitMQ already dispatches.
- **Option C (only after parity proof)**: JetStream replacing RabbitMQ for
  DAG work execution entirely. Not evaluated; not scheduled.

## Prerequisite fixed by this change

`RUNTIME-QUEUE-01` (see tasks.md) closed a real, live bug that matches the
"consuming from a nonexistent queue closes the channel" RabbitMQ failure
mode exactly: `RabbitMQManager.queues` (`rabbitmq-manager-fixed.ts`) — the
registry `setupInfrastructure()` iterates to `assertQueue` every queue
before any consumer starts — had 7 of `queue-worker.ts`'s 8 legacy
`QueueWorker` subclass queue names, but not `WebIngestWorker`'s
`'kb.ingest'`. `queue-worker.ts`'s `consume()` calls `channel.consume()`
directly with no `assertQueue` of its own; `web-ingest.ts`'s
`publishToQueue()` also never asserts. So `kb.ingest` was declared by
nothing, anywhere, before `createDefaultRegistry().startAll()` tried to
consume from it at boot. Fixed by adding `kb_ingest: 'kb.ingest'` to
`this.queues` so it is asserted during `initialize()` → `setupInfrastructure()`,
which the RabbitMQ XState pipeline (`rabbitmq-xstate-integration.ts`)
guarantees completes (`connecting` → `consuming`) before
`hooks.server.ts` invokes `createDefaultRegistry().startAll()`.

This was the whole fix required for the immediate failure. It did **not**
require NATS JetStream, a worker-registry rewrite, or any part of the DAG
contract above — those remain separate, larger, deliberately-not-yet-started
work tracked by this change.
