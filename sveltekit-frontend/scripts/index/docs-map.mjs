#!/usr/bin/env node
import { listFiles, readRel, stableHash, writeJson, writeJsonl } from './shared.mjs';
const docs = listFiles({ extensions: ['.md'], roots: ['docs', 'memory'] });
const rows = [];
for (const file of docs) {
  const text = readRel(file);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!heading) continue;
    const title = heading[2].replace(/[`*_#]/g, '').trim();
    const body = lines.slice(i + 1, i + 9).filter((line) => line.trim() && !line.startsWith('#')).join(' ').slice(0, 500);
    const refs = [...body.matchAll(/(?:src|scripts|tests|docs|memory)\/[A-Za-z0-9_.\/+[\]-]+/g)].map((m) => m[0]).slice(0, 10);
    rows.push({ file, kind: 'doc_heading', language: 'markdown', line: i + 1, level: heading[1].length, refs, stable_id: stableHash(file + ':' + (i + 1) + ':' + title), summary: body, title });
  }
}
const out = writeJsonl('docs-map.jsonl', rows);
writeJson('docs-summary.json', { artifact: out, count: rows.length, generated_by: 'scripts/index/docs-map.mjs', lane: 'markdown-headings' });
console.log(JSON.stringify({ ok: true, lane: 'markdown-headings', count: rows.length, artifact: out }, null, 2));
