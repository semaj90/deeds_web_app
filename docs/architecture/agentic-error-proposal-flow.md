# Agentic Error Proposal Flow

This project uses a read-only proposal path before any repair or patching work.

## Trigger conditions

The proposal flow should be used when one of these surfaces reports an error or degraded state:

- OpenCode command execution
- AI contextual chat
- LangGraph orchestration
- MCP / FastMCP tool runs
- Gemma4 agentic repair loops

## Core contract

The agentic flow is split into stages:

1. Capture the error text, file path, cluster id, or query.
2. Build a deterministic provenance envelope.
3. Launch read-only subagents in parallel.
4. Sort the output into repair lanes.
5. Return a proposal report.

## Parallel subagents

The current repair-proposal helper uses these read-only tools in parallel:

- LangExtract for structured error facts
- HMM repair-state inference
- GraphRAG context expansion
- Marco rerank for candidate ordering
- Wiki / encyclopedia lookup

The outputs are merged into one proposal instead of asking the model to invent a free-form repair plan.

## Lane order

The proposal output is normalized into this order:

1. Serialization
2. Encoding
3. Indexing
4. Retrieval
5. Ranking
6. Ingestion
7. Repair

That keeps the heap/stack of work in a deterministic order after ingestion and avoids repeated reasoning.

## Cache envelope

Exact-match and semantic cache hits return the same provenance envelope that they store:

- prompt hash / query hash
- model
- source refs
- feature id
- primary source ref
- parent atlas card id
- cached tuple payload

This allows OpenCode and Gemma4 to reuse cached packets without reconstructing provenance later.

## Temporal ledger

Every proposal run also appends a `context_timeline` event:

- `eventType: agentic_proposal`
- `pipeline: agentic-fix-proposal`
- payload includes the query, file path, `featureId` and `feature_id`, `sourceRef` and `source_ref`, `sourceRefs` and `source_refs`, `workspaceTaskId` and `workspace_task_id`, `parentAtlasCardId` and `parent_atlas_card_id`, tuple hash, semantic hash, observed states, lane order, suggestion count, and an explicit `missingFeatureId` / `agentic_proposal_missing_feature_id` warning when the Parent Atlas key cannot be resolved

Resolution order is strict: typed proposal input, provenance tuple, cache or ACE tuple fields, explicit JSON payload fields, regex fallback from messy text, then the missing-feature warning. Regex is recovery only, never the canonical source of truth.

The replay / join spine is `sourceRef + feature_id`. `clusterId` remains a routing hint only and is not the canonical feature key.

That gives the system a temporal index of the repair-thinking path, separate from the immutable packet cache.

## UI surface

The agentic controller can request the proposal flow through `/api/v1/agentic?action=fix-suggestions`.
The endpoint now returns both:

- compact suggestions
- read-only proposal markdown

The same controller can query `/api/v1/agentic?action=timeline` to show recent proposal events from `context_timeline`.
That exposes the temporal repair ledger in the UI without making the proposal path writable.

## Design rule

Do not apply writes from the proposal path.
The proposal path is for diagnosis, lane ordering, and review only.
