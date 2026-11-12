#!/usr/bin/env node
/**
 * RECOMMENDATIONS-E2E-01 R1: dry-run extraction of checklist tasks from the tracked next_steps docs.
 *
 * Reads tracked *.md files in next_steps/, sveltekit-frontend/next_steps/ and docs/next_steps/ (via git ls-files) and
 * extracts GitHub-style checkboxes. NO datastore is read or written; output goes only to
 * .tmp/atlas/next-steps-task-extract-v1/<stamp>/ (exclusive create, gitignored).
 *
 * Task key (proposal, not yet admitted anywhere): `<doc-slug>#<first 16 hex of sha256(docPath + "\n" + normalizedText)>`.
 *  - docPath is the repo-relative path with forward slashes; normalizedText = trimmed text with whitespace collapsed.
 *  - Identical text repeated inside one doc: the first keeps the plain hash, repeats hash with "\n#<occurrence>" appended.
 *  - Checkboxes inside fenced code blocks are examples/templates: counted and reported, NOT emitted as tasks.
 *  - A key collision (two different tasks -> same key) aborts the run.
 * `source_revision` is sha256 over the exact file bytes (never a git OID), as defined for sourceRevision.
 *
 * usage: node scripts/atlas/extract-next-steps-tasks-v1.mjs [--out-root=.tmp/atlas/next-steps-task-extract-v1]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS = ['next_steps', 'sveltekit-frontend/next_steps', 'docs/next_steps'];
const outRoot = path.resolve(ROOT, (process.argv.find((a) => a.startsWith('--out-root=')) ?? '--out-root=.tmp/atlas/next-steps-task-extract-v1').slice(11));
const allowedRoot = path.resolve(ROOT, '.tmp/atlas');
if (!outRoot.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('OUT_ROOT_MUST_BE_UNDER_.tmp/atlas');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const slug = (p) => p.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const CHECKBOX = /^[ \t]*[-*] \[([ xX])\][ \t]+(.*)$/;
const FENCE = /^[ \t]*(```|~~~)/;
const HEADING = /^#{1,6}\s+(.*)$/;

const files = execFileSync('git', ['ls-files', '-z', '--', ...DIRS], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0').filter((f) => f && /\.md$/i.test(f) && f !== 'next_steps/INDEX.md').sort();

const tasks = [];
const seenKeys = new Map();
let inFence = 0;
const perDoc = new Map();
for (const file of files) {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  const sourceRevision = `sha256:${sha256(bytes)}`;
  const lines = bytes.toString('utf8').split(/\r?\n/);
  const occurrences = new Map();
  let fenced = false;
  let heading = '';
  lines.forEach((line, index) => {
    if (FENCE.test(line)) { fenced = !fenced; return; }
    const checkbox = CHECKBOX.exec(line);
    if (fenced) { if (checkbox) inFence += 1; return; }
    const h = HEADING.exec(line);
    if (h) { heading = normalize(h[1]); return; }
    if (!checkbox) return;
    const text = normalize(checkbox[2]);
    if (!text) return;
    const n = (occurrences.get(text) ?? 0) + 1;
    occurrences.set(text, n);
    const hashInput = n === 1 ? `${file}\n${text}` : `${file}\n${text}\n#${n}`;
    const docSlug = slug(file);
    const key = `${docSlug}#${sha256(hashInput).slice(0, 16)}`;
    if (seenKeys.has(key)) throw new Error(`KEY_COLLISION:${key}: ${seenKeys.get(key)} vs ${file}:${index + 1}`);
    seenKeys.set(key, `${file}:${index + 1}`);
    tasks.push({
      taskKey: key, docSlug, featureId: `nextsteps:${docSlug}`, docPath: file, line: index + 1, heading: heading.slice(0, 120),
      status: checkbox[1] === ' ' ? 'open' : 'done', occurrence: n, text: text.slice(0, 400), sourceRevision,
    });
    perDoc.set(file, (perDoc.get(file) ?? 0) + 1);
  });
}

const open = tasks.filter((t) => t.status === 'open').length;
const done = tasks.length - open;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(outRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });
const rowsBody = tasks.map((t) => JSON.stringify(t)).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'tasks.jsonl'), rowsBody, { flag: 'wx' });
const byFolder = Object.fromEntries(DIRS.map((d) => [d, tasks.filter((t) => t.docPath.startsWith(`${d}/`)).length]));
const receipt = {
  schema: 'atlas.next-steps-task-extract.v1', generatedAt: new Date().toISOString(), mode: 'DRY_RUN',
  canonicalAuthority: false, writesPerformed: false, writes: { postgres: 0, valkey: 0, qdrant: 0, neo4j: 0 },
  docsScanned: files.length, docsWithTasks: perDoc.size, tasks: tasks.length, open, done,
  fencedCheckboxesExcluded: inFence, repeatedTextOccurrences: tasks.filter((t) => t.occurrence > 1).length,
  byFolder, maxKeyLength: Math.max(0, ...tasks.map((t) => t.taskKey.length)),
  keyUnique: seenKeys.size === tasks.length,
  tasksJsonl: { path: path.relative(ROOT, path.join(outDir, 'tasks.jsonl')).replaceAll('\\', '/'), sha256: `sha256:${sha256(rowsBody)}` },
  note: 'Proposal only. No task row is admitted; keys are not yet registered in kanban_tasks. Dependencies are not inferred (docs have none).',
};
fs.writeFileSync(path.join(outDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ outDir: path.relative(ROOT, outDir).replaceAll('\\', '/'), ...receipt, tasksJsonl: undefined, note: undefined }, null, 2));
