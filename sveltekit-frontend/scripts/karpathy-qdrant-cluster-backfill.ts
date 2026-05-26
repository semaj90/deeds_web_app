#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { buildKarpathyClusterBackfillRows } from '../src/lib/server/ace/karpathy-qdrant-cluster-backfill.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXPORT_PATH = resolve(ROOT, 'memory/exports/karpathy-publish-split.json');
const OUTPUT_DIR = resolve(ROOT, 'memory/exports');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const BATCH_SIZE = 100;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseNumberArg(args, '--limit', Infinity);
const POINT_LIMIT = parseNumberArg(args, '--point-limit', 500);

function parseNumberArg(argv, flag, fallback) {
  const eq = argv.find((value) => value.startsWith(`${flag}=`));
  if (eq) return Number(eq.slice(flag.length + 1));
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) return Number(argv[index + 1]);
  return fallback;
}

function ensureExportsDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadManifest() {
  const raw = readFileSync(EXPORT_PATH, 'utf8');
  return JSON.parse(raw) as {
    selectedClusters?: Array<{
      clusterKey: string;
      clusterId: number;
      hotness: number;
      summary: string;
      purpose: string;
      riskLevel: string;
      mitigationProtocols: string[];
      topTags: string[];
      topFiles: string[];
      topoClasses: string[];
      scalarSeed: number;
      metadataSummary: string;
      source: string;
    }>;
    generatedAt?: string;
  };
}

async function scrollPoints(filter, limit) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter,
      limit,
      with_vector: false,
      with_payload: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Scroll failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function patchPoints(pointIds, patch) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: pointIds, payload: patch }),
  });
  if (!res.ok) {
    throw new Error(`Patch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  if (!readFileSync || !EXPORT_PATH) {
    throw new Error('Publish-split manifest path is unavailable');
  }

  const manifest = loadManifest();
  const clusters = (manifest.selectedClusters ?? []).slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
  if (!clusters.length) {
    throw new Error(`No selected clusters found in ${EXPORT_PATH}`);
  }

  ensureExportsDir();
  const summaryPath = resolve(OUTPUT_DIR, 'karpathy-qdrant-cluster-backfill.json');
  const jsonlPath = resolve(OUTPUT_DIR, 'karpathy-qdrant-cluster-backfill.jsonl');
  const rows = buildKarpathyClusterBackfillRows(clusters);

  writeFileSync(summaryPath, JSON.stringify({
    generatedAt: manifest.generatedAt ?? new Date().toISOString(),
    sourceCount: clusters.length,
    qdrantCollection: COLLECTION,
    dryRun: DRY_RUN,
  }, null, 2));
  writeFileSync(jsonlPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  console.log(`[karpathy:qdrant-backfill] source=${clusters.length} collection=${COLLECTION}`);
  console.log(`[karpathy:qdrant-backfill] wrote ${summaryPath}`);
  console.log(`[karpathy:qdrant-backfill] wrote ${jsonlPath}`);

  if (DRY_RUN) {
    console.log('[karpathy:qdrant-backfill] dry-run only — Qdrant writes skipped');
    return;
  }

  let patched = 0;
  for (const row of rows) {
    const filters = {
      should: [
        { key: 'cluster_key', match: { value: row.clusterKey } },
        { key: 'neo4j_gpuCluster', match: { value: row.clusterId } },
        { key: 'som_cluster', match: { value: row.clusterId } },
      ],
    };
    const scroll = await scrollPoints(filters, POINT_LIMIT);
    const pointIds = (scroll.result?.points ?? []).map((point) => point.id);
    if (pointIds.length === 0) continue;

    for (let i = 0; i < pointIds.length; i += BATCH_SIZE) {
      const batch = pointIds.slice(i, i + BATCH_SIZE);
      await patchPoints(batch, row.patch);
      patched += batch.length;
    }
  }

  console.log(`[karpathy:qdrant-backfill] patched ${patched} points`);
}

main().catch((err) => {
  console.error('[karpathy:qdrant-backfill] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});

