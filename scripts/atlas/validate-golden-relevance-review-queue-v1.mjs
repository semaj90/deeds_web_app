#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const inputPath = path.resolve(repoRoot, process.argv[2] ?? '.tmp/atlas/golden-relevance-review-queue-v1.ndjson');
const reportPath = path.resolve(repoRoot, 'docs/reports/golden-relevance-review-queue-validation-v1.json');

if (!fs.existsSync(inputPath)) throw new Error(`Missing review queue: ${inputPath}`);

const rows = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
});

const errors = [];
let judgmentCount = 0;
let completedJudgmentCount = 0;
let hardNegativeCount = 0;
const queryIds = new Set();

for (const [index, row] of rows.entries()) {
  const label = `row ${index + 1}`;
  if (row.schema !== 'atlas.golden-relevance-review-item.v1') errors.push(`${label}: wrong schema`);
  if (!row.queryId || !row.querySourceRef || !row.queryText) errors.push(`${label}: missing query identity/text`);
  if (queryIds.has(row.queryId)) errors.push(`${label}: duplicate queryId`);
  queryIds.add(row.queryId);
  if (!Array.isArray(row.judgments) || row.judgments.length === 0) errors.push(`${label}: no candidate judgments`);
  const packetIds = new Set();
  for (const judgment of row.judgments ?? []) {
    judgmentCount += 1;
    if (!judgment.packetKey || packetIds.has(judgment.packetKey)) errors.push(`${label}: duplicate/missing packetKey`);
    packetIds.add(judgment.packetKey);
    const grade = judgment.relevanceGrade;
    if (grade !== null) {
      completedJudgmentCount += 1;
      if (!Number.isInteger(grade) || grade < 0 || grade > 3) errors.push(`${label}: grade outside 0-3`);
      if (typeof judgment.confidence !== 'number' || judgment.confidence < 0 || judgment.confidence > 1) {
        errors.push(`${label}: completed judgment missing valid confidence`);
      }
      if (!judgment.judgmentSource || !judgment.reviewerId) errors.push(`${label}: completed judgment missing reviewer/source`);
    }
    if (judgment.isHardNegative === true) hardNegativeCount += 1;
  }
}

const hasAllGrades = [0, 1, 2, 3].every((grade) => rows.some((row) =>
  (row.judgments ?? []).some((judgment) => judgment.relevanceGrade === grade)));
const readyForImport = errors.length === 0 && rows.length > 0 && completedJudgmentCount === judgmentCount &&
  hardNegativeCount > 0 && hasAllGrades;

const report = {
  schema: 'atlas.golden-relevance-review-queue-validation-v1',
  status: readyForImport ? 'READY_FOR_IMPORT_REVIEW' : 'INCOMPLETE_FAIL_CLOSED',
  canonicalAuthority: false,
  inputPath: path.relative(repoRoot, inputPath),
  queryCount: rows.length,
  judgmentCount,
  completedJudgmentCount,
  blankJudgmentCount: judgmentCount - completedJudgmentCount,
  hardNegativeCount,
  hasAllGrades,
  errors,
  databaseWrites: false,
  importAllowed: false,
  nextRequiredStep: readyForImport
    ? 'Independent review of corpus checksum and revision bindings before any import.'
    : 'Complete grades 0-3, reviewer/confidence metadata, and hard negatives; then rerun validation.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
