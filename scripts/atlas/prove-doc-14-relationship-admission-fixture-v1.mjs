/** DOC-14 fixture proof: documentation relationships remain derived, typed and revision-bound. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-14-relationship-admission-fixture-v1.json');
const sha = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const relations = [
  ['DOCUMENTED_BY', 'concept:cudaMalloc', 'doc:cuda-runtime:section-1'],
  ['REQUIRES', 'concept:cudaMalloc', 'version:cuda-11'],
  ['SUPPORTS', 'concept:cudaMalloc', 'architecture:sm-86'],
  ['USES', 'example:cudaMalloc-basic', 'concept:cudaMalloc'],
  ['RELATED_TO', 'error:deprecated-allocation', 'concept:cudaMalloc'],
].map(([relationType, sourceId, targetId]) => ({
  relationType,
  sourceId,
  targetId,
  sourceRevision: 'sha256:' + '1'.repeat(64),
  workspaceRevision: 'sha256:' + '2'.repeat(64),
  evidenceRef: 'evidence:doc-12-fixture',
  canonicalAuthority: false,
}));
const ordered = [...relations].sort((a, b) => `${a.relationType}:${a.sourceId}:${a.targetId}`.localeCompare(`${b.relationType}:${b.sourceId}:${b.targetId}`));
const report = {
  schema: 'atlas.doc-14-relationship-admission-fixture.v1',
  gate: 'DOC-14',
  status: 'DOC_14_RELATION_ADMISSION_FIXTURE_PROVEN',
  relationTypes: [...new Set(ordered.map((row) => row.relationType))],
  relationCount: ordered.length,
  relations: ordered,
  deterministicReplayChecksum: sha(ordered),
  canonicalAuthority: false,
  writesPerformed: false,
  liveNeo4jAdmission: false,
  nextGate: 'DOC_14_LIVE_BOUNDED_RELATION_ADMISSION',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, relationCount: report.relationCount, relationTypes: report.relationTypes, writesPerformed: false }, null, 2));
