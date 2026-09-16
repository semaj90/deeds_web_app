---
type: pipeline
title: SvelteKit Vite/Vitest Lane Validation
id: pipeline/sveltekit-vitest-validation
status: active
owners:
  - legal-ai-team
source_refs:
  - sveltekit-frontend/vitest.lane-contracts.config.ts
  - tests/canonical-source-inventory-hygiene.spec.ts
  - scripts/atlas/lib/whole-codebase-source-exclusions.test.mjs
related:
  - pipeline/retrieval-ranking-synthesis
  - system/parent-atlas-execution
generated:
  by: codex:2026-09-16
---

# SvelteKit Vite/Vitest Lane Validation

## Authority

The SvelteKit workspace owns the Vitest lane through
`sveltekit-frontend/vitest.lane-contracts.config.ts`. The repository does not
create a second root Vitest configuration.

Vitest resolves `test.include` patterns relative to the configured root. The
repository-level hygiene contract is therefore included explicitly as:

```text
../tests/canonical-source-inventory-hygiene.spec.ts
```

## Focused validation

Run from `sveltekit-frontend`:

```text
npx vitest run --config vitest.lane-contracts.config.ts ../tests/canonical-source-inventory-hygiene.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1
```

The recovered hygiene contract currently passes 5/5 tests. The Node-only
exclusion-policy pair is independent of Vite and runs with:

```text
node --test scripts/atlas/lib/whole-codebase-source-exclusions.test.mjs
```

The live hygiene audit requires an explicit snapshot manifest; it must not
select a manifest by directory mtime:

```text
npx tsx scripts/atlas/audit-canonical-source-inventory-hygiene-v1.mts --manifest <sealed-snapshot.json>
```

If the two-scan capture observes a worktree mutation, it remains blocked and
must be retried after the worktree is quiet.

## Boundary

This lane proves test contracts and source-inventory hygiene only. It does not
authorize workspace admission, packet/chunk writes, database migrations, cache
population, vector projection, or source mutation. Production source authority
still requires the snapshot, Graphify, and lineage gates recorded in OpenSpec.
