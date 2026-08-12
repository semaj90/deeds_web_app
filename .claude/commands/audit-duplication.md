# Duplicate-Owner Audit — Runtime Ownership Sweep

Finds capabilities with more than one uncoordinated implementation (peer
owners) instead of one canonical owner behind swappable backends. This is
the check CLAUDE.md's "Duplication Prevention" hard rule and the
`docs/architecture/runtime-ownership-registry.json` convention describe —
this command operationalizes it as a repeatable sweep instead of relying on
an agent remembering to grep first.

## Target: `$ARGUMENTS`

If no argument: sweep the whole repo for the capability categories below.
If an argument is given (a capability name, a file path, or a feature area
like "outbox" or "reranker"), scope the sweep to that capability only.

## What counts as a duplicate owner

Two or more implementations of the same logical capability that are:
- **Live** (real callers exist — check with `grep -rl`, not just file existence)
- **Uncoordinated** (neither delegates to the other; each does its own thing)
- **Peers** (same layer — not one being a documented `BACKEND`/`ADAPTER` behind
  the other's `CANONICAL_OWNER` contract)

A file existing is not evidence it's live. A table having rows is not
evidence its writer still runs. Verify callers, not existence — see CLAUDE.md
"Duplication Prevention" for the full reasoning and known false-negative
patterns (webgpu init, dynamic-import-only components, etc.).

## Phase 1: Candidate discovery

For the target capability (or, with no argument, sweep this list — extend it
opportunistically if you notice other repeated capability names during the
sweep):

- Retrieval lanes / rerankers / RRF fusion owners
- Persistence writers for one logical row/entity (e.g. an outbox table, a
  packet identity table, a cache-key builder)
- MCP tool implementations reachable through more than one transport/dispatch
  path (HTTP MCP server vs stdio vs in-process tool-dispatch table)
- Graph algorithms (PageRank, community detection, clustering)
- Representation IDs / embedding dimension owners
- Sidecar/service transports for one GPU or vector capability (HTTP sidecar
  vs gRPC vs native N-API addon — TurboVec had exactly this pattern, see
  `openspec/changes/parent-atlas-error-research-lane/tasks.md` "Found while
  reviewing retrieval transport")
- Hash/stringify utility pairs (`stableStringify`/`sha256Hex` style) copy-pasted
  across files instead of imported from one owner
- Chunking / AST parsing entry points

For each candidate, find every implementation:
```
rg -l "<capability keyword>" src/ scripts/ --type ts
```
Then for each file found, confirm real callers:
```
rg -l "from.*<module-name>" src/ --type ts
```

## Phase 2: Classify each implementation

Use this vocabulary (from CLAUDE.md) — every implementation found gets
exactly one label:

| Label | Meaning |
|---|---|
| `CANONICAL_OWNER` | The one contract other code depends on. Exactly one per capability. |
| `BACKEND` | A swappable implementation behind the canonical owner. |
| `ADAPTER` | Wraps an external tool/library to conform to the canonical contract. |
| `EXPERIMENT` | Explicitly non-production, evaluated but not wired into the canonical path. |
| `COMPATIBILITY` | Kept only so an old caller doesn't break; not for new use. |
| `FIXTURE_ONLY` | Test/proof-of-concept data, never touches production tables for real traffic. |
| `DEAD` | Confirmed zero callers — flag for archival (see Archival Rules), don't delete. |

If two or more implementations are found and NONE of them can be classified
as `BACKEND`/`ADAPTER` relative to a `CANONICAL_OWNER` — i.e. they're
genuine uncoordinated peers — that's a confirmed duplicate-owner finding.

## Phase 3: Report

| Capability | Implementations | Classification | Live callers | Verdict |
|---|---|---|---|---|

Verdict is one of:
- **RESOLVED** — one CANONICAL_OWNER, rest are BACKEND/ADAPTER/EXPERIMENT/COMPATIBILITY, no action needed
- **NEW_CONFLICT** — genuine uncoordinated peer owners, introduced or discovered this sweep
- **BASELINE_DEBT** — known, pre-existing duplication already recorded in
  `docs/architecture/runtime-ownership-baseline.json` or an OpenSpec change —
  tolerated, do not silently "fix" without a scoped decision

## Phase 4: Record, don't unilaterally fix

Per CLAUDE.md: "If ownership can't be established, stop and record the
ambiguity in an OpenSpec change — don't implement past that point." For each
`NEW_CONFLICT` finding:
1. Write it into the relevant `openspec/changes/*/tasks.md`, or create one if
   none fits, with the exact file paths, caller list, and classification table.
2. Do NOT pick a winner and refactor the others away in the same sweep —
   that's a separate, scoped decision the user should confirm (matches how
   the outbox-table conflict and `context.build_kv_packet` triplication were
   handled this session: found, documented, resolved only after explicit
   confirmation of which owner wins).
3. If asked to resolve a specific finding after this audit, treat it as its
   own bounded task — don't fold it into the audit itself.

## Known findings already on record (starting points, not exhaustive)

- `context.build_kv_packet` — was triplicated (HTTP MCP tool, in-process
  `mcp-tool-dispatch.ts`, canonical `kv-context-controller.ts`) — RESOLVED,
  all three now delegate to the canonical controller.
- Outbox table for code-evidence events — `workflow_outbox` (existing,
  adopted) vs `integration_event_outbox` (proposed in a scaffold pack,
  superseded) — RESOLVED in favor of reuse.
- TurboVec transport — HTTP sidecar (`:8791`) vs gRPC client
  (`turbovec-cuda-client.ts`) vs Rust N-API (`crates/turbovec-napi`) — **NOT
  YET AUDITED**, all three have live callers, no canonical owner declared.
  Good first real target for this command.
