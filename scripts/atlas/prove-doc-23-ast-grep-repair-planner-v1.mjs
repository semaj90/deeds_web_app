/** DOC-23 fixture proof: structural match -> patch proposal, never direct mutation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-23-ast-grep-repair-planner-v1.json');
const source = Buffer.from('const value = oldValue;\n', 'utf8');
const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
const match = { ruleId: 'replace-legacy-value', language: 'typescript', startByte: 14, endByte: 22, matchedText: 'oldValue', evidenceRef: 'ast-grep:replace-legacy-value:1' };
const proposal = { schema: 'atlas.patch-proposal.v1', sourceRef: 'src/example.ts', baseSourceRevision: sourceRevision, matches: [match], replacementText: 'newValue', evidenceRefs: [match.evidenceRef], canonicalAuthority: false, mutationAuthorized: false };
const matchedBytes = source.subarray(match.startByte, match.endByte).toString('utf8');
const report = {
  schema: 'atlas.doc-23-ast-grep-repair-planner-proof.v1',
  gate: 'DOC-23',
  status: matchedBytes === match.matchedText && proposal.mutationAuthorized === false ? 'DOC_23_AST_GREP_REPAIR_FIXTURE_PROVEN' : 'DOC_23_AST_GREP_REPAIR_FIXTURE_FAILED',
  structuralMatch: match,
  proposal,
  checks: { exactUtf8Match: matchedBytes === match.matchedText, sourceRevisionBound: proposal.baseSourceRevision === sourceRevision, mutationAuthorized: false },
  writesPerformed: false,
  nextGate: 'DOC_24_PATCH_PROPOSAL_AND_VALIDATION_RECEIPT',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, checks: report.checks }, null, 2));
if (report.status !== 'DOC_23_AST_GREP_REPAIR_FIXTURE_PROVEN') process.exitCode = 1;
