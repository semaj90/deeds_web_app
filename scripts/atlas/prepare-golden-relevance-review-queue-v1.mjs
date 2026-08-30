#!/usr/bin/env node

/**
 * Prepare a human/evaluator review queue from the structural proxy corpus.
 *
 * This is intentionally a file-only preparation step:
 * - it never writes PostgreSQL;
 * - it never assigns a relevance grade;
 * - proxy relationships are retained only as review candidates;
 * - reviewers must confirm, change, or reject every proposed candidate.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = process.cwd();
const inputPath = path.resolve(repoRoot, '.tmp/atlas/structural-proxy-golden-set-v1.ndjson');
const outputPath = path.resolve(repoRoot, '.tmp/atlas/golden-relevance-review-queue-v1.ndjson');
const reportPath = path.resolve(repoRoot, 'docs/reports/golden-relevance-review-queue-v1.json');
const sampleSize = Number(process.env.ATLAS_GOLDEN_REVIEW_SAMPLE ?? 60);
const seed = 684453;

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function stableSample(rows, limit) {
  return rows
    .map((row) => ({ row, key: sha256(`${seed}|${row.query_source_ref}|${row.query_packet_key}`) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, Math.max(0, limit))
    .map(({ row }) => row);
}

function readNdjson(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
      }
    });
}

if (!Number.isInteger(sampleSize) || sampleSize < 1) {
  throw new Error('ATLAS_GOLDEN_REVIEW_SAMPLE must be a positive integer');
}
if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing proxy corpus: ${inputPath}`);
}

const entries = readNdjson(inputPath);
const sampled = stableSample(entries, sampleSize);
const queue = [];

for (const entry of sampled) {
  const candidates = [...new Set(entry.relevant_packet_keys ?? [])].sort();
  queue.push({
    schema: 'atlas.golden-relevance-review-item.v1',
    reviewStatus: 'PENDING',
    queryPacketKey: entry.query_packet_key,
    evaluationQueryId: null,
    querySourceRef: entry.query_source_ref,
    queryText: entry.query_text,
    candidateSource: 'STRUCTURAL_PROXY_IMPORTERS',
    proxyCandidatePacketKeys: candidates,
    judgments: candidates.map((packetKey) => ({
      packetKey,
      relevanceGrade: null,
      confidence: null,
      judgmentSource: null,
      reviewerId: null,
      evidenceRefs: [],
      notes: null,
    })),
    reviewInstructions: {
      gradeScale: '0=irrelevant, 1=marginal, 2=relevant, 3=highly relevant',
      proxyIsNotTruth: true,
      addHardNegatives: true,
      requireRevisionBoundIdentity: true,
    },
  });
}

const serialized = queue.map((item) => JSON.stringify(item)).join('\n') + (queue.length ? '\n' : '');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(outputPath, serialized, 'utf8');

const report = {
  schema: 'atlas.golden-relevance-review-queue-v1',
  status: 'REVIEW_QUEUE_PREPARED',
  canonicalAuthority: false,
  inputPath: path.relative(repoRoot, inputPath),
  outputPath: path.relative(repoRoot, outputPath),
  sourceCorpusEntries: entries.length,
  sampledQueries: queue.length,
  proposedCandidateJudgments: queue.reduce((count, item) => count + item.judgments.length, 0),
  blankGrades: queue.reduce((count, item) => count + item.judgments.filter((j) => j.relevanceGrade === null).length, 0),
  hardNegativesIncluded: false,
  databaseWrites: false,
  productionActivation: false,
  inputChecksum: sha256(fs.readFileSync(inputPath)),
  outputChecksum: sha256(serialized),
  nextRequiredStep: 'Reviewer fills grades 0-3, confidence, identity, evidenceRefs, and hard negatives before import.',
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
