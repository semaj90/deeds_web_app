#!/usr/bin/env node
/**
 * DAILY-GRAPHIFY-PROGRESS-01 (read-only derived projection)
 *
 * Joins current authority receipts into a daily summary. A delta is reported
 * only when a prior receipt is for the same admitted workspace revision;
 * otherwise the delta fields remain null rather than being inferred from an
 * unrelated historical Graphify run.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const OUT_PATH = path.join(REPORT_DIR, 'daily-graphify-progress-v1.json');

function load(name) {
  const filePath = path.join(REPORT_DIR, name);
  if (!fs.existsSync(filePath)) return { path: `docs/reports/${name}`, data: null, checksum: null };
  const raw = fs.readFileSync(filePath, 'utf8');
  return {
    path: `docs/reports/${name}`,
    data: JSON.parse(raw),
    checksum: `sha256:${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`,
  };
}

const authority = load('current-graphify-snapshot-authority-v1.json');
const owner = load('current-graphify-execution-owner-resolution-v1.json');
const workstation = load('workstation-progress-receipt-v1.json');
const candidates = load('graphify-task-candidates-receipt.json');
const prior = load('daily-graphify-progress-v1.json');
const admittedRevision = authority.data?.sourceSnapshot?.workspaceRevision ?? null;
const currentSourceCount = authority.data?.sourceSnapshot?.sourceCount ?? null;
const qualifyingExecutions = Array.isArray(authority.data?.candidates)
  ? authority.data.candidates.filter((candidate) => candidate.eligible === true).length
  : 0;
const priorSameRevision = prior.data?.admittedWorkspaceRevision === admittedRevision;

const delta = priorSameRevision
  ? {
      basis: 'SAME_ADMITTED_WORKSPACE_REVISION',
      filesObserved: currentSourceCount,
      changed: null,
      new: null,
      deleted: null,
      unchanged: null,
      note: 'The current receipt has no per-file predecessor classification; null values are preserved.',
    }
  : {
      basis: 'NO_PRIOR_RECEIPT_FOR_ADMITTED_WORKSPACE_REVISION',
      filesObserved: currentSourceCount,
      changed: null,
      new: null,
      deleted: null,
      unchanged: null,
      note: 'Historical or different-revision Graphify receipts are not valid temporal baselines.',
    };

const body = {
  schema: 'atlas.daily-graphify-progress.v1',
  mode: 'DERIVED_READ_ONLY_PROJECTION',
  gate: 'DAILY-GRAPHIFY-PROGRESS-01',
  generatedAt: new Date().toISOString(),
  admittedWorkspaceRevision: admittedRevision,
  sourceOfAuthority: authority.path,
  executionOwner: {
    status: owner.data?.status ?? null,
    qualifyingExecutions,
    preferredExecutionId: owner.data?.recommendation?.preferredExecutionId ?? null,
    explicitOwnerRequired: owner.data?.recommendation?.requiresExplicitAuthorityDecision ?? true,
  },
  delta,
  pipeline: {
    sourceObserved: currentSourceCount,
    sourceMembershipProven: qualifyingExecutions > 0,
    canonicalExecutionOwnerProven: authority.data?.canonicalAuthority === true,
    packetChunkStatus: workstation.data?.gates?.find((gate) => gate.id === 'CURRENT_PACKET_CHUNK_LINEAGE')?.state ?? 'UNKNOWN',
    graphStatus: workstation.data?.gates?.find((gate) => gate.id === 'CURRENT_GRAPH_ORDINAL')?.state ?? 'UNKNOWN',
    taskCandidateCount: candidates.data?.candidateCount ?? null,
    taskCandidateCurrentRevisionProven: false,
    kanbanProjectionAuthoritative: false,
  },
  classifications: {
    blocked: workstation.data?.blockers?.length ?? null,
    admitted: 0,
    validated: workstation.data?.gates?.filter((gate) => gate.state === 'PROVEN').length ?? null,
    recommendations: candidates.data?.candidateCount ?? null,
  },
  sourceReceipts: {
    authority: authority,
    executionOwner: owner,
    workstation: workstation,
    taskCandidates: candidates,
    priorDaily: prior.checksum ? prior : null,
  },
  authoritative: false,
  writesPerformed: false,
  nextGate: authority.data?.canonicalAuthority === true
    ? 'CURRENT_EXECUTION_SOURCE_PACKET_CHUNK_CLOSURE'
    : 'EXPLICIT_GRAPHIFY_EXECUTION_OWNER_DECISION',
  notes: [
    'TaskCandidate and Kanban values are projections only; they do not close tasks or authorize execution.',
    'Changed/new/deleted/unchanged remain null until a same-revision temporal baseline exists.',
    'No historical Graphify receipt is used as current authority.',
  ],
};
const checksumBody = {
  ...body,
  generatedAt: null,
  // The prior daily receipt is diagnostic context only. Excluding it avoids
  // making the current receipt checksum self-referential across rebuilds.
  sourceReceipts: Object.fromEntries(Object.entries(body.sourceReceipts)
    .filter(([key]) => key !== 'priorDaily')
    .map(([key, value]) => [key, value ? { path: value.path, checksum: value.checksum } : null])),
};
const report = {
  ...body,
  receiptChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify(checksumBody), 'utf8').digest('hex')}`,
};
fs.mkdirSync(REPORT_DIR, { recursive: true });
const tempPath = `${OUT_PATH}.${process.pid}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tempPath, OUT_PATH);
console.log(JSON.stringify({
  status: 'DAILY_GRAPHIFY_PROGRESS_DERIVED',
  admittedWorkspaceRevision: admittedRevision,
  filesObserved: currentSourceCount,
  qualifyingExecutions,
  taskCandidateCount: report.pipeline.taskCandidateCount,
  deltaBasis: delta.basis,
  authoritative: false,
  writesPerformed: false,
  reportPath: 'docs/reports/daily-graphify-progress-v1.json',
}, null, 2));
