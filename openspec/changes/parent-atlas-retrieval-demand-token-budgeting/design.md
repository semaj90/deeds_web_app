## Context

The repository already has separate owners for canonical feature identity and crosswalks (`atlas-feature-intelligence`, including FI-ONTO-04/06), retrieval reconciliation, ACE/ContextManifest selection, tokenizer/context-budget helpers, and advisory HLL telemetry (`parent-atlas-adaptive-backprop-hll-monitoring`). The proposal connects these existing owners for measurement; it does not replace them. Current evidence does not yet establish one revision-bound caller path from retrieval impression through selected/cited evidence to exact prompt-token accounting.

Constraints: PostgreSQL remains canonical for identity and revisions; HLL remains approximate telemetry only; Qdrant/TurboVec and caches remain derived. Use live retrieval outputs and existing ContextManifest inputs rather than synthetic identities or a parallel event pipeline. Keep implementation read-only until the owner crosswalk, retention policy, and tokenizer owner are verified.

## Goals / Non-Goals

**Goals:**
- Define a testable observation contract for retrieval demand and context-token cost.
- Preserve canonical packet/chunk identity, source/workspace revisions, retrieval-lane health, and evidence references through the observation.
- Measure tokens with the exact tokenizer artifact used by the active model; expose estimates as estimates when exact counting is unavailable.
- Provide aggregate breadth estimates only as optional HLL telemetry, clearly separated from exact counts and admission decisions.
- Sequence work through existing OpenSpec owners and gate any persistence or tool exposure behind review.

**Non-Goals:**
- Creating a new feature registry, canonical retrieval index, background agent, or independent MCP/ACP/A2A pipeline.
- Changing canonical feature identity, retrieval fusion/ranking, packet eligibility, embeddings, TurboVec codec, nibble packing, or model promotion.
- Reading Docker logs from application code, storing raw prompts/logs, using HLL for deduplication, or allowing HLL/token counts to determine identity, ranking, cache eviction, or promotion.
- Adding C++, AVX2, SIMDJSON, Huffman/Zstd, MLP, or Cython work without a separately measured and approved bottleneck.

## Decisions

1. **Join through existing identity owners.** Observation references MUST resolve through canonical packet/chunk and feature-resolution owners where applicable. Missing identity or revision is represented as unresolved/degraded; paths, labels, vector IDs, and current HEAD are not substitutes.
   - Alternative rejected: duplicate a feature/source registry in a new telemetry pipeline.
2. **Separate exact evidence from aggregate telemetry.** Keep per-observation provenance and exact admitted-token counts distinct from optional HLL cardinality estimates. Exact reconciliation continues to use canonical data and exact queries.
   - Alternative rejected: use HLL counts as a duplicate detector or eligibility/eviction signal.
3. **Use the active tokenizer as the exact-count owner.** The observation records tokenizer/model artifact identity and count scope. If that owner is unavailable, report `TOKEN_COUNT_UNAVAILABLE` or a separately labeled estimate; never claim characters/4 is exact.
   - Alternative rejected: introduce a new tokenizer or treat a model name/dimension as a tokenizer revision.
4. **Measure before persisting or optimizing.** Initial implementation tasks inventory callers, revisions, and existing contracts; fixture tests validate envelopes and negative cases. Any persistent telemetry, MCP tool, or ranking use requires a later explicit task, authorization, and readback.
   - Alternative rejected: wire a new background worker or store before identifying an owning table/outbox and retention policy.
5. **Keep compression experiments outside this contract.** TurboVec, 4-bit encoding, Zstd, and prompt selection optimize different resources and require separate parity/quality evidence. This change only records enough measurement metadata to compare future challengers.

## Risks / Trade-offs

- [Multiple overlapping task ledgers] → Publish an owner crosswalk; existing FI/HLL/retrieval tasks remain authoritative and this change adds only integration dependencies.
- [Stale or missing identity/revision can make observations misleading] → Fail closed to unresolved/degraded states and include exact revision fields in contract tests.
- [Token counts may vary by tokenizer/model revision] → Bind every exact count to tokenizer artifact/revision and input scope; do not compare unqualified totals.
- [Telemetry can expose sensitive query/context text] → Record identifiers, counts, and bounded receipts only; do not persist raw prompt or source text by default; establish retention/privacy review before persistence.
- [Approximate HLL values can be mistaken for exact totals] → Name fields as estimates, include precision/window/scope metadata, and prohibit canonical or safety decisions from consuming them.

## Migration Plan

No database migration or service rollout is included. First complete the owner/revision audit and fixture-only contract validation. A later implementation may add a read-only report or bounded telemetry adapter only after the persistence owner, privacy/retention policy, and exact tokenizer call are approved. Rollback is to disable that adapter/report; canonical retrieval and identity remain unchanged.

## Open Questions

- Which existing active tokenizer API and model artifact receipt provide exact token counts for the production ContextManifest?
- Which retrieval receipt/caller can supply observed impressions, selected candidates, and citations without reconstructing events from lossy logs?
- Is an existing canonical telemetry/outbox table the approved persistence owner, or should the first deliverable remain report-only?
- What retention, privacy, and tenant/session scoping apply if observations are persisted?
- Which HLL namespace/window is already approved for this observation class, and is HLL necessary at the expected volume?
