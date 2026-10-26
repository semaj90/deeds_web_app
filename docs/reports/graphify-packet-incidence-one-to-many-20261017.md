# Graphify Packet-Incidence One-to-Many Alignment

## Finding

The existing Graphify endpoint resolver treated a symbol-to-packet join as unique. That is not a valid invariant: a source symbol span can overlap multiple exact packet/chunk spans. Rejecting every multi-row match prevented otherwise qualified incidence candidates from being represented.

## Change

- The existing resolver now returns sorted packet bindings for both endpoints, validating each against canonical packet identity, exact source revision, and the snapshot workspace revision.
- Duplicate rows for the same endpoint symbol and packet remain rejected. Each endpoint is capped at 64 packet bindings.
- The existing materializer expands the bounded endpoint combinations deterministically and excludes same-packet self-pairs. It still returns proposal candidates only; it performs no persistence.

## Validation

- Focused Vitest: 4 files, 19 tests passed (endpoint resolver, packet-incidence materializer, projection, lineage).
- No live database query, DDL, packet/graph write, GPU execution, or SearchRuntime request was performed.
- The owning lineage task remains unchecked. Current source-edge and GraphV2/N-ary data availability is still a separate blocker.

likely_cause: The packet-incidence resolver assumed one packet per symbol, discarding valid one-to-many source-span coverage across chunks.
evidence: `graphify-packet-incidence-endpoint-resolver-v1.ts`, `graphify-packet-incidence-materializer-v1.ts`, and the 19-test focused run.
patch_targets: `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-packet-incidence-endpoint-resolver-v1.ts`, `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-packet-incidence-materializer-v1.ts`, and adjacent specs; `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`.
safe_next_command: `npx vitest run src/lib/server/atlas/indexing/graphify-packet-incidence-materializer-v1.spec.ts src/lib/server/atlas/indexing/graphify-packet-incidence-endpoint-resolver-v1.spec.ts src/lib/server/atlas/indexing/graphify-packet-incidence-projection-v1.spec.ts src/lib/server/atlas/lineage/packet-incidence-lineage-v1.spec.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true`
smoke_command: `npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --strict`
report_path: `docs/reports/graphify-packet-incidence-one-to-many-20261017.md`
