#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  ensureDir,
  resolveTurboVec4BitConfig,
  fetchQdrantVectorsByIds,
  cosineSimilarity,
  topKRankCorrelation,
  probeTurboVecHealth,
  round,
} from './lib/turbovec-4bit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(APP_ROOT, 'docs', 'reports');

loadAtlasEnv(APP_ROOT);
ensureDir(REPORTS_DIR);

const config = resolveTurboVec4BitConfig(process.env);
const ARTIFACT = String(
  process.argv.find((arg) => arg.startsWith('--artifact='))?.split('=')[1] ??
  path.join(REPORTS_DIR, 'turbovec-384-4bit-build-report.json')
);
const SAMPLE_COUNT = Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--samples='))?.split('=')[1] ?? 32));
const TOP_K = Math.max(5, Number(process.argv.find((arg) => arg.startsWith('--top-k='))?.split('=')[1] ?? 25));
const CANDIDATE_LIMIT = Math.max(TOP_K, Number(process.argv.find((arg) => arg.startsWith('--candidate-limit='))?.split('=')[1] ?? 1000));
const MIN_SPEARMAN = Number(process.argv.find((arg) => arg.startsWith('--min-spearman='))?.split('=')[1] ?? 0.85);
const REPORT_JSON = path.join(REPORTS_DIR, 'turbovec-384-4bit-quality-report.json');
const REPORT_MD = path.join(REPORTS_DIR, 'turbovec-384-4bit-quality-report.md');

function readArtifact(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function renderMarkdown(report) {
  return [
    '# TurboVec 384 4-bit Quality Report',
    '',
    `- Artifact: ${report.artifact}`,
    `- Collection: ${report.collection}`,
    `- Vector name: ${report.vectorName}`,
    `- Dimension: ${report.dimension}`,
    `- Bits: ${report.bits}`,
    `- Query samples: ${report.sampleCount}`,
    `- Candidate limit: ${report.candidateLimit}`,
    `- Top K: ${report.topK}`,
    `- Mean Spearman: ${report.meanSpearman}`,
    `- Median Spearman: ${report.medianSpearman}`,
    `- Min Spearman: ${report.minSpearman}`,
    `- Mean overlap: ${report.meanOverlap}`,
    `- Threshold: ${report.minSpearmanThreshold}`,
    `- Verdict: ${report.passed ? 'PASS' : 'FAIL'}`,
  ].join('\n');
}

function rankExactCandidates(queryVector, candidates) {
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      score: cosineSimilarity(queryVector, candidate.vector),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, TOP_K)
    .map((entry) => entry.id);
}

async function rankTurboCandidates(queryVector) {
  const response = await fetch(`${config.buildUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: Array.from(queryVector), k: TOP_K }),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`TurboVec search HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  return (Array.isArray(data?.ids) ? data.ids : [])
    .map((id) => String(id))
    .slice(0, TOP_K);
}

async function main() {
  const artifact = readArtifact(ARTIFACT);
  const buildIds = Array.isArray(artifact.accepted) ? artifact.accepted.map((entry) => String(entry.id)) : [];
  if (!buildIds.length) {
    throw new Error(`Artifact does not contain accepted ids: ${ARTIFACT}`);
  }

  const health = await probeTurboVecHealth(config.buildUrl);
  if (!health?.ok) {
    throw new Error(`TurboVec sidecar unhealthy at ${config.buildUrl}`);
  }
  if (Number(health.dim) !== Number(config.dimension)) {
    throw new Error(`TurboVec dimension mismatch: expected ${config.dimension}, got ${health.dim}`);
  }
  if (Number(health.bits) !== Number(config.bits)) {
    throw new Error(`TurboVec bit width mismatch: expected ${config.bits}, got ${health.bits}`);
  }

  const candidatePoints = await fetchQdrantVectorsByIds({
    collection: config.collection,
    ids: buildIds.slice(0, CANDIDATE_LIMIT),
    vectorName: config.vectorName,
  });
  if (!candidatePoints.length) {
    throw new Error(`No Qdrant candidate vectors found for artifact ids in ${config.collection}`);
  }

  const queryPoints = candidatePoints.slice(0, Math.min(SAMPLE_COUNT, candidatePoints.length));
  const queryResults = [];
  const correlations = [];
  const overlaps = [];

  for (const queryPoint of queryPoints) {
    const exactTopK = rankExactCandidates(queryPoint.vector, candidatePoints);
    const turboTopK = await rankTurboCandidates(queryPoint.vector);
    const stats = topKRankCorrelation(exactTopK, turboTopK, TOP_K);

    correlations.push(stats.rho);
    overlaps.push(stats.overlap);
    queryResults.push({
      queryId: queryPoint.id,
      exactTopK,
      turboTopK,
      spearman: round(stats.rho, 4),
      overlap: stats.overlap,
      universeSize: stats.universeSize,
    });
  }

  const mean = correlations.reduce((sum, value) => sum + value, 0) / correlations.length;
  const sorted = [...correlations].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const min = Math.min(...correlations);
  const meanOverlap = overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;

  const report = {
    schemaVersion: 'atlas.turbovec.index.quality.v1',
    generatedAt: new Date().toISOString(),
    artifact: ARTIFACT,
    collection: config.collection,
    vectorName: config.vectorName,
    dimension: config.dimension,
    bits: config.bits,
    buildUrl: config.buildUrl,
    sampleCount: queryResults.length,
    candidateLimit: candidatePoints.length,
    topK: TOP_K,
    meanSpearman: round(mean, 4),
    medianSpearman: round(median, 4),
    minSpearman: round(min, 4),
    meanOverlap: round(meanOverlap, 2),
    minSpearmanThreshold: MIN_SPEARMAN,
    passed: mean >= MIN_SPEARMAN,
    queryResults,
  };

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(REPORT_MD, renderMarkdown(report));

  console.log(`[turbovec-384-4bit] queries=${queryResults.length} candidates=${candidatePoints.length} topK=${TOP_K}`);
  console.log(`[turbovec-384-4bit] meanSpearman=${report.meanSpearman} medianSpearman=${report.medianSpearman} minSpearman=${report.minSpearman}`);
  console.log(`[turbovec-384-4bit] report=${REPORT_JSON}`);

  if (!report.passed) {
    throw new Error(`Mean Spearman ${report.meanSpearman} below threshold ${MIN_SPEARMAN}`);
  }
}

main().catch((error) => {
  console.error(`[turbovec-384-4bit] failed: ${error?.message ?? error}`);
  process.exit(1);
});
