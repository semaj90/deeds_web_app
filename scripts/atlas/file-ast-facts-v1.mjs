#!/usr/bin/env node
// Per-file AST facts for the directory remediation rank (read-only, CPU, deterministic, no network, no datastore writes).
// TS: ast-grep (request.json() calls, URL literals inside string nodes, TODO-like comments). Svelte: svelte/compiler modern AST
// (Svelte-4 constructs). Facts are evidence for a PROPOSAL ranking only; nothing here is identity or authority.
// Usage: node scripts/atlas/file-ast-facts-v1.mjs [--out=.tmp/atlas/file_ast_facts.jsonl]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=.tmp/atlas/file_ast_facts.jsonl').slice(6);
const SCHEMA = 'atlas.file-ast-facts.v1';
const { parse } = createRequire(path.join(FRONTEND, 'package.json'))('svelte/compiler');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full, acc); } else acc.push(full);
  }
  return acc;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const files = walk(path.join(FRONTEND, 'src'))
  .filter((f) => /\.(ts|svelte)$/.test(f) && !f.endsWith('.d.ts'))
  .map(rel).sort();

function astGrep(args) {
  const cmd = ['ast-grep', ...args].join(' ');
  const r = spawnSync(cmd, { cwd: FRONTEND, shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`ast-grep failed (${r.status}): ${String(r.stderr).slice(0, 300)}`);
  const counts = new Map();
  for (const line of String(r.stdout).split('\n')) {
    if (!line.trim()) continue;
    const f = ('sveltekit-frontend/' + JSON.parse(line).file.replace(/\\/g, '/'));
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return counts;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astfacts-'));
const rule = (id, body) => { const p = path.join(tmp, `${id}.yml`); fs.writeFileSync(p, body, 'utf8'); return p.split(path.sep).join('/'); };
const urlRule = rule('url', "id: url\nlanguage: TypeScript\nrule:\n  any:\n    - kind: string\n    - kind: template_string\n  regex: 'localhost|127\\.0\\.0\\.1'\n");
const todoRule = rule('todo', "id: todo\nlanguage: TypeScript\nrule:\n  kind: comment\n  regex: '\\b(TODO|FIXME|HACK|XXX)\\b'\n");
const requestJson = astGrep(['run', '--pattern', 'request.json()', '--lang', 'ts', '--json=stream', 'src']);
const urlLits = astGrep(['scan', '--rule', `"${urlRule}"`, '--json=stream', 'src']);
const todoCmts = astGrep(['scan', '--rule', `"${todoRule}"`, '--json=stream', 'src']);

const schemaText = /\.(safeParse|parse|parseAsync|safeParseAsync)\s*\(|superValidate|zod/i;
function svelteFacts(source) {
  const f = { svelte4_export_let: 0, svelte4_on_directive: 0, svelte4_reactive_label: 0, svelte4_slot: 0, parse_error: false };
  let ast;
  try { ast = parse(source, { modern: true }); } catch { f.parse_error = true; return f; }
  for (const stmt of ast.instance?.content?.body ?? []) {
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration' && stmt.declaration.kind === 'let') f.svelte4_export_let += stmt.declaration.declarations.length;
    if (stmt.type === 'LabeledStatement' && stmt.label?.name === '$') f.svelte4_reactive_label += 1;
  }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === 'OnDirective') f.svelte4_on_directive += 1;
    if (node.type === 'SlotElement' || (node.type === 'RegularElement' && node.name === 'slot')) f.svelte4_slot += 1;
    for (const k of Object.keys(node)) if (k !== 'parent') visit(node[k]);
  };
  visit(ast.fragment);
  return f;
}

const rows = files.map((f) => {
  const bytes = fs.readFileSync(path.join(ROOT, f));
  const text = bytes.toString('utf8');
  const row = {
    schema: SCHEMA, source_ref: f, source_digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'),
    extension: path.extname(f), is_test: /\.(spec|test)\.ts$/.test(f), is_route_server: f.endsWith('/+server.ts'),
    request_json_calls: requestJson.get(f) ?? 0, schema_text_present: schemaText.test(text),
    url_literals: urlLits.get(f) ?? 0, todo_comments: todoCmts.get(f) ?? 0,
    svelte4_export_let: 0, svelte4_on_directive: 0, svelte4_reactive_label: 0, svelte4_slot: 0, parse_error: false,
  };
  if (f.endsWith('.svelte')) Object.assign(row, svelteFacts(text));
  row.unvalidated_request_json = row.is_route_server && row.request_json_calls > 0 && !row.schema_text_present;
  return row;
});

fs.mkdirSync(path.dirname(path.resolve(ROOT, out)), { recursive: true });
fs.writeFileSync(path.resolve(ROOT, out), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
const sum = (k) => rows.reduce((a, r) => a + (typeof r[k] === 'boolean' ? Number(r[k]) : r[k]), 0);
console.log(JSON.stringify({
  schema: SCHEMA, files: rows.length, out, canonicalAuthority: false, writesPerformed: false,
  totals: { unvalidated_request_json: sum('unvalidated_request_json'), url_literals_non_test: rows.filter((r) => !r.is_test).reduce((a, r) => a + r.url_literals, 0),
            todo_comments: sum('todo_comments'), svelte4_export_let: sum('svelte4_export_let'), svelte4_on_directive: sum('svelte4_on_directive'),
            svelte4_reactive_label: sum('svelte4_reactive_label'), svelte4_slot: sum('svelte4_slot'), parse_errors: sum('parse_error') },
}));
