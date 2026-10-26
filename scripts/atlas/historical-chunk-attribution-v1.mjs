#!/usr/bin/env node
// HISTORICAL_CHUNK_01 attribution (read-only): for chunks whose body is NOT in the current file,
// search the file's last N commits for the body. Writes .tmp/atlas/historical-chunk-attribution-v1.json.
// No database writes, no source writes, no git writes.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMIT_CAP = 5;
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
const commitsFor = new Map();
const attributed = {};
const outcome = { CURRENT_CONTAINED: 0, ATTRIBUTED_TO_HISTORY: 0, UNATTRIBUTED_IN_COMMIT_WINDOW: 0, SOURCE_MISSING: 0 };
const samples = [];

for (const r of rows) {
  const rel = r.relative_path.split(path.sep).join('/');
  const abs = path.join(ROOT, r.relative_path);
  if (!fs.existsSync(abs)) { outcome.SOURCE_MISSING += 1; continue; }
  if (!currentFile.has(rel)) currentFile.set(rel, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n'));
  const lines = currentFile.get(rel);
  const needle = r.content.replace(/\r\n/g, '\n').trim();
  const window = lines.slice(Math.max(0, Number(r.line_start) - 1), Number(r.line_end)).join('\n');
  if (needle && window.includes(needle)) { outcome.CURRENT_CONTAINED += 1; continue; }
  if (!commitsFor.has(rel)) {
    const commits = git(['log', `-n${COMMIT_CAP}`, '--format=%H', '--', rel]).split('\n').filter(Boolean);
    const texts = commits.map((commit) => {
      try { return [commit, git(['show', `${commit}:${rel}`]).replace(/\r\n/g, '\n')]; } catch { return null; }
    });
    commitsFor.set(rel, texts.filter(Boolean));
  }
  let hit = null;
  for (const [commit, text] of commitsFor.get(rel)) {
    if (needle && text.includes(needle)) { hit = commit; break; }
  }
  if (hit) {
    outcome.ATTRIBUTED_TO_HISTORY += 1;
    attributed[hit] = (attributed[hit] || 0) + 1;
    if (samples.length < 25) samples.push({ id: r.id, relative_path: rel, matchedCommit: hit, storedBodySha256: sha(needle) });
  } else outcome.UNATTRIBUTED_IN_COMMIT_WINDOW += 1;
}

const receipt = {
  schema: 'atlas.historical-chunk-attribution.v1',
  gate: 'HISTORICAL_CHUNK_01',
  readOnly: true, writesPerformed: false, canonicalAuthority: false,
  generatedAt: new Date().toISOString(),
  rowsInspected: rows.length,
  commitCapPerFile: COMMIT_CAP,
  outcome,
  attributedCommits: attributed,
  method: 'stored body contained in `git show <commit>:<file>` for the last N commits touching the file',
  caveat: 'Bounded to the last N commits; UNATTRIBUTED means not found in that window, not that the chunk is current.',
  samples,
};
fs.mkdirSync(path.join(ROOT, '.tmp', 'atlas'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.tmp', 'atlas', 'historical-chunk-attribution-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ rowsInspected: rows.length, outcome, distinctAttributedCommits: Object.keys(attributed).length }, null, 2));
