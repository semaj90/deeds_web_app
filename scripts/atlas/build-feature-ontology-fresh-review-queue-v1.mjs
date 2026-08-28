#!/usr/bin/env node
/** Build a deterministic, non-authoritative review queue for REL-01A8 output. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(ROOT, 'docs/reports/feature-ontology-fresh-candidate-validation-v1.json');
const reportPath = path.join(ROOT, 'docs/reports/feature-ontology-fresh-review-queue-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rows = (input.rows ?? []).filter((row) => row.classification === 'VALID_REVIEW_CANDIDATE');

const queue = rows.map((row, index) => ({
  reviewId: `review:${String(index + 1).padStart(4, '0')}:${row.candidateId}`,
  candidateId: row.candidateId,
  sourceRef: row.sourceRef,
  sourceRevision: row.sourceRevision,
  workspaceRevision: row.workspaceRevision,
  objectId: row.objectId,
  evidence: {
    structural: row.structuralEvidence,
    groundedText: row.groundedEvidence,
    requiresGroundedSemanticReview: !row.groundedEvidence,
  },
  decision: 'PENDING_REVIEW',
  approved: false,
  canonicalAuthority: false,
  relationshipMaterializationAllowed: false,
}));

const queueChecksum = crypto.createHash('sha256').update(JSON.stringify(queue)).digest('hex');
const report = {
  schema: 'atlas.feature-ontology-fresh-review-queue.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REVIEW_QUEUE',
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  relationshipWrites: false,
  input: path.relative(ROOT, inputPath).replaceAll('\\', '/'),
  workspaceRevision: input.workspaceRevision ?? null,
  selectionChecksum: input.selectionChecksum ?? null,
  queueChecksum,
  counts: {
    queued: queue.length,
    pending: queue.length,
    approved: 0,
    rejected: 0,
    requiringGroundedSemanticReview: queue.filter((row) => row.evidence.requiresGroundedSemanticReview).length,
    structuralEvidencePresent: queue.filter((row) => row.evidence.structural).length,
  },
  decisionPolicy: {
    allowed: ['APPROVE', 'REJECT', 'REGENERATE_ONTOLOGY_REQUIRED'],
    defaultDecision: 'PENDING_REVIEW',
    approvalRequires: ['sourceRef exact', 'sourceRevision exact', 'workspaceRevision exact', 'concept identity reviewed', 'evidence span or approved structural mapping'],
    prohibitedAutomaticPromotion: true,
  },
  queue,
  status: queue.length > 0 ? 'REVIEW_QUEUE_READY_NOT_APPROVED' : 'REVIEW_QUEUE_EMPTY',
  nextGate: 'HUMAN_REVIEW_DECISIONS_AND_GROUNDED_SEMANTIC_EVIDENCE',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, queued: report.counts.queued, requiringGroundedSemanticReview: report.counts.requiringGroundedSemanticReview, approved: report.counts.approved, relationshipMaterializationAllowed: false, reportPath: 'docs/reports/feature-ontology-fresh-review-queue-v1.json' }, null, 2));
