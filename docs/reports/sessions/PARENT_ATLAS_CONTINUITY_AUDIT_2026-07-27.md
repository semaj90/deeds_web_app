# Parent Atlas Continuity Audit

Date: 2026-07-27
Workspace: `C:\Users\james\Videos\deeds-web-app`
Scope: Correct the attached "What Was Working On Yesterday" note against the live repo and recent Phase 108D proof work.

## Executive State

The attached note is directionally useful, but several items are now stale:

- `Gemma4 -> MCP tool dispatch` is not missing. A real dispatch loop exists in [gemma4-tool-controller.ts](C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/ai/gemma4-tool-controller.ts).
- `Embed dimensions metadata` is not missing. The embed route already returns `dimensions`.
- `TurboVec Stage 1.5 prefilter` exists as a retriever-sidecar client, but it is not visibly wired into the ACE query-router path named in the note.
- `Phase 108D` is now stronger than the note implies: cross-store packet proof is live for one canonical packet across `POSTGRES`, `QDRANT`, `REDIS`, `HYPERRAG_RPC`, and `ACE`.

Current highest-value gap is no longer "make proof work". It is tightening the remaining warning-level contract gaps and deciding which runtime path is canonical for retrieval orchestration.

## Confirmed In Repo

### Confirmed live or materially present

- `sveltekit-frontend/src/lib/server/ace/query-router.ts`
  - Real multi-lane ACE router.
  - Uses centroid lookup, Qdrant search, and GPU reranking.
- `sveltekit-frontend/src/lib/server/ai/gemma4-tool-controller.ts`
  - Has tool loop, `dispatchToolCall`, MCP HTTP dispatch, in-process fallback, dedup, and round limits.
- `sveltekit-frontend/src/routes/api/embed/+server.ts`
  - Already returns `model` and `dimensions`.
  - Supports truncation via requested `dimensions`.
- `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`
  - Real TurboVec prefilter/search sidecar client exists.
  - Supports HTTP and optional gRPC fallback.
- `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts`
  - Real RRF integration file exists.
- `sveltekit-frontend/src/lib/server/gpu/gpu-reranker.ts`
  - GPU reranker seam exists.
- `sveltekit-frontend/src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts`
  - Real chunk-stream indexer seam exists.
- `sveltekit-frontend/src/lib/server/db/schema/packet-metadata-v1.ts`
  - Real packet metadata schema exists.

### Confirmed recent runtime proof

- `scripts/atlas/phase-108d-proof-matrix.mts`
  - Live proof runner now reaches all five layers.
- Latest successful report:
  - [phase108d-proof-packet:1f18437ee58f-2026-07-27T05-36-25Z.json](C:/Users/james/Videos/deeds-web-app/docs/reports/atlas/phase108d-proof-packet:1f18437ee58f-2026-07-27T05-36-25Z.json)
  - Status: `CROSS_STORE_PROVEN`
  - Packet: `packet:1f18437ee58f`

## Corrections To The Attached Note

### 1. Gemma4 -> MCP dispatch

Attached note status: `MISSING`

Corrected status: `PARTIALLY WIRED, DISPATCH LOOP PRESENT`

Evidence:

- `dispatchViaHTTP(...)`
- `dispatchToolCall(...)`
- `runGemma4ToolLoop(...)`
- response processing of `tool_calls`

What is still fair to say:

- End-to-end production use should still be proven on the specific tool surfaces you care about.
- But the claim "tool proposals are not dispatched" is no longer accurate.

### 2. Embed dimensions metadata

Attached note status: `MISSING`

Corrected status: `ALREADY PRESENT`

Evidence in [api/embed/+server.ts](C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/routes/api/embed/+server.ts):

- request schema accepts optional `dimensions`
- response includes `dimensions`
- mock/degraded responses also include `dimensions`

This item should be removed from the blocker list.

### 3. TurboVec Stage 1.5 prefilter

Attached note status: `MISSING`

Corrected status: `CLIENT PRESENT, QUERY-ROUTER WIRING NOT EVIDENT`

Evidence:

