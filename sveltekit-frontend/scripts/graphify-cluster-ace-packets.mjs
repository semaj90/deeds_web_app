#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { eq } from 'drizzle-orm';
import {
  buildClusterAcePacket,
  clusterAcePacketToAtlasPacketInsert,
  hashClusterAcePacketProjection,
  ClusterSummaryRecordSchema,
} from '../src/lib/server/ace/cluster-ace-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ROOT_ENV = resolve(REPO_ROOT, '..', '.env');
const REPORT_DIR = resolve(REPO_ROOT, 'docs', 'reports');
const REPORT_JSON = resolve(REPORT_DIR, 'cluster-ace-packet-assembly.json');
const REPORT_MD = resolve(REPORT_DIR, 'cluster-ace-packet-assembly.md');

dotenv.config({ path: ROOT_ENV, override: true });

let db;
let atlasPackets;
let closeConnections;

const {
  WORKSPACE_REVISION,
  REPOSITORY_REVISION,
  SOURCE_REVISION,
  GRAPH_REVISION,
} = process.env;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = args.includes('--dry-run') || !APPLY;
const LIMIT = Number.parseInt(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const CLUSTER_ID = args.find((arg) => arg.startsWith('--cluster-id='))?.split('=')[1] ?? '';
const REDIS_URL = process.env.VALKEY_URL ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.VALKEY_PASSWORD ?? process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const REDIS_TTL_SECONDS = 6 * 60 * 60;
const CENTROIDS_KEY = 'gpu:autoencoder:centroids_64';
const CLUSTER_SUMMARY_PATTERN = 'cluster:summary:*';

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function getWorkspaceRevision() {
  return String(WORKSPACE_REVISION || REPOSITORY_REVISION || 'workspace:parent-atlas').trim();
}

function getSourceRevision() {
  return String(SOURCE_REVISION || WORKSPACE_REVISION || REPOSITORY_REVISION || 'source:parent-atlas').trim();
}

function getGraphRevision() {
  return String(GRAPH_REVISION || WORKSPACE_REVISION || REPOSITORY_REVISION || 'graph:parent-atlas').trim();
}

function normalizeValkeyUrl(rawUrl, password) {
  const raw = String(rawUrl ?? '').trim();
  if (!raw) return 'redis://127.0.0.1:6379';
  try {
    const parsed = new URL(raw);
    if (password && !parsed.password) {
      parsed.password = password;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashProjection(value) {
  return sha256(stableStringify(value));
}

function extractCanonicalProjection(record) {
  if (!record || typeof record !== 'object') return null;
  const wrapper = record;
  const canonicalProjection =
    wrapper.canonicalProjection ??
    wrapper.canonical_projection ??
    wrapper.metadata?.canonicalProjection ??
    wrapper.metadata?.canonical_projection ??
    wrapper.payload?.canonicalProjection ??
    wrapper.payload?.canonical_projection ??
    null;
  if (!canonicalProjection || typeof canonicalProjection !== 'object') return null;
  return canonicalProjection;
}

function summarizePacketStatus({ schemaOk, pgOk, cacheOk, compareOk }) {
  return {
    schema: schemaOk,
    postgres: pgOk,
    valkey: cacheOk,
    compare: compareOk,
    pass: schemaOk && pgOk && cacheOk && compareOk,
  };
}

async function scanClusterSummaries(redis) {
  const keys = [];
  let cursor = '0';
  do {
    // eslint-disable-next-line no-await-in-loop
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', CLUSTER_SUMMARY_PATTERN, 'COUNT', 200);
    cursor = nextCursor;
    if (Array.isArray(batch)) keys.push(...batch);
  } while (cursor !== '0');

  return keys.sort((a, b) => {
    const aMatch = Number(a.replace('cluster:summary:', ''));
    const bMatch = Number(b.replace('cluster:summary:', ''));
    return aMatch - bMatch;
  });
}

async function loadSummaryRecord(redis, clusterSummaryKey) {
  const raw = await redis.get(clusterSummaryKey);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return ClusterSummaryRecordSchema.parse(parsed);
}

function toClusterSummaryInput({ clusterSummaryKey, summaryRecord, workspaceRevision, sourceRevision, graphRevision }) {
  return {
    clusterSummaryKey,
    summaryRecord,
    workspaceRevision,
    sourceRevision,
    graphRevision,
    representationRevision: 1,
    representationId: 'semantic_768',
    centroidKey: CENTROIDS_KEY,
  };
}

async function persistClusterPacket(packet) {
  const insert = clusterAcePacketToAtlasPacketInsert(packet);
  await db.transaction(async (tx) => {
    await tx
      .insert(atlasPackets)
      .values(insert)
      .onConflictDoUpdate({
        target: atlasPackets.packetKey,
        set: {
          ...insert,
          updatedAt: new Date(packet.created_at),
        },
      });
  });
}

async function readBackClusterPacket(packetKey) {
  const rows = await db
    .select()
    .from(atlasPackets)
    .where(eq(atlasPackets.packetKey, packetKey))
    .limit(1);
  return rows[0] ?? null;
}

async function warmClusterPacket(redis, packet) {
  const canonicalProjection = packet.metadata?.canonicalProjection ?? packet.payload?.canonicalProjection ?? packet.metadata;
  const payload = {
    canonicalProjection,
    canonicalHash: packet.canonical_hash,
    packetKey: packet.packet_key,
    packetId: packet.packet_id,
    sourceRef: packet.source_ref,
    featureId: packet.feature_id,
    summaryKey: packet.summary_key,
    warmedAt: new Date().toISOString(),
  };
  await redis.set(`ace:packet:${packet.packet_key}`, JSON.stringify(payload), 'EX', REDIS_TTL_SECONDS);
}

async function readBackClusterCache(redis, packetKey) {
  const raw = await redis.get(`ace:packet:${packetKey}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const workspaceRevision = getWorkspaceRevision();
  const sourceRevision = getSourceRevision();
  const graphRevision = getGraphRevision();
  const redisUrl = normalizeValkeyUrl(REDIS_URL, REDIS_PASSWORD);
  ({ db, closeConnections } = await import('../src/lib/server/db/client.js'));
  ({ atlasPackets } = await import('../src/lib/server/db/schema/atlas-packets.js'));
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    family: 4,
  });

  console.log('=== Cluster ACE Packet Materializer ===');
  console.log(`[mode] ${APPLY ? 'apply' : 'dry-run'}`);
  console.log(`[redis] ${redisUrl}`);
  console.log(`[workspaceRevision] ${workspaceRevision}`);
  console.log(`[sourceRevision] ${sourceRevision}`);
  console.log(`[graphRevision] ${graphRevision}`);
  console.log(`[centroids] ${CENTROIDS_KEY}`);

  await redis.connect();
  const pong = await redis.ping();
  if (pong !== 'PONG') {
    throw new Error(`Redis ping failed: ${pong}`);
  }

  const keys = await scanClusterSummaries(redis);
  const limitedKeys = CLUSTER_ID
    ? keys.filter((key) => key.endsWith(String(CLUSTER_ID)))
    : keys.slice(0, LIMIT > 0 ? LIMIT : keys.length);

  console.log(`[input] ${limitedKeys.length} cluster summary key(s)`);

  const results = [];
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const clusterSummaryKey of limitedKeys) {
    const clusterId = Number(clusterSummaryKey.replace('cluster:summary:', ''));
    const summaryRecord = await loadSummaryRecord(redis, clusterSummaryKey);

    if (!summaryRecord) {
      failed += 1;
      results.push({
        clusterId,
        clusterSummaryKey,
        status: 'FAIL',
        reason: 'summary_missing',
      });
      continue;
    }

    const input = toClusterSummaryInput({
      clusterSummaryKey,
      summaryRecord,
      workspaceRevision,
      sourceRevision,
      graphRevision,
    });

    const built = buildClusterAcePacket(input);
    const packet = built.packet;
    const canonicalHash = built.canonicalHash;
    const schemaOk = packet.schemaVersion === 'ace.cluster.packet.v1' && packet.packet_key === packet.packet_id;

    if (!APPLY) {
      skipped += 1;
      results.push({
        clusterId,
        clusterSummaryKey,
        packetKey: packet.packet_key,
        canonicalHash,
        status: 'DRY_RUN',
        schema: schemaOk ? 'PASS' : 'FAIL',
      });
      continue;
    }

    try {
      await persistClusterPacket(packet);
      const pgRow = await readBackClusterPacket(packet.packet_key);
      const pgProjection = extractCanonicalProjection(pgRow);
      const pgHash = pgProjection ? hashProjection(pgProjection) : null;

      await warmClusterPacket(redis, packet);
      const cacheRow = await readBackClusterCache(redis, packet.packet_key);
      const cacheProjection = extractCanonicalProjection(cacheRow);
      const cacheHash = cacheProjection ? hashProjection(cacheProjection) : null;

      const compareOk = canonicalHash === pgHash && canonicalHash === cacheHash;
      const status = summarizePacketStatus({
        schemaOk,
        pgOk: !!pgProjection,
        cacheOk: !!cacheProjection,
        compareOk,
      });

      if (status.pass) {
        written += 1;
      } else {
        failed += 1;
      }

      results.push({
        clusterId,
        clusterSummaryKey,
        packetKey: packet.packet_key,
        canonicalHash,
        postgresHash: pgHash,
        cacheHash,
        ...status,
      });
    } catch (error) {
      failed += 1;
      results.push({
        clusterId,
        clusterSummaryKey,
        packetKey: packet.packet_key,
        canonicalHash,
        status: 'FAIL',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    workspaceRevision,
    sourceRevision,
    graphRevision,
    centroidsKey: CENTROIDS_KEY,
    sourcePattern: CLUSTER_SUMMARY_PATTERN,
    totalKeys: keys.length,
    requested: limitedKeys.length,
    written,
    skipped,
    failed,
    results,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    REPORT_MD,
    [
      '# Cluster ACE Packet Materialization',
      '',
      `- mode: ${report.mode}`,
      `- workspaceRevision: ${workspaceRevision}`,
      `- sourceRevision: ${sourceRevision}`,
      `- graphRevision: ${graphRevision}`,
      `- centroidsKey: ${CENTROIDS_KEY}`,
      `- totalKeys: ${keys.length}`,
      `- requested: ${limitedKeys.length}`,
      `- written: ${written}`,
      `- skipped: ${skipped}`,
      `- failed: ${failed}`,
      '',
      '## Results',
      '',
      ...results.map((entry) => `- cluster ${entry.clusterId}: ${entry.status}${entry.pass ? ' PASS' : ''} (${entry.packetKey ?? 'no packet'})`),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify(report, null, 2));

  await redis.quit().catch(() => {});
  await closeConnections?.().catch(() => {});

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    console.error('[fatal]', error);
    process.exit(1);
  });
