#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  ensureDir,
  quantizeInt4,
  resolveTurboVec4BitConfig,
  round,
  scrollQdrantVectors,
  ensureTurboVecSidecar,
  uploadTurboVecIndex,
} from './lib/turbovec-4bit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(APP_ROOT, '.tmp', 'turbovec');
const REPORTS_DIR = path.join(APP_ROOT, 'docs', 'reports');

loadAtlasEnv(APP_ROOT);
ensureDir(TMP_DIR);
ensureDir(REPORTS_DIR);

const config = resolveTurboVec4BitConfig({
  ...process.env,
  CODEBASE_QDRANT_COLLECTION: 'codebase_chunks_768',
  TURBOVEC_DIMENSION: '768',
  TURBOVEC_VECTOR_NAME: 'content',
});
const LOG_PREFIX = '[turbovec-768-4bit]';
const SEMANTIC_PROFILE = 'ast-aware lexical langextract';
const SOURCE_MODEL_PATH = path.resolve(APP_ROOT, '..', 'models', 'hfor', 'hforf.gguf');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? config.limit));
const REPORT_JSON = path.join(REPORTS_DIR, 'turbovec-768-4bit-build-report.json');
const REPORT_MD = path.join(REPORTS_DIR, 'turbovec-768-4bit-build-report.md');
const MANIFEST_JSON = path.join(TMP_DIR, 'turbovec-768-4bit-index-manifest.json');

function renderMarkdown(report) {
  return [
    '# TurboVec 768 4-bit Build Report',
    '',
    `- Collection: ${report.collection}`,
    `- Vector name: ${report.vectorName}`,
    `- Dimension: ${report.dimension}`,
    `- Semantic profile: ${report.semanticProfile}`,
    `- Source model path: ${report.sourceModelPath}`,
    `- Bits: ${report.bits}`,
    `- Points requested: ${report.pointsRequested}`,
    `- Points accepted: ${report.pointsAccepted}`,
    `- Points rejected: ${report.pointsRejected}`,
    `- Duration ms: ${report.durationMs}`,
    `- Build URL: ${report.buildUrl}`,
    `- Mode: ${report.status}`,
    `- Manifest: ${report.manifestFile}`,
  ].join('\n');
}

async function main() {
  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} building index from ${config.collection}`);
  console.log(`${LOG_PREFIX} limit=${LIMIT} dim=${config.dimension} bits=${config.bits} dryRun=${DRY_RUN}`);

  const points = await scrollQdrantVectors({
    collection: config.collection,
    vectorName: config.vectorName,
    limit: LIMIT,
    withPayload: true,
  });

  const accepted = [];
  const rejected = [];
  for (const point of points) {
    if (!(point.vector instanceof Float32Array)) {
      rejected.push({ id: point.id, reason: 'missing_vector' });
      continue;
    }
    if (point.vector.length !== config.dimension) {
      rejected.push({ id: point.id, reason: `dimension_${point.vector.length}` });
      continue;
    }

    const preview = quantizeInt4(point.vector);
    accepted.push({
      id: point.id,
      vector: point.vector,
      payload: point.payload,
      quantization: {
        scale: round(preview.scale),
        maxAbs: round(preview.maxAbs),
        packedBytes: preview.packed.length,
        packedPreview: Buffer.from(preview.packed.slice(0, 24)).toString('base64'),
      },
    });
  }

  if (!accepted.length) {
    throw new Error('No Qdrant vectors matched the requested dimension');
  }

  const manifest = {
    schemaVersion: 'atlas.turbovec.index.v1',
    generatedAt: new Date().toISOString(),
    collection: config.collection,
    vectorName: config.vectorName,
    dimension: config.dimension,
    bits: config.bits,
    semanticProfile: SEMANTIC_PROFILE,
    sourceModelPath: SOURCE_MODEL_PATH,
    buildUrl: config.buildUrl,
    buildPort: config.buildPort,
    pointsRequested: LIMIT,
    pointsScrolled: points.length,
    pointsAccepted: accepted.length,
    pointsRejected: rejected.length,
    rejectedSample: rejected.slice(0, 20),
    accepted: accepted.map((entry) => ({
      id: entry.id,
      scale: entry.quantization.scale,
      maxAbs: entry.quantization.maxAbs,
      packedBytes: entry.quantization.packedBytes,
      payload: {
        packet_key: entry.payload?.packet_key ?? null,
        source_ref: entry.payload?.source_ref ?? null,
        title_id: entry.payload?.title_id ?? null,
        feature_id: entry.payload?.feature_id ?? null,
      },
    })),
    status: DRY_RUN ? 'DRY_RUN' : 'READY',
  };

  writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2));

  let upload = null;
  if (!DRY_RUN) {
    const sidecar = await ensureTurboVecSidecar({
      buildUrl: config.buildUrl,
      buildPort: config.buildPort,
      pythonExe: config.pythonExe,
      pythonScript: config.pythonScript,
      collection: config.collection,
      dimension: config.dimension,
      bits: config.bits,
      logPrefix: LOG_PREFIX,
    });
    upload = await uploadTurboVecIndex({ buildUrl: sidecar.url, vectors: accepted });
    manifest.upload = {
      url: sidecar.url,
      started: sidecar.started,
      health: sidecar.health,
      response: upload,
    };
  }

  const durationMs = Date.now() - startedAt;
  const report = {
    ...manifest,
    durationMs,
    upload,
    manifestFile: MANIFEST_JSON,
    reportFile: REPORT_JSON,
  };

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(REPORT_MD, renderMarkdown(report));

  console.log(`${LOG_PREFIX} accepted=${accepted.length} rejected=${rejected.length} durationMs=${durationMs}`);
  console.log(`${LOG_PREFIX} manifest=${MANIFEST_JSON}`);
  console.log(`${LOG_PREFIX} report=${REPORT_JSON}`);
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} failed: ${error?.message ?? error}`);
  process.exit(1);
});

