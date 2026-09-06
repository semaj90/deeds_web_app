/** DOC-16 fixture proof; descriptor-only ACE repair packet, no writes or model calls. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-16-ace-repair-packet-fixture-v1.json');
const packet = {
  schema: 'atlas.ace-repair-packet.v1',
  requestId: 'request:doc-16-fixture',
  candidateSnapshotRevision: 'sha256:' + '1'.repeat(64),
  ordinalMapChecksum: 'sha256:' + '2'.repeat(64),
  selectedCandidateOrdinals: [0],
  packetRefs: ['packet:doc-16-fixture'],
  sourceRefs: ['docs/cuda-runtime.md'],
  sourceRevisions: ['sha256:' + '3'.repeat(64)],
  evidenceRefs: ['evidence:doc-12-fixture'],
  diagnosticRef: 'diagnostic:cuda-legacy-allocation',
  structuralEvidenceRefs: ['ast-grep:call-site:cudaMalloc'],
  documentationRuleRefs: ['api-rule:cudaMalloc:cuda-11'],
  graphEvidenceRefs: [],
  representationRefs: [],
  canonicalAuthority: false,
  writesPerformed: false,
};
const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'rawPrompt'];
const serialized = JSON.stringify(packet, Object.keys(packet).sort());
const report = {
  schema: 'atlas.doc-16-ace-repair-packet-fixture-proof.v1',
  gate: 'DOC-16',
  status: 'DOC_16_ACE_PACKET_FIXTURE_PROVEN',
  packet,
  packetChecksum: `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`,
  forbiddenFieldsPresent: forbidden.filter((field) => Object.prototype.hasOwnProperty.call(packet, field)),
  descriptorOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  modelCalls: false,
  nextGate: 'DOC_16_LIVE_ACE_REPAIR_PACKET_COMPOSITION',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, packetChecksum: report.packetChecksum, forbiddenFieldsPresent: report.forbiddenFieldsPresent }, null, 2));
