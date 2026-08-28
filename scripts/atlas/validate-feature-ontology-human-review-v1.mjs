#!/usr/bin/env node

/** Fail-closed validation of the human-review form; never promotes candidates. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(root, 'docs/reports/feature-ontology-human-review-form-v1.json');
const reportPath = path.join(root, 'docs/reports/feature-ontology-human-review-validation-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const allowed = new Set(['ACCEPT', 'REJECT', 'NEEDS_MORE_EVIDENCE']);
const rows = input.rows ?? [];
const invalidRows = rows.filter((row) => !allowed.has(row.decision) || !String(row.reviewer ?? '').trim() || !String(row.rationale ?? '').trim());
const acceptedRows = rows.filter((row) => row.decision === 'ACCEPT');
const report = {
  schema: 'atlas.feature-ontology-human-review-validation.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_FAIL_CLOSED',
  input: { path: path.relative(root, inputPath).replaceAll('\\', '/'), formChecksum: input.formChecksum ?? null },
  counts: { rows: rows.length, invalidRows: invalidRows.length, accepted: acceptedRows.length, rejected: rows.filter((row) => row.decision === 'REJECT').length, needsMoreEvidence: rows.filter((row) => row.decision === 'NEEDS_MORE_EVIDENCE').length },
  invalidCandidateIds: invalidRows.map((row) => row.candidateId),
  approved: false,
  canonicalAuthority: false,
  relationshipMaterializationAllowed: false,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  relationshipWrites: false,
  status: rows.length > 0 && invalidRows.length === 0 ? 'REVIEW_DECISIONS_COMPLETE_NOT_PROMOTED' : 'REVIEW_DECISIONS_INCOMPLETE',
  nextGate: invalidRows.length === 0 ? 'INDEPENDENT_EVIDENCE_VALIDATION_REQUIRED' : 'HUMAN_REVIEW_DECISION_REQUIRED',
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts: report.counts, reportPath: 'docs/reports/feature-ontology-human-review-validation-v1.json' }, null, 2));
