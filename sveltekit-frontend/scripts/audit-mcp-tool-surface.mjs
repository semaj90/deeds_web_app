#!/usr/bin/env node
/**
 * Static audit of the MCP tool surface.
 *
 * Scans src/mcp/**.ts for `server.registerTool('name', schema, handler)` calls
 * and reports:
 *   1. total tool count
 *   2. cross-file name collisions (same tool name registered in 2+ files)
 *   3. handler aliases (multiple tool names sharing the same handler reference)
 *   4. the legacy-alias gate state (which names are inside `if (enableLegacy)`)
 *
 * Read-only. No network, no live MCP probe. Pairs with the runtime
 * `tools/list` curl in the operator runbook.
 *
 *   node scripts/audit-mcp-tool-surface.mjs                  # text report
 *   node scripts/audit-mcp-tool-surface.mjs --json           # machine-readable
 *   node scripts/audit-mcp-tool-surface.mjs --with-fixtures  # also scan scripts/__fixtures__
 *                                                            # (regression-tests the audit's failure paths)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const ROOT = join(REPO, 'src', 'mcp');
const FIXTURES = join(__dirname, '__fixtures__');

const wantJson = process.argv.includes('--json');
const withFixtures = process.argv.includes('--with-fixtures');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// Match: server.registerTool(\n? 'name',\n? { ... },\n? handler)
// Capture: tool name + an approximate handler signature (first ~80 chars after the schema closes)
const TOOL_RE = /server\.registerTool\(\s*['"]([^'"]+)['"]\s*,\s*\{[\s\S]*?\}\s*,\s*([\s\S]*?)\)\s*;?/g;
const GATE_RE = /if\s*\(\s*enableLegacy\s*\)\s*\{/g;

const tools = []; // { name, file, line, handlerHint, gated }

const scanRoots = [ROOT];
if (withFixtures) {
  try { statSync(FIXTURES); scanRoots.push(FIXTURES); } catch { /* fixtures dir absent — skip */ }
}

for (const file of scanRoots.flatMap(walk)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(REPO, file).replace(/\\/g, '/');

  // Build a list of [start, end] offsets of `if (enableLegacy) { ... }` blocks
  const gates = [];
  for (const m of src.matchAll(GATE_RE)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    gates.push([m.index, i]);
  }
  const isGated = (offset) => gates.some(([s, e]) => offset >= s && offset <= e);

  for (const m of src.matchAll(TOOL_RE)) {
    const name = m[1];
    const raw = m[2].trim();
    // Inline handlers (`async (...) =>` or `function ...`) are unique by definition.
    // Only a bare identifier as the third arg is a real shared-handler alias.
    const isInline = /^(async\s*\(|async\s+function|function\b|\()/.test(raw);
    const handlerHint = isInline ? `<inline:${name}>` : raw.split(/[\s)(]/, 1)[0];
    const line = src.slice(0, m.index).split('\n').length;
    tools.push({ name, file: rel, line, handlerHint, gated: isGated(m.index) });
  }
}

// Group: collisions (same name in 2+ files)
const byName = new Map();
for (const t of tools) {
  if (!byName.has(t.name)) byName.set(t.name, []);
  byName.get(t.name).push(t);
}
const collisions = [...byName.entries()].filter(([, regs]) => regs.length > 1);

// Intentional canonical-alias handlers: documented multi-name single-impl
// pairs per §10 of trace-kag-web-development-guide.md. Adding here requires
// matching JSDoc in the source explaining why both names are canonical.
const ALLOWED_MULTI_NAME_HANDLERS = new Set([
  'handleTraceSearch',  // kb.trace_search + trace.kag_search (§10 named tool)
]);

// Group: aliases (same handlerHint in 2+ tools within the same file)
const byHandler = new Map();
for (const t of tools) {
  const key = `${t.file}::${t.handlerHint}`;
  if (!byHandler.has(key)) byHandler.set(key, []);
  byHandler.get(key).push(t);
}
const aliases = [...byHandler.values()].filter(regs => regs.length > 1);

// Namespace breakdown (for the canonical-30 surface check)
const namespaces = {};
for (const t of tools) {
  const ns = t.name.includes('.') ? t.name.split('.')[0] : '<bare>';
  namespaces[ns] = (namespaces[ns] || 0) + 1;
}

const report = {
  totalRegistrations: tools.length,
  uniqueNames: byName.size,
  gatedRegistrations: tools.filter(t => t.gated).length,
  collisions: collisions.map(([name, regs]) => ({
    name,
    locations: regs.map(r => `${r.file}:${r.line}${r.gated ? ' (gated)' : ''}`),
  })),
  aliasGroups: aliases.map(regs => ({
    handler: regs[0].handlerHint,
    file: regs[0].file,
    names: regs.map(r => `${r.name}${r.gated ? ' (gated)' : ''}`),
  })),
  namespaces,
};

// Compute pass/fail before either output mode.
const ungatedNames = report.aliasGroups.flatMap(a =>
  a.names.filter(n => !n.includes('(gated)'))
);
const ungatedAliasGroups = report.aliasGroups.filter(a =>
  a.names.filter(n => !n.includes('(gated)')).length > 1
  && !ALLOWED_MULTI_NAME_HANDLERS.has(a.handler)
);
const failed = report.collisions.length > 0 || ungatedAliasGroups.length > 0;

if (wantJson) {
  console.log(JSON.stringify({ ...report, ok: !failed }, null, 2));
  process.exit(failed ? 1 : 0);
}

const pad = (s, n) => String(s).padEnd(n);

console.log('=== MCP tool surface audit ===');
console.log(`registrations: ${report.totalRegistrations}  unique names: ${report.uniqueNames}  gated: ${report.gatedRegistrations}`);
console.log();

console.log('namespaces:');
for (const [ns, n] of Object.entries(report.namespaces).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(ns, 16)} ${n}`);
}
console.log();

if (report.collisions.length === 0) {
  console.log('collisions: NONE');
} else {
  console.log(`collisions: ${report.collisions.length}`);
  for (const c of report.collisions) {
    console.log(`  ${c.name}`);
    for (const loc of c.locations) console.log(`    ${loc}`);
  }
}
console.log();

if (report.aliasGroups.length === 0) {
  console.log('alias groups (same handler, multiple names): NONE');
} else {
  console.log(`alias groups: ${report.aliasGroups.length}`);
  for (const a of report.aliasGroups) {
    console.log(`  ${a.file}`);
    console.log(`    handler: ${a.handler}`);
    console.log(`    names:   ${a.names.join(', ')}`);
  }
}

const ungatedAliases = report.aliasGroups.flatMap(a =>
  a.names.filter(n => !n.includes('(gated)'))
).filter((n, i, arr) => arr.indexOf(n) === i);

console.log();
console.log(`canonical surface (ungated): ${report.totalRegistrations - report.gatedRegistrations} tools`);
console.log(`legacy aliases gated by MCP_LEGACY_ALIASES: ${report.gatedRegistrations}`);

if (failed) process.exit(1);
