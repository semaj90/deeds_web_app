## Orchestration ownership decision (step 3)

**LangGraph is the current orchestration runtime owner.** Do not install
Mastra to legitimize files that merely use "Mastra" in their names.

Rationale, from verified evidence:
- `@langchain/langgraph` + `@langchain/core` are real installed
  dependencies, and `dispatcher-graph.ts` uses the real `StateGraph`/
  `Annotation`/`END`/`START` API — not a shim.
- `@mastra/core` is not installed at all. Every file in this repo calling
  itself "Mastra" (`atlas-mastra-adapter.ts`, `atlas-mastra-workflow.ts`,
  `/api/atlas/mastra-agent`) is homegrown code with Mastra-shaped naming,
  now patched with local passthrough shims (`createTool`, `defineWorkflow`)
  that preserve the call shape but provide none of the real runtime
  (tool selection, step orchestration, model loop).
- Deep Agents: not installed, no runtime claims.

Two workflow engines should not own the same lifecycle. Until Mastra is
formally adopted (a separate, explicit decision — not implied by existing
naming), all new orchestration work targets LangGraph's `StateGraph`
pattern, following `dispatcher-graph.ts`'s existing structure.

## Dispatcher worker entrypoint (steps 5–6)

`startIdentityListener()` (`src/lib/server/dispatcher/rabbitmq-identity-listener.ts:45`)
is real and complete but has zero callers anywhere in the app. Before
wiring a startup trigger, the intended event source must be explicit —
options are a RabbitMQ message (matches the function's own name and
existing `dispatcher-signal-extractor.ts`), an ACP task, a direct MCP
invocation, a scheduled queue consumer, or a manual admin route.

Given the function is already RabbitMQ-shaped, the safest first
entrypoint is a standalone worker process, not a hook:

```
scripts/atlas/dispatcher-worker.mjs   (or .mts)
npm run atlas:dispatcher:worker
```

Required before this is anything but a toy:
- single-process lock (same pattern as the graphify pipeline lock fix
  from `session-159-followup-tasks.md` — PID-liveness check, no
  unconditional release-on-failure)
- queue consumer wired to `startIdentityListener`
- graceful shutdown (SIGTERM/SIGINT → drain in-flight, ack/nack cleanly)
- retry policy + dead-letter handling
- `/health` endpoint (or a Redis heartbeat key, consistent with other
  sidecars in this repo)
- structured telemetry (reuse `acp-mcp-telemetry.ts` if it fits — check
  before building a parallel telemetry path)

**Do not** wire this into `hooks.server.ts`. `vite dev` reloads the
module graph on file changes; a hook-based start would spawn duplicate
RabbitMQ consumers on every reload — the same failure class as this
session's TurboVec duplicate-bind bug (two processes both holding a
listener, work nondeterministically routed between them). Prove one real
task end-to-end via the manual worker command first; only then evaluate
automatic startup, with an explicit single-instance guard.

## Canonical pre-call schema — first operation: `atlas.retrieve_evidence`

Chosen because it's the most-referenced Atlas operation across MCP,
the (currently-gated) mastra-agent route, and `atlas-mastra-adapter.ts`'s
`atlasRetrieveTool`. Centroid routing is modeled as optional and
defaults to disabled so this schema is not blocked on the centroid
key-contract decision (`session-159-followup-tasks.md` Phase 11).

```typescript
import { z } from 'zod';

export const RetrieveEvidenceInputSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  workspaceRevision: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(20),
  lanes: z
    .array(z.enum(['exact', 'lexical', 'semantic', 'ast', 'schema', 'graph', 'centroid']))
    .default(['exact', 'lexical', 'semantic', 'ast']),
  centroidRouting: z
    .object({
      enabled: z.boolean().default(false),
      representationRevision: z.string().optional(),
    })
    .optional(),
});
export type RetrieveEvidenceInput = z.infer<typeof RetrieveEvidenceInputSchema>;
```

Contract: until a centroid projection exists and is approved,
`centroidRouting.enabled` stays `false`, or the runtime returns
`{lane: 'centroid', status: 'not_configured', candidateCount: 0, fallbackUsed: true}`
and continues through the Qdrant/lexical lanes — never a silent empty
result indistinguishable from "searched, found nothing" (the exact defect
found in `parallel-orchestrator.ts:183`).

## Shared pre-call layer (step 9)

Not MCP-specific middleware — must be callable identically from MCP,
tRPC, LangGraph nodes, and future gRPC/ACP/A2A adapters. Proposed module
family (create only as each step above actually needs it — do not
scaffold all seven files speculatively):

```
src/lib/server/parent-atlas/precall/
  transport-precall.ts     — auth + Zod validation, transport-agnostic
  query-precall.ts         — workspace-revision validation, normalization
  query-plan-schema.ts     — the QueryPlanSchema (below)
  normalize-query.ts
  classify-intent.ts
  build-retrieval-plan.ts
  token-budget.ts
  capability-check.ts
```

Call flow: transport request → auth + Zod validation → workspace-revision
validation → query normalization → deterministic query planning → cache/
centroid routing (optional, degrades to `not_configured`) → domain
service call → output validation.

## Deterministic query planning (step 9, supporting)

The planning pass returns a compact plan, not prose. Gemma4 (or any LLM)
should not decide the base retrieval plan directly from raw repository
content — use rules/lightweight NLP first; reserve LLM synthesis for
after the plan has already bounded the retrieval.

```typescript
const QueryPlanSchema = z.object({
  intent: z.enum([
    'exact_symbol',
    'semantic_search',
    'schema_lookup',
    'dependency_analysis',
    'error_diagnosis',
    'repair_target',
    'research',
  ]),
  lexicalQueries: z.array(z.string()).max(6),
  symbolHints: z.array(z.string()).max(20),
  retrievalLanes: z.array(
    z.enum(['exact', 'rg', 'bm25', 'semantic_768', 'ast', 'schema', 'graph', 'centroid'])
  ),
  topK: z.number().int().min(1).max(100),
  graphHops: z.number().int().min(0).max(3),
  needsEmbedding: z.boolean(),
});
```

## Shared domain-service shape (step 9, cross-transport)

```
MCP adapter ─┐
tRPC procedure ─┼─→ ParentAtlasDomainService ─→ gRPC adapter / ACP adapter
LangGraph node ─┘
```

Canonical schema source: Zod (domain runtime validation). Everything
else derives from it — MCP tool JSON Schema is generated from the Zod
schema (not hand-maintained), tRPC procedures consume the Zod schema
directly, LangGraph node state is validated with the same Zod schema,
and the Protobuf/Drizzle contracts are the transport/persistence-layer
translations of the same shape. Do not hand-maintain four independently-
drifting schemas for one operation — that pattern is exactly what
produced the 8 incompatible centroid Redis key schemes this repo
currently has.

## Cross-references

- `openspec/changes/session-159-followup-tasks.md` — Phase 11 centroid
  key contract audit (referenced throughout this change, not duplicated)
- `docs/parent-atlas/MCP_TOOL_REGISTRY_AUDIT.md` — Phase 4 structural
  audit this change extends with runtime columns
- `docs/architecture/retrieval-layer-separation.md` — existing
  Orchestrator → Search Contract → Backend Implementation layering;
  the pre-call layer proposed here sits above that, at the transport
  boundary, not inside it
