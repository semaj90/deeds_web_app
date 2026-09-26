#!/usr/bin/env node
/**
 * NS-7A DECLARED_DEPENDENCY_SHADOW (read-only). Compares the controller's keyword-based ready/waiting decision with a
 * challenger derived from declared `wfu: depends=` edges, and records where they disagree. It changes NO controller
 * behavior; admission (NS-7B) requires every criterion in the receipt to be met.
 *
 * Input : docs/reports/openspec-execution-controller-v1.json (ledger fields spread + controller.state per task)
 * Output: docs/reports/dependency-scheduler-shadow-v1.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { compareDependencyShadow } from './lib/wfu-metadata.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'dependency-scheduler-shadow-v1.json'));
const controller = JSON.parse(fs.readFileSync(path.join(reportsDir, 'openspec-execution-controller-v1.json'), 'utf8'));
const rows = Array.isArray(controller.allTasks) ? controller.allTasks : [];

const result = compareDependencyShadow(rows);
const identityBasis = {};
for (const r of rows.filter((x) => x.state === 'OPEN')) {
  const b = r.taskIdentity?.basis ?? 'NO_IDENTITY_FIELD';
  identityBasis[b] = (identityBasis[b] ?? 0) + 1;
}
const report = {
  schema: 'atlas.dependency-scheduler-shadow.v1',
  stage: 'NS-7A_DECLARED_DEPENDENCY_SHADOW',
  generatedFrom: { controllerGeneratedAt: controller.generatedAt ?? null, controllerRows: rows.length },
  behaviorChanged: false,
  controllerAuthorityUnchanged: true,
  canonicalAuthority: false,
  writesPerformed: false,
  rule: 'depends=none is an observed empty set; a task with no wfu comment is missingMetadata and stays on the incumbent controller rules.',
  ...result,
  openTaskIdentityBasis: identityBasis,
  nextGate: result.admissionEligible ? 'NS-7B_DECLARED_DEPENDENCY_ADMISSION (explicit operator approval still required)' : 'NOT_ELIGIBLE: unmet criteria remain; stay on incumbent controller rules'
};
report.semanticChecksum = crypto.createHash('sha256').update(JSON.stringify({ ...report, generatedFrom: undefined })).digest('hex');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
for (let attempt = 1; ; attempt++) {
  try { fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n'); break; }
  catch (e) { if (attempt >= 6) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000); }
}
console.log(JSON.stringify({ outputPath, counts: report.counts, admissionEligible: report.admissionEligible, criteria: Object.fromEntries(Object.entries(report.criteria).map(([k, v]) => [k, v.met])) }, null, 2));
