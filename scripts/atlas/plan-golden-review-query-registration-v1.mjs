#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const inputPath = path.resolve(root, '.tmp/atlas/golden-relevance-review-pool-v1.ndjson');
const outputPath = path.resolve(root, '.tmp/atlas/golden-review-query-registration-plan-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/golden-review-query-registration-plan-v1.json');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rows = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const plan = rows.map((row) => ({
  schema: 'atlas.golden-review-query-registration-plan-item.v1',
  registrationStatus: 'PROPOSED_REVIEW_REQUIRED',
  proposedEvaluationQueryKey: `golden-review:${digest(`${row.queryPacketKey}|${row.querySourceRef}|${row.queryText}`)}`,
  queryPacketKey: row.queryPacketKey,
  querySourceRef: row.querySourceRef,
  queryText: row.queryText,
  domain: null,
  difficulty: null,
  expectedCount: null,
  evaluationQueryId: null,
  sourceRevision: null,
  candidateSnapshotRevision: null,
  ordinalMapChecksum: null,
  reviewerId: null,
  approvalStatus: 'PENDING',
}));

const serialized = plan.map((row) => JSON.stringify(row)).join('\n') + (plan.length ? '\n' : '');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(outputPath, serialized, 'utf8');
const report = {
  schema: 'atlas.golden-review-query-registration-plan-v1',
  status: 'REGISTRATION_PLAN_PREPARED',
  canonicalAuthority: false,
  sourceQueue: path.relative(root, inputPath),
  proposedRows: plan.length,
  assignedEvaluationQueryIds: 0,
  databaseWrites: false,
  approvalRequired: true,
  outputPath: path.relative(root, outputPath),
  outputChecksum: `sha256:${digest(serialized)}`,
  nextRequiredStep: 'Review query text/source identity and explicitly approve registrations before any database insert.',
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
