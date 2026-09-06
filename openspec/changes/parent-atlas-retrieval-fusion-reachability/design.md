## Memory/agent reconciliation design — 2026-09-05

SearchRuntime retains normalization and fusion ownership. A logical dense lane
can have multiple executors; executor identity is provenance, not voting identity.
The current combineViaRRF same-name map cannot enforce this until callers normalize
executor results under the chosen owner boundary. Decide delegation before changing
weights or arithmetic. Preserve distinct canonical chunks, reject unqualified identity,
and retain best-rank/executor evidence without another vote.

The evaluation route and conditional Go multi-vector path are separate consumers.
Do not infer an edge from a comment pointing at a recommended production facade.
Tests must distinguish same-name duplicates from alternative-executor duplicates.
No runtime migration is included in this planning pass.

## RF6 owner decision receipt — 2026-09-05

The current-source proof at `docs/reports/rf6-executor-lane-owner-v1.json` establishes
the owner boundary. SearchRuntime remains canonical. A dense executor name is
provenance only; it is not a second logical lane. The proof is source-trace evidence,
not a live endpoint or production replay. RF6-SEMANTIC-VOTE-01 must implement and test
the one-vote invariant after the relevant caller has been adapted to the canonical
candidate envelope. Evaluation-only and Go multi-vector routes remain separate until
their own envelope and replay gates pass.

The precondition audit found that `TurboVecSearchResult` currently carries only
backend-local `id`, `score`, and `cluster`. This is insufficient for cross-executor
deduplication or revision-qualified semantic voting. The next implementation gate is
`TURBOVEC-CANONICAL-ENVELOPE-01`; it must add or join identity metadata before any
fusion arithmetic changes. Dropping the lane or joining by cluster would conceal the
missing authority rather than solve it.
