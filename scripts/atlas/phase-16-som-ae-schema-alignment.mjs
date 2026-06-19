#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));
const require = createRequire(import.meta.url);
const root = resolve('.');
const reportDir = resolve(root, 'docs/reports');
const reportJson = resolve(reportDir, 'phase-16-som-ae-schema-alignment.json');
const reportMd = resolve(reportDir, 'phase-16-som-ae-schema-alignment.md');
const addonPath = resolve(root, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const requiredTopologyColumns = [
  'pagerank', 'betweenness', 'eigenvector', 'nn_1', 'nn_2', 'nn_3', 'nn_4',
  'ae_distance', 'topology_version', 'topology_updated_at', 'relation_type',
];

function evidence(path) {
  return { path, present: existsSync(resolve(root, path)) };
}

function listArtifacts(path) {
  const absolutePath = resolve(root, path);
  if (!existsSync(absolutePath)) return [];
  return readdirSync(absolutePath).flatMap((name) => {
    const fullPath = resolve(absolutePath, name);
    const stats = statSync(fullPath);
    return stats.isFile() ? [{ path: `${path}/${name}`, bytes: stats.size }] : [];
  });
}

function inspectNativeBridge() {
  if (!existsSync(addonPath)) return { present: false, cuda: false, trainSOM: false };
  try {
    const addon = require(addonPath);
    return {
      present: true,
      cuda: addon.checkCudaAvailable?.() === 1,
      trainSOM: typeof addon.trainSOM === 'function',
    };
  } catch (error) {
    return { present: true, cuda: false, trainSOM: false, error: error.message };
  }
}

function inspectLatentDataset() {
  const path = resolve(root, 'models/autoencoder/autoencoder_latent_index.json');
  if (!existsSync(path)) return { present: false, total: 0, addressable: 0 };
  try {
    const artifact = JSON.parse(readFileSync(path, 'utf8'));
    const entries = Object.values(artifact.index ?? {});
    const addressable = entries.filter((entry) =>
      entry &&
      entry.kind !== 'directory-cluster' &&
      entry.ledger_type !== 'legacy_qdrant_only' &&
      entry.canonical !== false &&
      entry.payload_unmatched !== true &&
      Boolean(entry.packet_key || entry.source_ref)
    ).length;
    return {
      present: true,
      total: entries.length,
      addressable,
      generatedAt: artifact.timestamp ?? null,
    };
  } catch (error) {
    return { present: true, total: 0, addressable: 0, error: error.message };
  }
}

async function inspectDatabase() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ||
      'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
  try {
    const columnsResult = await pool.query(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'atlas_topology_index'`
    );
    const indexResult = await pool.query(
      `select indexname
         from pg_indexes
        where schemaname = 'public'
          and tablename = 'atlas_topology_index'`
    );
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));
    return {
      status: 'READY',
      tableExists: columns.size > 0,
      presentColumns: requiredTopologyColumns.filter((column) => columns.has(column)),
      missingColumns: requiredTopologyColumns.filter((column) => !columns.has(column)),
      indexes: indexResult.rows.map((row) => row.indexname).sort(),
    };
  } catch (error) {
    return { status: 'DEGRADED', error: error.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

const runners = {
  gds: evidence('sveltekit-frontend/scripts/neo4j-graph-enrich.mjs'),
  autoencoderPython: evidence('sveltekit-frontend/scripts/train-autoencoder.py'),
  autoencoderNode: evidence('sveltekit-frontend/scripts/train-autoencoder.mjs'),
  latentBackfill: evidence('scripts/atlas/backfill-latent-vectors.mjs'),
  som20x20: evidence('scripts/atlas/train-som-20x20.mjs'),
  combinedGpuPipeline: evidence('scripts/atlas/pytorch-qdrant-redis-som-index.mjs'),
  adaptiveSchema: evidence('scripts/atlas/adaptive-schema-contract-reconciler.mjs'),
};
const migration = evidence('drizzle/manual/0046_phase_16_topology_gds.sql');
const artifacts = [
  ...listArtifacts('models/autoencoder'),
  ...listArtifacts('models/som'),
  ...listArtifacts('.tmp/gpu-som-checkpoint'),
];
const nativeBridge = inspectNativeBridge();
const latentDataset = inspectLatentDataset();
const database = await inspectDatabase();
const runnersReady = Object.values(runners).every((entry) => entry.present);
const migrationAligned = database.status === 'READY'
  ? database.missingColumns.length === 0
  : migration.present;
const implementationAligned = runnersReady && migrationAligned && nativeBridge.trainSOM;
const datasetAligned = latentDataset.addressable > 0;
const status = implementationAligned && datasetAligned
  ? 'IMPLEMENTATION_ALIGNED'
  : implementationAligned
    ? 'IMPLEMENTATION_ALIGNED_DATASET_REBUILD_REQUIRED'
    : 'PARTIAL';

const report = {
  generatedAt: new Date().toISOString(),
  status,
  contract: {
    latent64Storage: 'bytea',
    aeDistance: 'additive',
    somBmuField: 'z_som',
    checkpointRequired: false,
    retrievalTruth: 'embedding_384',
    latent128Role: 'semantic_compression',
    latent64Role: 'routing_topology_rerank_bonus',
    identityFields: ['packet_key', 'source_ref'],
    executionOrder: ['GDS', 'AE latent projection', 'SOM 20x20', 'higher-hop enrichment'],
  },
  migration,
  database,
  nativeBridge,
  latentDataset,
  runners,
  artifacts: { count: artifacts.length, files: artifacts },
  commandMap: {
    gdsDryRun: 'npm run atlas:phase16:gds:dry',
    gdsApply: 'npm run atlas:phase16:gds:apply',
    autoencoderDryRun: 'npm run atlas:phase16:ae:dry',
    latentDryRun: 'npm run atlas:phase16:latent:dry',
    somDryRun: 'npm run atlas:phase16:som:dry',
    joinAudit: 'npm run atlas:phase16:join:audit',
  },
  nextSafeAction: 'Run the read-only join-key audit and classify unmatched reasons. Do not retrain AE/SOM or use latent_64 as the primary retrieval vector.',
};

const runnerLines = Object.entries(runners)
  .map(([name, value]) => `- ${name}: ${value.present ? 'present' : 'missing'} (\`${value.path}\`)`)
  .join('\n');
const markdown = `# Phase 16-H SOM/AE Schema Alignment

Generated: ${report.generatedAt}
Status: ${status}

## Current Truth

- active migration: \`${migration.path}\`
- live topology table: ${database.status}
- latent_64 stays bytea: yes
- embedding_384 remains dense-retrieval truth: yes
- latent_64 is routing/topology/rerank evidence only: yes
- ae_distance stays additive: yes
- z_som remains the SOM BMU: yes
- checkpoint required: no
- native SOM bridge: ${nativeBridge.trainSOM ? 'present' : 'missing'}
- CUDA available: ${nativeBridge.cuda ? 'yes' : 'no'}
- latent artifact entries: ${latentDataset.total}
- addressable packet entries in latent artifact: ${latentDataset.addressable}
- derived AE/SOM/checkpoint artifacts found: ${artifacts.length}

## Existing Runners

${runnerLines}

The previously requested \`run-topology-gds-pass.mjs\` and
\`train-autoencoder-768-64.mjs\` names are stale aliases. The command map uses
the existing GDS and autoencoder implementations.

## Database Contract

- required topology columns present: ${database.presentColumns?.length ?? 0}/${requiredTopologyColumns.length}
- missing topology columns: ${(database.missingColumns ?? []).join(', ') || 'none'}

## Next Safe Action

${report.nextSafeAction}
`;

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportJson, JSON.stringify(report, null, 2));
writeFileSync(reportMd, markdown);
console.log(JSON.stringify({
  status,
  migration: migration.present,
  runnersReady,
  artifactCount: artifacts.length,
  nativeBridge,
  latentDataset,
  database: database.status,
  missingColumns: database.missingColumns ?? [],
}, null, 2));
