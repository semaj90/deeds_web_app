# Session 140 SOM Write-Path Audit

## Verified

`feature-extraction-orchestrator.ts` calls `somClusterer.cluster(...)` and then, in apply mode only, calls `materializeToPostgres(clusterResult)`.

`som-clustering.ts` performs one Postgres `UPDATE` per assignment and increments `updated` after each awaited update call.

The CLI exits with `process.exit(result.failed > 0 ? 1 : 0)`, so a run with zero failed updates but also zero successful updates can still exit 0.

## Findings

1. There is no explicit zero-update guard in `materializeToPostgres`.
2. There is no rowcount check on the update call before incrementing `updated`.
3. Dry-run mode skips writes by branching, but it does not establish read-only transaction semantics.
4. The success condition is still implicit: "no thrown error" plus `failed === 0`.

## What This Means

The current path can report success even if the materializer writes nothing, provided the update loop does not throw.

That is the exact false-success class we needed to check.

## Not Proven

- persistent rowcount validation
- zero-update failure handling
- read-only dry-run enforcement
- bounded smoke proof of a successful write/readback cycle

## Recommended Next To-Do

1. Inspect the actual `UPDATE` return value and enforce `rowCount > 0` where supported.
2. Add a terminal guard that fails the run when `updated === 0` in apply mode.
3. Convert dry-run to a read-only transaction or equivalent explicit no-write proof.
4. Run a bounded smoke case and confirm write/readback parity.

## Status

IMPLEMENTED
- SOM clustering assignment contract
- apply-mode write path
- CLI result reporting

PROVEN
- zero-update guard is absent
- success path is not rowcount-aware

EXPECTED GAPS
- write/readback proof
- read-only dry-run proof

UNRESOLVED
- whether the current database state already reflects valid SOM assignments

UNSAFE CONSTRAINTS
- treating zero throws as success
- treating a branch-based dry-run as a write-proof

NOT YET PROVEN
- the materializer fails when nothing is persisted
- the apply path is operationally safe under silent no-op conditions

NEXT SAFE ACTION
- patch the materializer to fail closed on zero successful updates, then rerun a bounded smoke test.
