#!/usr/bin/env node
/** Build a read-only operator snapshot of candidate-level grounded evidence. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const validationPath = path.join(root, 'docs/reports/feature-ontology-fresh-candidate-validation-v1.json');
const queuePath = path.join(root, 'docs/reports/feature-ontology-fresh-review-queue-v1.json');
const reportPath = path.join(root, 'docs/reports/feature-ontology-grounded-review-snapshot-v1.json');
const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const queuedByCandidate = new Map((queue.queue ?? []).map((row) => [row.candidateId, row]));

// These are bounded operator hints, not ontology assertions. Keep them tied to
// the existing canonical domain vocabulary and require human review before
// they can influence relationship materialization.
function taxonomyReviewHint(row) {
  const objectId = String(row.objectId ?? '').toLowerCase();
  const sourceRef = String(row.sourceRef ?? '').toLowerCase();
  if (objectId === 'concept:mixedbread' || sourceRef.includes('cross-encoder-reranker')) {
    return {
      canonicalDomain: 'retrieval',
      conceptHint: 'RERANKER',
      rationale: 'Named provider appears in the cross-encoder reranker implementation.',
      evidenceBasis: 'STRUCTURAL_EXACT',
      reviewRequired: true,
    };
  }
  if (objectId === 'concept:stategraph' || sourceRef.includes('langgraph-dag')) {
    return {
      canonicalDomain: 'agent',
      conceptHint: 'WORKFLOW_ORCHESTRATION',
      rationale: 'StateGraph is imported from the LangGraph workflow implementation.',
      evidenceBasis: 'STRUCTURAL_EXACT',
      reviewRequired: true,
    };
  }
  return null;
}

const candidates = (validation.rows ?? [])
  .filter((row) => row.groundedEvidence === true && row.sourceSpanGrounded === true)
  .sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId)))
  .map((row) => ({
    reviewId: queuedByCandidate.get(row.candidateId)?.reviewId ?? null,
    candidateId: row.candidateId,
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
    workspaceRevision: row.workspaceRevision,
    objectId: row.objectId,
    sourceSpan: row.sourceSpan,
    evidenceModes: row.evidenceModes,
    taxonomyReviewHint: taxonomyReviewHint(row),
    decision: queuedByCandidate.get(row.candidateId)?.decision ?? 'PENDING_REVIEW',
    approved: false,
    canonicalAuthority: false,
  }));
const report = {
  schema: 'atlas.feature-ontology-grounded-review-snapshot.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_OPERATOR_REVIEW',
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  relationshipWrites: false,
  input: {
    validation: path.relative(root, validationPath).replaceAll('\\', '/'),
    queue: path.relative(root, queuePath).replaceAll('\\', '/'),
    validationChecksum: validation.checksum ?? null,
    queueChecksum: queue.queueChecksum ?? null,
  },
  counts: { groundedCandidates: candidates.length, pending: candidates.filter((row) => row.decision === 'PENDING_REVIEW').length, approved: 0 },
  candidates,
  relationshipMaterializationAllowed: false,
  status: candidates.length > 0 ? 'GROUNDED_CANDIDATES_READY_FOR_HUMAN_REVIEW' : 'NO_GROUNDED_CANDIDATES',
  nextGate: 'HUMAN_REVIEW_DECISION_REQUIRED',
};
report.snapshotChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, groundedCandidates: candidates.length, pending: report.counts.pending, reportPath: 'docs/reports/feature-ontology-grounded-review-snapshot-v1.json' }, null, 2));
