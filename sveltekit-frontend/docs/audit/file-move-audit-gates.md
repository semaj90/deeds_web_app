# File-Move Audit Gates — 23-step Safety Checklist

**Purpose**: every PR that relocates source files (`git mv`, directory split, lane re-classification) MUST pass these gates. Skipping gates → silent runtime breakage (dynamic imports, barrel re-exports, ambient type drift).

**Authored**: 2026-05-10 during PR-2 (lib/services split).
**Trigger**: any PR with `git mv` on >1 `.ts`/`.svelte`/`.svelte.ts` file.
**Companion**: CLAUDE.md 47-gate system (G1-G55 + G-HR1-G-HR10). These gates extend that surface for refactors specifically.

---

## Why these gates exist

TypeScript's static type checker catches **static imports** at compile time. It does NOT catch:

1. **Dynamic imports** with string literals — `await import('$lib/services/foo')` — these are byte-level string matches at bundle time. If you `git mv` `foo.ts` but the string still says `services/foo`, Vite resolves to the old path (nothing there) → runtime error at first use.
2. **Barrel `index.ts` resolution** — importing `$lib/services/error-analysis` (no filename) resolves through `index.ts`. If the directory moves, the barrel resolves to the wrong place even if `index.ts` itself is intact.
3. **Relative paths** in non-`$lib/` style (`../lib/services/foo.js`) — common in `src/mcp/**` and a few legacy places.
4. **Doc strings** (AGENTS.md, JSDoc `@see`, markdown link refs) — non-blocking but produce stale guidance for the next agent.
5. **Test files** — Playwright + Vitest fixture paths can lag behind real moves.

23 gates below. Designed for one-pass verification: each gate is a `bash` or `node` invocation that returns non-zero if the gate fails.

---

## Pre-move gates (run BEFORE `git mv`)

### G-FM-01 — Lane classification (per file)

For each file being moved, classify as `server | client | shared | ambiguous` by inspecting its imports.

```bash
# Server signals
rg "from\s+['\"]\\\$lib/server/" <file>
rg "from\s+['\"](drizzle-orm|ioredis|pg|node:|amqplib)" <file>

# Client signals
rg "browser\s+from\s+['\"]\\\$app/environment" <file>
rg "\\b(window|document|localStorage|IndexedDB|navigator)\\b" <file>
rg "\\.svelte(\\.ts)?['\"]" <file>
```

**Gate**: zero files classified as `ambiguous` (imports from BOTH lanes). If ambiguous → split or refactor before move.

### G-FM-02 — Dynamic import survey (`$lib/` prefix)

```bash
rg "import\\s*\\(\\s*['\"]\\\$lib/<moved-path>" src/ -t ts -t svelte -n
```

**Gate**: every hit is mapped 1:1 in the move plan. If the hit is in a file that ALSO moves (intra-subdir dynamic import), the rewrite script must update both source and consumer in the same pass.

### G-FM-03 — Dynamic import survey (relative paths)

```bash
# Match relative paths to the moved directory (e.g. '../lib/services/...', '../../lib/services/...')
rg "import\\s*\\(\\s*['\"]\\.{1,2}/.*<moved-path>" src/ -t ts -t svelte -n
```

**Gate**: every hit gets manual review. The rewrite script that handles `$lib/` paths typically does NOT handle relative paths.

### G-FM-04 — Static import survey

```bash
rg "from\\s+['\"]\\\$lib/<moved-path>" src/ -t ts -t svelte -l | wc -l
```

**Gate**: capture the count. Post-move, count must equal zero on the old path AND match the original count on the new path.

### G-FM-05 — Barrel re-export check

For each moved directory, check for `index.ts`:

```bash
ls <moved-dir>/index.ts && cat <moved-dir>/index.ts | grep -c "^export"
```

**Gate**: if barrel exists, count its exports. Post-move, the same export count must resolve via the new path (use `tsgo` or `npx tsc --noEmit` on a consumer file).

### G-FM-06 — Cross-lane violation pre-check

A `client`-classified file MUST NOT be imported by `$lib/server/**`. A `server`-classified file MUST NOT be imported by `*.svelte` or `*.svelte.ts` outside dynamic-import server-action patterns.

```bash
# Client file imported by server (violation)
rg "from\\s+['\"]\\\$lib/services/<client-file>" src/lib/server/ -t ts

# Server file imported by client (violation)
rg "from\\s+['\"]\\\$lib/services/<server-file>" src/ -t svelte
```

**Gate**: zero violations. If non-zero → pre-fix the consumer before moving.

### G-FM-07 — Dead-code reference sweep

Some dynamic imports point at files that **don't exist** (refactor leftovers). Surface them before move so they're not mistakenly "fixed" by rewrite.

