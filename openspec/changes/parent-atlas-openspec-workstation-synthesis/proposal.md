## Why

Parent Atlas already produces an OpenSpec workboard and already has governed ACE, ContextManifest, BitFrost/Valkey, DAG, validation, and Ornith execution boundaries. What is missing is a bounded workstation workflow that turns the authoritative task ledgers and linked evidence into one revision-qualified next-work decision without sending the entire backlog to a model or treating cache state as task truth.

This change is an `ACTIVE_DEPENDENCY` of the sole portfolio authority, `parent-atlas-retrieval-lineage-dag-convergence`. It does not claim `CURRENT_AUTHORITY`, does not reorder convergence gates, and cannot close upstream tasks without their owning evidence.

The workflow is needed now because the repository contains thousands of open task rows across multiple dependency lanes, while the current convergence ledger requires deterministic evidence ordering and fail-closed handling of blocked lineage. A first-class planning workflow can reduce that backlog to a small, auditable action set while preserving OpenSpec as the authority.

## What Changes

- Add a read-only workboard snapshot and stable task-identity adapter over the existing OpenSpec task ledgers.
- Resolve task evidence from task text, linked reports, receipts, source references, tests, and declared dependencies without inferring proof from completion percentage.
- Classify bounded candidates as ready, blocked, stale, superseded, needs-proof, or needs-human-decision.
- Rank only dependency-eligible candidates and emit an `OpenSpecWorkPlanV1` containing one bounded next action, blockers, evidence, expected mutation scope, and validation commands.
- Assemble a compact ACE/ContextManifest input using references and checksums rather than copying the full task backlog.
- Permit Ornith synthesis only from the validated bounded context and record model/prompt/revision provenance in a synthesis receipt.
- Permit BitFrost/Valkey residency only for revision- and checksum-addressed context/plan references; it remains a cache and never becomes task authority.
- Require validation and an explicit mutation gate before any task-ledger checkbox or implementation file is changed.
- Keep all initial implementation in `scripts/atlas`; later promotion to `packages/atlas*` requires separate proof of stable ownership.

## Capabilities

### New Capabilities

- `openspec-workstation-synthesis`: revision-qualified workboard selection, bounded ACE context assembly, governed Ornith planning, cache-safe residency, and validation handoff.

### Modified Capabilities

None. Existing OpenSpec, ACE, BitFrost, DAG, and synthesis owners remain authoritative; this change adds an adapter/workflow around them.

## Impact

- Existing owner: `scripts/atlas/build-openspec-workboard-v1.mjs` and its generated workboard/report.
- New read-only planning adapters and receipts under `scripts/atlas` and `docs/reports`.
- Existing ACE/ContextManifest, BitFrost/Valkey, DAG, validation, and llama-server `:8090` boundaries are consumed but not replaced.
- No automatic task-ledger updates, source edits, database writes, Qdrant/Neo4j writes, cache promotion, or model execution are permitted by the initial proof gates.
