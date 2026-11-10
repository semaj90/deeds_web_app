#!/usr/bin/env node
/**
 * Build a review-only crosswalk from explicit next_steps document references
 * in current OpenSpec workboard task blocks. No identity inference or writes to
 * Kanban are performed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotArg = process.argv.find((arg) => arg.startsWith('--workboard='));
const snapshotPath = resolve(ROOT, snapshotArg?.slice('--workboard='.length) ?? '.tmp/atlas/openspec-workboard-nextsteps-alignment-v1.json');
const reportArg = process.argv.find((arg) => arg.startsWith('--report-out='));
const reportPath = resolve(ROOT, reportArg?.slice('--report-out='.length) ?? 'docs/reports/nextsteps-openspec-document-crosswalk-v1.json');
const indexPath = resolve(ROOT, 'next_steps/INDEX.md');
const noIndexWrite = process.argv.includes('--no-index-write');
const START = '<!-- openspec-document-crosswalk:start -->';
const END = '<!-- openspec-document-crosswalk:end -->';
const docRef = /(?:next_steps|sveltekit-frontend\/next_steps|docs\/next_steps)\/[A-Za-z0-9._/-]+\.md/gi;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };

if (!existsSync(snapshotPath)) fail(`WORKBOARD_SNAPSHOT_MISSING: ${snapshotPath}`);
const snapshotBytes = readFileSync(snapshotPath);
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
if (snapshot.schema !== 'atlas.openspec.workboard-task-snapshot.v1' || !Array.isArray(snapshot.tasks)) {
  fail('INVALID_WORKBOARD_SNAPSHOT');
}

const tracked = new Set(spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0'));
const sourceCache = new Map();
const candidates = new Map();
let currentSourceBlocks = 0;
let staleSourceBlocks = 0;
let badSourceRefs = 0;
for (const task of snapshot.tasks) {
  const source = task.source?.replaceAll('\\', '/');
  if (!source || !Number.isInteger(task.line) || !task.blockHash || !task.stableKey) { badSourceRefs++; continue; }
  if (!sourceCache.has(source)) {
    const filePath = resolve(ROOT, source);
    if (!existsSync(filePath)) { sourceCache.set(source, null); continue; }
    const bytes = readFileSync(filePath);
    sourceCache.set(source, { lines: bytes.toString('utf8').split(/\r?\n/), fileSha256: sha(bytes) });
  }
  const file = sourceCache.get(source);
  if (!file) { staleSourceBlocks++; continue; }
  const index = task.line - 1;
  const block = taskBlock(file.lines, index);
  if (!/^\s*[-*] \[[ xX~]\]\s+/.test(file.lines[index] ?? '') || blockHash(block) !== task.blockHash) {
    staleSourceBlocks++;
    continue;
  }
  currentSourceBlocks++;
  for (const match of block.join('\n').matchAll(docRef)) {
    const referencedPath = match[0].replaceAll('\\', '/');
    const targetPath = resolve(ROOT, referencedPath);
    if (!existsSync(targetPath) || !tracked.has(referencedPath)) continue;
    const targetBytes = readFileSync(targetPath);
    const key = `${task.stableKey}\0${referencedPath}`;
    candidates.set(key, {
      workboardTaskKey: task.taskKey,
      stableKey: task.stableKey,
      logicalTaskKey: task.taskIdentity?.logicalTaskKey ?? null,
      change: task.change,
      taskSource: source,
      taskLine: task.line,
      taskBlockSha256: task.blockHash,
      taskSourceFileSha256: file.fileSha256,
      referencedDocument: referencedPath,
      referencedDocumentSha256: sha(targetBytes),
      relationship: 'EXPLICIT_DOCUMENT_REFERENCE_ONLY',
      identityApproval: 'REVIEW_REQUIRED',
    });
  }
}

const links = [...candidates.values()].sort((a, b) => a.referencedDocument.localeCompare(b.referencedDocument) || a.taskKey.localeCompare(b.taskKey));
const indexHasCheckboxTasks = /^\s*[-*] \[[ xX~]\]\s+/m.test(readFileSync(indexPath, 'utf8'));
const report = {
  schema: 'atlas.nextsteps-openspec-document-crosswalk.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  taskCompletionAuthorized: false,
  kanbanWritesPerformed: false,
  taskIdsRewritten: false,
  input: { workboardSnapshot: snapshotPath.replace(`${ROOT}\\`, '').replaceAll('\\', '/'), workboardSnapshotSha256: sha(snapshotBytes), generatedAt: snapshot.generatedAt, taskRows: snapshot.tasks.length },
  sourceValidation: { currentTaskBlocks: currentSourceBlocks, staleOrMissingTaskBlocks: staleSourceBlocks, invalidTaskReferences: badSourceRefs },
  nextStepsIndex: { path: 'next_steps/INDEX.md', hasCheckboxTaskRows: indexHasCheckboxTasks, hasTaskIdentity: false },
  relationshipSemantics: 'An explicit path mention links an OpenSpec task to a document for navigation only. It does not assert task identity equivalence, ownership, dependency, or completion.',
  counts: { explicitTrackedDocumentLinks: links.length, distinctDocuments: new Set(links.map((row) => row.referencedDocument)).size, reviewRequired: links.length },
  links,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const table = links.length
  ? ['| next_steps document | OpenSpec workboard task | Source binding |', '|---|---|---|', ...links.map((row) => {
    const href = relative(dirname(indexPath), resolve(ROOT, row.referencedDocument)).split(sep).join('/');
    return `| [\`${row.referencedDocument}\`](${href}) | \`${row.workboardTaskKey}\` · stable \`${row.stableKey}\` | \`${row.taskSource}#L${row.taskLine}\` · \`${row.taskBlockSha256}\` |`;
  })].join('\n')
  : '_No current, explicit tracked-document references were found._';
const section = [START, '## OpenSpec workboard references (review only)', '', `Fresh workboard snapshot: \`${report.input.workboardSnapshot}\` (${report.input.workboardSnapshotSha256}).`, '', `The index contains no checkbox task rows and has no task identity. The ${links.length} links below are explicit document references from current, block-hash-verified OpenSpec tasks. They are navigation links only; they do not approve ID equivalence, ownership, dependency, or completion.`, '', table, '', `Machine-readable source and document hashes: [crosswalk report](../docs/reports/nextsteps-openspec-document-crosswalk-v1.json).`, END].join('\n');
const oldIndex = readFileSync(indexPath, 'utf8');
const updatedIndex = oldIndex.includes(START) && oldIndex.includes(END)
  ? oldIndex.replace(new RegExp(`${START}[\\s\\S]*?${END}`), section)
  : `${oldIndex.trimEnd()}\n\n${section}\n`;
if (!noIndexWrite) writeFileSync(indexPath, updatedIndex, 'utf8');
console.log(JSON.stringify({ report: reportPath, index: noIndexWrite ? null : indexPath, indexWriteSkipped: noIndexWrite, snapshotRows: snapshot.tasks.length, ...report.sourceValidation, ...report.counts, indexHasCheckboxTasks }, null, 2));
