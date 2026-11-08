#!/usr/bin/env node
// READ-ONLY crosswalk: low-rank cohort ordinals -> the OpenSpec workboard's canonical task identity.
//
// The 6,527-record cohort identifies a task as `<tasks.md path>#L<line>`. A line number is NOT a stable identity: it moves
// when a tasks.md is edited. The Kanban importer (populate-kanban-from-openspec-workboard-v1.mjs) uses the workboard's
// content-hashed `stableKey` (`<change>#<16 hex>`) as task_id. This tool maps each cohort ordinal to that stableKey where it
// can be proven, and labels every other row instead of guessing. It never mints an id, never uses the ordinal or a Morton code
// as an identity, and never writes to a database. The ordinal is cohort-local (an index into one frozen rows file).
//
// Statuses (one per ordinal):
//   MATCHED_EXACT            workboard has this path+line AND the current file line still has the same task text
//   RESOLVED_BY_TEXT         line drifted, but exactly one workboard task in that file has this task's text
//   LINE_DRIFT_UNRESOLVED    in the workboard but text changed and no unique text match: needs review
//   AMBIGUOUS_TEXT           more than one workboard task in that file has the text: needs review
//   FILE_NOT_IN_WORKBOARD    the workboard does not cover that tasks.md at all (e.g. sveltekit-frontend/openspec/**)
//   NEW_SINCE_WORKBOARD      file is covered but this line/text is absent: workboard predates the task or the edit
//   SOURCE_FILE_MISSING      tasks.md no longer exists
//   SOURCE_LINE_NOT_A_TASK   the current line at that number is not a checkbox task
//   NON_LINE_IDENTITY        the cohort id is not `<path>#L<n>`
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKBOX = /^\s*[-*]\s*\[[ xX]\]\s*/;
const norm = (s) => String(s).replace(CHECKBOX, '').replace(/\s+/g, ' ').trim();
const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Pure core. `readLines(file)` returns the current lines of a tasks.md, or null if unreadable. */
export function buildCrosswalk({ cohortRows, workboard, readLines }) {
  const inventory = workboard.taskInventory;
  const byPathLine = new Map(inventory.map((t) => [`${t.source}#L${t.line}`, t]));
  const byFileText = new Map();
  for (const t of inventory) {
    const key = `${t.source}\u0000${norm(t.text)}`;
    if (!byFileText.has(key)) byFileText.set(key, []);
    byFileText.get(key).push(t);
  }
  const coveredFiles = new Set(Object.keys(workboard.sourceFileHashes ?? {}));
  const counts = {};
  const states = {};
  const out = cohortRows.map((row, ordinal) => {
    const taskId = row.task_id;
    const base = { ordinal, taskId, stableKey: null, workboardState: null, status: null };
    const m = /^(.*)#L(\d+)$/.exec(String(taskId));
    if (!m) return { ...base, status: 'NON_LINE_IDENTITY' };
    const [, source, lineStr] = m;
    const line = Number(lineStr);
    const lines = readLines(source);
    if (!lines) return { ...base, source, line, status: 'SOURCE_FILE_MISSING' };
    const current = lines[line - 1];
    if (current === undefined || !CHECKBOX.test(current)) return { ...base, source, line, status: 'SOURCE_LINE_NOT_A_TASK' };
    if (!coveredFiles.has(source)) return { ...base, source, line, status: 'FILE_NOT_IN_WORKBOARD' };

    const direct = byPathLine.get(taskId);
    if (direct && norm(direct.text) === norm(current)) {
      return { ...base, source, line, stableKey: direct.stableKey, workboardState: direct.state, status: 'MATCHED_EXACT' };
    }
    const sameText = byFileText.get(`${source}\u0000${norm(current)}`) ?? [];
    if (sameText.length === 1) return { ...base, source, line, stableKey: sameText[0].stableKey, workboardState: sameText[0].state, status: 'RESOLVED_BY_TEXT' };
    if (sameText.length > 1) return { ...base, source, line, status: 'AMBIGUOUS_TEXT', candidates: sameText.map((t) => t.stableKey) };
    return { ...base, source, line, status: direct ? 'LINE_DRIFT_UNRESOLVED' : 'NEW_SINCE_WORKBOARD' };
  });
  for (const r of out) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.workboardState) states[r.workboardState] = (states[r.workboardState] ?? 0) + 1;
  }
  const keys = out.filter((r) => r.stableKey).map((r) => r.stableKey);
  const duplicateStableKeys = keys.length - new Set(keys).size;
  const resolved = (counts.MATCHED_EXACT ?? 0) + (counts.RESOLVED_BY_TEXT ?? 0);
  return {
    rows: out,
    summary: {
      cohortRows: cohortRows.length, uniqueTaskIds: new Set(cohortRows.map((r) => r.task_id)).size,
      resolvedToStableKey: resolved, unresolved: cohortRows.length - resolved, duplicateStableKeys,
      statusCounts: counts, workboardStatesOfResolved: states,
    },
  };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const root = path.resolve(argOf('--root') ?? path.join(here, '..', '..'));
  const rowsPath = argOf('--rows');
  const workboardPath = path.resolve(argOf('--workboard') ?? path.join(root, 'docs', 'reports', 'openspec-workboard-v1.json'));
  if (!rowsPath) { console.error('usage: --rows <cohort rows.jsonl> [--workboard <file>] [--root <repo>] [--out-dir <dir>]'); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const outDir = path.resolve(argOf('--out-dir') ?? path.join(root, '.tmp', 'atlas', `task-cohort-crosswalk-${stamp}`));

  const rowsRaw = fs.readFileSync(path.resolve(rowsPath));
  const cohortRows = rowsRaw.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const wbRaw = fs.readFileSync(workboardPath);
  const workboard = JSON.parse(wbRaw.toString('utf8'));
  const cache = new Map();
  const readLines = (rel) => {
    if (!cache.has(rel)) { try { cache.set(rel, fs.readFileSync(path.resolve(root, rel), 'utf8').split(/\r?\n/)); } catch { cache.set(rel, null); } }
    return cache.get(rel);
  };
  const { rows, summary } = buildCrosswalk({ cohortRows, workboard, readLines });

  // How many covered files changed since the workboard hashed them (explains line drift).
  let changedSinceWorkboard = 0, hashed = 0;
  for (const [file, expected] of Object.entries(workboard.sourceFileHashes ?? {})) {
    try { hashed++; if (`sha256:${sha256Hex(fs.readFileSync(path.resolve(root, file)))}` !== expected) changedSinceWorkboard++; } catch { changedSinceWorkboard++; }
  }
  const receipt = {
    schema: 'atlas.task-cohort-crosswalk-receipt.v1', generatedAt: new Date().toISOString(),
    cohortRowsSha256: `sha256:${sha256Hex(rowsRaw)}`, workboardSha256: `sha256:${sha256Hex(wbRaw)}`, workboardGeneratedAt: workboard.generatedAt,
    workboardTaskCount: workboard.taskInventory.length, workboardFilesHashed: hashed, workboardFilesChangedSinceHashing: changedSinceWorkboard,
    ...summary,
    note: 'Ordinals are cohort-local. stableKey (<change>#<hash>) is the canonical task identity. Occupancy bits, routing scores and Morton codes are not task state.',
    canonicalAuthority: false, writesPerformed: false, localArtifactsWritten: true,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'crosswalk.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, 'crosswalk-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(`crosswalk: ${summary.resolvedToStableKey}/${summary.cohortRows} resolved to a stableKey -> ${outDir}`);
  console.log(JSON.stringify(summary.statusCounts));
  process.exit(summary.unresolved === 0 && summary.duplicateStableKeys === 0 ? 0 : 2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
