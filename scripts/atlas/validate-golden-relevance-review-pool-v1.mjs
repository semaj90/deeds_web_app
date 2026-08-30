#!/usr/bin/env node

/**
 * Validate the canonical reviewer-facing golden pool without assigning grades or writing data.
 * This is intentionally separate from the older structural-proxy queue validator: the pool
 * carries canonical candidate IDs, source references, summaries, and semantic_768 metadata.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.resolve(root, process.argv[2] ?? '.tmp/atlas/golden-relevance-review-pool-bound-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/golden-relevance-review-pool-validation-v1.json');

if (!fs.existsSync(inputPath)) throw new Error(`Missing golden review pool: ${inputPath}`);

const rows = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSON at line ${index + 1}: ${error.message}`); }
});

const errors = [];
const queryIds = new Set();
let candidateCount = 0;
let blankGradeCount = 0;
let completedGradeCount = 0;
let revisionBoundQueryCount = 0;
let revisionBoundCandidateCount = 0;
let missingEvidenceCount = 0;

for (const [rowIndex, row] of rows.entries()) {
  const label = `row ${rowIndex + 1}`;
  if (row.schema !== 'atlas.golden-relevance-review-pool-item.v1') errors.push(`${label}: wrong schema`);
  if (!row.queryPacketKey || queryIds.has(row.queryPacketKey)) errors.push(`${label}: missing/duplicate queryPacketKey`);
  queryIds.add(row.queryPacketKey);
  if (!row.queryText || !row.querySourceRef) errors.push(`${label}: missing query text/source`);
  if (row.embeddingModel !== 'embeddinggemma:latest') errors.push(`${label}: non-canonical embedding model`);
  if (row.representation !== 'semantic_768') errors.push(`${label}: non-canonical representation`);
  if (row.candidateSnapshotRevision && row.ordinalMapChecksum) revisionBoundQueryCount += 1;

  if (!Array.isArray(row.candidates) || row.candidates.length === 0) {
    errors.push(`${label}: no candidates`);
    continue;
  }
  const candidateIds = new Set();
  for (const [candidateIndex, candidate] of row.candidates.entries()) {
    const candidateLabel = `${label} candidate ${candidateIndex + 1}`;
    candidateCount += 1;
    if (!candidate.candidateId || candidateIds.has(candidate.candidateId)) errors.push(`${candidateLabel}: missing/duplicate candidateId`);
    candidateIds.add(candidate.candidateId);
    if (!Number.isInteger(candidate.rank) || candidate.rank < 1) errors.push(`${candidateLabel}: invalid rank`);
    if (!candidate.sourceRef) errors.push(`${candidateLabel}: missing sourceRef`);
    if (typeof candidate.summary !== 'string' || candidate.summary.length === 0) missingEvidenceCount += 1;
    if (candidate.relevanceGrade === null || candidate.relevanceGrade === undefined) blankGradeCount += 1;
    else {
      completedGradeCount += 1;
      if (!Number.isInteger(candidate.relevanceGrade) || candidate.relevanceGrade < 0 || candidate.relevanceGrade > 3) {
        errors.push(`${candidateLabel}: grade outside 0-3`);
      }
      if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) {
        errors.push(`${candidateLabel}: completed grade missing confidence`);
      }
      if (!candidate.reviewerId) errors.push(`${candidateLabel}: completed grade missing reviewerId`);
    }
    if (candidate.candidateSnapshotRevision && candidate.ordinalMapChecksum) revisionBoundCandidateCount += 1;
  }
}

const structuralValid = errors.length === 0 && rows.length === 60 && candidateCount > 0;
const report = {
  schema: 'atlas.golden-relevance-review-pool-validation-v1',
  status: structuralValid
    ? (missingEvidenceCount === 0 ? 'REVIEW_POOL_STRUCTURALLY_VALID_GRADES_PENDING' : 'REVIEW_POOL_EVIDENCE_PARTIAL_GRADES_PENDING')
    : 'INCOMPLETE_FAIL_CLOSED',
  canonicalAuthority: false,
  inputPath: path.relative(root, inputPath),
  queryCount: rows.length,
  candidateCount,
  blankGradeCount,
  completedGradeCount,
  revisionBoundQueryCount,
  revisionBoundCandidateCount,
  missingEvidenceCount,
  errors,
  databaseWrites: false,
  importAllowed: false,
  productionActivation: false,
  nextRequiredStep: structuralValid
    ? 'Complete blinded grades 0-3, reviewer/confidence metadata, hard negatives, and revision bindings; then rerun validation.'
    : 'Repair pool structure before review or import.',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (report.status === 'INCOMPLETE_FAIL_CLOSED') process.exitCode = 1;
