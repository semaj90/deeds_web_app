#!/usr/bin/env node
/**
 * NS-8D (read-only): SUGGEST declared ids for OPEN tasks that have none. It never edits a tasks.md file.
 * Output: docs/reports/task-id-suggestions-v1.json (per-task suggestions) and docs/reports/task-id-suggestions-v1.patch
 * (a zero-context unified diff the operator may review and apply with `git apply --unidiff-zero`; dry-run with `--check`).
 *
 * Id shape: <CHANGE-INITIALS>-<NNN> (e.g. parent-atlas-neural-prefill-encoder -> NPE-001), numbered in file order.
 * A suggestion is skipped (recorded, not guessed) when the source line no longer matches the ledger text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { WFU_ID } from './lib/wfu-metadata.mjs';

const root = process.cwd();
const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const ledger = JSON.parse(fs.readFileSync(path.join(reportsDir, 'openspec-workboard-v1.json'), 'utf8'));
const tasks = ledger.taskInventory;

// Prefix per change: initials of the words after "parent-atlas-", extended until unique across all changes.
const changes = [...new Set(tasks.map((t) => t.change))].sort();
const prefixOf = new Map();
const used = new Set();
for (const change of changes) {
  const words = change.replace(/^parent-atlas-/, '').split('-').filter(Boolean);
  let prefix = words.map((w) => w[0]).join('').toUpperCase() || 'TASK';
  const last = (words.at(-1) ?? 'x').toUpperCase();
  let extra = 1;
  while (used.has(prefix)) prefix = words.map((w) => w[0]).join('').toUpperCase() + last.slice(1, 1 + extra++);
  used.add(prefix);
  prefixOf.set(change, prefix);
}
const existingIds = new Set(tasks.map((t) => t.ledgerId).filter(Boolean));

const fileLines = new Map();
const loadLines = (rel) => {
  if (!fileLines.has(rel)) {
    try { fileLines.set(rel, fs.readFileSync(path.join(root, rel), 'utf8').split('\n')); } catch { fileLines.set(rel, null); }
  }
  return fileLines.get(rel);
};

const suggestions = [];
const skipped = { drift: 0, sourceMissing: 0 };
const counters = new Map();
const candidates = tasks
  .filter((t) => t.state === 'OPEN' && t.taskIdentity?.basis === 'MIGRATION_TITLE_HASH')
  .sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line);
for (const t of candidates) {
  const lines = loadLines(t.source);
  if (!lines) { skipped.sourceMissing++; continue; }
  const original = lines[t.line - 1];
  const m = original && /^(\s*-\s*\[[ xX]\]\s+)(.*)$/.exec(original.replace(/\r$/, ''));
  if (!m || !m[2].replace(/<!--.*?-->/g, '').trim().startsWith(t.text.slice(0, 30).trim().replace(/^\*\*/, '').slice(0, 20)) && !m[2].includes(t.text.slice(0, 20))) { skipped.drift++; continue; }
  let n = counters.get(t.change) ?? 0;
  let id;
  do { n++; id = `${prefixOf.get(t.change)}-${String(n).padStart(3, '0')}`; } while (existingIds.has(id));
  counters.set(t.change, n);
  existingIds.add(id);
  const cr = original.endsWith('\r') ? '\r' : '';
  const replacement = `${m[1]}**${id}** ${m[2]}${cr}`;
  suggestions.push({ change: t.change, source: t.source, line: t.line, suggestedId: id, sectionSlug: t.sectionSlug ?? null, before: original.replace(/\r$/, '').slice(0, 110), after: replacement.replace(/\r$/, '').slice(0, 130), _original: original, _replacement: replacement });
}

// Zero-context unified diff, grouped per file in ascending line order.
const bySource = new Map();
for (const s of suggestions) (bySource.get(s.source) ?? bySource.set(s.source, []).get(s.source)).push(s);
let patch = '';
for (const [source, list] of [...bySource.entries()].sort()) {
  patch += `diff --git a/${source} b/${source}\n--- a/${source}\n+++ b/${source}\n`;
  for (const s of list.sort((a, b) => a.line - b.line)) patch += `@@ -${s.line},1 +${s.line},1 @@\n-${s._original}\n+${s._replacement}\n`;
}

const report = {
  schema: 'atlas.task-id-suggestions.v1',
  advisoryOnly: true,
  writesPerformed: false,
  tasksFilesEdited: 0,
  candidates: candidates.length,
  suggested: suggestions.length,
  skipped,
  filesAffected: bySource.size,
  prefixes: Object.fromEntries(prefixOf),
  apply: 'Review docs/reports/task-id-suggestions-v1.patch, dry-run: git apply --check --unidiff-zero <patch>; apply only with operator approval.',
  suggestions: suggestions.map(({ _original, _replacement, ...rest }) => rest)
};
const write = (file, body) => {
  for (let attempt = 1; ; attempt++) {
    try { fs.writeFileSync(file, body); return; } catch (e) { if (attempt >= 6) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000); }
  }
};
write(path.join(reportsDir, 'task-id-suggestions-v1.json'), JSON.stringify(report, null, 1) + '\n');
write(path.join(reportsDir, 'task-id-suggestions-v1.patch'), patch);
console.log(JSON.stringify({ candidates: report.candidates, suggested: report.suggested, skipped, filesAffected: report.filesAffected, patchBytes: patch.length }, null, 2));
void WFU_ID;
