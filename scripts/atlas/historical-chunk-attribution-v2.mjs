#!/usr/bin/env node
// HISTORICAL_CHUNK_01 V2 attribution (read-only). Side-by-side with V1; does not modify V1 receipts.
// 1) Whole-file containment first: a moved chunk can sit outside its stored line window.
// 2) Only rows still unresolved are searched in Git history, up to HISTORY_CAP_V2 commits per file.
// 3) Records each file's search boundary and whether history was truncated (cap reached).
// Writes .tmp/atlas/historical-chunk-attribution-v2.json. No database, source or git writes.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HISTORY_CAP_V2 = Number(process.env.HISTORY_CAP_V2 || 50);
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const SQL = 'COPY (SELECT id, relative_path, line_start, line_end, content_hash, content FROM codebase_chunk_index WHERE content IS NOT NULL AND relative_path IS NOT NULL AND line_start IS NOT NULL ORDER BY id LIMIT 2000) TO STDOUT WITH (FORMAT csv, HEADER true)';

function parseCsv(text) {
  const out = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  const [head, ...body] = out;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const rows = parseCsv(execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-c', SQL], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }));

const currentFile = new Map();
const historyCache = new Map(); // rel -> { commits: string[], texts: [commit, text][], truncated: boolean }
const outcome = { CURRENT_CONTAINED_IN_STORED_WINDOW: 0, CURRENT_CONTAINED_ELSEWHERE_IN_FILE: 0, ATTRIBUTED_TO_HISTORY: 0, UNATTRIBUTED_IN_INSPECTED_HISTORY: 0, SOURCE_MISSING: 0 };
const attributed = {};
const boundaries = {};
const samples = [];

function loadHistory(rel) {
  if (historyCache.has(rel)) return historyCache.get(rel);
  const commits = git(['log', `-n${HISTORY_CAP_V2}`, '--format=%H', '--', rel]).split('\n').filter(Boolean);
  const texts = [];
  for (const commit of commits) {
    try { texts.push([commit, git(['show', `${commit}:${rel}`]).replace(/\r\n/g, '\n')]); } catch { /* file absent at commit */ }
  }
  const entry = { commits, texts, truncated: commits.length === HISTORY_CAP_V2 };
  historyCache.set(rel, entry);
  boundaries[rel] = { commitsInspected: commits.length, commitCap: HISTORY_CAP_V2, historyTruncated: entry.truncated };
  return entry;
}

for (const r of rows) {
  const rel = r.relative_path.split(path.sep).join('/');
  const abs = path.join(ROOT, r.relative_path);
  if (!fs.existsSync(abs)) { outcome.SOURCE_MISSING += 1; continue; }
  if (!currentFile.has(rel)) currentFile.set(rel, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
  const fileText = currentFile.get(rel);
  const needle = r.content.replace(/\r\n/g, '\n').trim();
  if (!needle) { outcome.UNATTRIBUTED_IN_INSPECTED_HISTORY += 1; continue; }

  const lines = fileText.split('\n');
  const windowText = lines.slice(Math.max(0, Number(r.line_start) - 1), Number(r.line_end)).join('\n');
  if (windowText.includes(needle)) { outcome.CURRENT_CONTAINED_IN_STORED_WINDOW += 1; continue; }
  if (fileText.includes(needle)) { outcome.CURRENT_CONTAINED_ELSEWHERE_IN_FILE += 1; continue; }

  const history = loadHistory(rel);
  const hit = history.texts.find(([, text]) => text.includes(needle));
  if (hit) {
    outcome.ATTRIBUTED_TO_HISTORY += 1;
    attributed[hit[0]] = (attributed[hit[0]] || 0) + 1;
    if (samples.length < 25) samples.push({ id: r.id, relative_path: rel, matchedCommit: hit[0], storedBodySha256: sha(needle) });
  } else {
    outcome.UNATTRIBUTED_IN_INSPECTED_HISTORY += 1;
  }
}

const receipt = {
  schema: 'atlas.historical-chunk-attribution.v2',
  gate: 'HISTORICAL_CHUNK_01',
  companionV1: '.tmp/atlas/historical-chunk-attribution-v1.json',
  readOnly: true, writesPerformed: false, canonicalAuthority: false,
  generatedAt: new Date().toISOString(),
  rowsInspected: rows.length,
  historyCapPerFile: HISTORY_CAP_V2,
  outcome,
  attributedCommits: attributed,
  fileSearchBoundaries: boundaries,
  filesHistoryTruncated: Object.values(boundaries).filter((b) => b.historyTruncated).length,
  method: 'whole current file containment, then stored window, then exact body in git show <commit>:<file> for the last N commits',
  caveat: 'UNATTRIBUTED_IN_INSPECTED_HISTORY means not found in the inspected commits of that file. Where historyTruncated is true, older revisions were never inspected.',
  samples,
};
fs.mkdirSync(path.join(ROOT, '.tmp', 'atlas'), { recursive: true });
const outPath = path.join(ROOT, '.tmp', 'atlas', 'historical-chunk-attribution-v2.json');
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'w' });
console.log(JSON.stringify({ rowsInspected: rows.length, outcome, filesHistoryTruncated: receipt.filesHistoryTruncated, distinctAttributedCommits: Object.keys(attributed).length }, null, 2));
