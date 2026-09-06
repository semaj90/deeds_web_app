#!/usr/bin/env node
/** Validate a pre-admission OKF chunk plan without promoting it. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.resolve(ROOT, process.argv.find((x) => x.startsWith('--input='))?.slice(8) || 'docs/reports/okf-chunk-plan-v1.json');
const report = JSON.parse(await readFile(input, 'utf8'));
const failures = [];
if (report.schema !== 'atlas.okf-chunk-plan.v1') failures.push('wrong_plan_schema');
if (report.canonicalAuthority !== false) failures.push('plan_must_not_be_canonical');
if (report.writesPerformed !== false || report.datastoreWritesPerformed !== false) failures.push('write_boundary_failed');
if (!/^sha256:[0-9a-f]{64}$/i.test(String(report.workspaceRevision))) failures.push('invalid_workspace_revision');
for (const row of report.chunks ?? []) {
  if (row.schema !== 'atlas.okf-chunk-plan-row.v1') failures.push('wrong_row_schema');
  if (!row.sourceRef || !row.sourceRevision || !Number.isInteger(row.startByte) || !Number.isInteger(row.endByte) || row.endByte <= row.startByte) failures.push('invalid_chunk_binding');
  if (row.canonicalAuthority !== false) failures.push('chunk_plan_must_not_be_canonical');
}
const result = {
  schema: 'atlas.okf-chunk-plan-validation.v1',
  input: path.relative(ROOT, input).replaceAll('\\', '/'),
  status: failures.length ? 'REJECTED' : 'VALIDATED_PRE_ADMISSION',
  chunkCount: Array.isArray(report.chunks) ? report.chunks.length : 0,
  failures,
  canonicalPromotion: 'BLOCKED_UNTIL_CANONICAL_CHUNK_ADAPTER',
  writesPerformed: false,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
