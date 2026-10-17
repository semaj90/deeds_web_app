#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { goldenHumanJudgmentErrorsV1 } from './lib/golden-review-journal-v1.mjs';

const repoRoot = process.cwd();
const inputPath = path.resolve(repoRoot, process.argv[2] ?? '.tmp/atlas/golden-relevance-review-queue-v1.ndjson');
const reportPath = path.resolve(repoRoot, process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
  ?? `docs/reports/golden-relevance-review-queue-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

if (!fs.existsSync(inputPath)) throw new Error(`Missing review queue: ${inputPath}`);

const inputBytes = fs.readFileSync(inputPath);
const rows = inputBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
});

const errors = [];
let judgmentCount = 0;
let completedJudgmentCount = 0;
let blankJudgmentCount = 0;
let invalidJudgmentCount = 0;
let hardNegativeCount = 0;
const queryIds = new Set();

for (const [index, row] of rows.entries()) {
  const label = `row ${index + 1}`;
  if (row.schema !== 'atlas.golden-relevance-review-item.v1') errors.push(`${label}: wrong schema`);
  if (!row.queryPacketKey || !row.querySourceRef || !row.queryText) errors.push(`${label}: missing query packet identity/text`);
  if (queryIds.has(row.queryPacketKey)) errors.push(`${label}: duplicate queryPacketKey`);
  queryIds.add(row.queryPacketKey);
  if (!Array.isArray(row.judgments) || row.judgments.length === 0) errors.push(`${label}: no candidate judgments`);
  const packetIds = new Set();
  for (const judgment of row.judgments ?? []) {
    judgmentCount += 1;
    if (!judgment.packetKey || packetIds.has(judgment.packetKey)) errors.push(`${label}: duplicate/missing packetKey`);
    packetIds.add(judgment.packetKey);
    const grade = judgment.relevanceGrade;
    if (grade != null) {
      const judgmentErrors = goldenHumanJudgmentErrorsV1(judgment);
      errors.push(...judgmentErrors.map((error) => `${label}: ${error}`));
      if (judgmentErrors.length === 0) completedJudgmentCount += 1;
      else invalidJudgmentCount += 1;
    } else {
      blankJudgmentCount += 1;
    }
    if (judgment.isHardNegative === true && goldenHumanJudgmentErrorsV1(judgment).length === 0) hardNegativeCount += 1;
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
  inputChecksum: `sha256:${createHash('sha256').update(inputBytes).digest('hex')}`,
  reportPath: path.relative(repoRoot, reportPath),
  judgmentValidationScope: 'DECLARED_HUMAN_METADATA_NOT_REVIEWER_AUTHENTICATION_OR_SOURCE_AUTHORITY',
  queryCount: rows.length,
  judgmentCount,
  completedJudgmentCount,
  blankJudgmentCount,
  invalidJudgmentCount,
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
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify(report));
