---
name: openspec-quickhit
description: Use when asked to work down the OpenSpec backlog cheaply — rank changes by fewest open tasks, split actionable vs operator-decision vs waiting-on-dependency, and close the smallest changes first. Reads docs/reports/openspec-workboard-v1.json; never invents task state.
---

# OpenSpec Quick-Hit Ranking

Goal: finish the most changes for the fewest tokens. Read the workboard projection, not 90 `tasks.md` files.

## Owners (reuse, do not rebuild)

| Need | Owner |
|---|---|
| Task/progress projection | `npm run atlas:docs:workboard` -> `docs/reports/openspec-workboard-v1.json` (authority stays each `tasks.md`) |
| Dependency/waiting state | `executionState` in `taskInventory` (`ACTIONABLE`, `WAITING_ON_DEPENDENCY`, `SUPERSEDED_OR_HISTORICAL`) |
| File labels / directory graph / KMeans | existing `audit-openspec-{file-labels,directory-graph,file-task-fanout}-v1.mjs` reports under `docs/reports/` — do not add a new crawler |
| Code-side checks per change | `/trace-mcp-tooling`, `/deep-audit` |
| Web research (only for research tasks) | no `/deep-research` skill exists in this repo; use the `ldr_research` / `kag_web_search` TRACE tools |
| Existing Kanban tickets (read-only lookup) | `listKanbanTasks` in `sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts`, or admin-only `GET /api/admin/atlas/kanban-tickets`; board UI `/admin/atlas/taskboard`. Do not add another Kanban table |
| OpenSpec task-source identity (DB) | `/admin/atlas/task-sources` (`openspec_task_source_index_v1`: `sourceRef`, `taskHash`, `identityStatus`, `canonicalTaskKeyCandidate`); its preview descriptor `atlas.task-source-batch-prefill-descriptor.v1` is the manifest shape to reuse |
| Recommendation / service ranking | `scripts/atlas/agentic-recommendation-workflow.mjs`, `scripts/atlas/service-capability-rank-v1.mjs` — do not build another crawler, tool selector or task scheduler |

## Steps

1. **Refresh** (writes tracked files — ask first if the tree has unrelated edits): `npm run atlas:docs:workboard`.
2. **Rank** (read-only; run from repo root):
   ```bash
   node -e "
   const j=require('./docs/reports/openspec-workboard-v1.json');
   const by={};for(const t of j.taskInventory){if(t.state!=='DONE')(by[t.change]??=[]).push(t)}
   for(const c of j.changes.filter(c=>c.open>0).sort((a,b)=>a.open-b.open).slice(0,25)){
    console.log(c.change,c.completed+'/'+c.total,'act='+c.actionable,'wait='+c.waiting);
    for(const t of by[c.change].slice(0,3))console.log('  '+t.executionState[0]+' L'+t.line+' '+t.text.replace(/\s+/g,' ').slice(0,100))}"
   ```
3. **Classify each open task** before touching it. Quick tally (heuristic — read the task text before acting; verified 2026-09-21: 2138 executable / 47 decision / 326 runtime / 751 waiting):
   ```bash
   node -e "
   const j=require('./docs/reports/openspec-workboard-v1.json');
   const dec=/(decide|operator (call|decision)|ask the user|out of scope|human sign-off)/i, rt=/(live|runtime|WSL|GPU|RTX|docker|service)/i, c={};
   for(const t of j.taskInventory){if(t.state==='DONE'||['INVARIANT','SUPERSEDED_OR_HISTORICAL'].includes(t.executionState))continue;
    const k=t.executionState==='WAITING_ON_DEPENDENCY'?'WAITING':dec.test(t.text)?'OPERATOR_DECISION':rt.test(t.text)?'RUNTIME_GATE':'EXECUTABLE';c[k]=(c[k]||0)+1}
   console.log(c)"
   ```
   - `EXECUTABLE` — code/test/read-only proof; do it.
   - `OPERATOR_DECISION` — text says "decide", "operator call", "ask the user", "explicitly out of scope". Batch into one list for the user; never act.
   - `RUNTIME_GATE` — needs a live service/GPU/WSL; run only if the service is confirmed up.
   - `WAITING` — name the blocking task from its text; work that blocker first if it is itself executable.
4. **Execute** smallest change first. Per change: `/trace-mcp-tooling` for graph/tool lookups, `/deep-audit` only if the change touches routes/schema/imports. Duplication rule: grep `packages/` and `scripts/atlas/` before writing anything.
5. **Close honestly.** Check the box in the owning `tasks.md` only with tool-backed evidence (command output, test result, diff). A percentage or a comment is not evidence. Use status words from CLAUDE.md (CREATED/WIRED/DRY_RUN_PROVEN/APPLY_PROVEN/NOT_PROVEN).
6. Re-run step 1 and report `done/total` and the change-state counts.

## Read-only taskboard workflow (added 2026-11-11)

Use when asked to pick Quick-Hit candidates and relate them to the taskboard. Every step is read-only; none of it checks a box, writes a table, or dispatches an agent.

