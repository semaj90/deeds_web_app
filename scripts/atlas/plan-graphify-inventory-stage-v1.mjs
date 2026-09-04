import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const handoffPath = path.resolve(root, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const reportPath = path.resolve(root, 'docs/reports/graphify-inventory-stage-plan-v1.json');
const revisionPattern = /^sha256:[a-f0-9]{64}$/;
const digestPattern = /^[a-f0-9]{64}$/;

function checksum(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
const workspaceRevision = String(handoff.workspaceRevision ?? '');
const sourceBindings = Array.isArray(handoff.sourceBindings) ? handoff.sourceBindings : [];
const failures = [];
const refs = new Set();

if (!revisionPattern.test(workspaceRevision)) failures.push('INVALID_WORKSPACE_REVISION');
for (const [index, binding] of sourceBindings.entries()) {
  const prefix = `binding[${index}]`;
  if (!binding || typeof binding !== 'object') {
    failures.push(`${prefix}:NOT_OBJECT`);
    continue;
  }
  const sourceRef = String(binding.sourceRef ?? '');
  const sourceRevision = String(binding.sourceRevision ?? '');
  const contentDigest = String(binding.contentDigest ?? '');
  if (!sourceRef) failures.push(`${prefix}:MISSING_SOURCE_REF`);
  if (refs.has(sourceRef)) failures.push(`${prefix}:DUPLICATE_SOURCE_REF:${sourceRef}`);
  refs.add(sourceRef);
  if (binding.workspaceRevision !== workspaceRevision) failures.push(`${prefix}:WORKSPACE_REVISION_MISMATCH`);
  if (!revisionPattern.test(sourceRevision)) failures.push(`${prefix}:INVALID_SOURCE_REVISION`);
  if (!digestPattern.test(contentDigest)) failures.push(`${prefix}:INVALID_CONTENT_DIGEST`);
  if (sourceRevision !== `sha256:${contentDigest}`) failures.push(`${prefix}:SOURCE_CONTENT_MISMATCH`);
  if (!Number.isInteger(binding.byteLength) || binding.byteLength < 0) failures.push(`${prefix}:INVALID_BYTE_LENGTH`);
}

const orderedBindings = [...sourceBindings].sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef)));
const sourceSelectionChecksum = checksum(orderedBindings.map((binding) => String(binding.sourceRef)).join(''));
const inventoryOutputChecksum = checksum(stable(orderedBindings.map((binding) => ({
  sourceRef: binding.sourceRef,
  sourceRevision: binding.sourceRevision,
  contentDigest: binding.contentDigest,
  byteLength: binding.byteLength,
  workspaceRevision: binding.workspaceRevision,
}))));

const report = {
  schema: 'atlas.graphify-inventory-stage-plan.v1',
  status: failures.length === 0 && sourceBindings.length > 0 ? 'INVENTORY_RECEIPT_READY' : 'INVENTORY_RECEIPT_BLOCKED',
  sourceHandoff: 'docs/reports/graphify-lifecycle-entrypoint-v1.json',
  workspaceRevision,
  sourceCount: sourceBindings.length,
  sourceSelectionChecksum,
  inventoryOutputChecksum,
  validation: {
    uniqueSourceRefs: refs.size === sourceBindings.length,
    allWorkspaceRevisionsMatch: failures.every((failure) => !failure.endsWith(':WORKSPACE_REVISION_MISMATCH')),
    allSourceRevisionsBindContent: failures.every((failure) => !failure.endsWith(':SOURCE_CONTENT_MISMATCH')),
    failures,
  },
  executionStage: {
    stage: 'INVENTORY',
    inputChecksum: sourceSelectionChecksum,
    outputChecksum: inventoryOutputChecksum,
    receiptRef: 'docs/reports/graphify-inventory-stage-plan-v1.json',
  },
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  nextGate: 'COORDINATOR_INVENTORY_STAGE_READBACK',
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  workspaceRevision,
  sourceCount: report.sourceCount,
  sourceSelectionChecksum,
  inventoryOutputChecksum,
  failureCount: failures.length,
  writesPerformed: false,
  reportPath,
}, null, 2));

if (report.status !== 'INVENTORY_RECEIPT_READY') process.exitCode = 1;
