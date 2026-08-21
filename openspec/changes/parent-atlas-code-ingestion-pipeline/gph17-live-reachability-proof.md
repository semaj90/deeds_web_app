# GPH-17 live Graphify reachability proof

Status: `IMPLEMENTED_UNPROVEN`

This proof establishes only that the real `graphify:daily` startup wrapper reaches and successfully executes the opt-in native structural child in dry-run mode.

It does not prove canonical revision ownership, persistence/readback, fallback acceptance, or canonical owner promotion.

## Required environment

- 8095 running and healthy.
- GPH-14R / GPH-15 / GPH-16 focused tests should pass first.
- `GRAPHIFY_NATIVE_STRUCTURAL_APPLY` MUST remain `0`.
- `GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS` MUST remain `0`.

## Run

From `sveltekit-frontend/`:

```bash
GRAPHIFY_NATIVE_STRUCTURAL=1 \
GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0 \
GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS=0 \
GRAPHIFY_NATIVE_STRUCTURAL_LIMIT=5 \
GRAPHIFY_NATIVE_STRUCTURAL_REACHABILITY_OUT=docs/reports/graphify-native-structural-reachability.json \
npm run graphify:daily
```

The startup wrapper writes the reachability file only because `GRAPHIFY_NATIVE_STRUCTURAL_REACHABILITY_OUT` is set. The report is noncanonical proof telemetry.

The state transitions are:

```text
ENTERED_NATIVE_STRUCTURAL_STAGE
  -> INVOKING_NATIVE_STRUCTURAL_CHILD
  -> LIVE_REACHABLE_DRY_RUN
```

or, on failure:

```text
ENTERED_NATIVE_STRUCTURAL_STAGE
  -> INVOKING_NATIVE_STRUCTURAL_CHILD
  -> NATIVE_STRUCTURAL_CHILD_FAILED
```

## Verify

From the repository root:

```bash
node scripts/atlas/verify-graphify-native-structural-reachability.mjs
```

The verifier recomputes the receipt checksum and requires all of:

```text
schemaValid                  true
checksumValid                true
nativeStructuralEnabled      true
dryRunOnly                   true
symbolCreationNotRequested   true
childInvoked                 true
childCompleted               true
childExitZero                true
liveReachableDryRun          true
canonicalWritesNotProven     true
```

Only then may GPH-17 be reported as `LIVE_REACHABILITY_PROVEN`.

## Explicit non-gates

A GPH-17 PASS does not close:

- GPH-18 persistence/readback;
- EMB3A source/workspace revision ownership;
- GPH-19 canonical owner acceptance;
- fallback policy acceptance;
- legacy supersession.

`GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` remains prohibited while canonical source revision authority is unproven.
