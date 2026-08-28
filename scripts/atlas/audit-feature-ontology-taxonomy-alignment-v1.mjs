#!/usr/bin/env node

/** Validate grounded-candidate taxonomy hints without approving or persisting them. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(root, 'docs/reports/feature-ontology-grounded-review-snapshot-v1.json');
const reportPath = path.join(root, 'docs/reports/feature-ontology-taxonomy-alignment-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const canonicalDomains = new Set(['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml']);
const candidates = input.candidates ?? [];
const rows = candidates.map((candidate) => {
  const hint = candidate.taxonomyReviewHint ?? null;
  const domainValid = hint ? canonicalDomains.has(hint.canonicalDomain) : false;
  const reviewRequired = hint?.reviewRequired === true;
  const safe = domainValid && reviewRequired && candidate.approved === false && candidate.canonicalAuthority === false;
  return {
    candidateId: candidate.candidateId,
    objectId: candidate.objectId,
    sourceRef: candidate.sourceRef,
    canonicalDomain: hint?.canonicalDomain ?? null,
    conceptHint: hint?.conceptHint ?? null,
    domainValid,
    reviewRequired,
    approved: candidate.approved === true,
    canonicalAuthority: candidate.canonicalAuthority === true,
    status: safe ? 'REVIEW_ONLY_VALID' : 'TAXONOMY_ALIGNMENT_BLOCKED',
  };
});

const invalidRows = rows.filter((row) => row.status !== 'REVIEW_ONLY_VALID');
const report = {
  schema: 'atlas.feature-ontology-taxonomy-alignment.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_VALIDATION',
  input: {
    path: path.relative(root, inputPath).replaceAll('\\', '/'),
    snapshotChecksum: input.snapshotChecksum ?? null,
  },
  canonicalDomains: [...canonicalDomains],
  counts: {
    candidates: rows.length,
    validReviewOnly: rows.length - invalidRows.length,
    blocked: invalidRows.length,
    approved: rows.filter((row) => row.approved).length,
    canonicalAuthority: rows.filter((row) => row.canonicalAuthority).length,
  },
  rows,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  relationshipWrites: false,
  relationshipMaterializationAllowed: false,
  status: invalidRows.length === 0 ? 'TAXONOMY_HINTS_REVIEW_ONLY_VALID' : 'TAXONOMY_ALIGNMENT_BLOCKED',
  nextGate: 'HUMAN_REVIEW_DECISION_REQUIRED',
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts: report.counts, reportPath: 'docs/reports/feature-ontology-taxonomy-alignment-v1.json' }, null, 2));
