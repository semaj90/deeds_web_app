#!/usr/bin/env node
// HISTORICAL_CHUNK_01 (read-only): check whether stored chunk bodies appear in the current source file.
// Stored chunks carry no byte span, so the test is containment within the stored line window.
// Writes .tmp/atlas/historical-chunk-receipt-v1.json. No database or source writes.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const SQL = 'COPY (SELECT id, relative_path, line_start, line_end, content_hash, content FROM codebase_chunk_index WHERE content IS NOT NULL AND relative_path IS NOT NULL AND line_start IS NOT NULL ORDER BY id LIMIT 2000) TO STDOUT WITH (FORMAT csv, HEADER true)';

function parseCsv(text) {
  const out = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  const [head, ...body] = out;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const csv = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-c', SQL], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const rows = parseCsv(csv);
const fileCache = new Map();
const results = { CONTAINED_IN_CURRENT_WINDOW: 0, NOT_CONTAINED: 0, SOURCE_MISSING: 0 };
const notContained = [];

for (const r of rows) {
  const abs = path.join(ROOT, r.relative_path);
  if (!fs.existsSync(abs)) { results.SOURCE_MISSING += 1; continue; }
  if (!fileCache.has(abs)) fileCache.set(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n'));
  const lines = fileCache.get(abs);
  const start = Math.max(0, Number(r.line_start) - 1);
  const windowText = lines.slice(start, Number(r.line_end)).join('\n');
  const needle = r.content.replace(/\r\n/g, '\n').trim();
  if (needle.length > 0 && windowText.includes(needle)) results.CONTAINED_IN_CURRENT_WINDOW += 1;
  else {
    results.NOT_CONTAINED += 1;
    if (notContained.length < 50) notContained.push({ id: r.id, relative_path: r.relative_path, lines: [Number(r.line_start), Number(r.line_end)], storedHashPrefix: (r.content_hash || '').slice(0, 12), storedBodySha256: sha(needle) });
  }
}

const receipt = {
  schema: 'atlas.historical-chunk-receipt.v1',
  gate: 'HISTORICAL_CHUNK_01',
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  generatedAt: new Date().toISOString(),
  rowsInspected: rows.length,
  results,
  method: 'containment of the stored body within the stored line window of the current file',
  digestScope: 'UNKNOWN (stored content_hash scope not declared; not verified here)',
  methodStatus: 'UNVALIDATED for historical attribution: containment does not identify the revision a body came from. Use per-file git history for that.',
  notContainedSample: notContained,
};
fs.mkdirSync(path.join(ROOT, '.tmp', 'atlas'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.tmp', 'atlas', 'historical-chunk-receipt-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ rowsInspected: rows.length, results }, null, 2));
