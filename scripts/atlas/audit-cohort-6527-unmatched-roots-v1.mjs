#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const crosswalkPath = path.join(ROOT, 'docs/reports/openspec-cohort-6527-workboard-crosswalk-refresh-v1.json');
const bindingsPath = path.join(ROOT, '.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl');
const reportPath = path.join(ROOT, 'docs/reports/openspec-cohort-6527-unmatched-root-audit-v1.json');
if (!existsSync(crosswalkPath) || !existsSync(bindingsPath)) throw new Error('CURRENT_CROSSWALK_INPUTS_REQUIRED');

const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
const bindingByKey = new Map(readFileSync(bindingsPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line))
  .map((row) => [row.canonical_task_key, row]));
const trackedRoots = ['openspec/specs', 'parent-atlas-qas-bundle', 'parent-atlas-rtx-gpu-lab', 'parent-atlas-tensor-residency-integration', 'parent-atlas-graph-runtime-enhancement'];
const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', ...trackedRoots], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean));
const roots = new Map();
const checks = [];

for (const row of crosswalk.rows.filter((item) => item.status === 'UNMATCHED' || item.status === 'AMBIGUOUS_SOURCE_CONTENT')) {
  const binding = bindingByKey.get(row.canonicalTaskKey);
  if (!binding) throw new Error(`SOURCE_BINDING_MISSING:${row.canonicalTaskKey}`);
  const [sourceRef, lineText] = binding.source_ref.split('#L');
  const absolute = path.join(ROOT, sourceRef);
  const lines = existsSync(absolute) ? readFileSync(absolute, 'utf8').split(/\r?\n/) : [];
  const line = Number(lineText);
  const actualHash = lines[line - 1] ? blockHash(taskBlock(lines, line - 1)) : null;
  const root = sourceRef.split('/').slice(0, sourceRef.startsWith('openspec/specs/') ? 2 : sourceRef.startsWith('sveltekit-frontend/') ? 2 : 1).join('/');
  const entry = roots.get(root) ?? { sourceRows: 0, uniqueFiles: new Set(), missingFiles: 0, untrackedFiles: 0, exactCurrentBlockHashes: 0, staleBlockHashes: 0 };
  entry.sourceRows += 1;
  entry.uniqueFiles.add(sourceRef);
  if (!existsSync(absolute)) entry.missingFiles += 1;
  if (!tracked.has(sourceRef)) entry.untrackedFiles += 1;
  if (actualHash === binding.source_claim_hash) entry.exactCurrentBlockHashes += 1;
  else entry.staleBlockHashes += 1;
  roots.set(root, entry);
  checks.push({ sourceRef: binding.source_ref, canonicalTaskKey: binding.canonical_task_key, fileExists: existsSync(absolute), gitTracked: tracked.has(sourceRef), sourceHashMatches: actualHash === binding.source_claim_hash });
}

const rootSummary = Object.fromEntries([...roots].sort(([a], [b]) => a.localeCompare(b)).map(([root, value]) => [root, { ...value, uniqueFiles: value.uniqueFiles.size }]));
const report = {
  schema: 'atlas.openspec-cohort-6527-unmatched-root-audit.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  taskCompletionAuthorized: false,
  writesPerformed: false,
  inputCrosswalkSha256: createHash('sha256').update(readFileSync(crosswalkPath)).digest('hex'),
  inputSourceBindingRevision: crosswalk.sourceBindingRevision,
  sourceRowsChecked: checks.length,
  counts: {
    existingTrackedAndCurrent: checks.filter((item) => item.fileExists && item.gitTracked && item.sourceHashMatches).length,
    missingFile: checks.filter((item) => !item.fileExists).length,
    untrackedFile: checks.filter((item) => !item.gitTracked).length,
    staleBlockHash: checks.filter((item) => !item.sourceHashMatches).length,
  },
  roots: rootSummary,
  examples: checks.filter((item) => !item.fileExists || !item.gitTracked || !item.sourceHashMatches).slice(0, 20),
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.counts.existingTrackedAndCurrent === checks.length ? 'PASS_SOURCE_ROOTS_CURRENT' : 'PARTIAL_SOURCE_ROOTS', sourceRowsChecked: report.sourceRowsChecked, counts: report.counts, roots: report.roots, reportPath: path.relative(ROOT, reportPath) }, null, 2));
if (report.counts.existingTrackedAndCurrent !== checks.length) process.exitCode = 1;
