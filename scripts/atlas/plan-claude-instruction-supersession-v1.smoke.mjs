#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const auditPath = 'docs/reports/document-supersession-audit-current-v1.json';
const registry = JSON.parse(readFileSync(join(root, 'docs/reports/document-governance-registry-v1.json'), 'utf8'));
const reportPath = join(root, 'docs/reports/claude-instruction-supersession-plan-v1.json');
const instructionPaths = registry.records
  .filter((record) => record.documentKind === 'CLAUDE_INSTRUCTIONS')
  .map((record) => record.path);
const digestFile = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const before = new Map(instructionPaths.map((path) => [path, digestFile(path)]));

execFileSync(process.execPath, ['scripts/atlas/plan-claude-instruction-supersession-v1.mjs', '--audit', auditPath], {
  cwd: root,
  stdio: 'inherit',
});

const after = new Map(instructionPaths.map((path) => [path, digestFile(path)]));
assert.deepEqual(after, before, 'supersession discovery must not modify instruction sources');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
assert.equal(report.records.length, instructionPaths.length);
for (const item of report.records) assert.equal(item.currentSha256, before.get(item.path));
assert.equal(report.canonicalAuthority, false);
assert.equal(report.writesPerformed, false);
console.log(`CLAUDE_SUPERSESSION_DISCOVERY_READ_ONLY files=${instructionPaths.length}`);
