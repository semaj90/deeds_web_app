# Runbook — bisect the TRACE MCP `tools/list` `_zod` crash

**Date**: 2026-05-09
**Status**: ✅ **ROOT CAUSE FOUND AND FIXED** (2026-05-09 second pass)
**Original estimate**: ~30-45 min — **actual**: ~25 min via isolation probe (no server restart needed)

## ✅ Resolution (2026-05-09)

**Root cause**: 4 MCP tools used `z.record(z.any())` — the **zod-3 single-arg
syntax**. Zod 4 requires `z.record(keySchema, valueSchema)` (two args). The
zod 3 form survives TypeScript compilation but crashes the SDK's
`tools/list` JSON-Schema generator at `zod/v4/core/json-schema-processors.js:432`
because the record's `keyType` is `undefined`.

**Files fixed**:

| File | Line | Change |
|------|------|--------|
| `src/mcp/admin_tools.ts` | 17 | `z.record(z.any())` → `z.record(z.string(), z.any())` |
| `src/mcp/admin_tools.ts` | 44 | same |
| `src/mcp/bifrost_tools.ts` | 18 | same |
| `src/mcp/skill_tools.ts` | 32 | same |

**How it was found**: instead of restarting the live MCP server in halves,
[scripts/diagnose/probe-tools-list-by-module.mjs](../../sveltekit-frontend/scripts/diagnose/probe-tools-list-by-module.mjs)
loads each `register*Tools` module into a **fresh in-process `McpServer`**
(no stdio/HTTP transport, fake pg pool), iterates `_registeredTools`, and
runs the same `normalizeObjectSchema` + `toJsonSchemaCompat` chain that
`tools/list` uses. The crash propagates per-tool with stack trace, naming
the offending field. Total: 4 modules flagged, all with the same root cause.

**Regression lock**: G34 (`mcp:zod-record-two-arg`) added to
`scripts/validate/full-system.mjs`. Tier 0, fatal. Greps every `src/mcp/*.ts`
for `z.record(<one-arg>)` patterns. First run after fix: 14 files scanned,
all `z.record(...)` calls have ≥2 args (PASS, 15 ms).

**Operator-side step still needed**: restart the live trace MCP server on
:8788 so it picks up the fixed source. Then `tools/list` should return all
30+ tools cleanly. Verify with:

