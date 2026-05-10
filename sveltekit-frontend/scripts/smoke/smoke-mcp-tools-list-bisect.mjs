#!/usr/bin/env node
/**
 * smoke-mcp-tools-list-bisect.mjs
 *
 * Diagnostic + regression gate for the trace-mcp-server `tools/list`
 * crash. Runs each `register*Tools(...)` registry function in isolation
 * against a fresh McpServer, then calls the SDK's internal serializer
 * (`zodToJsonSchema`) on every tool's `inputSchema`. The first registry
 * that throws — or whose tool produces a `Cannot read properties of
 * undefined (reading '_zod')` style error — is the offender.
 *
 * Usage:
 *   npm run smoke:mcp-tools-list:bisect
 *   node scripts/smoke/smoke-mcp-tools-list-bisect.mjs --strict
 *
 * Exit:
 *   0 = every registry serializes cleanly
 *   1 = at least one registry has a tool with a non-Zod-shaped inputSchema
 *
 * Why this exists: the live trace-mcp-server `/mcp tools/list` returns
 *   { error: "Cannot read properties of undefined (reading '_zod')" }
 * but the SDK accepts both Zod 3 and 4. The crash is a code-shape issue
 * (one tool registered with a non-zod input) — this script identifies
 * the exact registry + tool name without taking the live server down.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');
const STRICT    = process.argv.includes('--strict');

let pass = 0, fail = 0;
const failed = [];

console.log('\n🔍 mcp tools/list bisect — register*Tools isolation\n');

// Bring in tsx so we can import the registry .ts files raw.
try {
  const tsx = await import('tsx/esm/api').catch(() => null);
  if (tsx?.register) tsx.register();
} catch {
  console.error('❌ tsx loader required'); process.exit(2);
}

// Registry isolation check
console.log('  starting registry isolation walk...');

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
// Test BOTH paths: the production library (`zod-to-json-schema`, which
// the SDK actually calls) AND Zod 4's built-in `z.toJSONSchema()` (the
// fix). A "library fail + builtin pass" pattern proves the codebase is
// clean and the bug is library-side. A "both fail" pattern means the
// schemas are genuinely broken.
const { z } = await import('zod');
const ztjsNs = await import('zod-to-json-schema').catch(() => null);
const libToJsonSchema     = ztjsNs ? (s, o) => (ztjsNs.zodToJsonSchema ?? ztjsNs.default)(s, o) : null;
const builtinToJsonSchema = (s) => z.toJSONSchema(s);
const zodToJsonSchema     = libToJsonSchema; // primary check uses library path (matches SDK behavior)

// Optional pool stub — topology_mgmt_tools needs one.
const stubPool = {
  query:   async () => ({ rows: [] }),
  end:     async () => {},
  on:      () => stubPool,
};

const REGISTRIES = [
  { id: 'newTools',          mod: './src/mcp/new_tools.ts',           fn: 'registerNewTools',          args: (s) => [s, { rerankUrl: 'http://127.0.0.1:8090' }] },
  { id: 'adminTools',        mod: './src/mcp/admin_tools.ts',         fn: 'registerAdminTools',        args: (s) => [s] },
  { id: 'skillTools',        mod: './src/mcp/skill_tools.ts',         fn: 'registerSkillTools',        args: (s) => [s] },
  { id: 'codebaseTools',     mod: './src/mcp/codebase_tools.ts',      fn: 'registerCodebaseTools',     args: (s) => [s] },
  { id: 'researchTools',     mod: './src/mcp/research_tools.ts',      fn: 'registerResearchTools',     args: (s) => [s] },
  { id: 'bifrostTools',      mod: './src/mcp/bifrost_tools.ts',       fn: 'registerBifrostTools',      args: (s) => [s] },
  { id: 'topologyMgmtTools', mod: './src/mcp/topology_mgmt_tools.ts', fn: 'registerTopologyMgmtTools', args: (s) => [s, stubPool] },
  { id: 'dbInspectionTools', mod: './src/mcp/db-inspection-tools.ts', fn: 'registerDbInspectionTools', args: (s) => [s, stubPool] },
];

for (const r of REGISTRIES) {
  const t0 = Date.now();
  let server;
  try {
    server = new McpServer({ name: `bisect-${r.id}`, version: '0.0.0' });
  } catch (err) {
    console.log(`  ❌ ${r.id.padEnd(22)} — McpServer construct failed: ${err.message}`);
    failed.push({ id: r.id, stage: 'construct', error: err.message });
    fail++;
    continue;
  }

  // Step 1: register
  try {
    const mod = await import(pathToFileURL(resolve(ROOT, r.mod)).href);
    const fn = mod[r.fn];
    if (typeof fn !== 'function') throw new Error(`${r.fn} not exported as function`);
    fn(...r.args(server));
  } catch (err) {
    console.log(`  ❌ ${r.id.padEnd(22)} — register threw: ${err.message.slice(0, 120)}`);
    failed.push({ id: r.id, stage: 'register', error: err.message });
    fail++;
    continue;
  }

  // Step 2: enumerate tools + serialize each inputSchema (the SDK code path
  // that crashes in production tools/list).
  let badTool = null, badError = null;
  try {
    // McpServer keeps tools at server._registeredTools (private; documented
    // shape in SDK source). Walk it directly so we exercise the same shape
    // tools/list does.
    const tools = (server._registeredTools ?? new Map());
    const entries = tools instanceof Map ? [...tools.entries()] : Object.entries(tools);
    for (const [name, tool] of entries) {
      if (!tool?.inputSchema) continue;
      try {
        if (zodToJsonSchema) zodToJsonSchema(tool.inputSchema, { name });
      } catch (err) {
        // LIBRARY path failed — try Zod's built-in to confirm it's a
        // library bug, not a schema bug.
        let builtinResult = 'untested';
        try { builtinToJsonSchema(tool.inputSchema); builtinResult = 'PASS (z.toJSONSchema works — library is the bug)'; }
        catch (e2) { builtinResult = `FAIL (${e2.message.slice(0, 60)})`; }
        badTool = name;
        badError = `library: ${err.message.slice(0, 80)} ; z.toJSONSchema: ${builtinResult}`;
        break;
      }
    }
  } catch (err) {
    failed.push({ id: r.id, stage: 'list-walk', error: err.message });
    fail++;
    console.log(`  ❌ ${r.id.padEnd(22)} — list-walk threw: ${err.message.slice(0, 120)}`);
    continue;
  }

  if (badTool) {
    failed.push({ id: r.id, stage: 'serialize', tool: badTool, error: badError });
    fail++;
    console.log(`  ❌ ${r.id.padEnd(22)} — tool '${badTool}' inputSchema not Zod-shape: ${badError?.slice(0, 80)}`);
  } else {
    pass++;
    const tools = server._registeredTools ?? {};
    const count = tools instanceof Map ? tools.size : Object.keys(tools).length;
    console.log(`  ✅ ${r.id.padEnd(22)} — ${String(count).padStart(3)} tools, ${Date.now() - t0}ms`);
  }
}

console.log(`\n${fail === 0 ? '✅ all registries serialize cleanly' : `❌ ${fail} registry/registries have a non-Zod-shaped inputSchema`}\n`);
if (fail > 0) {
  console.log('Offenders:');
  for (const f of failed) {
    console.log(`  - ${f.id} (${f.stage}${f.tool ? ` / tool=${f.tool}` : ''}): ${f.error?.slice(0, 200)}`);
  }
  console.log('\nFix: open the offending file, find the named tool, and replace any plain-object\ninputSchema with a real `z.object({ … })`. Common mistakes:');
  console.log('  - inputSchema: { foo: "string" }      ← plain object literal');
  console.log('  - inputSchema: zodSchema._def.shape   ← unwrapped internals');
  console.log('  - inputSchema: someValidatorJoi(...)  ← non-Zod validator\n');
}

process.exit((fail === 0 || !STRICT) ? (fail === 0 ? 0 : (STRICT ? 1 : 0)) : 1);
