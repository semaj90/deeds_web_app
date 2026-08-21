# Archive receipt — Parent Atlas event/Merkle identity scaffold

Archived: 2026-08-20
Original path: `parent-atlas-event-merkle-identity-pack/parent-atlas-event-merkle-identity-pack/`
Reason: generated scaffold/contract pack at a doubled top-level pseudo-root; not a canonical runtime owner.

## Preservation

All original scaffold files were moved byte-for-byte under this archive directory. The original `MANIFEST.json` is retained and explicitly states that the pack is not evidence that its proposed files are missing.

## Runtime owner review

- `src/contracts/events.ts`: not imported wholesale; overlaps live workflow-action event/control-plane contracts in `sveltekit-frontend/src/lib/server/atlas/workflow` and `packages/parent-atlas/src/core`.
- `src/contracts/graph-identity.ts`: proposal only until reconciled with live GIS/canonical chunk/symbol identity contracts.
- `src/contracts/merkle.ts` and Merkle implementation/tests: retained for later deterministic hash/RFC9162 review; no runtime promotion in this move.
- `src/daily/parent-atlas-daily-compiler.ts`: not imported; current startup/Graphify/QAS orchestration is the live owner.
- `src/daily/kanban-contracts.ts`: retained as proposal; must map into existing recommendation/Kanban owners rather than create a parallel owner.
- `sql/*.sql`: templates only; not applied.
- `docs/EXECUTION_ORDER.md`: historical; contains pre-semantic_512 representation assumptions and may not define current retrieval ownership.

## Import rule

Future adaptation must copy only the reviewed primitive into its live owner and add tests/receipts there. Never restore this archive as a runtime package or add imports from `deeds_labs/archive/**`.
