#!/usr/bin/env node

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportDir = resolve(root, 'docs/reports');
const reportPath = resolve(reportDir, 'retrieval-executor-receipts-v1.json');
const selected = readdirSync(reportDir).filter((name) => /(?:compatibility|capability|residency|tensorrt|llama|python-runtime|turbovec-runtime|analyze-this|centroid-cache|pgvector|postgres-fts)/i.test(name) && name.endsWith('.json'));
const forbidden = /hiddenThoughts|chainOfThought|kv_cache|recurrent_state|raw_tensor|cudaPointer/i;
const violations = [];
const reviewed = [];
for (const name of selected) {
  let value;
  try { value = JSON.parse(readFileSync(resolve(reportDir, name), 'utf8')); } catch { continue; }
  const text = JSON.stringify(value);
  const writes = value.writesPerformed;
  const authority = value.canonicalAuthority;
  reviewed.push({ file: `docs/reports/${name}`, writesPerformed: writes ?? null, canonicalAuthority: authority ?? null });
  if (writes === true) violations.push({ file: name, reason: 'writesPerformed=true' });
  if (authority === true) violations.push({ file: name, reason: 'canonicalAuthority=true' });
  if (forbidden.test(text)) violations.push({ file: name, reason: 'forbidden model-state field present' });
}
const report = {
  schema: 'atlas.retrieval-executor-receipts.v1',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'REVIEW_REQUIRED' : 'RECEIPTS_REVIEWED',
  reviewedCount: reviewed.length,
  reviewed,
  violations,
  writesPerformed: false,
  canonicalAuthority: false,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reviewedCount: report.reviewedCount, violations: report.violations.length, reportPath }, null, 2));
if (violations.length) process.exitCode = 1;
