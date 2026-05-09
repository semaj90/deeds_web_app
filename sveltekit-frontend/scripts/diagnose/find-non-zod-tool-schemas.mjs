#!/usr/bin/env node
// find-non-zod-tool-schemas.mjs — static scan for the `tools/list` _zod crash
// culprit. Walks every `src/mcp/*tools*.ts` + trace-mcp-server.ts, finds each
// `server.tool(name, <schema>, handler)` call, and reports any schema field
// whose value doesn't look like a zod call (z.*, z(...), or a known-good
// pattern).
//
// Output: list of suspect file:line:tool-name with the offending field name.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const FILES = [
  'src/mcp/trace-mcp-server.ts',
  'src/mcp/admin_tools.ts',
  'src/mcp/bifrost_tools.ts',
  'src/mcp/codebase_tools.ts',
  'src/mcp/new_tools.ts',
  'src/mcp/research_tools.ts',
  'src/mcp/skill_tools.ts',
  'src/mcp/topology_mgmt_tools.ts',
  'src/mcp/db-inspection-tools.ts',
];

// A field value is "zod-ish" if it starts with `z.`, is `z()`, or is one of
// these wrapper patterns commonly used in this codebase.
const ZOD_PREFIX = /^(z\.|z\(|z<)/;
const ZOD_WRAPPER_FNS = ['array', 'object', 'union', 'intersection', 'tuple', 'record', 'map', 'set', 'lazy', 'literal', 'enum', 'nativeEnum', 'optional', 'nullable', 'preprocess', 'transform', 'refine'];

// Find every server.tool('name', { ... }, handler) call. Capture name + the
// schema-object source range. Naive but works: we look for `server.tool(`,
// then read until the matching closing paren of the call (depth-tracked).
function findToolCalls(src) {
  const calls = [];
  const re = /server\.tool\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const nameStart = m.index;
    const lineNum = src.slice(0, nameStart).split('\n').length;
    const name = m[1];
    // From the comma after the name, find the schema object's outer braces.
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '{') {
      // Schema is something else (a variable reference, a function call) — skip.
      calls.push({ name, line: lineNum, schemaSrc: null, schemaKind: 'non-literal' });
      continue;
    }
    // Capture matching braces.
    let depth = 1;
    const start = i;
    let inStr = null;
    let escape = false;
    for (i = start + 1; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (inStr) {
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    const schemaSrc = src.slice(start, i);
    calls.push({ name, line: lineNum, schemaSrc, schemaKind: 'literal' });
  }
  return calls;
}

// Inside a schema literal `{ ... }`, find each top-level `key:` pair and
// classify the value as zod-ish / non-zod.
function classifyFields(schemaSrc) {
  if (!schemaSrc) return [];
  const inner = schemaSrc.slice(1, -1).trim();
  if (!inner) return []; // empty {} is fine
  const fields = [];
  // Top-level field split: walk the source, track brace/paren/bracket depth,
  // split on `,` only at depth 0.
  let depth = 0;
  let last = 0;
  let inStr = null;
  let escape = false;
  const parts = [];
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{' || c === '(' || c === '[' || c === '<') depth++;
    else if (c === '}' || c === ')' || c === ']' || c === '>') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(inner.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(inner.slice(last));

  for (const raw of parts) {
    const part = raw.trim();
    if (!part || part.startsWith('//') || part.startsWith('/*')) continue;
    // Strip leading inline comment lines
    const cleaned = part.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n').trim();
    if (!cleaned) continue;
    // Field key: identifier or quoted, then colon
    const km = cleaned.match(/^['"]?([A-Za-z_$][A-Za-z0-9_$]*|[^'"]+)['"]?\s*:\s*([\s\S]+)$/);
    if (!km) continue;
    const key = km[1];
    const val = km[2].trim();
    const zodLike = ZOD_PREFIX.test(val) || ZOD_WRAPPER_FNS.some(fn => val.startsWith(`${fn}(`));
    fields.push({ key, valuePreview: val.slice(0, 60).replace(/\s+/g, ' '), zodLike });
  }
  return fields;
}

// ── main ────────────────────────────────────────────────────────────

// Count top-level args of `server.tool(...)` to catch the 2-arg form
// `server.tool(name, handler)` which leaves inputSchema undefined and crashes
// tools/list per @modelcontextprotocol/sdk/dist/esm/server/zod-compat.js:11.
function findTwoArgCalls(src) {
  const hits = [];
  const re = /server\.tool\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length;
    const lineNum = src.slice(0, m.index).split('\n').length;
    let depth = 1, i = start, args = 0, sawNonWs = false;
    // strStack tracks nested string contexts; template literals can contain
    // `${expr}` and inside expr we're back in code context (and may open more
    // strings/templates). Without this, nested templates (common in handlers
    // returning template literals) confuse the comma counter.
    const strStack = []; // 'sq' | 'dq' | 'tpl-str' | 'tpl-expr'
    let escape = false;
    let firstArg = '';
    while (i < src.length && depth > 0) {
      const c = src[i];
      const top = strStack[strStack.length - 1];
      if (escape) { escape = false; i++; continue; }
      if (top === 'sq' || top === 'dq' || top === 'tpl-str') {
        if (c === '\\') { escape = true; i++; continue; }
        if (top === 'sq' && c === "'") strStack.pop();
        else if (top === 'dq' && c === '"') strStack.pop();
        else if (top === 'tpl-str' && c === '`') strStack.pop();
        else if (top === 'tpl-str' && c === '$' && src[i + 1] === '{') {
          strStack.push('tpl-expr'); i += 2; continue;
        }
        i++;
        continue;
      }
      // code context (incl. inside ${...} expressions)
      if (c === "'") { strStack.push('sq'); i++; continue; }
      if (c === '"') { strStack.push('dq'); i++; continue; }
      if (c === '`') { strStack.push('tpl-str'); i++; continue; }
      if (c === '}' && top === 'tpl-expr') { strStack.pop(); i++; continue; }
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') {
        depth--;
        if (depth === 0 && sawNonWs) args++;
      } else if (c === ',' && depth === 1) {
        args++;
        if (args === 1) firstArg = src.slice(start, i);
      } else if (!/\s/.test(c)) sawNonWs = true;
      i++;
    }
    if (args === 2) {
      const nameMatch = firstArg.match(/^['"]([^'"]+)['"]/);
      hits.push({ line: lineNum, name: nameMatch?.[1] ?? '?', argCount: 2 });
    }
  }
  return hits;
}

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };
const suspects = [];
let totalCalls = 0;

for (const rel of FILES) {
  let src;
  try { src = await readFile(resolve(ROOT, rel), 'utf8'); }
  catch { console.log(`${C.dim}skip ${rel} (not found)${C.reset}`); continue; }

  const calls = findToolCalls(src);
  const twoArg = findTwoArgCalls(src);
  totalCalls += calls.length;
  let fileBad = 0;

  for (const t of twoArg) {
    suspects.push({ file: rel, line: t.line, tool: t.name, kind: '2-arg-call', detail: 'server.tool(name, handler) — no inputSchema; tools/list will throw _zod' });
    fileBad++;
  }

  for (const call of calls) {
    if (call.schemaKind === 'non-literal') {
      // Could be a const reference like `register({server, foo})` — check by reading.
      // For now flag as warn (rare in this codebase).
      suspects.push({ file: rel, line: call.line, tool: call.name, kind: 'non-literal-schema', detail: 'schema is not an object literal — verify it builds a real zod shape' });
      fileBad++;
      continue;
    }
    const fields = classifyFields(call.schemaSrc);
    const bad = fields.filter(f => !f.zodLike);
    if (bad.length > 0) {
      for (const b of bad) {
        suspects.push({ file: rel, line: call.line, tool: call.name, kind: 'non-zod-value', field: b.key, value: b.valuePreview });
        fileBad++;
      }
    }
  }
  console.log(`${fileBad === 0 ? C.green + '✓' : C.red + '✗'}${C.reset} ${rel}  ${C.dim}${calls.length} tools, ${fileBad} suspect${C.reset}`);
}

console.log('');
if (suspects.length === 0) {
  console.log(`${C.green}clean${C.reset} — ${totalCalls} server.tool() calls scanned, all schema fields look zod-shaped`);
  console.log(`${C.dim}If tools/list still throws, the bug is not in static schema shape — try the runtime bisect.${C.reset}`);
} else {
  console.log(`${C.red}${suspects.length} suspect schema field(s) found:${C.reset}\n`);
  for (const s of suspects) {
    console.log(`  ${s.file}:${s.line}  tool="${s.tool}"`);
    if (s.field) console.log(`    field "${s.field}" = ${C.yellow}${s.value}${C.reset}`);
    else if (s.detail) console.log(`    ${C.yellow}${s.detail}${C.reset}`);
  }
}
process.exit(suspects.length > 0 ? 1 : 0);
