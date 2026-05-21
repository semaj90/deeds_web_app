#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR, stableHash, writeJson, writeJsonl } from './shared.mjs';
function readJsonl(file) {
  const full = path.join(OUT_DIR, file);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
const lexical = readJsonl('lexical-hits.jsonl');
const symbols = readJsonl('symbols.jsonl');
const docs = readJsonl('docs-map.jsonl');
const byFile = new Map();
function inferLanguage(file) { if (file.endsWith('.svelte')) return 'svelte'; if (file.endsWith('.ts')) return 'typescript'; if (file.endsWith('.js') || file.endsWith('.mjs')) return 'javascript'; if (file.endsWith('.md')) return 'markdown'; return path.extname(file).slice(1) || 'unknown'; }
function inferKind(file) { if (file.includes('/routes/') && file.endsWith('+server.ts')) return 'route'; if (file.includes('/routes/') && file.endsWith('+page.svelte')) return 'page'; if (file.includes('/src/mcp/') || file.includes('/scripts/mcp/')) return 'mcp'; if (file.includes('/db/') || file.includes('schema')) return 'db'; if (file.includes('/tests/') || file.includes('.test.') || file.includes('.spec.')) return 'test'; if (file.includes('/docs/') || file.includes('/memory/')) return 'doc'; if (file.includes('/scripts/')) return 'script'; return 'module'; }
function inferFeature(file) { const clean = file.replace(/\\/g, '/'); if (/mcp|engram|turbovec|langextract|trace/i.test(clean)) return 'mcp-tools'; if (/cache|bifrost|redis/i.test(clean)) return 'cache-memory'; if (/qdrant|vector|embedding|semantic/i.test(clean)) return 'semantic-retrieval'; if (/route|routes|api/i.test(clean)) return 'api-routes'; if (/drizzle|schema|postgres|db/i.test(clean)) return 'database'; if (/test|spec|smoke/i.test(clean)) return 'validation'; return clean.split('/').slice(0, 3).join('/'); }
function item(file) {
  if (!byFile.has(file)) byFile.set(file, { docs_refs: new Set(), feature: inferFeature(file), file, graph_edges: [], kind: inferKind(file), language: inferLanguage(file), mocks_or_stubs: new Set(), symbols_called: new Set(), symbols_defined: new Set() });
  return byFile.get(file);
}
for (const row of symbols) {
  const target = item(row.file);
  if (['exported_function', 'exported_const', 'sveltekit_route_handler', 'drizzle_table', 'mcp_tool'].includes(row.kind)) target.symbols_defined.add(row.symbol);
  if (['cache_call', 'vector_call'].includes(row.kind)) target.symbols_called.add(row.symbol);
  if (row.kind === 'mock_or_stub') target.mocks_or_stubs.add(row.symbol + '@' + row.line);
}
for (const row of lexical) {
  const target = item(row.file);
  if (/mock|stub|TODO|FIXME|501|503|not implemented/i.test(row.text)) target.mocks_or_stubs.add(row.text.slice(0, 80) + '@' + row.line);
  if (/qdrant|redis|neo4j|couchdb|bifrost|engram|langextract|turbovec|mcp/i.test(row.text)) target.symbols_called.add(row.pattern);
}
for (const doc of docs) {
  for (const ref of doc.refs || []) {
    const target = item(ref);
    target.docs_refs.add(doc.file + '#' + doc.title);
    target.graph_edges.push(['docs', 'describes', ref]);
  }
}
const rows = [...byFile.values()].map((row) => ({
  ...row,
  docs_refs: [...row.docs_refs].sort().slice(0, 12),
  graph_edges: row.graph_edges.slice(0, 20),
  mocks_or_stubs: [...row.mocks_or_stubs].sort().slice(0, 20),
  stable_id: stableHash(row.file + ':' + row.feature + ':' + row.kind),
  symbols_called: [...row.symbols_called].sort().slice(0, 30),
  symbols_defined: [...row.symbols_defined].sort().slice(0, 30)
})).sort((a, b) => a.file.localeCompare(b.file));
const out = writeJsonl('feature-map.jsonl', rows);
const digest = stableHash(rows.map((row) => JSON.stringify(row)).join('\n'));
writeJson('feature-summary.json', { artifact: out, count: rows.length, digest, generated_by: 'scripts/index/feature-map.mjs', lane: 'feature-join' });
console.log(JSON.stringify({ ok: true, lane: 'feature-join', count: rows.length, digest, artifact: out }, null, 2));
