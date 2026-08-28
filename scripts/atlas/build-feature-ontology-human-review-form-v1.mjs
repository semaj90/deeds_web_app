#!/usr/bin/env node

/** Build a non-authoritative human-review form from the grounded candidate snapshot. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'docs/reports/feature-ontology-grounded-review-snapshot-v1.json');
const alignmentPath = path.join(root, 'docs/reports/feature-ontology-taxonomy-alignment-v1.json');
const reportPath = path.join(root, 'docs/reports/feature-ontology-human-review-form-v1.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const alignment = JSON.parse(fs.readFileSync(alignmentPath, 'utf8'));

const rows = (snapshot.candidates ?? []).map((candidate) => {
  const aligned = (alignment.rows ?? []).find((row) => row.candidateId === candidate.candidateId);
  return {
    reviewId: candidate.reviewId,
    candidateId: candidate.candidateId,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    objectId: candidate.objectId,
    sourceSpan: candidate.sourceSpan,
    evidenceModes: candidate.evidenceModes ?? [],
    taxonomyReviewHint: candidate.taxonomyReviewHint ?? null,
    taxonomyAlignment: aligned?.status ?? 'NOT_CHECKED',
    decision: null,
    reviewer: null,
    rationale: null,
    approved: false,
    canonicalAuthority: false,
  };
});

const form = {
  schema: 'atlas.feature-ontology-human-review-form.v1',
  generatedAt: new Date().toISOString(),
  mode: 'HUMAN_REVIEW_INPUT_ONLY',
  instructions: [
    'Set decision to ACCEPT, REJECT, or NEEDS_MORE_EVIDENCE only after inspecting the source span.',
    'A decision here does not create a relationship or authorize persistence.',
    'Do not set approved or canonicalAuthority to true in this generated form.',
  ],
  inputs: {
    groundedSnapshotChecksum: snapshot.snapshotChecksum ?? null,
    taxonomyAlignmentChecksum: alignment.reportChecksum ?? null,
  },
  rows,
  approvalBoundary: {
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    relationshipWrites: false,
    relationshipMaterializationAllowed: false,
  },
  status: rows.length > 0 ? 'REVIEW_FORM_READY' : 'NO_REVIEW_ROWS',
  nextGate: 'HUMAN_REVIEW_DECISION_REQUIRED',
};
form.formChecksum = crypto.createHash('sha256').update(JSON.stringify(form)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(form, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: form.status, reviewRows: rows.length, reportPath: 'docs/reports/feature-ontology-human-review-form-v1.json' }, null, 2));
