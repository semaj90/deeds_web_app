# AGENTS.md Incremental Update Pipeline — Design Doc

**Status**: design-only. Operator must approve scope before implementation.
**Created**: 2026-05-09
**Hard rule**: **NEVER bulk-rewrite the 377 AGENTS.md files.** Update is incremental, hash-gated, capped per-run, triggered by real source changes.

---

## Goal in one sentence

On VS Code startup (or `predev` hook), scan dirty directories via `git status` + mtime, regenerate AGENTS.md only for dirs where source files changed AND the regenerated content actually differs (hash gate), with a hard cap of N writes per run.

## Why this is necessary

- 377 AGENTS.md files in the tree (counted 2026-05-09 from `sveltekit-frontend/`).
- Bulk rewrites blow away operator hand-edits, slow down VS Code startup, churn git history, invalidate every `agent_context_files.content_hash` row.
- The existing `agent_context_files` Postgres table (per CLAUDE.md "AGENTS.md Relationship Spine") already keys by `content_hash` — the missing piece is the incremental trigger that USES the hash gate.

## Existing tooling (don't rebuild)

Verified 2026-05-09 in `scripts/`:

| Script | Job | Reuse for incremental? |
|---|---|---|
| `generate-agents-md.mjs` | Generate AGENTS.md from current dir state | ✅ — call per-dir, not bulk |
| `enrich-agents-md.mjs` | Add structured envelope (rules/tools/constraints) | ✅ — call after generate |
| `backfill-agents-md-envelope.mjs` | One-shot backfill for missing envelopes | ❌ — bulk operation, don't run from startup |
| `index-agents-md.mjs` | Populate `agent_context_files` table | ✅ — call after envelope write |
| `build-agents-md-relations.mjs` | Build `directory_context_bindings` rows | ✅ — call after index |
| `agents-db-verify.mjs` | Sanity-check Postgres rows | ✅ — call as final smoke |
| `agent-diagnose.mjs` | Inspect a single AGENTS.md | — diagnostic only |

Parser: `src/lib/server/agents-md/{parse-agents-md.ts, resolve-directory-context.ts, schema.ts}` — already produces canonical envelope JSON with `content_hash`.

## The pipeline (proposed `kb-agents-md:refresh`)

```
1. DETECT
   git diff --name-only HEAD                          # staged + unstaged
   + git ls-files --others --exclude-standard         # untracked
   + find ./AGENTS.md -newer .last-agents-refresh     # mtime fallback
   → dirty_files: Set<path>

2. ROLL UP TO DIRS
   dirty_dirs = unique(parent(file) for file in dirty_files)
   filter: only dirs that already contain AGENTS.md (no auto-creation in v1)
   → dirty_dirs: Set<dir>

3. CAP
   if dirty_dirs.size > MAX_PER_RUN (default 25):
     prioritize by: (a) src/lib/server/* (b) src/routes/* (c) everything else
     truncate to MAX_PER_RUN, defer rest to next run
   → batch: Array<dir>, capped

4. GENERATE (per dir, in batch)
   a. Run generate-agents-md.mjs → candidate AGENTS.md content (in-memory)
   b. Run parse-agents-md.ts on candidate → candidate_envelope
   c. Compute candidate_hash = sha256(candidate_envelope canonicalized)
   d. Read existing AGENTS.md → current_hash from agent_context_files table
   e. IF candidate_hash == current_hash: SKIP (no write, log "unchanged")
   f. ELSE: write AGENTS.md, run enrich → index → relations

5. RECORD
   touch .last-agents-refresh
   write memory/runs/agents-md-refresh/<TS>/report.md:
     - dirty_dirs total / batch size / skipped (unchanged) / written
     - per-write: dir, old_hash, new_hash, fields_changed
     - deferred dirs (capped out) for next run

6. SMOKE
   agents-db-verify.mjs --since=<TS>     # confirm new rows landed
```

## Trigger points

### A — VS Code startup hook (recommended)

Wire into `predev` step (already in `npm run dev` invocation chain per NEXT-SESSION-TODO.md):

```
predev: node scripts/ensure-dev-runtime.mjs dev
        → spawns kb-agents-md:refresh (DETACHED, --quiet, --max=25)
```

**Why detached**: dev server shouldn't block on agent regeneration. Worst case the next session sees slightly stale AGENTS.md — fine.

### B — Manual VS Code task

```
"label": "📋 AGENTS.md: Refresh changed dirs (incremental)"
"command": "npm run kb-agents-md:refresh"
```

For when operator wants explicit refresh after a big edit.

### C — Git pre-commit (rejected)

Considered, rejected. Pre-commit blocking on AGENTS.md regeneration is too slow + interrupts flow. The startup-hook + manual-task pair covers the gap.

## Hard rules (non-negotiable)

