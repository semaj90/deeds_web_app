#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = process.cwd();
const outputPath = path.resolve(root, 'docs/reports/okf-gap-recommendations-v1.json');
const conceptsDir = path.resolve(root, '.okf/concepts');
const requireFromFrontend = createRequire(path.resolve(root, 'sveltekit-frontend/package.json'));
const { parse: parseYaml } = requireFromFrontend('yaml');

const sha = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const files = fs.existsSync(conceptsDir)
  ? fs.readdirSync(conceptsDir).filter((name) => name.endsWith('.yaml')).sort()
  : [];

const concepts = files.map((name) => ({ name, value: parseYaml(fs.readFileSync(path.join(conceptsDir, name), 'utf8')) }));
const records = concepts.map(({ name, value }) => {
  const gapId = String(value.gap_id);
  const evidence = Array.isArray(value.evidence) ? value.evidence.map((item) => item?.ref).filter(Boolean) : [];
  const issueId = `okf-issue:${gapId}`;
  const issue = {
    issueId,
    gapId,
    title: String(value.title),
    status: 'REVIEW_ONLY',
    owner: String(value.owner),
    sourceConcept: `.okf/concepts/${name}`,
    evidenceRefs: evidence,
    sourceStatus: String(value.status),
    writesPerformed: false,
  };
  const recommendation = {
    recommendationId: `okf-recommendation:${gapId}`,
    issueId,
    category: 'OKF_GROUNDED_KNOWLEDGE_GAP',
    action: 'REVIEW_AND_DEFINE_OWNER_CONTRACT',
    acceptanceGates: ['EVIDENCE_OWNER_RECONCILED', 'REVISION_BOUND_READBACK', 'OPERATOR_APPROVAL_REQUIRED'],
    prohibitedMutations: ['canonical_postgres_rows', 'qdrant_projection', 'valkey_cache', 'graphify_state', 'source_data'],
    evidenceRefs: evidence,
    confidence: evidence.length > 0 ? 1 : 0,
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false,
  };
  return { issue, recommendation, recordChecksum: sha(JSON.stringify({ issue, recommendation })) };
});

const report = {
  schema: 'atlas.okf-gap-recommendations.v1',
  status: records.length === 6 && records.every(({ issue, recommendation }) => issue.evidenceRefs.length > 0 && recommendation.evidenceRefs.length > 0)
    ? 'OKF_GAP_RECOMMENDATIONS_DERIVED'
    : 'OKF_GAP_RECOMMENDATIONS_REVIEW_REQUIRED',
  generatedAt: new Date().toISOString(),
  source: { directory: '.okf/concepts', conceptCount: concepts.length },
  records,
  delivery: { createdKanbanTasks: false, createdRecommendations: false, operatorReviewRequired: true },
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outputPath.replace(/\.json$/i, '.md'), [
  '# OKF gap recommendations', '', `Status: ${report.status}`, `Concepts: ${concepts.length}`, '',
  ...records.map(({ issue, recommendation }) => `- ${issue.issueId}: ${issue.title} — ${recommendation.action} — REVIEW_ONLY`),
  '', 'No Kanban, database, cache, vector, graph, or source mutation was performed.', '',
].join('\n'));
console.log(JSON.stringify({ schema: report.schema, status: report.status, records: records.length, createdKanbanTasks: false, writesPerformed: false, output: path.relative(root, outputPath) }, null, 2));
