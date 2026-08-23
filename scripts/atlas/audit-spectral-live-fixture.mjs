#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'docs', 'reports');
const reportPath = path.join(reportDir, 'spectral-live-fixture-implementation-audit.json');
const markdownPath = path.join(reportDir, 'spectral-live-fixture-implementation-audit.md');

const expected = [
  'scripts/atlas/build_spectral_live_fixture.py',
  'scripts/atlas/export-spectral-fixture-routing-labels.mjs',
  'scripts/atlas/run_fabric_benchmark.py',
  'docs/reports/spectral-live-fixture-receipt.json',
  'docs/reports/spectral-live-fixture-receipt.md',
];

const files = [];
for (const relativePath of expected) {
  try {
    const stat = await fs.stat(path.join(root, relativePath));
    files.push({ file: relativePath, exists: true, bytes: stat.size });
  } catch {
    files.push({ file: relativePath, exists: false });
  }
}

const missing = files.filter((file) => !file.exists).map((file) => file.file);
const report = {
  schema: 'atlas.spectral.live.fixture.implementation.audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  expectedFiles: files,
  existingBenchmarkOwner: files.find((file) => file.file.endsWith('run_fabric_benchmark.py'))?.exists === true,
  runtimeReceiptPresent: files.some((file) => file.file.endsWith('spectral-live-fixture-receipt.json') && file.exists),
  status: missing.length === 0 ? 'IMPLEMENTED_UNPROVEN' : 'CLAIM_NOT_PRESENT_IN_WORKSPACE',
  missing,
  promotion: 'BLOCKED_UNTIL_FIXTURE_AND_LIVE_RECEIPT_EXIST',
  canonicalWrites: false,
};

await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(markdownPath, [
  '# Spectral live fixture implementation audit', '',
  `- Status: **${report.status}**`,
  '- Read-only: **true**',
  `- Existing benchmark owner: **${report.existingBenchmarkOwner}**`,
  `- Runtime receipt present: **${report.runtimeReceiptPresent}**`,
  '',
  'Missing claimed tranche files:',
  ...(missing.length ? missing.map((file) => `- \`${file}\``) : ['- None']),
  '',
  'SGC-5 through SGC-8 remain unproven until the fixture runs and emits a workstation receipt.',
  'No runtime, graph, vector, cache, or canonical data was modified.',
].join('\n') + '\n', 'utf8');

console.log(JSON.stringify({ status: report.status, missing: report.missing, reportPath: path.relative(root, reportPath), canonicalWrites: false }, null, 2));
