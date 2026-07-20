# Validation protocol

## Always-on rule
Use the repo authority first:
1. Postgres canonical truth
2. current source files and checked-in reports
3. replay / smoke / schema evidence

## Before implementation
1. Read the active OpenSpec proposal and task list
   - `openspec/changes/<change>/proposal.md`
   - `openspec/changes/<change>/tasks.md`
2. Search for existing implementations: `rg "<symbol>" src/ --type ts`
3. Read only the relevant file sections (use line ranges, not whole files)
4. State the smallest intended patch — one function, one file

## During implementation
- Keep all derived store writes idempotent (upsert, not insert)
- Add or update a focused test alongside the code change
- Prefer editing existing files over creating new ones
- For RPC/MCP tool calls, validate the tool schema and packet identity before dispatch.
- Do not write to derived mirrors before the canonical Postgres change has passed validation.

## After implementation (required before marking done)
```bash
# 1. Focused test
cd sveltekit-frontend && npx vitest run tests/<relevant>.spec.ts

# 2. Type gate (non-blocking, report tail only)
cd sveltekit-frontend && npx tsc --noEmit 2>&1 | tail -5

# 3. Smoke (if infrastructure is up)
npm run smoke:search-runtime    # retrieval lane
npm run atlas:ae:train:dry      # AE pipeline
npm run test:hyperrag           # HyperRAG lane contracts
```

## Agentic error fixing (Parent Atlas loop)
1. Read `scripts/atlas/lib/ae-train-contract.mjs` — frozen contract
2. Identify packet identity gaps: missing `packet_key`, `source_ref`, `feature_id`
3. Run dry-run before any write: add `--dry-run` flag to scripts
4. Fix Postgres truth first → invalidate Redis → re-enqueue projection outbox
5. Never fix only the Qdrant mirror — the Qdrant fix is downstream of Postgres
6. If a workflow step lacks identity/schema proof, stop and gather the missing evidence first.

## Cline Act mode — three-proof gate for a new model
Before trusting a GGUF in Act mode, verify in order:
1. Read one named file and summarize one function — emits correct tool call?
2. Edit one harmless line and show the diff — emits correct edit tool call?
3. Run a command, inspect failure output, patch, rerun — maintains state after tool output?
If the model describes the intended tool call in prose instead of emitting it, switch models.

## Status vocabulary
- CREATED — file exists, syntax valid
- WIRED — passes dry-run, no side effects
- DRY_RUN_PROVEN — dry-run gate passes
- APPLY_PROVEN — apply + verification gate passes
- NOT_PROVEN — blocked by prerequisite or failed gate
