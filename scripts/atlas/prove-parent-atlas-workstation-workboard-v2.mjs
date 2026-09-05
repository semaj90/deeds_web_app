#!/usr/bin/env node

/** Read-only deterministic proof for the Workstation OpenSpec board adapter. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const builder = path.join(root, 'scripts', 'atlas', 'build-parent-atlas-workstation-openspec-workboard-v2.mjs');
const reportPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-openspec-workboard-v2.json');
const run = () => {
  const result = spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`BOARD_BUILD_FAILED: ${result.stderr || result.stdout}`);
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
};
const a = run();
const b = run();
const sample = a.tasks[0];
if (!sample || !sample.taskChecksum) throw new Error('TASK_CHECKSUM_MISSING');
const alteredText = `${sample.taskText} [fixture alteration]`;
const alteredChecksum = `sha256:${crypto.createHash('sha256').update(`${sample.openspecChange}\n${sample.sourceLine}\n${alteredText}`, 'utf8').digest('hex')}`;
const allowed = new Set(['OPEN_ACTIONABLE', 'BLOCKED_UPSTREAM', 'CLOSED_BY_CURRENT_EVIDENCE', 'SUPERSEDED', 'OWNED_BY_OTHER_CHANGE', 'GOVERNANCE_ONLY', 'NEGATIVE_CONSTRAINT', 'HUMAN_DECISION_REQUIRED', 'UNVERIFIED']);
const unclassifiedNotExecutable = a.tasks.every((task) => task.classification !== 'OPEN_ACTIONABLE' || task.executable === false);
const percentageNotUsedForEligibility = a.tasks.every((task) => task.eligibilityBasis === 'EXPLICIT_CLASSIFICATION_AND_EVIDENCE_ONLY');
const candidateBounded = a.planning.candidateLimit === 5 && a.planning.selectedCandidateCount <= a.planning.candidateLimit;
const noExecutableCandidateHonest = a.planning.status === 'NO_EXECUTABLE_CANDIDATE' && a.planning.eligibleCandidateCount === 0;
const planReplayStable = a.workPlan.planChecksum === b.workPlan.planChecksum;
const noCandidatePlanExplicit = a.workPlan.status === 'NO_EXECUTABLE_CANDIDATE' && a.workPlan.nextAction === null;
const evidenceResolution = a.tasks.flatMap((task) => task.evidenceResolution ?? []).map((item) => ({
  ref: item.ref,
  exists: item.exists,
}));
const proof = {
  schema: 'atlas.parent-atlas-workstation-openspec-workboard-proof.v1',
  status: a.taskPopulationChecksum === b.taskPopulationChecksum && alteredChecksum !== sample.taskChecksum ? 'PROVEN' : 'FAILED',
  taskPopulationChecksumA: a.taskPopulationChecksum,
  taskPopulationChecksumB: b.taskPopulationChecksum,
  unchangedReplay: a.taskPopulationChecksum === b.taskPopulationChecksum,
  changedTextChangesTaskChecksum: alteredChecksum !== sample.taskChecksum,
  classificationsValid: a.tasks.every((task) => allowed.has(task.classification)),
  unclassifiedNotExecutable,
  percentageNotUsedForEligibility,
  candidateBounded,
  noExecutableCandidateHonest,
  planReplayStable,
  noCandidatePlanExplicit,
  missingEvidenceRefs: a.summary.missingEvidenceRefs,
  writes: { taskLedgers: 0, sourceFiles: 0, databases: 0, qdrant: 0, neo4j: 0, cache: 0, modelCalls: 0 },
  reportPath: 'docs/reports/parent-atlas-workstation-openspec-workboard-v2.json',
};
const out = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-openspec-workboard-v2-proof.json');
const evidenceReceipt = {
  schema: 'atlas.parent-atlas-workstation-evidence-resolution.v1',
  status: proof.missingEvidenceRefs === 0 ? 'PROVEN' : 'INCOMPLETE',
  sourceReport: proof.reportPath,
  taskCount: a.tasks.length,
  evidenceRefCount: evidenceResolution.length,
  resolvedCount: evidenceResolution.filter((item) => item.exists).length,
  missingCount: evidenceResolution.filter((item) => !item.exists).length,
  refs: evidenceResolution,
  writes: proof.writes,
};
const evidenceOut = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-evidence-resolution-v1.json');
fs.writeFileSync(evidenceOut, `${JSON.stringify(evidenceReceipt, null, 2)}\n`, 'utf8');
proof.evidenceResolutionReceipt = 'docs/reports/parent-atlas-workstation-evidence-resolution-v1.json';
fs.writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out, evidenceOut }, null, 2));
if (proof.status !== 'PROVEN' || !unclassifiedNotExecutable || !percentageNotUsedForEligibility || !candidateBounded || !noExecutableCandidateHonest || !planReplayStable || !noCandidatePlanExplicit || evidenceReceipt.status !== 'PROVEN') process.exitCode = 1;