1. **Locate the next_steps index; never recreate it.** Check the worktree (`ls next_steps/INDEX.md next_steps/CATEGORIZED_INDEX.md`), the git index (`git ls-files 'next_steps/*INDEX.md'`), `HEAD` (`git ls-tree -r --name-only HEAD -- next_steps`), other branches (`git branch -a`, `git log --all --oneline -- next_steps/INDEX.md`). Report where the newest copy is. If missing everywhere, say so and stop that step. Both files were tracked on `session/2026-11-08-verified-context-live-shadow` as of 2026-11-11.
2. **Verify workboard freshness before trusting a rank.** Use `node scripts/atlas/build-openspec-workboard-v1.mjs --task-snapshot-stdout` for a fresh isolated snapshot; save stdout as UTF-8 under `.tmp/atlas/` if needed. Compare each candidate's live task line, block hash, and file SHA-256 to the projection, including uncommitted edits. Mark mismatches `STALE_PROJECTION` and regenerate the snapshot before selection.
3. **Rank up to 15 small eligible changes.** Screen open tasks with the classification above and inspect their section headings. Exclude deferred, dependency-blocked, operator-decision, authorization, runtime and production-write gates. Rank the remaining changes by ascending open-task count, then by change name. Keep heuristic matches in review until the source block has been inspected.
4. **Select three** source-verified candidates. For each report: exact `tasks.md` path and line, task text, `taskKey`/`taskIdentity`/`declaredSourceRef`/`declaredSourceRevision` exactly as the inventory holds them (null stays null; never mint or infer an ID), blockers, and the acceptance command.
5. **Compare against existing Kanban tickets** read-only. Resolve a canonical candidate only from an exact source locator and block-hash match in the crosswalk. Look up that exact ticket key in the board. The board requires the exact line locator plus the verified file revision, or the exact path plus the same task text and a compatible revision. Distinguish `IDENTITY_UNRESOLVED`, `NO_VERIFIED_TICKET`, and `TICKET_LOOKUP_UNAVAILABLE`.
6. **Cross-check the index.** Look the three changes up in `next_steps/INDEX.md` and in `docs/reports/openspec-cohort-6527-workboard-crosswalk-v1.json`. A link is navigation only, not a dependency.
7. **Emit the review-only import manifest** at `.tmp/atlas/quick-hit-taskboard-preview-v1.json` for `/admin/atlas/taskboard`. Use `schema: atlas.task-source-batch-prefill-descriptor.v1`, `mode: PREVIEW_ONLY`, `dispatchable: false`, `canonicalAuthority: false`, `modelRouting: NOT_INVOKED`, and UTC `createdAt`. Include up to three `sources` with `sourceRef`, `sourceLine`, exact checkbox `taskText`, `taskHash`, `sourceFileSha256`, `sourceRevision` (nullable), `taskKey` (nullable), `identityStatus` (`SOURCE_MATCH` or `UNRESOLVED`), `canonicalTaskKeyCandidate` (nullable), `blockers`, `acceptanceGates`, and `reviewRequired: true`. Keep the rank and review evidence in this scratch artifact; they do not grant authority.

**Future, separate gates (not part of this skill):** a scratch-database rollback rehearsal of any ticket import, then explicit per-action apply approval. Agent dispatch stays disabled: `agent_dispatch` returns HTTP 409 `AGENT_DISPATCH_UNAVAILABLE_VALIDATED_WORKER_REQUIRED`, and `complete` needs a validated run and `executionReceiptId`. `DEV_BYPASS_AUTH` never grants task-mutation rights.

## Hard limits

- Do not delete, move, or archive files. Archive-not-delete: copy + SHA-256 manifest entry in `docs/archive-manifest.json`, dry run first, restore verified before anything is removed.
- SeaweedFS hot/warm/cold moves and any DB/cache write need explicit per-action approval; a bare "yes" is not approval.
- SOM 20x20 cell/`somRevision` cannot be used as a bucket key until a fresh versioned SOM run exists (see CLAUDE.md `SOM_REVISION_PROVENANCE_01`). Use KMeans/domain taxonomy meanwhile.
- Do not edit Drizzle schema/migrations, model files, CUDA/native builds, or `src/lib/shims/*`.
- Task counts are navigation metrics only, not readiness.

## Lessons from the first run (2026-09-21)

- `ACTIONABLE` in the workboard is not proof of executable: several top tasks were decisions (RRF 3.1 sits under a "Decision (human sign-off)" heading) or stale-blocked (pca-svd 3.1 cited a registry decision that was already applied). Read the task and its section heading first.
- New route tests must live where `sveltekit-frontend/vitest.config.ts` `include` globs them (`tests/atlas/**`, `tests/routes/auto/**`, or add to the explicit list) — a file in `tests/routes/*.test.ts` outside that list silently never runs.
- Prove a new regression test catches the bug (temporarily revert the fix, see it fail, restore) before checking the box.
- `it.todo` stubs (about 72% of `tests/routes/auto`) are placeholders, not coverage; a green run over them proves little.
- A bare `STACK_TRACE_ERROR` from a `beforeEach` is usually the hook timeout on a slow cold import — rerun the file alone before assuming a code bug.
- Re-run `npm run atlas:docs:workboard` after closing tasks; the board is a projection and goes stale.
