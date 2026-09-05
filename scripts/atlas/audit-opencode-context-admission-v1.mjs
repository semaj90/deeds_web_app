#!/usr/bin/env node
/**
 * OPENCODE-CONTEXT-ADMISSION-01 — read-only instruction/context audit.
 * Measures ambient AGENTS.md admission pressure and existing ast-grep owners.
 * It does not move, rewrite, or delete files, call an LLM, or write a datastore.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'opencode-context-admission-audit-v1.json');

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

const output = execFileSync('rg', [
  '--files', '-uu', '-g', 'AGENTS.md',
  '-g', '!**/.git/**', '-g', '!**/node_modules/**',
], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });

const files = output.trim().split(/\r?\n/).filter(Boolean).map((name) => {
  const file = path.resolve(root, name);
  const buffer = fs.readFileSync(file);
  const text = buffer.toString('utf8');
  const markers = ['Full Repository Index', 'LLM jump table', 'npm run agents:write']
    .filter((marker) => text.includes(marker));
  return {
    path: relative(file),
    bytes: buffer.byteLength,
    lines: text.split(/\r?\n/).length,
    classification: markers.length ? 'GENERATED_INDEX' : buffer.byteLength > 12 * 1024
      ? 'CORE_OR_SCOPED_OVER_BUDGET' : 'CORE_OR_SCOPED_INSTRUCTION',
    generatedIndexMarkers: markers,
  };
});

const astGrepSurfaces = [
  'scripts/atlas/audit-atlas-indexing-surfaces.mjs',
  'scripts/atlas/atlas-ast-backfill-receipt-v1.mjs',
  'scripts/atlas/phase1-ast-grep-extraction.mjs',
  'sveltekit-frontend/scripts/atlas/phase1-ast-grep-extraction.mjs',
  'sveltekit-frontend/scripts/atlas/phase1.5-ast-grep-extraction.mjs',
].map((file) => ({ file, present: fs.existsSync(path.join(root, file)) }));

const generated = files.filter((file) => file.classification === 'GENERATED_INDEX');
const oversized = files.filter((file) => file.bytes > 12 * 1024);
const report = {
  schema: 'atlas.opencode-context-admission-audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
  instructionFileCount: files.length,
  generatedIndexCount: generated.length,
  oversizedFileCount: oversized.length,
  files,
  astGrepSurfaces,
  findings: [
    ...(generated.length ? ['GENERATED_INDEX_IN_AMBIENT_INSTRUCTIONS'] : []),
    ...(oversized.length ? ['INSTRUCTION_FILE_OVER_BUDGET'] : []),
  ],
  nextGate: 'OPENCODE-CONTEXT-ADMISSION-01',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.findings.length ? 'CONTEXT_ADMISSION_REVIEW_REQUIRED' : 'CONTEXT_ADMISSION_BASELINE_CLEAN',
  instructionFileCount: files.length,
  generatedIndexCount: generated.length,
  oversizedFileCount: oversized.length,
  astGrepSurfaces: astGrepSurfaces.filter((entry) => entry.present).length,
  reportPath: relative(reportPath),
  readOnly: true,
}, null, 2));
