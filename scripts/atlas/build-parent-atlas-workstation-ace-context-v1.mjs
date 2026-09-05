#!/usr/bin/env node

/**
 * Build a reference-only ACE context for the Workstation OpenSpec planner.
 * The existing ACE/ContextManifest owner remains authoritative; this adapter
 * only prepares bounded references and never materializes a competing manifest.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const boardPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-openspec-workboard-v2.json');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ace-context-v1.json');
const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const selectedTaskRefs = board.planning.selectedTaskRefs ?? [];
const selectedTasks = (board.tasks ?? []).filter((task) => selectedTaskRefs.includes(task.taskRef));
const selectedEvidenceRefs = [...new Set([
  ...(board.workPlan?.evidenceRefs ?? []),
  ...selectedTasks.flatMap((task) => task.evidenceRefs ?? []),
])];
const contextBody = {
  schema: 'atlas.openspec-workstation-ace-context-reference.v1',
  status: board.workPlan?.status === 'BOUNDED_ACTION_AVAILABLE' ? 'READY_FOR_ACE_ASSEMBLY' : 'NO_EXECUTABLE_CANDIDATE',
  authority: 'EXISTING_ACE_CONTEXTMANIFEST_OWNER',
  workboardChecksum: board.sourceChecksums?.workboard ?? null,
  taskPopulationChecksum: board.taskPopulationChecksum ?? null,
  planChecksum: board.workPlan?.planChecksum ?? null,
  selectedTaskRefs,
  selectedEvidenceRefs,
  excludedTaskCount: Math.max(0, (board.tasks?.length ?? 0) - selectedTasks.length),
  tokenBudget: 2000,
  maxEvidenceReferences: 8,
  mutationScope: 'NONE',
  modelCalls: 0,
};
const report = {
  ...contextBody,
  contextChecksum: sha256(JSON.stringify(contextBody)),
  evidenceResolution: selectedEvidenceRefs.map((ref) => ({ ref, exists: fs.existsSync(path.join(root, ref)) })),
  writes: { taskLedgers: 0, sourceFiles: 0, databases: 0, qdrant: 0, neo4j: 0, cache: 0, modelCalls: 0 },
  notes: [
    'Reference-only adapter; existing ACE/ContextManifest owner remains authoritative.',
    'The complete OpenSpec backlog is never materialized into context.',
    'No model call occurs when the plan has no executable candidate.',
  ],
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, contextChecksum: report.contextChecksum, selectedTaskRefs: report.selectedTaskRefs, selectedEvidenceRefs: report.selectedEvidenceRefs, excludedTaskCount: report.excludedTaskCount, writes: report.writes, out: outPath }, null, 2));
