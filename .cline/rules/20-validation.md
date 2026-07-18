# Validation Protocol

## Before implementation
1. Read the active OpenSpec proposal and tasks
2. `rg "<symbol>" src/ --type ts` to find existing implementations
3. Read only the relevant file sections (use line ranges)
4. State the smallest intended patch — one function, one file

## During implementation
- Do not create a parallel authority alongside an existing module
- Keep all derived stores idempotent (upsert, not insert)
- Add or update focused tests alongside code changes
- Prefer editing existing files over creating new ones

## After implementation (required before marking done)
```bash
# Focused test first
cd sveltekit-frontend && npx vitest run tests/<relevant>.spec.ts

# Type check (non-blocking baseline)
cd sveltekit-frontend && npx tsc --noEmit 2>&1 | tail -5

# Smoke if infrastructure is up
npm run smoke:search-runtime    # retrieval lane
npm run atlas:ae:train:dry      # AE pipeline
```

## Agentic error fixing (Parent Atlas)
1. Read `scripts/atlas/lib/ae-train-contract.mjs` — frozen contract
2. Identify packet identity gaps: missing `packet_key`, `source_ref`, `feature_id`
3. Run dry-run before any write: `--dry-run` flag
4. Fix Postgres truth first, then invalidate Redis, then re-project to Qdrant
5. Never fix only the Qdrant mirror — always fix Postgres root first

## Status vocabulary
- CREATED — file exists, syntax valid
- WIRED — passes dry-run, no side effects
- DRY_RUN_PROVEN — dry-run gate passes
- APPLY_PROVEN — apply + verification gate passes
- NOT_PROVEN — blocked
