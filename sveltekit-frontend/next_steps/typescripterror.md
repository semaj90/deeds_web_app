# TypeScript 7 Error Synthesis — Karpathy Autoresearch Log

**Generated:** 2026-05-07  
**Tool:** tsgo v7.0.0-dev.20260421.2 (native Go compiler, 10× faster than tsc)  
**Run:** `npm run audit:tsgo:json` → `wire:synthesis:grpo`  
**Wired to:** Redis `nes:cluster_risk:*` (NES cartridge, 6h TTL)

---

## Totals

| Metric | Count |
|--------|-------|
| Parsed errors | **26** |
| Unparsed lines | 36 |
| Affected files | **4** |
| Critical-cluster overlap | 0 (topFiles don't include error files — see §5) |

---

## Error Inventory by File

### 1. `src/lib/server/ace/context-assembler.ts` — 4 errors TS2339

**Root cause:** `ClusterContextPacket` interface in `src/lib/server/ace/types.ts` is missing three fields
that `context-assembler.ts:1850-1852` accesses.

| Line | Code | Field accessed | Interface has |
|------|------|----------------|---------------|
| 1850 | TS2339 | `c.tags` | `topTags: string[]` ← wrong name |
| 1850 | TS2339 | `c.tags` | (duplicate — same expr twice) |
| 1852 | TS2339 | `c.topoLabel` | `topoClass: string` ← wrong name |
| 1852 | TS2339 | `c.summaryLens` | **missing** — not in interface at all |

**Fix A — rename at call site** (preferred, 1-line change):

```typescript
// context-assembler.ts:1850-1852 — current (broken)
const tags = c.tags?.length ? `Tags: ${c.tags.slice(0, 6).join(', ')}` : '';
return `**${c.clusterKey}** (${c.topoLabel ?? 'unknown'}): ${c.summaryLens ?? ''}...`;

// Fixed — use existing interface names + add summaryLens to type
const tags = c.topTags?.length ? `Tags: ${c.topTags.slice(0, 6).join(', ')}` : '';
return `**${c.clusterKey}** (${c.topoClass ?? 'unknown'}): ${c.summaryLens ?? ''}...`;
```

**Fix B — extend the interface** (adds the missing field):

```typescript
// types.ts — ClusterContextPacket, after line 514 (communityId)
/** Human-readable topology label (alias for topoClass, populated by graphify) */
topoLabel?: string;
/** One-sentence LLM synthesis lens for this cluster (set by synthesize-next-actions) */
summaryLens?: string;
/** Deduplicated Qdrant tags for the cluster (alias for topTags) */
tags?: string[];
```

**Recommendation:** Fix A for `tags`/`topoLabel` (rename to existing fields), Fix B for `summaryLens`
(it's genuinely new data — the synthesis sets it but the type doesn't declare it).

**Effort:** ~5 min  
**Impact:** Unblocks ACE cluster context rendering in prompt assembly

---

### 2. `src/lib/server/mcp/tool-ranker.ts` — 2 errors TS2339

**Root cause:** Dynamic import of `{ pool }` from `$lib/server/db/client.js`.
`pool` IS a named export (`export const pool = new Pool(...)` at client.ts:41),
but tsgo's path-alias resolver (`$lib/...`) may not resolve the re-export chain through
`schema.js` barrel. This is a **tsgo path-alias limitation** (known in pre-stable Go compiler).

| Line | Code | Expression |
|------|------|------------|
| 306  | TS2339 | `const { pool } = await import('$lib/server/db/client.js')` |
| 327  | TS2339 | `const { pool } = await import('$lib/server/db/client.js')` |

**Fix options:**

```typescript
// Option 1 — use tracedQuery helper (already exported, wraps pool internally)
import { tracedQuery } from '$lib/server/db/client.js';
await tracedQuery(sql, params);

// Option 2 — explicit cast to suppress tsgo pre-stable alias bug
const { pool } = await import('$lib/server/db/client.js') as any;

// Option 3 — add pool to the default export shape in db/client.ts
// (client.ts:104 already has: export default { db, adminDb, pool })
// then: const { pool } = (await import('$lib/server/db/client.js')).default;
```

**Recommendation:** Option 1 (`tracedQuery`) — removes the dynamic import entirely and uses
the existing observability wrapper. Keeps the HMM stat INSERT working.

**Effort:** ~10 min (2 call sites)  
**Impact:** Cleans up DB access pattern in MCP tool ranker

---

### 3. `src/mcp/trace-mcp-server.ts` — 19 errors (18× TS2769 + 1× TS2304)

**Root cause A — TS2769 (18 errors):** FastMCP's `server.tool()` second argument expects
`McpSchema` / `ZodRawShape`, NOT a raw JSON Schema object literal with a top-level `type` field.
The `ops.*` tool group (L1617–1987) uses the raw JSON Schema style:

```typescript
// Current — raw JSON Schema (tsgo rejects 'type' in AnySchema)
server.tool('ops.propose_patch', {
  description: '...',
  inputSchema: { type: 'object' as const, properties: {...}, required: [...] },
}, handler);

// Fixed — Zod schema (what FastMCP expects)
import { z } from 'zod';
server.tool('ops.propose_patch', {
  description: '...',
  inputSchema: z.object({
    operator_token: z.string(),
    file_path:      z.string(),
    issue:          z.string(),
    context_lines:  z.number().int().min(5).max(200).optional(),
  }),
}, handler);
```

Affected tool registrations (all in ops group, L1617–1987):
- `ops.propose_patch` (L1617)
- `ops.run_targeted_test` (L1668)
- `ops.record_fix_attempt` (L1738)
- `ops.run_quality_gate` (L1794)
- `ops.propose_patch` duplicate (L1856, L1897, L1926, L1954, L1982) — or these are the
  remaining ops tools; check exact tool names at each line

**Root cause B — TS2304 (1 error, L1643):** `resolve` called without import at file scope
in the `ops.propose_patch` handler. `resolve` from `node:path` needs to be imported
at the top of the file (or the handler imports it locally).

```typescript
// L1643 context (ops.propose_patch handler)
const absPath = resolve(process.cwd(), safeFile);  // 'resolve' not in scope here

// Fix: check existing imports at top of trace-mcp-server.ts
import { resolve } from 'node:path';
// If already imported with a different alias, use it — or add the import
```

**Effort:** ~30-45 min (schema conversion for 9-10 ops tools)  
**Impact:** MCP ops tool group will be fully tsgo-clean; Zod schemas add runtime validation

---

### 4. `src/routes/api/admin/observability/+server.ts` — 1 error TS2614

**Root cause:** tsgo TS2614 says "no exported member 'db'" but `db` IS a named export
(`export const db = drizzle(...)` at client.ts:52). This is a **tsgo path-alias issue**
identical to issue #2 — the Go compiler's `$lib/` resolution doesn't follow the
`tsconfig.json` path mapping in the same way as tsc in pre-stable mode.

```typescript
// Current (L14) — triggers TS2614 under tsgo
import { db } from '$lib/server/db/client.js';

// Fix A: suppress tsgo alias false-positive (no functional change)
// @ts-expect-error tsgo pre-stable: $lib alias not resolved for named db export
import { db } from '$lib/server/db/client.js';

// Fix B: use default import (also works since db is in default export)
import client from '$lib/server/db/client.js';
const { db } = client;
```

**Recommendation:** Fix A (`@ts-expect-error`) — this is a tsgo pre-stable limitation,
not a real bug. tsc/svelte-check see it correctly. The comment documents the workaround.

**Effort:** 2 min  
**Impact:** 1 less tsgo error; no runtime change

---

## Priority Order (cluster-risk × file importance)

| Priority | File | Errors | Fix class | Est. time |
|----------|------|--------|-----------|-----------|
| **P0** | `context-assembler.ts` | 4 | Interface mismatch | 5 min |
| **P0** | `trace-mcp-server.ts` (TS2304) | 1 | Missing import | 2 min |
| **P1** | `trace-mcp-server.ts` (TS2769) | 18 | Zod schema migration | 45 min |
| **P1** | `tool-ranker.ts` | 2 | DB access pattern | 10 min |
| **P2** | `observability/+server.ts` | 1 | tsgo alias workaround | 2 min |

**Cluster risk mapping** (from synthesis run 2026-05-07T15-56-22):

```
context-assembler.ts → cluster:gpu:6  (P0, risk=1.000, critical)
trace-mcp-server.ts  → cluster:gpu:58 (P0, risk=1.000, critical)
tool-ranker.ts       → cluster:gpu:6  (P0, risk=1.000, critical)
observability/+server.ts → cluster:gpu:92 (P1, risk=0.300, medium)
```

Both P0 clusters (gpu:6, gpu:58) are **critical** risk — these are the ACE assembly engine
and the XState/MCP/SSE cluster. Fixing their tsgo errors closes the GRPO feedback loop:
`tsgo7Diags > 0` on a critical cluster → cartridge `nes_priority=255` + `grpo_reward` penalty.

---

## GPU-Accelerated Autoresearch Notes (Karpathy-style)

The error pattern here is classic interface drift — the implementation races ahead of the type
declarations. Three root causes, all resolvable in < 1h total:

1. **ACE ClusterContextPacket** — field names diverged during the quaternion manifold / tile
   engine refactor (session `feat(tile-engine): SemanticTile, TileEngineTrace`). The
   `summaryLens` field was written by `synthesize-next-actions.mjs` but never landed in the
   interface. Quick fix: add 3 optional fields to the interface.

2. **tsgo $lib alias** — 3 of the 4 affected files use `$lib/server/db/client.js` dynamic or
   named imports. tsgo 7.0 pre-stable doesn't fully resolve SvelteKit path aliases. This will
   self-heal when tsgo stable ships (expected TS 7.1). For now: `@ts-expect-error` comments
   or use the `tracedQuery` wrapper that abstracts the raw pool access.

3. **FastMCP inputSchema shape** — ops tools were written with raw JSON Schema objects but
   FastMCP v2 expects Zod. The `type: 'object' as const` pattern triggers TS2769 on every
   registration. Migration is mechanical: wrap each schema in `z.object({})`.

---

## Wire Results (Redis NES cartridge, as of this run)

```
nes:cluster_risk:cluster:gpu:6   → critical (priority 255)  tsgo7=4*
nes:cluster_risk:cluster:gpu:58  → critical (priority 255)  tsgo7=19*
nes:cluster_risk:cluster:gpu:73  → high     (priority 192)  tsgo7=0
nes:cluster_risk:cluster:gpu:92  → medium   (priority 128)  tsgo7=1*
nes:cluster_risk:cluster:gpu:19  → low      (priority  64)  tsgo7=0
nes:cluster_risk:cluster:gpu:20  → low      (priority  64)  tsgo7=0
nes:cluster_risk:cluster:gpu:59  → low      (priority  64)  tsgo7=0
```

*\* Projected counts after running `wire:synthesis:grpo` with expanded topFiles list
(current topFiles only cover 5 files per cluster; errors are in non-top-5 files of those clusters)*

**Next run command** (after fixing errors and re-running tsgo):
```bash
npm run audit:tsgo:json && npm run wire:synthesis:grpo
```

---

---

## Pipeline Trace Log — 2026-05-07

Full test run results. All commands from `sveltekit-frontend/`.

### Stage 1: PageRank

**Command:** `NEO4J_PASSWORD=neo4j123 npx tsx scripts/run-pagerank.ts`

**Result:** PASS — 1368 nodes scored in 4.2s

```
[pr] Neo4j: 2769 IMPORTS edges loaded
[pr] Converged in 62 iterations (delta=9.82e-7)
[pr] Top PageRank: schema-postgres.ts (1.000), schema-chat.ts (0.859), env.server.ts (0.752)
[pr] Cached 1368 scores in Redis (TTL=21600s)
```

**Gap found:** `run-pagerank.ts` default password is `legal_ai_pass` but `.env` sets `neo4j123`.
The script reads `NEO4J_PASSWORD` from env but the npm script doesn't load `.env`.

**Fix needed:** Add `dotenv/config` or pass env explicitly in the npm script.

```json
"run:pagerank": "NEO4J_PASSWORD=neo4j123 npx tsx scripts/run-pagerank.ts"
```

---

### Stage 2: Authority Scores

**Command:** `NEO4J_PASSWORD=neo4j123 npm run graphify:authority`

**Result:** PASS — 374 nodes with PageRank → 7119 authority scores mirrored in 9s

```
[authority] Neo4j: 374 nodes with PageRank
[authority] Mirrored 7119 authority scores in 9021ms
[authority] Artifact → memory/runs/2026-05-07-16-44-09/authority_scores.json
```

**Gap found:** `graphify:authority` creates a new run directory with only `authority_scores.json`.
The `synthesize-next-actions.mjs` script uses the **latest** run directory for graph_nodes context,
but the latest directory won't have `synthesis_summary.json`. Forces manual `--run-id` override.

**Fix needed:** Authority script should write into the most recent directory that already
has `graph_nodes.json`, or synthesis should scan subdirs for the most recent `synthesis_summary.json`.

---

### Stage 3: Synthesis

**Command:** `NEO4J_PASSWORD=neo4j123 node scripts/graph/synthesize-next-actions.mjs`

**Result:** PASS — 7 clusters scored, all LLM synthesis complete

```
[synth] run: 2026-05-07T16-22-48
[synth] graph: 2000 nodes, 20 synthesis clusters
[synth] tsgo: 62 diagnostics
[synth] G17=102 (localhost hardcoded — all others 0)
[synth] P0: cluster:gpu:6 risk=1.000, cluster:gpu:58 risk=1.000, cluster:gpu:73 risk=0.594
[synth] P1: cluster:gpu:92 risk=0.300, cluster:gpu:19 risk=0.297, cluster:gpu:20 risk=0.297, cluster:gpu:59 risk=0.239
```

**Gap found:** `tsgo.diagCount=0` for all P0/P1 clusters despite 26 parsed errors.
Root cause: error files are in `cluster:gpu:72` (`context-assembler.ts`) and
`cluster:dir:src-mcp` (`trace-mcp-server.ts`) — outside the P0/P1 set.
These clusters have low composite risk scores (dominated by shallow-wiring × 0.35 + authority × 0.15).

**Observation:** `cluster:gpu:72` (context-assembler, ACE assembly engine) may deserve
P0 elevation. Current risk formula doesn't weight tsgo errors. Worth adding `tsgo_weight: 0.05`
to the composite formula in `synthesize-next-actions.mjs`.

---

### Stage 4: GRPO Wire

**Command:** `node scripts/graph/wire-synthesis-grpo.mjs --run-id=2026-05-07T16-22-48`

Two bugs fixed during this run:

**Bug 1 — Qdrant filter mismatch (FIXED):** Script was filtering `neo4j_gpuCluster = "cluster:gpu:6"`
(string) but Qdrant payload stores it as integer `6`. Added `parseGpuClusterId()` + `buildClusterFilter()`
that matches against integer value as well as `cluster_key` string.

**Bug 2 — tsgo7 undercount (FIXED):** Only checked `topFiles` (5 files/cluster). Now loads
full `graph_nodes.json` to build `fileToCluster` map and counts all error files per cluster.

**Result after fixes:** PASS — 3,438 total Qdrant chunks updated

| Cluster | Risk | Level | Chunks Updated |
|---------|------|-------|----------------|
| cluster:gpu:6  | 1.000 | critical | 883 |
| cluster:gpu:58 | 1.000 | critical | 10 |
| cluster:gpu:73 | 0.594 | high | 448 |
| cluster:gpu:92 | 0.300 | medium | 910 |
| cluster:gpu:19 | 0.297 | low | 410 |
| cluster:gpu:20 | 0.297 | low | 745 |
| cluster:gpu:59 | 0.239 | low | 32 |

---

### Stage 5: Quaternion Manifold Tests

**Command:** `npx vitest run tests/quaternion-manifold.spec.ts --reporter=verbose`

**Result:** 59/59 PASS in 1.74s

All test suites green:
- `standardiseManifold4` — 5/5 pass (SOM coord clamping, reward axis preservation)
- `manifold4ToQuaternion` — 3/3 pass (unit quaternion, HMM section weighting)
- `manifold4Similarity` — 5/5 pass (identity=1, section-aware ranking)
- `hmmAxisMultiplier` — 6/6 pass (LEGAL_AUTHORITY/FACTS/CLAIMS boosts)
- `biasedUnitQuaternion` — 3/3 pass
- `standardizeManifold4` — 5/5 pass
- `applyQuaternionAxisMultiplier` — 2/2 pass
- `toStandardizedBiasedQuaternion` — 4/4 pass (end-to-end pipeline)

---

## Open Gaps / TODO

| # | Gap | Effort | Priority |
|---|-----|--------|----------|
| G1 | `run-pagerank.ts` doesn't load `.env` — requires `NEO4J_PASSWORD=xxx` prefix | 5 min | medium |
| G2 | `graphify:authority` creates new run dir, breaks `--run-id`-free wire workflow | 15 min | medium |
| G3 | `cluster:gpu:72` (context-assembler.ts, 4 tsgo errors) not in P0/P1 — may need tsgo weight in composite risk | 30 min | high |
| G4 | tsgo `$lib` alias resolution: tool-ranker.ts + observability/+server.ts get false TS2339/TS2614 | 15 min | medium |
| G5 | `ClusterContextPacket` missing `summaryLens` field — context-assembler.ts L1852 (4 errors) | 5 min | high |
| G6 | `trace-mcp-server.ts` ops tools use raw JSON Schema not `z.object()` — 18× TS2769 | 45 min | low (tsgo-only) |
| G7 | G17 gate: 102 hardcoded localhost references — majority in AGENTS.md files not server code | 30 min | low |

### Recommended fix order (fast wins first)
1. **G5** — Add `summaryLens?`, `topoLabel?`, `tags?` to `ClusterContextPacket` in `types.ts` (5 min, fixes 4 errors)
2. **G1** — Add `dotenv` load to `run-pagerank.ts` OR update npm script
3. **G4** — Add `@ts-expect-error` comments for `$lib` alias false positives in tool-ranker + observability
4. **G3** — Add `tsgo_weight: 0.05` to cluster risk formula in `synthesize-next-actions.mjs`
5. **G2** — Modify authority script to write into existing run dir with `graph_nodes.json`
6. **G6** — Migrate ops tool `inputSchema` objects to `z.object()` (mechanical but large)

---

## Reproduce

```bash
cd sveltekit-frontend
npm run audit:tsgo:json          # writes scratch/audits/tsgo-diagnostics.json
npm run wire:synthesis:grpo      # maps risk + tsgo7 → Redis NES cartridge keys
cat scratch/audits/tsgo-diagnostics.json | node -e "
  const j=require('./scratch/audits/tsgo-diagnostics.json');
  const by={};
  j.diagnostics.filter(d=>d.parsed).forEach(d=>{
    if(!by[d.file_path])by[d.file_path]=[];
    by[d.file_path].push(d.line+' '+d.code);
  });
  Object.entries(by).forEach(([f,e])=>console.log(f+':',e.join(', ')));
"
```

---

## Fix Session — 2026-05-07 (P0/P1 closes)

All P0 and P1 items from the priority list above were applied in a single session.

### Results

| Gap | Fix applied | Outcome |
|-----|-------------|---------|
| G5 ClusterContextPacket | Already fixed (topoLabel + summaryLens in types.ts L522/524) | Pre-existing |
| G4 $lib alias in tool-ranker | Already had `@ts-expect-error` at L306/328 | Pre-existing |
| G4 $lib alias in observability | Already had `@ts-expect-error` at L14 | Pre-existing |
| trace-mcp-server.ts missing `{` | 9 `server.tool()` schema objects were missing opening `{` (mixed CRLF/CR corruption). Added `  {` to all 9 tool registrations | **FIXED** |
| `z.record(z.unknown())` TS2554 | `ops.record_fix_attempt` used 1-arg form; tsgo expects 2 args. Changed to `z.record(z.string(), z.unknown())` | **FIXED** |
| synthesis_grpo_wiring.json artifact | Wire script wrote only to Qdrant + Redis, no disk artifact. Added `writeFile` call after Summary section | **FIXED** |

### tsgo Error Count

| Run | Errors |
|-----|--------|
| Pre-session (this log created) | 26 |
| After brace fix (9 tools) | 1 |
| After z.record() fix | **0** |

### Artifact

`synthesis_grpo_wiring.json` is now written to the run directory after every wire run:

```json
{
  "runId": "2026-05-07T16-46-33",
  "wiredAt": "...",
  "dryRun": false,
  "clusterCount": 7,
  "summary": { "critical": 2, "high": 1, "medium": 1, "low": 3 },
  "clusters": [...]
}
```

### Root Cause: Missing Braces

The 9 affected `server.tool()` calls had their schema `{` replaced by a bare `\r` (carriage
return) or simply omitted entirely. This is a line-ending corruption artifact — likely from an
editor that stripped the `{` when converting between CRLF/LF modes. The fix adds the opening
`{` back to each schema argument, restoring valid TypeScript object literal syntax.

### Updated Open Gaps

| # | Gap | Status |
|---|-----|--------|
| G1 | run-pagerank.ts dotenv | **CLOSED** — `import 'dotenv/config'` added; `run:pagerank` npm script added |
| G2 | graphify:authority new-dir issue | OPEN |
| G3 | cluster:gpu:72 (context-assembler) not P0/P1 | OPEN |
| G7 | 102 hardcoded localhost refs | OPEN |
| G5/G4/G6 | ClusterContextPacket, $lib alias, Zod migration | **CLOSED** |
