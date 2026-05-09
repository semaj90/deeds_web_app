# Runbook — bisect the TRACE MCP `tools/list` `_zod` crash

**Date**: 2026-05-09
**Status**: ready to execute (~30-45 min)
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
