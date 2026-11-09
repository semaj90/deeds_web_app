#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INPUT = path.join(ROOT, 'docs/reports/openspec-cohort-6527-workboard-crosswalk-cohort-roots-v1.json');
const OUTPUT = path.join(ROOT, 'docs/reports/openspec-cohort-6527-identity-review-sheet-v1.json');
const inputBytes = readFileSync(INPUT);
const crosswalk = JSON.parse(inputBytes.toString('utf8'));
if (crosswalk.schema !== 'atlas.openspec-cohort-6527-workboard-crosswalk.v1') {
  throw new Error('IDENTITY_REVIEW_CROSSWALK_SCHEMA_MISMATCH');
}

const expectedCounts = {
  DECLARED_ID_UNIQUE: 124,
  DECLARED_ID_SECTION_QUALIFIED_UNIQUE: 10,
  MIGRATION_TITLE_HASH_REQUIRES_REVIEW: 107,
};
for (const [key, expected] of Object.entries(expectedCounts)) {
  if (crosswalk.keyDifferenceIdentityCounts?.[key] !== expected) {
    throw new Error(`IDENTITY_REVIEW_COUNT_MISMATCH:${key}`);
  }
}
const differences = crosswalk.rows.filter((row) => row.status === 'EXACT_SOURCE_LOCATOR_AND_HASH_KEY_DIFFERS');
if (differences.length !== 241) throw new Error(`IDENTITY_REVIEW_ROW_COUNT_MISMATCH:${differences.length}`);

function readTaskLine(sourceRef) {
  const match = /^(.+)#L(\d+)$/.exec(sourceRef ?? '');
  if (!match) throw new Error(`TASK_SOURCE_REF_INVALID:${sourceRef}`);
  const absolute = path.resolve(ROOT, match[1]);
  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`TASK_SOURCE_OUTSIDE_REPO:${sourceRef}`);
  const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
  const text = lines[Number(match[2]) - 1];
  if (typeof text !== 'string' || !/\[[ x~]\]/i.test(text)) throw new Error(`TASK_LINE_NOT_CHECKBOX:${sourceRef}`);
  return text;
}

const rows = differences.map((row, index) => {
  if (!row.sourceClaimHash || row.sourceClaimHash !== row.candidateBlockHash) {
    throw new Error(`TASK_SOURCE_HASH_PARITY_MISSING:${index}`);
  }
  const identity = row.candidateIdentityReview;
  if (!identity || identity.canonicalAuthority !== false) throw new Error(`TASK_IDENTITY_REVIEW_INVALID:${index}`);
  return {
    reviewIndex: index + 1,
    identityBasis: identity.status,
    sourceTask: {
      existingCanonicalTaskKey: row.canonicalTaskKey,
      sourceRef: row.sourceRef,
      sourceBlockSha256: row.sourceClaimHash,
      checkboxState: row.sourceCheckboxState,
      taskLine: readTaskLine(row.sourceRef),
    },
    workboardCandidate: {
      existingTaskKey: row.candidateWorkboardKey,
      sourceRef: row.candidateSourceRef,
      blockSha256: row.candidateBlockHash,
      logicalTaskKeyHint: identity.logicalTaskKey,
      identityBasisHint: identity.basis,
      uniqueWithinWorkboardHint: identity.uniqueWithinWorkboard,
      taskLine: readTaskLine(row.candidateSourceRef),
    },
    review: {
      decision: 'PENDING_HUMAN_REVIEW',
      approvedExistingKanbanTaskKey: null,
      note: null,
    },
  };
});

const report = {
  schema: 'atlas.openspec-cohort-6527-identity-review-sheet.v1',
  generatedAt: new Date().toISOString(),
  status: 'REVIEW_REQUIRED',
  canonicalAuthority: false,
  taskCreationAuthorized: false,
  taskIdReplacementAuthorized: false,
  writesPerformed: false,
  inputCrosswalkSha256: `sha256:${createHash('sha256').update(inputBytes).digest('hex')}`,
  sourceBindingRevision: crosswalk.sourceBindingRevision,
  counts: expectedCounts,
  unresolvedCount: rows.length,
  instructions: [
    'Review each source task against its existing workboard candidate and exact block hash.',
    'Identity basis and logicalTaskKey are hints only; do not replace IDs or create rows from this sheet.',
    'Record a human decision only after checking task meaning, source revision, and existing Kanban ownership.',
  ],
  rows,
};
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, rows: rows.length, counts: report.counts, output: path.relative(ROOT, OUTPUT) }, null, 2));