1. **MAX_PER_RUN = 25** by default. Operator can override via env var. **Never** unbounded.
2. **Hash gate is mandatory.** No write if regenerated content matches existing — this is what prevents the "every refresh writes 377 files" failure mode.
3. **Never delete an existing AGENTS.md.** If a dir's source files vanish, mark the row `status='tombstone'` in Postgres but leave the .md on disk.
4. **No new AGENTS.md creation in v1.** Only update existing ones. Adding to dirs that lack them is a separate operator-triggered task (use `enrich-agents-md.mjs` standalone).
5. **Detached spawn never fails the dev server.** Errors logged to `memory/runs/agents-md-refresh/<TS>/error.log`, not propagated.
6. **No LLM calls in v1.** Regeneration uses static templates + rule extraction (existing `generate-agents-md.mjs` behavior). LLM-augmented enrichment is v2.
7. **Hyper-graph-RAG analysis (Neo4j + CouchDB) is a SEPARATE concern.** Don't conflate. AGENTS.md updates are deterministic file ops; graph analysis runs from `karpathy:gpu` lane on its own schedule.

## Cache + idempotency contract

```
# Track last refresh wallclock
.last-agents-refresh                                                file mtime

# Track per-AGENTS.md content hash (already exists per CLAUDE.md)
agent_context_files.content_hash                                    Postgres column

# Defer queue for capped runs
memory/runs/agents-md-refresh/deferred.json                         next-run pickup list
   { "deferred_dirs": [...], "first_seen": "<ISO TS>", "attempts": N }

# Per-run report (for audit)
memory/runs/agents-md-refresh/<TS>/report.md                        what was actually written
```

**Idempotency proof**: running the pipeline twice in a row with no source changes between → 0 writes the second run. This is the determinism gate, same discipline as Phase 0B + notecard hash.

## Effort estimate

| Task | File | Effort |
|---|---|---|
| `scripts/kb/agents-md-refresh.mjs` — orchestrator (detect → cap → batch → invoke existing scripts) | new | M |
| Wire into `ensure-dev-runtime.mjs` predev chain | `scripts/ensure-dev-runtime.mjs` | XS |
| Add `kb-agents-md:refresh` npm script | `package.json` | XS |
| Add VS Code task entry | `.vscode/tasks.json` | XS |
| Per-run report writer | inside orchestrator | XS |
| Smoke test: dirty 1 file → 1 write; rerun → 0 writes | `scripts/smoke-agents-md-refresh.mjs` | S |
| Hash-gate verification harness | `tests/agents-md-incremental.spec.ts` | S |

**Total**: ~3 hours if scripts compose cleanly. Probably 6–8 hours including the hash-gate edge cases (canonicalization order, line-ending differences, BOM handling).

## Open questions for operator

1. **Cap default**: 25 per run reasonable, or want a different number?
2. **Dirty detection scope**: just `git diff` against HEAD, or also include uncommitted untracked files? (Recommendation: include both.)
3. **Scope of incrementally-touchable AGENTS.md**: all 377, or restrict to `src/`, `scripts/`, `memory/`? (Recommendation: all.)
4. **Hyper-graph-RAG hookup**: separate `karpathy:gpu` lane already runs nightly per `config/startup-ace-policy.json`. Want AGENTS.md refresh added to its allowed-list, or kept independent? (Recommendation: independent — different cadence.)
5. **What's the right "fields_changed" granularity for the report?** Top-level keys (rules, tools, constraints, tags) only, or per-rule diff? (Recommendation: top-level keys for v1, per-rule diff in v2.)
6. **Failure threshold**: how many consecutive deferrals before an alert? (Recommendation: 3 — then surface in dev-server stdout, don't fail.)

## What this does NOT do

- ❌ Does not run any LLM. Static template regeneration only in v1.
- ❌ Does not delete or rewrite the existing 377 AGENTS.md as a one-shot. Strictly incremental.
- ❌ Does not touch the Postgres spine schema. Reuses `agent_context_files` + `directory_context_bindings` as-is.
- ❌ Does not block dev server startup. Detached spawn, errors logged not raised.
- ❌ Does not create AGENTS.md in dirs that lack them. Update-only in v1.
- ❌ Does not hook to the hyper-graph-RAG lane. Separate concern.

## Cross-references

- CLAUDE.md §"AGENTS.md Relationship Spine" — `agent_context_files` schema + parser
- `scripts/{generate,enrich,backfill,index}-agents-md.mjs` — existing tooling to compose
- `src/lib/server/agents-md/parse-agents-md.ts` — canonical envelope schema
- `memory/reconstruction/NEXT-SESSION-TODO.md` §"`npm run dev` invocation chain" — predev hook insertion point
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — sister design doc (cartridge wiring; same hash-gate discipline)

## Decision needed before implementation

**Pick A or B for trigger** (or both):
- A: VS Code predev hook (auto, detached, capped)
- B: Manual VS Code task only (operator-triggered, no auto)

My recommendation: **A + B** (predev for incremental, manual task for explicit refresh after big edits). A alone might miss edits made between sessions; B alone requires operator discipline.
