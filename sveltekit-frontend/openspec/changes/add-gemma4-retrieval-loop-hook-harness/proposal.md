# Gemma4 Retrieval Loop Hook Harness - 2026-07-30

## Why

Gemma4 retrieval-loop hook behavior already exists in the repository, but it is split across a local append script, a smoke test, and an architecture note. We need one contract that states what the hook harness may do, what it must never do, and which files own the behavior.

## What Changes

- Define a hook-harness contract for the retrieval loop writer used by `scripts/opencode/gemma4-retrieval-hook.mjs`
- Treat `.tmp/atlas-retrieval-loop.jsonl` as the local audit sink for hook events
- Preserve `sourceRefs`, `selectedCardIds`, `rerankScore`, `tool`, and `outcome` in the emitted row
- Keep forwarding to the outcome ledger as an implementation detail, not a second source of truth
- Lock the harness to dry-run safe defaults and local-only writes until an explicit publish flow exists

## Capabilities

- `gemma4-retrieval-loop-hook-harness`: local append-only event capture for agentic retrieval loops
- `gemma4-retrieval-loop-hook-smoke`: bounded smoke test that appends one row and validates required fields
- `gemma4-retrieval-loop-hook-doc`: architecture note explaining the hook boundary and safety rules

## Non-goals

- No new retrieval pipeline
- No Qdrant writes
- No Redis publish path
- No TensorRT bridge changes
- No change to the existing MCP registry

## Impact

- **New spec files**: `openspec/changes/add-gemma4-retrieval-loop-hook-harness/specs/gemma4-retrieval-loop-hook-harness/spec.md`
- **Modified files**: none required for the spec itself
- **Runtime behavior**: unchanged until an implementation task is selected
