#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = process.cwd();
const repoRoot = join(appRoot, '..');

function readTextIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

function hasAll(text, parts) {
  if (!text) return false;
  return parts.every((p) => text.includes(p));
}

function loadJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileCheck(relPath, contains = []) {
  const abs = join(appRoot, relPath);
  const src = readTextIfExists(abs);
  return {
    path: relPath,
    exists: Boolean(src),
    contains: contains.length > 0 ? hasAll(src, contains) : null,
  };
}

function repoFileCheck(relPath, contains = []) {
  const abs = join(repoRoot, relPath);
  const src = readTextIfExists(abs);
  return {
    path: relPath,
    exists: Boolean(src),
    contains: contains.length > 0 ? hasAll(src, contains) : null,
  };
}

function main() {
  const packageJsonPath = join(appRoot, 'package.json');
  const packageJson = loadJson(packageJsonPath) ?? {};
  const scripts = packageJson.scripts ?? {};

  const dagBuilder = repoFileCheck('scripts/atlas/build-error-fix-dag.mjs', [
    'HMM_STATES',
    'kagRecall',
    'ace:fixer:patterns',
    'schema_mismatch',
    'route_contract_mismatch',
  ]);

  const dagReportJson = loadJson(join(repoRoot, 'docs/reports/error-fix-dag-report.json'));
  const dagGraphJson = loadJson(join(repoRoot, 'docs/graph/contract-error-map.json'));

  const runtimeWiring = {
    acePayloadSelector: fileCheck('src/lib/server/ace/ace-payload-selector.ts', [
      'HmmErrorClass',
      'hmmErrorRisk',
      'selectAcePayload',
    ]),
    rankingFeatures: fileCheck('src/lib/server/retrieval/ranking-features.ts', [
      'hmm_error_risk',
      'errorRiskScore',
      'extractRankingFeatures',
    ]),
    boostedReranker: fileCheck('src/lib/server/retrieval/boosted-reranker.ts', [
      'hmm_error_penalty',
      'REDIS_WEIGHTS_KEY',
      'updateBoostWeights',
    ]),
  };

  const redisLoggerStubs = {
    hmmWikiLogger: fileCheck('src/lib/server/ace/hmm-wiki-logger.ts', [
      'wiki:note:hmm:',
      'getRedis',
      'setex',
      'scanHMMNotes',
    ]),
    errorBrainRedisTransport: fileCheck('src/lib/server/error-brain/transport/redis.ts', [
      'error-brain:events',
      'publish(',
      'subscribe(',
    ]),
    queryLoggerJsonl: fileCheck('src/lib/server/training/query-logger.ts', [
      'query-training-data.jsonl',
      'appendFile',
      'logToolUsage',
    ]),
  };

  const scriptsCheck = {
    hasAuditErrorDag: typeof scripts['audit:error-dag'] === 'string',
    hasHmmLoopAudit: typeof scripts['audit:hmm-error-loop'] === 'string',
    hasHmmLoopFull: typeof scripts['audit:hmm-error-loop:full'] === 'string',
    hasInferenceObservability: typeof scripts['audit:inference-observability'] === 'string',
  };

  const criticalChecks = [
    dagBuilder.exists,
    dagBuilder.contains === true,
    runtimeWiring.acePayloadSelector.exists,
    runtimeWiring.rankingFeatures.exists,
    runtimeWiring.boostedReranker.exists,
    redisLoggerStubs.hmmWikiLogger.exists,
    redisLoggerStubs.errorBrainRedisTransport.exists,
    scriptsCheck.hasAuditErrorDag,
  ];

  const result = {
    ok: criticalChecks.every(Boolean),
    summary: {
      hmmErrorLoopWired: runtimeWiring.acePayloadSelector.exists && runtimeWiring.rankingFeatures.exists && runtimeWiring.boostedReranker.exists,
      redisLoggerStubsReady: redisLoggerStubs.hmmWikiLogger.exists && redisLoggerStubs.errorBrainRedisTransport.exists,
      dagBuilderReady: dagBuilder.exists && dagBuilder.contains === true,
      dagArtifactsPresent: Boolean(dagReportJson) && Boolean(dagGraphJson),
      runTaskReady: scriptsCheck.hasHmmLoopAudit && scriptsCheck.hasHmmLoopFull,
    },
    checks: {
      scripts: scriptsCheck,
      dagBuilder,
      dagArtifacts: {
        reportJson: {
          path: 'docs/reports/error-fix-dag-report.json',
          exists: Boolean(dagReportJson),
          hasDagNodes: Boolean(dagReportJson && Array.isArray(dagReportJson.dagNodes)),
        },
        graphJson: {
          path: 'docs/graph/contract-error-map.json',
          exists: Boolean(dagGraphJson),
          hasNodes: Boolean(dagGraphJson && Array.isArray(dagGraphJson.nodes)),
          hasEdges: Boolean(dagGraphJson && Array.isArray(dagGraphJson.edges)),
        },
      },
      runtimeWiring,
      redisLoggerStubs,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) process.exit(1);
}

main();
