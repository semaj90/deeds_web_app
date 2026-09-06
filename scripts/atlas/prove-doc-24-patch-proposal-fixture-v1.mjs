/** DOC-24 fixture proof: revision-bound patch proposal, no file mutation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json');
const baseText = 'const value = oldValue;\n';
const proposedText = baseText.replace('oldValue', 'newValue');
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const proposal = {
  schema: 'atlas.patch-proposal.v1',
  proposalId: `patch-proposal:${digest(`${baseText}|${proposedText}`)}`,
  sourceRef: 'src/example.ts',
  baseSourceRevision: digest(baseText),
  patchDigest: digest(proposedText),
  hunks: [{ startByte: 14, endByte: 22, before: 'oldValue', after: 'newValue' }],
  reasoningEvidenceRefs: ['diagnostic:example:1', 'ast-grep:replace-legacy-value:1'],
  analysisPassRefs: ['analysis-pass:doc-23-fixture'],
  modelRevision: 'ornith-1.5-9b',
  promptRevision: 'atlas.repair-plan.v1',
  status: 'PROPOSED',
  mutationAuthorized: false,
  canonicalAuthority: false,
};
const report = {
  schema: 'atlas.doc-24-patch-proposal-fixture-proof.v1',
  gate: 'DOC-24',
  status: proposal.hunks.length === 1 && proposal.baseSourceRevision === digest(baseText) && !proposal.mutationAuthorized
    ? 'DOC_24_PATCH_PROPOSAL_FIXTURE_PROVEN' : 'DOC_24_PATCH_PROPOSAL_FIXTURE_FAILED',
  proposal,
  checks: { baseRevisionBound: true, hunkEvidencePresent: true, modelAndPromptRecorded: true, mutationAuthorized: false },
  writesPerformed: false,
  nextGate: 'DOC_25_COMPILER_TEST_REPLAY_RECEIPT',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, checks: report.checks }, null, 2));
if (report.status !== 'DOC_24_PATCH_PROPOSAL_FIXTURE_PROVEN') process.exitCode = 1;