```bash
curl -sS -X POST http://127.0.0.1:8788/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Should return a `result.tools[]` array, not an `error.message` containing `_zod`.

---

## Original investigation log (for posterity)

The bisect protocol below was the *plan*; the isolation probe approach
above was the *execution*. Keeping the original notes because the bisect
protocol still applies if future tools/list bugs arise that the probe
can't catch.


**Symptom**: `tools/list` JSON-RPC call against `src/mcp/trace-mcp-server.ts` returns
`{"error":{"code":-32603,"message":"Cannot read properties of undefined (reading '_zod')"}}`.
Direct `tools/call` works fine — only `tools/list` introspection fails.

## What we know (verified 2026-05-09)

- **Not a zod version mismatch.** `@modelcontextprotocol/sdk@1.24.3` declares
  `peerDependencies.zod: "^3.25 || ^4.0"`. Installed `zod@4.3.6` satisfies it.
  Pinning back to zod 3.22 would *worsen* the situation (SDK requires `^3.25` minimum on the v3 side).
- **`_zod` is a zod-4 internal symbol.** The SDK's `tools/list` introspector
  reads `inputSchema._zod` from each registered tool. If even one tool's
  schema isn't a real zod-4 schema, the introspector throws and `tools/list`
  fails for *all* tools, not just the bad one. Hence: bisect.
- **Direct calls don't introspect.** `tools/call` dispatches by name to the
  registered handler without walking schemas. That's why our atlas P1.7
  smoke + the new `db.*` tools work end-to-end.

## Suspect-source matrix

| Source | Risk | Why |
|--------|------|-----|
| `src/mcp/trace-mcp-server.ts` (inline `server.tool(...)` calls) | **HIGH** — 30+ inline registrations, easy to miss one | grep first |
| `src/mcp/topology_mgmt_tools.ts` (`registerTopologyMgmtTools`) | **HIGH** — recently moved due to TDZ; may have been edited unsafely | check first |
| `src/mcp/codebase_tools.ts` | medium | |
| `src/mcp/research_tools.ts` | medium | |
| `src/mcp/admin_tools.ts` | medium | |
| `src/mcp/skill_tools.ts` | medium | |
| `src/mcp/bifrost_tools.ts` | medium | |
| `src/mcp/new_tools.ts` | medium | |
| `src/mcp/db-inspection-tools.ts` | **LOW** — just shipped, all tools verified pure zod-4 | |

## Bisect protocol (7 steps, ~30-45 min)

### Step 1 — capture the failing baseline

```bash
# Terminal: trace MCP must be running on :8788 (npm run trace:mcp:start or similar)
curl -sS -X POST http://127.0.0.1:8788/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
| tee scratch/mcp-bisect/baseline-failure.json
```

Confirm the error message contains `_zod`. If not, the symptom has changed; stop and re-diagnose.

### Step 2 — bisect by `register*Tools` call

In `src/mcp/trace-mcp-server.ts` near lines 90-117, wrap each
`register*Tools(server, ...)` call in a feature flag:

```ts
const SKIP = (process.env.MCP_SKIP_REGISTRATIONS ?? '').split(',');
if (!SKIP.includes('new'))      registerNewTools(server, { rerankUrl: RERANK_URL });
if (!SKIP.includes('admin'))    registerAdminTools(server);
if (!SKIP.includes('skill'))    registerSkillTools(server);
if (!SKIP.includes('codebase')) registerCodebaseTools(server);
if (!SKIP.includes('research')) registerResearchTools(server);
if (!SKIP.includes('bifrost'))  registerBifrostTools(server);
// (topology + db-inspection registered below pool init)
if (!SKIP.includes('topology')) registerTopologyMgmtTools(server, pool);
if (!SKIP.includes('db'))       registerDbInspectionTools(server, pool);
```

Then bisect: start with `MCP_SKIP_REGISTRATIONS=topology,research,admin,skill,codebase,bifrost,new` (only `db` registered → known-good per Phase B). Restart the server and retry `tools/list`. Add modules back one at a time. The first one that reintroduces the crash is the offender.

### Step 3 — within the offending file, bisect by tool

Once the offender is identified (e.g. `topology_mgmt_tools.ts`), comment
out half its `server.tool(...)` calls. Restart, retry. Halve again.
Within ~6 iterations you'll have the single offending tool.

### Step 4 — read the offending tool's input schema

Open the file at the offending `server.tool('name', <schema>, handler)`
call. Inspect the `<schema>` object. Look for:

- **A non-zod value**: `{ foo: 'string' }` instead of `{ foo: z.string() }`.
- **A nested object literal where a zod schema is expected**: `{ filters: { from: z.string() } }` instead of `{ filters: z.object({ from: z.string() }) }`.
- **A `.optional()` / `.nullable()` mistake** that produces a non-schema value.
- **A schema constructed from a different zod copy** (rare — check imports).
- **A spread of an external object** (`{ ...someConst }`) where `someConst` isn't a zod-shape.

### Step 5 — verify the suspect with a tiny standalone repro

```ts
// scratch/mcp-bisect/probe.mjs
import { z } from 'zod';
const offendingSchema = { /* paste the schema here */ };
for (const [k, v] of Object.entries(offendingSchema)) {
  console.log(k, typeof v, '_zod:', !!(v as any)?._zod, '_def:', !!(v as any)?._def);
}
```

Run it. Any field whose `_zod` is `false` is the culprit.

### Step 6 — fix in place

Replace the bad value with a real zod schema. Example:

```ts
// before:
{ name: 'string', age: 'number' }
// after:
{ name: z.string(), age: z.number() }
```

If the tool is conceptually schema-less, pass `{}` (empty object — that's a valid zod-shape).

### Step 7 — confirm + lock the regression

1. Restart the MCP server with `MCP_SKIP_REGISTRATIONS` unset.
2. Re-run the curl from Step 1. Should now return the full tool list (≥30 tools).
3. Save success body to `scratch/mcp-bisect/post-fix.json`.
4. Commit the fix with the bisect log in the commit body.
5. **Add G32 (`mcp:trace-server-tools-list-probe`)** to `scripts/validate/full-system.mjs` — runtime probe that boots the server, hits `tools/list`, asserts no `_zod` error. Tier 2 (requires infra), non-fatal at first; promote to fatal once stable.

## What G32 should look like (after the fix lands)

```js
async function G32() {
  // Skip if trace-mcp-server isn't running on :8788 (don't try to spawn it
  // here — it has Postgres/Neo4j/Redis dependencies that may not be up).
  const health = await fetchSafe('http://127.0.0.1:8788/health', { timeoutMs: 2000 });
  if (health.status !== 200) return skip('trace MCP not on :8788 — start with npm run trace:mcp:start');

  const res = await fetch('http://127.0.0.1:8788/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (text.includes('_zod')) return fail(`tools/list still throws on _zod — bisect runbook: next_steps/active/2026-05-09_mcp-tools-list-bisect.md`);

  // Parse SSE-or-JSON
  const line = text.split('\n').find(l => l.startsWith('{') || l.startsWith('data:'));
  const body = JSON.parse(line?.startsWith('data:') ? line.slice(5).trim() : line);
  const n = body.result?.tools?.length ?? 0;
  if (n < 30) return warn(`tools/list returned only ${n} tools — expected ≥30`);
  return pass(`tools/list returned ${n} tools cleanly`);
}
```

Register in the GATES array as Tier 2, non-fatal (until proven stable across infra-up/infra-down).

## Why this matters

`tools/list` is what every fresh MCP client calls first to discover tool
shapes. Until it works, any new client (Open WebUI, AnythingLLM,
Claude Code reconnect after restart) sees zero tools and quietly
falls back to no-MCP mode. Direct `tools/call` keeps working for
clients that hard-code tool names — which is fine for our atlas smoke
but not for the synthesis loop's "agent discovers tools dynamically"
assumption in Lane 1.

Fixing this unblocks Lane 1 of the synthesis-loop plan and removes
the "deferred per prior session" caveat from Phase B.

## Effort

- Bisect: 30-45 min
- Schema fix: 5-15 min depending on how exotic the bad shape is
- G32 wire-up: 15 min (mostly already sketched above)
- Total: **~1 hour**, single sitting.

---

## UPDATE 2026-05-09 — bisect executed, "one bad schema" theory refuted

The bisect ran via `npm run smoke:mcp-tools-list:bisect` and produced
a **uniform failure pattern across all 8 registries** — every registry's
*first* tool fails with the same error, on a fresh `McpServer` instance,
with no other registries loaded:

```
❌ newTools           → tool=kb.organize_messy_text       'typeName' undefined
❌ adminTools         → tool=ui.analyze_view              'typeName' undefined
❌ skillTools         → tool=skills.list                  'typeName' undefined
❌ codebaseTools      → tool=codebase.rg_search           'typeName' undefined
❌ researchTools      → tool=research.web_search          'typeName' undefined
❌ bifrostTools       → tool=trace.bifrost_dispatch       'typeName' undefined
❌ topologyMgmtTools  → tool=topology.hydration_status    'typeName' undefined
❌ dbInspectionTools  → tool=db.schema_overview           'typeName' undefined
```

8/8 fail identically → **library-side root cause, not codebase-side**.

### Corrected diagnosis

The crash error `_def.typeName` (Zod 3 internal) being missing is the
giveaway. The actual broken component is **`zod-to-json-schema@3.24.6`**
(transitive dep of `@modelcontextprotocol/sdk`) — that library's
peerDependency is `zod: "^3.24.1"` (Zod **3 only**). When the SDK calls
`zodToJsonSchema(tool.inputSchema, …)` during `tools/list`, it tries to
read v3 internals (`._def.typeName`) on the installed v4 schemas
(`zod@4.1.12`) — which use `_zod` symbol instead — and throws.

`tools/call` works because it routes through `safeParseAsync`, which Zod 4
supports identically.

### Three viable fixes (operator picks)

| Option | Effort | Risk | Notes |
|--------|--------|------|-------|
| **A. Pin `zod` to `^3.25.76`** | 5 min + `svelte-check` audit | High — Zod 3 → 4 had subtle semantic shifts (error format, `.parse` return shape on certain unions, `.refine` ergonomics). 523 consumers must pass type-check. The lone Zod-4-only call site (`z.url()` in `ingest-dev-docs/+server.ts:85`) is already fixed to v3-compatible `z.string().url()`. | Now possible. |
| **B. Add `package.json` overrides for `zod-to-json-schema`** | 30 min — find or write a v4-compatible fork | Low — only swaps the failing transitive dep. Zod 4 ships `z.toJSONSchema()` natively, so a 30-LOC shim that delegates v4 schemas to that built-in covers the gap. | Cleanest if a community fork exists in npm. |
| **C. Wait for upstream MCP SDK to migrate to `z.toJSONSchema()`** | 0 effort, weeks of waiting | None | Zod 4 ships its own `z.toJSONSchema()`; SDK PR tracks this. |

### Bisect script — keep as regression gate

`scripts/smoke/smoke-mcp-tools-list-bisect.mjs` (npm:
`smoke:mcp-tools-list:bisect`) walks every registry in isolation
against a fresh `McpServer`, calls `zodToJsonSchema(tool.inputSchema)`
on each tool, and reports the first failure per registry. After ANY of
the three fixes above ships, this script must report 0/8 failed before
the fix is considered green.

### Audit checklist — new gate G56

Add to project root `CLAUDE.md` "20-Gate System" Tier-H extension
(G55 is the current ceiling):

```bash
# G56 — MCP tools/list serializer compat
npm run smoke:mcp-tools-list:bisect:strict
# MUST report: ✅ all registries serialize cleanly
# Failure mode: ❌ N registries with non-Zod-shaped inputSchema
#   → indicates zod-to-json-schema cannot read installed Zod's internals
#   → library compat issue, NOT a per-tool code-shape bug
#   → see this doc for fix options A/B/C
```

### Reload-claude-skills + subagents — yes, requires reload

After picking fix A/B and shipping, Claude Code must be reloaded for
the new MCP `tools/list` to be re-fetched. Either start a fresh session
or `/reload`. Skill / subagent hot-reload semantics are the same — both
load at session start and don't auto-refresh on file change. New skills
in `.claude/skills/` and new subagents in `.claude/agents/` only become
visible on session start.
