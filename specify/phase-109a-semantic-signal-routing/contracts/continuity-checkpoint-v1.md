# Continuity Checkpoint v1

Canonical source:
- `sveltekit-frontend/src/lib/server/atlas/contracts/semantic-signal-v1.ts`

Required fields:
- active goal
- accepted decisions
- rejected hypotheses
- unresolved questions
- current plan step
- authority constraints
- required evidence IDs
- packet revision
- source revision

Rule:
- Compaction must preserve the active goal and unresolved evidence trail.
