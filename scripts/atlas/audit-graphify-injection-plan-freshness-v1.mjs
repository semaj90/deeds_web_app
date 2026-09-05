#!/usr/bin/env node
/** Compare the proposal-only Graphify injection plan with the latest cohort receipt. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planPath = path.join(root, 'docs/reports/graphify-current-execution-injection-plan-v1.json');
const cohortPath = path.join(root, 'docs/reports/current-source-cohort-lineage-v1.json');
const outPath = path.join(root, 'docs/reports/graphify-injection-plan-freshness-v1.json');
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const plan = await read(planPath);
const cohort = await read(cohortPath);
const plannedRevision = plan.workspaceRevision ?? null;
const currentRevision = cohort.counts?.currentWorkspaceRevision ?? cohort.currentWorkspaceRevision ?? null;
const generatedAtPresent = Boolean(plan.generatedAt);
const revisionAgrees = Boolean(plannedRevision && currentRevision && plannedRevision === currentRevision);
const report = {
  schema: 'atlas.graphify-injection-plan-freshness.v1',
  plan: 'docs/reports/graphify-current-execution-injection-plan-v1.json',
  cohort: 'docs/reports/current-source-cohort-lineage-v1.json',
  planStatus: plan.status ?? null,
  plannedWorkspaceRevision: plannedRevision,
  currentWorkspaceRevision: currentRevision,
  generatedAtPresent,
  revisionAgrees,
  status: generatedAtPresent && revisionAgrees && plan.status === 'READY_FOR_EXPLICIT_AUTHORIZATION'
    ? 'CURRENT_PROPOSAL_REQUIRES_SEPARATE_AUTHORIZATION'
    : 'STALE_OR_CONFLICTING_PROPOSAL_FAIL_CLOSED',
  authorization: false,
  execution: false,
  sourceSelectionWrites: false,
  blockers: [
    ...(!generatedAtPresent ? ['PLAN_GENERATED_AT_MISSING'] : []),
    ...(!revisionAgrees ? ['PLAN_WORKSPACE_REVISION_CONFLICTS_WITH_CURRENT_COHORT'] : []),
    ...(cohort.counts?.revisionQualified === 0 ? ['CURRENT_COHORT_HAS_ZERO_REVISION_QUALIFIED_ROWS'] : []),
  ],
  nextGate: 'FRESH_WORKSPACE_SOURCE_SELECTION_INPUT_AND_INDEPENDENT_READBACK',
};
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, outPath).replaceAll('\\', '/'), status: report.status, revisionAgrees, authorization: false }, null, 2));
