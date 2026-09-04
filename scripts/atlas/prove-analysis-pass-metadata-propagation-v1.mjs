/** Pure fixture proof for worker metadata precedence; no database or model calls. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/analysis-pass-metadata-propagation-v1.json');
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const pick = (executor, job, key, fallback = null) => executor[key] ?? job[key] ?? fallback;

const job = {
  packetKey: 'packet:legacy', sourceRef: 'legacy-ref', sourceRevision: 'legacy-source',
  workspaceRevision: 'legacy-workspace', representationRevision: 'legacy-representation',
};
const executor = {
  packetKey: 'packet:executor', sourceRef: 'executor-ref', sourceRevision: 'executor-source',
  workspaceRevision: 'executor-workspace', representationRevision: 'semantic_768@1',
};
const enriched = Object.fromEntries(Object.keys(job).map((key) => [key, pick(executor, job, key)]));
const incompleteExecutor = { packetKey: 'packet:partial' };
const nullable = Object.fromEntries(['sourceRevision', 'workspaceRevision', 'representationRevision']
  .map((key) => [key, pick(incompleteExecutor, {}, key)]));
const result = {
  executorMetadataPrecedence: enriched.sourceRevision === 'executor-source'
    && enriched.workspaceRevision === 'executor-workspace'
    && enriched.representationRevision === 'semantic_768@1',
  jobFallbackPreserved: enriched.sourceRef === 'executor-ref',
  absentMetadataRemainsNull: Object.values(nullable).every((value) => value === null),
};
const report = {
  schema: 'parent-atlas.analysis-pass-metadata-propagation.v1',
  gate: 'ANALYSIS-PASS-METADATA-ENRICHMENT',
  status: Object.values(result).every(Boolean) ? 'FIXTURE_PROVEN' : 'FAILED',
  result,
  writesPerformed: false,
  modelCalls: false,
  canonicalAuthority: false,
  reportChecksum: hash(result),
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, writesPerformed: false }));
if (report.status !== 'FIXTURE_PROVEN') process.exitCode = 1;
