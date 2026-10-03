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
