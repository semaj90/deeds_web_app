#!/usr/bin/env node
// probe-tools-list-by-module.mjs — registers each register*Tools module
// against a fresh in-process McpServer (no stdio/HTTP transport, no Postgres
// pool needed for shape introspection), then asks each registered tool's
// inputSchema to be normalized + JSON-Schema'd. Whichever module/tool
// triggers the `_zod` throw is the culprit.
//
// Doesn't touch the running MCP server on :8788. Doesn't restart anything.
//
// Usage:
//   cd sveltekit-frontend && npx tsx scripts/diagnose/probe-tools-list-by-module.mjs

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
const COMPARE = await import('@modelcontextprotocol/sdk/server/zod-compat.js');

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };

// Minimal fake pool — db-inspection-tools + topology_mgmt_tools take a `pool`
// arg but we never actually call queries here, only register the tool shapes.
const fakePool = {
  query: async () => ({ rows: [] }),
  connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  on: () => {},
  end: async () => {},
};

const MODULES = [
  ['admin',     async () => (await import('../../src/mcp/admin_tools.ts')).registerAdminTools],
  ['bifrost',   async () => (await import('../../src/mcp/bifrost_tools.ts')).registerBifrostTools],
  ['codebase',  async () => (await import('../../src/mcp/codebase_tools.ts')).registerCodebaseTools],
  ['new',       async () => (await import('../../src/mcp/new_tools.ts')).registerNewTools],
  ['research',  async () => (await import('../../src/mcp/research_tools.ts')).registerResearchTools],
  ['skill',     async () => (await import('../../src/mcp/skill_tools.ts')).registerSkillTools],
  ['topology',  async () => (await import('../../src/mcp/topology_mgmt_tools.ts')).registerTopologyMgmtTools],
  ['db',        async () => (await import('../../src/mcp/db-inspection-tools.ts')).registerDbInspectionTools],
];

// ── per-module probe ─────────────────────────────────────────────

async function probeModule(label, getRegisterFn) {
  let registerFn;
  try {
    registerFn = await getRegisterFn();
  } catch (err) {
    return { label, status: 'fail', kind: 'import', detail: err.message.slice(0, 120) };
  }
  if (typeof registerFn !== 'function') {
    return { label, status: 'fail', kind: 'export', detail: 'register* function not exported' };
  }

  const server = new McpServer({ name: `probe-${label}`, version: '0.0.0' });

  try {
    if (label === 'topology' || label === 'db' || label === 'new') {
      registerFn(server, label === 'new' ? { rerankUrl: 'http://localhost:0' } : fakePool);
    } else {
      registerFn(server);
    }
  } catch (err) {
    return { label, status: 'fail', kind: 'register', detail: err.message.slice(0, 200) };
  }

  // Now iterate _registeredTools (private but stable in v1.x) and try to
  // shape each one the same way mcp.js tools/list does. Catch per-tool.
  const reg = (server)._registeredTools ?? {};
  const offenders = [];
  let okCount = 0;
  for (const [name, tool] of Object.entries(reg)) {
    if (!tool.enabled) continue;
    try {
      const obj = normalizeObjectSchema(tool.inputSchema);
      if (obj) toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'input' });
      if (tool.outputSchema) {
        const o2 = normalizeObjectSchema(tool.outputSchema);
        if (o2) toJsonSchemaCompat(o2, { strictUnions: true, pipeStrategy: 'output' });
      }
      okCount++;
    } catch (err) {
      const s = tool.inputSchema;
      const shape = s?._zod?.def?.shape;
      // For each field, run the SDK's exact isZ4Schema check and capture the
      // first one that throws. That's the field whose value is undefined/null.
      const fieldDiag = [];
      if (shape) {
        for (const [k, v] of Object.entries(shape)) {
          let result;
          try {
            const isZ4 = COMPARE.isZ4Schema(v);
            result = `isZ4=${isZ4} ctor=${v?.constructor?.name ?? '?'}`;
          } catch (e) {
            result = `THROWS: ${e.message}`;
          }
          fieldDiag.push({ key: k, result });
        }
      }
      offenders.push({
        name,
        message: err.message,
        ctorName: s?.constructor?.name ?? 'n/a',
        shapeKeys: shape ? Object.keys(shape).join(',') : 'n/a',
        fieldDiag,
        stack: err.stack?.split('\n').slice(0, 4).join('\n        ') ?? '',
      });
    }
  }
  return { label, status: offenders.length === 0 ? 'pass' : 'fail', kind: 'shape', okCount, offenders };
}

// ── main ─────────────────────────────────────────────

console.log(`\n${C.dim}probing each register*Tools module in isolation…${C.reset}\n`);

const results = [];
for (const [label, fn] of MODULES) {
  const r = await probeModule(label, fn);
  results.push(r);
  if (r.status === 'pass') {
    console.log(`  ${C.green}✓${C.reset} ${label.padEnd(10)} ${r.okCount} tools shape cleanly`);
  } else if (r.kind === 'shape') {
    console.log(`  ${C.red}✗${C.reset} ${label.padEnd(10)} ${r.okCount} ok, ${C.red}${r.offenders.length} broken${C.reset}`);
    for (const o of r.offenders) {
      console.log(`      ${C.yellow}${o.name}${C.reset}  ctor=${o.ctorName} shape=[${o.shapeKeys}]`);
      for (const fd of o.fieldDiag) {
        const bad = fd.result.startsWith('THROWS');
        console.log(`        ${bad ? C.red : C.dim}field "${fd.key}"${C.reset}  ${fd.result}`);
      }
      console.log(`        ${C.dim}stack: ${o.stack}${C.reset}`);
    }
  } else {
    console.log(`  ${C.red}✗${C.reset} ${label.padEnd(10)} ${r.kind}: ${r.detail}`);
  }
}

const totalBroken = results.reduce((a, r) => a + (r.offenders?.length ?? 0), 0);
console.log('');
if (totalBroken === 0) {
  console.log(`${C.green}all modules shape cleanly in isolation${C.reset}`);
  console.log(`${C.dim}→ if the live server still crashes tools/list, the bug is in trace-mcp-server.ts inline registrations${C.reset}`);
  console.log(`${C.dim}  (53 inline server.tool() calls — re-run with --include-trace to load those too)${C.reset}`);
} else {
  console.log(`${C.red}${totalBroken} broken tool(s) found across modules${C.reset}`);
}
process.exit(totalBroken > 0 ? 1 : 0);
