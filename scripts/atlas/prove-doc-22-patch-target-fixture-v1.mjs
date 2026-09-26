/** DOC-22 executable fixture proof for revision-qualified, non-mutating patch targets. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-22-patch-target-fixture-v1.json');
const source = Buffer.from('export const value = "oldValue";\n', 'utf8');
const before = Buffer.from('oldValue', 'utf8');
const after = Buffer.from('newValue', 'utf8');
const startByte = source.indexOf(before);
const endByte = startByte + before.length;
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourceRevision = digest(source);
const staleRevision = `sha256:${'f'.repeat(64)}`;
const target = {
  schema: 'atlas.patch-target.v1',
  sourceRef: 'src/example.ts',
  baseSourceRevision: sourceRevision,
  startByte,
  endByte,
  expectedBytesChecksum: digest(before),
  replacementBytesChecksum: digest(after),
  evidenceRefs: ['diagnostic:example:1', 'ast-grep:replace-legacy-value:fixture'],
  canonicalAuthority: false,
};
const exactRange = startByte >= 0 && endByte <= source.length &&
  source.subarray(startByte, endByte).equals(before) &&
  digest(source.subarray(startByte, endByte)) === target.expectedBytesChecksum;
const staleBaseRejected = staleRevision !== target.baseSourceRevision;
const patchedFixture = exactRange && staleBaseRejected
  ? Buffer.concat([source.subarray(0, startByte), after, source.subarray(endByte)])
  : null;
const patchAppliedInMemory = Boolean(patchedFixture) && patchedFixture.toString('utf8') === 'export const value = "newValue";\n';
const report = {
  schema: 'atlas.doc-22-patch-target-fixture-proof.v1',
  gate: 'DOC-22',
  status: exactRange && staleBaseRejected && patchAppliedInMemory ? 'DOC_22_PATCH_TARGET_FIXTURE_PROVEN' : 'DOC_22_PATCH_TARGET_FIXTURE_FAILED',
  proofMode: 'SYNTHETIC_FIXTURE_ONLY',
  sourceChecksum: sourceRevision,
  target,
  checks: {
    exactBaseSourceRevision: target.baseSourceRevision === sourceRevision,
    exactUtf8ByteRange: exactRange,
    expectedBytesChecksum: digest(before),
    replacementBytesChecksum: digest(after),
    staleBaseRevisionRejected: staleBaseRejected,
    inMemoryPatchResult: patchAppliedInMemory,
    patchedFixtureChecksum: patchedFixture ? digest(patchedFixture) : null,
  },
  mutationPerformed: false,
  persistentSourceModified: false,
  canonicalAuthority: false,
  mutationAuthorized: false,
  writesPerformed: false,
  nextGate: 'DOC_23_AST_GREP_REPAIR_PLANNER',
};
const tempReportPath = `${reportPath}.${process.pid}.tmp`;
try {
  await fs.writeFile(tempReportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(tempReportPath, reportPath);
} catch (error) {
  await fs.rm(tempReportPath, { force: true });
  throw error;
}
console.log(JSON.stringify({ reportPath, status: report.status, checks: report.checks, mutationPerformed: false }, null, 2));
if (report.status !== 'DOC_22_PATCH_TARGET_FIXTURE_PROVEN') process.exitCode = 1;
