# Unwired Features Wiring Plan — 2026-05-05

**Source**: `reports/deep-audit/d9-shallow-dynamic-triage.json` (`has-fanOut-no-fanIn` bucket)

32 modules (~6,500 LOC) have real imports + real implementations but **no consumers**. They are not dead code — they are features that were built but never wired to a route, machine, or component. This is high-value work: turn 6,500 lines of latent capability into shipped features.

## Bucket policy

- **WIRE** ≥ 200 LOC modules with clear domain ownership and 2+ imports → real features awaiting routes/UI
- **MERGE** schema-style modules that overlap with `schema-postgres.ts` (the canonical source)
- **ARCHIVE** small (<50 LOC) shims with no callers — likely dead refactor remnants
- **VERIFY** files where the integration intent is unclear

## Tier A — Wire now (high-impact features)

### 1. `src/lib/machines/evidence-lifecycle-machine.ts` (548 LOC)
**Status**: ~~WIRE~~ → **ARCHIVED** (2026-05-05)
**Location**: `deeds_labs/unwired-features-archive-2026-05-05/evidence-lifecycle-machine.ts`
**Why archived**: `evidence-processing-machine.ts` (#2 below) is the canonical machine referenced by active routes and `EvidenceUploadProgress.svelte`. This file was a draft successor that diverged without consumers. Wiring it would introduce a parallel machine with no clear upgrade path.
**Future path**: If the evidence pipeline is refactored, cherry-pick the `graphLinking → synthesizing → completed` states from the archived file.

### 2. `src/lib/machines/evidence-processing-machine.ts` (577 LOC)
**Status**: VERIFY → likely ARCHIVE
**Why**: 99% overlap with #1 above. One of these is the canonical machine; the other is an older draft.
**Action**: Diff the two state graphs. Keep whichever is referenced by the rebuild plan (`enhanced-legal-case-machine.ts`); archive the other.

### 3. `src/lib/ai/unified-generation.ts` (435 LOC, 3 imports)
**Status**: WIRE
**What it is**: Client-side 5-tier inference cascade — Bifrost L2 → E2B → LiteRT → ONNX → Server. Drops in cleanly above the current ChatSession routing.
**Wire path**:
- `src/lib/models/ChatSession.svelte.ts` — replace its current router with `generateText()` from this module
- `src/lib/components/ClientGemmaDemo.svelte` — already has a stub; swap to `unified-generation.generateText`
**Effort**: ~1 hr (replace 1 import + 1 call site)

### 4. `src/lib/server/analysis/hmm-ace-analyzer.ts` (394 LOC, 6 imports)
**Status**: WIRE
**What it is**: HMM analysis on ACE glyph sequences — narrative-flow scoring, graph-compression hints, **interim inference** (<10ms response while RabbitMQ queues full synthesis).
**Wire path**:
- `src/lib/server/ace/context-assembler.ts` — call `getInterimInference()` to emit SSE event-1 before full synthesis
- `src/routes/api/sse/chat/+server.ts` — interim inference becomes the first SSE chunk
- `src/routes/api/graph/analyze/+server.ts` (new) — expose `analyzeACEFlow()` for the GraphifyViewer
**Effort**: ~3-4 hrs (3 wire points, but each is small)

### 5. `src/lib/server/ai/error-fix-memory.ts` (109 LOC, 2 imports)
**Status**: WIRE
**What it is**: Redis-backed error-fix memory with verification status (`passed | failed | unknown | reverted`).
**Wire path**:
- `src/lib/server/ai/gemma4-agent.ts:645` — interface field `errorFixMemoryHit?: boolean` already declared but never populated
  - Add `getErrorFixMemory()` lookup at agent start
  - Add `saveErrorFixMemory()` call after `apply_shadow_patch` / `verify_fix` tools complete
  - Populate `errorFixMemoryHit` and `verificationStatus` in the return shape
- `src/lib/server/codeintel/fix-recommender.ts` — second consumer
**Effort**: ~1-2 hrs (smallest meaningful wire — interface fields exist, just populate them)

## Tier B — Merge into canonical schema

These 6 schema files are leftover variants from migrations. Compare to `src/lib/server/db/schema-postgres.ts` (canonical). For each table that's genuinely unique, MERGE; for duplicates, ARCHIVE.

| File | LOC | Action |
|------|-----|--------|
| `src/lib/server/db/schema-ingestion.ts` | 293 | MERGE missing tables into schema-postgres.ts |
| `src/lib/server/db/jsonb-legal-schema.ts` | 283 | MERGE — JSONB legal-doc tables |
| `src/lib/server/db/schema-phase78.ts` | 265 | VERIFY — phase78 tables may already exist |
| `src/lib/server/db/schema-gpu-cache.ts` | 206 | VERIFY — GPU-cache tables (some live as cluster_summaries) |
| `src/lib/server/db/jsonb-legal-schema.ts` | 283 | dup of above |
| `src/lib/server/db/schema-actual.ts` | 78 | INVESTIGATE — name implies "the real one" |

## Tier C — Other unwired modules

| File | LOC | Likely action |
|------|-----|---------------|
| `src/mcp-gpu-orchestrator.ts` (top-level!) | 576 | INVESTIGATE — top-level placement is suspicious |
| `src/lib/server/png-embed-extractor.ts` | 298 | WIRE into evidence pipeline OCR step |
| `src/lib/server/db/migrate-test-rag.ts` | 128 | DELETE — old migration script |
| `src/lib/server/analytics/web-research-crawler.test.ts` | 124 | RUN — orphaned test, should be in vitest config |
| `src/lib/server/db/index-clean.ts` | 52 | DELETE — superseded by `db/client.ts` |
| `src/lib/server/db/index-new.ts` | 68 | DELETE — same, superseded |
| `src/lib/server/db/mirror-query.ts` | 85 | INVESTIGATE — unique helper or dup |
| `src/lib/server/database-simple.js` | 72 | DELETE — JS file in TS codebase, no callers |

## Execution order (minimum-risk path)

1. **#5 error-fix-memory** — smallest, integration point pre-declared, ~1 hr → tangible win, builds confidence
2. **#3 unified-generation** — 2 call sites, well-isolated, ~1 hr
3. **#4 hmm-ace-analyzer** — biggest user-facing impact (interim SSE response < 10ms), 3-4 hrs
4. **#1/#2 evidence machines** — VERIFY first, then wire/archive, half-day total
5. **Tier B schema merge** — schema diff per file, half-day total
6. **Tier C cleanup** — half-day archive sweep

## Verification

After each wire:

```bash
npm run check            # type-check
npm run smoke:graphify   # 5-pillar graph consistency validator
npm run audit:d9         # confirm the file moved out of true-orphan-candidate
node scripts/triage-d9-shallow-dynamic.mjs   # confirm bucket changed
```

For workspace-start flows, run the lightweight startup guard first, then collect recent logs, rg related files, build the `.plan.md` / `graph-map.json` pair, and finish by validating `npm run smoke:graphify` before handing off the prompt.

The orphan should drop into either `runtime-referenced` (static import added) or `dynamic-referenced` (lazy `await import()`).

## Why this list matters

The earlier audit said "337 orphans". The layered triage refined that to:
- 50 `dynamic-import-target` (loaded at runtime — keep)
- 46 `mentioned-in-agents` (documented — keep)
- 32 `has-fanOut-no-fanIn` (← **this list** — wire, don't delete)
- 19 `true-orphan` (archive after peek)
- 1 `sibling-replaced` (investigate)

Without the second-pass triage, the project would have lost ~6,500 LOC of working features. The plan above turns latent capability into shipped functionality.