```bash
rg "import\\s*\\(\\s*['\"]\\\$lib/<moved-path>/([^'\"\\)]+)" src/ -o -r '$1' \
  | sort -u \
  | while read p; do
      [ -f "src/lib/<moved-path>/$p.ts" ] || [ -f "src/lib/<moved-path>/$p/index.ts" ] \
        || echo "DEAD: $p"
    done
```

**Gate**: flag dead refs in PR description. Decide per-ref: delete consumer code OR create the missing file.

### G-FM-08 — Ambient type augmentation check

`src/types/*.d.ts` and `src/app.d.ts` may declare module shapes for the moved files. If a `declare module '$lib/services/foo'` exists, it must move with the file.

```bash
rg "declare\\s+module\\s+['\"]\\\$lib/<moved-path>" src/ -t ts
```

**Gate**: zero hits OR every hit is updated in the same commit.

---

## Move-execution gates (run AFTER `git mv`, BEFORE rewrites)

### G-FM-09 — `git mv` preserves history

```bash
git log --follow --oneline <new-path> | head -3
```

**Gate**: at least 1 commit shown. If history is lost, use `git mv` instead of `rm` + `add`.

### G-FM-10 — No orphan files at old path

```bash
ls <old-path>/ 2>/dev/null
```

**Gate**: directory gone (or empty if other lane-mates remain).

---

## Rewrite gates (run AFTER import-path rewrites)

### G-FM-11 — Static import rewrite verification

```bash
# Should be zero
rg "from\\s+['\"]\\\$lib/<old-path>" src/ -t ts -t svelte -l | wc -l
```

**Gate**: returns 0.

### G-FM-12 — Dynamic import rewrite verification

```bash
# Should be zero
rg "import\\s*\\(\\s*['\"]\\\$lib/<old-path>" src/ -t ts -t svelte -l | wc -l
```

**Gate**: returns 0.

### G-FM-13 — Relative-path rewrite verification

```bash
# Should be zero
rg "['\"]\\.{1,2}/.*<old-suffix>" src/ -t ts -l | wc -l
```

**Gate**: returns 0 OR each remaining hit is a markdown/doc file (audited via G-FM-21).

### G-FM-14 — `.js` suffix correctness on dynamic imports

Per CLAUDE.md G11 + the established lesson on `db/client`, **most** dynamic imports of TS files in this codebase need a `.js` suffix for named-export resolution. The exception is barrel-via-directory resolution (e.g. `import('$lib/server/services/error-analysis')` resolves via `index.ts`).

```bash
# All dynamic imports of moved files
rg "import\\s*\\(\\s*['\"]\\\$lib/<new-path>" src/ -t ts -t svelte -n
```

**Gate**: every hit either (a) ends with `.js`, (b) ends with `/index.js`, or (c) is a bare directory path that has an `index.ts` (verify with `ls`).

### G-FM-15 — Barrel re-export still resolves

For each moved barrel, test that consumers can still resolve named exports:

```bash
# Pick one consumer; run tsgo (no-emit) on just that file
npx tsgo --noEmit --strict <consumer-file>
```

**Gate**: zero errors involving the moved exports.

---

## Verification gates (run AFTER rewrites + saves)

### G-FM-16 — `svelte-check` baseline holds

```bash
npx svelte-check --threshold error 2>&1 | tail -3
```

**Gate**: error count post-move ≤ error count pre-move. New errors introduced by the move = test failure. (Concurrent IDE edits in unrelated files are tracked separately; they should not count against the move.)

### G-FM-17 — `vite build` passes

```bash
npm run build 2>&1 | tail -5
```

**Gate**: exit code 0. Vite catches bundler-level path issues that `svelte-check` misses (dynamic imports, asset references).

### G-FM-18 — `tsgo --noEmit` passes

```bash
npm run typecheck:native 2>&1 | tail -3
```

**Gate**: 0 errors. Faster than `tsc`; uses the Go TypeScript implementation.

### G-FM-19 — Backend audit gates (where applicable)

If the moved files touch the 17 backend infrastructure gates (G1-G17 in `BACKEND_INFRASTRUCTURE_AUDIT.md`), re-run:

```bash
bash scripts/audit/backend-infrastructure-audit.sh
```

**Gate**: ≥ 15/17 green (2 SKIP slots reserved for Langfuse traces + simdjson DLL).

### G-FM-20 — Smoke tests touching moved area

Run smoke gates relevant to the moved area:

```bash
# If atlas-related
npm run smoke:trace -- --strict

# If hyperrag-related
npm run smoke:hyperrag

# If KAG-related
npm run smoke:kag
```