- [turbovec-prefilter.ts](C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts) exposes:
  - `turbovecPrefilter(...)`
  - `turbovecSearch(...)`
  - `turbovecHealth(...)`
- [query-router.ts](C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/ace/query-router.ts) shows centroid lookup, Qdrant search, and GPU reranking, but no obvious TurboVec prefilter call in the audited section.

This remains a legitimate integration target.

### 4. Cross-store proof state

Attached note framing: pre-proof integration audit

Corrected state as of 2026-07-27:

- `POSTGRES` canonical packet identity: proven
- `QDRANT` parity for proof packet: proven
- `REDIS` parity for proof packet: proven
- `HYPERRAG_RPC` projection parity for proof packet: proven with warnings
- `ACE` canonical identity exposure for proof packet: proven

Remaining warnings in the latest proof:

- `WORKSPACE_ID_MISSING` on `HYPERRAG_RPC`
- `CONTENT_HASH_MISSING` on `HYPERRAG_RPC`
- `ONTOLOGY_VERSION_MISSING` on `HYPERRAG_RPC`
- `N_ARY_FACTS_EMPTY` on `HYPERRAG_RPC`

These are warning-level contract gaps, not promotion blockers for that proof packet.

## Revised Priority Order

### Priority 1

1. Tighten `HYPERRAG_RPC` projection contract
   - Expose `workspace_id`
   - Expose `ontology_version`
   - Expose `content_hash` when authoritative
   - Distinguish "no facts for this packet" from "fact lane unavailable"

2. Decide whether `ACE query-router` should consume TurboVec prefilter directly
   - If yes, wire it deliberately into the ACE path.
   - If no, document that TurboVec belongs only in the retrieval runtime path outside ACE.

3. Standardize retrieval orchestration ownership
   - The repo currently has multiple valid retrieval seams.
   - The next pass should name one canonical orchestrator per use-case instead of letting audit notes imply a single path.

### Priority 2

1. Property-dimension registry
   - Still useful.
   - But it is cleanup, not a blocker.

2. Similarity and top-K consolidation
   - Still useful.
   - Needs bounded scope because there are many legacy and backup hits in the repo.

3. Launcher consolidation
   - Still useful operationally.
   - Not a retrieval correctness blocker.

### Priority 3

1. LangExtract
   - Optional.
   - Should not block current packet identity, retrieval, or tool calling proof lanes.

2. cuVS
   - Still a phase-2 accelerator concern.
   - Not needed for current correctness proof.

## Recommended Next Slice

If continuing from this checkpoint, the most defensible next slice is:

1. Add explicit `workspace_id`, `ontology_version`, and authoritative `content_hash` handling to `hyperrag-packet-rpc.ts`.
2. Decide and document whether TurboVec prefilter belongs in:
   - `sveltekit-frontend/src/lib/server/ace/query-router.ts`
   - or a separate retrieval runtime path.
3. Create a small `property-dimensions.ts` registry only after the runtime owner is decided.

## Current Classification

- `EMBED_DIMENSIONS_METADATA`: `ALREADY_WIRED`
- `GEMMA4_TOOL_DISPATCH`: `WIRED_NEEDS_ROUTE_LEVEL_PROOF`
- `TURBOVEC_PREFILTER_CLIENT`: `PRESENT`
- `TURBOVEC_PREFILTER_IN_ACE_QUERY_ROUTER`: `NOT_EVIDENT`
- `PHASE_108D_CROSS_STORE_PACKET_PROOF`: `CROSS_STORE_PROVEN`
- `HYPERRAG_PROJECTION_CONTRACT`: `PARTIAL_WARNINGS_REMAIN`

## Suggested Commands

Safe next command:

```powershell
Get-Content C:\Users\james\Videos\deeds-web-app\docs\reports\atlas\phase108d-proof-packet:1f18437ee58f-2026-07-27T05-36-25Z.json
```

Smoke command:

```powershell
npx tsx C:\Users\james\Videos\deeds-web-app\scripts\atlas\phase-108d-proof-matrix.mts --packet-key packet:1f18437ee58f
```