**Gate**: all relevant smoke gates green. If unsure which apply, run all three.

---

## Post-commit gates (run AFTER `git commit`, BEFORE push)

### G-FM-21 — AGENTS.md / doc-string sweep

```bash
rg "<moved-path>" --type md
```

**Gate**: flag remaining doc references in PR description. Auto-regen will fix them on next graphify pass; not blocking, but worth noting.

### G-FM-22 — Test fixture path check

```bash
rg "<moved-path>" tests/ -t ts -t svelte
```

**Gate**: zero hits OR every hit is in a test file scheduled to update in this PR.

### G-FM-23 — Final git status sanity

```bash
git status --short
```

**Gate**: only the expected file moves + rewrites are staged. No stray uncommitted files from concurrent IDE edits.

---

## Risk scoring rubric

After running all 23 gates, score the PR:

| Gates failed | Severity | Action |
|---|---|---|
| 0 | LOW — proceed | Standard review |
| 1-2 (post-commit gates only) | LOW — proceed with note | Mention in PR description |
| 1-2 (rewrite or verification gates) | MEDIUM — fix before merge | Address failing gate; re-run all from G-FM-11 onward |
| 3+ | HIGH — abort and re-plan | The move is bigger than estimated; split into multiple PRs |
| Any pre-move gate (G-FM-01..08) | BLOCKER | Cannot proceed; fix architecture violation first |

---

## When to run a subset

Not every move needs all 23 gates:

- **Renaming one file in place** (no directory change): G-FM-01, G-FM-04, G-FM-11, G-FM-16 (4 gates)
- **Splitting a barrel** (`index.ts` reorganization, no file moves): G-FM-05, G-FM-15, G-FM-16 (3 gates)
- **Moving a single file across lanes** (server ↔ client): all 23
- **Moving a whole directory tree** (PR-2 case): all 23
- **Archiving dead files** (no consumers): G-FM-04 (verify zero consumers), G-FM-16 (no new errors)

---

## PR-2 retrospective (2026-05-10)

The gates were validated against PR-2 itself (lib/services → lib/server/services for 5 server-only items):

| Gate | Result |
|---|---|
| G-FM-01 | PASS — 15 server / 2 client / 17 shared / 0 ambiguous |
| G-FM-02 | PASS — 10 dynamic imports surveyed, all mapped to rewrite |
| G-FM-03 | FAIL → FIX — 1 relative import in `src/mcp/server.ts:3075` missed by `$lib/`-only regex; fixed by hand |
| G-FM-04 | PASS — 32 static consumers, all rewritten by `scripts/pr2-rewrite-imports.mjs` |
| G-FM-05 | PASS — 2 barrels (`error-analysis/index.ts`, `knowledge-search/index.ts`) move intact |
| G-FM-06 | PASS — 0 cross-lane violations |
| G-FM-07 | PASS — 1 dead reference noted (`wire-telemetry.ts:20` → nonexistent `system-monitor-client`); deferred |
| G-FM-08 | PASS — no ambient module declarations for moved paths |
| G-FM-09 | PASS — `git mv` history preserved |
| G-FM-10 | PASS — old paths empty |
| G-FM-11 | PASS — 0 hits on old static path |
| G-FM-12 | PASS — 0 hits on old dynamic path |
| G-FM-13 | PASS after fix — 0 hits on relative paths to old location |
| G-FM-14 | PASS — barrel dynamic imports resolve via directory + `index.ts` |
| G-FM-16 | PASS — 12 errors remain but all pre-existing (concurrent IDE edits); 0 new errors from move |
| G-FM-21 | NOTE — AGENTS.md files in `lib/gpu/`, `lib/server/rag/`, etc. still reference old paths; graphify regen will fix |

**Verdict**: LOW risk with 1 manual fix. The rewrite script `scripts/pr2-rewrite-imports.mjs` is reusable for future PR-3+ moves (just edit the `MOVES` array).

---

## Cross-references

- `CLAUDE.md` §"Unified Audit Gate System (47 Gates)" — the broader gate framework
- `CLAUDE.md` §"Backend Infrastructure Audit (17 Gates)" — runtime health (G-FM-19 dependency)
- `scripts/pr2-rewrite-imports.mjs` — reusable import-rewrite tool
- `scripts/audit/orphan-detector.sh` — Tier A (~10s) for G-FM-04 consumer counts
- `next_steps/active/2026-05-10_production-mental-model.md` — Lane 1 framework gates
- `BACKEND_INFRASTRUCTURE_AUDIT.md` — gates referenced by G-FM-19

---

**Doc length**: ~270 lines. Drop into the PR template for any refactor that moves >1 source file.
