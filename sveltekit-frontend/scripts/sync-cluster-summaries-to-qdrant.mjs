#!/usr/bin/env node
/**
 * Sync cluster_summaries (Postgres) → Qdrant `cluster_narratives` + Redis cache.
 *
 * Why:
 *   - Postgres cluster_summaries holds gemma4 narratives with summary_embedding
 *     (768-dim from embeddinggemma during summarisation), but they aren't
 *     reachable via vector search until pushed to Qdrant.
 *   - GraphifyViewer's cluster panel reads cluster_narratives JSON from Redis
 *     in <5ms; otherwise it falls back to the Postgres join (~50ms).
 *
 * What this writes:
 *   - Qdrant `cluster_narratives` collection (named vector "narrative", 768-dim)
 *     payload includes summary, purpose, patterns, warnings, tags, metadata
 *   - Redis `cluster:summary:{id}` JSON cache, 12h TTL
 *
 * Idempotent — Qdrant uses point_id = gpu_cluster (deterministic int).
 */
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.resolve(__dirname, '..', '.env');

dotenv.config({ path: ENV_FILE, override: true });

if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const REPO          = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : 'default';
const DRY_RUN       = args.includes('--dry-run');
const LIMIT_ARG     = args.find((a) => a.startsWith('--limit='));
const LIMIT         = LIMIT_ARG ? Math.max(0, parseInt(LIMIT_ARG.split('=')[1] ?? '0', 10) || 0) : 0;
const QDRANT_URL    = String(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').trim();
const REDIS_URL     = String(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379').trim();
const DATABASE_URL  = String(process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db').trim();
const NEO4J_URL     = String(process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687').trim();
const NEO4J_USER    = String(process.env.NEO4J_USER ?? 'neo4j').trim();
const NEO4J_PASS    = String(process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123').trim();
const COLLECTION    = 'cluster_narratives';
const REDIS_TTL     = 12 * 60 * 60;
const GRAPH_REVISION = String(process.env.GRAPH_REVISION ?? process.env.WORKSPACE_REVISION ?? 'graph:parent-atlas').trim();
const PROJECTION_REVISION = String(process.env.PROJECTION_REVISION ?? 'cluster-narratives-projection-v2').trim();
const REPORT_DIR = path.resolve(__dirname, '..', 'docs', 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'cluster-narratives-projection-receipt.json');
const REPORT_MD = path.join(REPORT_DIR, 'cluster-narratives-projection-receipt.md');

const pool  = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const redis = new Redis(REDIS_URL, { lazyConnect: true });
let neo4jDriver = null;
await redis.ping();

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashProjection(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalizePath(filePath) {
  if (!filePath) return '';
  return String(filePath)
    .replace(/^.*[\\/](?:sveltekit-frontend|deeds-web-app)[\\/]/, '')
    .replace(/\\/g, '/')
    .trim()
    .toLowerCase();
}

function classifyAffinity(filePath) {
  const value = normalizePath(filePath);
  return {
    db: /(?:^|\/)(?:db|database|sql|schema|migration|migrations|drizzle|prisma|pgvector|postgres|postgresql)(?:\/|$)/i.test(value),
    tool: /(?:^|\/)(?:tool|tools|mcp|agent|opencode|plugin)(?:\/|$)/i.test(value),
    endpoint: /(?:^|\/)(?:api|route|routes|server|endpoint|health)(?:\/|$)/i.test(value),
    cache: /(?:^|\/)(?:cache|redis|valkey|warm|memo|ttl)(?:\/|$)/i.test(value),
    process: /(?:^|\/)(?:process|pipeline|workflow|dispatcher|router|orchestrator|worker)(?:\/|$)/i.test(value),
  };
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function ensureCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (res.ok) {
    const body = await res.json().catch(() => null);
    const params = body?.result?.config?.params?.vectors;
    const vectorInfo = params?.narrative ?? params?.default ?? params?.vector ?? null;
    if (vectorInfo && Number(vectorInfo.size) !== 768) {
      throw new Error(`Qdrant collection ${COLLECTION} exists but vector size is ${vectorInfo.size}, expected 768`);
    }
    return;
  }

  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        narrative: {
          size: 768,
          distance: 'Cosine',
        },
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Qdrant collection ${COLLECTION}: ${await createRes.text()}`);
  }
}

async function getNeo4jDriver() {
  if (neo4jDriver) return neo4jDriver;

  try {
    const { default: neo4j } = await import('neo4j-driver');
    neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    await neo4jDriver.verifyConnectivity();
    return neo4jDriver;
  } catch (err) {
    throw new Error(`Neo4j unavailable at ${NEO4J_URL}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function deriveGraphFeatures({ clusterId, topFiles, tags, memberCount }) {
  const candidates = [
    ...new Set(
      [...(Array.isArray(topFiles) ? topFiles : []), ...(Array.isArray(tags) ? tags : [])]
        .filter((value) => typeof value === 'string' && value.includes('/'))
        .map(normalizePath)
        .filter(Boolean)
    ),
  ];

  const fallbackPaths = candidates.slice(0, 20);
  const fallbackCommunityId = Number(clusterId ?? 0);
  const fallbackNeighborhoodHash = hashProjection({
    clusterId,
    memberCount,
    topFiles: fallbackPaths,
    tags: Array.isArray(tags) ? tags : [],
  });

  let driver = null;
  try {
    driver = await getNeo4jDriver();
  } catch (err) {
    return {
      source: 'fallback',
      error: err instanceof Error ? err.message : String(err),
      graphFeatureRows: 0,
      graphAuthority: Number(memberCount ?? 0),
      communityId: fallbackCommunityId,
      graphDegree: Number(Array.isArray(topFiles) ? topFiles.length : 0),
      dependencyBreadth: Number(Array.isArray(tags) ? tags.length : 0),
      dbAffinity: 0,
      toolAffinity: 0,
      endpointAffinity: 0,
      cacheAffinity: 0,
      processIds: fallbackPaths.slice(0, 8),
      neighborhoodHash: fallbackNeighborhoodHash,
      relationTypes: [],
    };
  }

  const session = driver.session({ database: 'neo4j' });
  try {
    const query = `
      UNWIND $paths AS requestedPath
      MATCH (f:CodebaseFile)
      WHERE coalesce(f.filePath, f.file_path, f.path) = requestedPath
      OPTIONAL MATCH (f)-[r]-()
      WITH
        requestedPath,
        coalesce(f.filePath, f.file_path, f.path) AS filePath,
        coalesce(f.graphPageRank, f.pageRankScore, f.graphAuthorityScore, 0.0) AS pageRank,
        coalesce(f.communityId, f.gpuCluster, $fallbackCommunityId) AS communityId,
        count(r) AS degree,
        collect(DISTINCT type(r)) AS relationTypes
      RETURN
        requestedPath AS requestedPath,
        filePath AS filePath,
        pageRank,
        communityId,
        degree,
        relationTypes
      ORDER BY pageRank DESC, degree DESC, filePath ASC
    `;

    let result = await session.run(query, {
      paths: fallbackPaths,
      fallbackCommunityId,
    });

    if (!result.records.length) {
      result = await session.run(
        `
          MATCH (c:SOMCluster {id: $clusterId})<-[:BELONGS_TO_CLUSTER]-(f:CodebaseFile)
          OPTIONAL MATCH (f)-[r]-()
          WITH
            coalesce(f.filePath, f.file_path, f.path) AS filePath,
            coalesce(f.graphPageRank, f.pageRankScore, f.graphAuthorityScore, 0.0) AS pageRank,
            coalesce(f.communityId, f.gpuCluster, $fallbackCommunityId) AS communityId,
            count(r) AS degree,
            collect(DISTINCT type(r)) AS relationTypes
          RETURN
            filePath,
            pageRank,
            communityId,
            degree,
            relationTypes
          ORDER BY pageRank DESC, degree DESC, filePath ASC
          LIMIT 50
        `,
        { clusterId: Number(clusterId), fallbackCommunityId }
      );
    }

    const graphRows = result.records.map((record) => ({
      filePath: normalizePath(record.get('filePath')),
      pageRank: firstNumber(record.get('pageRank')),
      communityId: firstNumber(record.get('communityId'), fallbackCommunityId),
      degree: firstNumber(record.get('degree')),
      relationTypes: Array.isArray(record.get('relationTypes'))
        ? record.get('relationTypes').map((value) => String(value)).filter(Boolean)
        : [],
    })).filter((row) => row.filePath.length > 0);

    if (!graphRows.length) {
      return {
        source: 'fallback',
        error: 'No Neo4j CodebaseFile rows matched the cluster top files',
        graphFeatureRows: 0,
        graphAuthority: Number(memberCount ?? 0),
        communityId: fallbackCommunityId,
        graphDegree: Number(Array.isArray(topFiles) ? topFiles.length : 0),
        dependencyBreadth: Number(Array.isArray(tags) ? tags.length : 0),
        dbAffinity: 0,
        toolAffinity: 0,
        endpointAffinity: 0,
        cacheAffinity: 0,
        processIds: fallbackPaths.slice(0, 8),
        neighborhoodHash: fallbackNeighborhoodHash,
        relationTypes: [],
      };
    }

    const resolvedPaths = [...new Set(graphRows.map((row) => row.filePath))];
    const graphAuthority = graphRows.reduce((sum, row) => sum + row.pageRank, 0) / graphRows.length;
    const communityHistogram = new Map();
    const relationTypes = new Set();
    let degreeSum = 0;
    let dbAffinity = 0;
    let toolAffinity = 0;
    let endpointAffinity = 0;
    let cacheAffinity = 0;
    const processIds = [];

    for (const row of graphRows) {
      degreeSum += row.degree;
      communityHistogram.set(row.communityId, (communityHistogram.get(row.communityId) ?? 0) + 1);
      for (const type of row.relationTypes) {
        if (type) relationTypes.add(type);
      }

      const affinity = classifyAffinity(row.filePath);
      if (affinity.db) dbAffinity++;
      if (affinity.tool) toolAffinity++;
      if (affinity.endpoint) endpointAffinity++;
      if (affinity.cache) cacheAffinity++;
      if (affinity.process) processIds.push(row.filePath);
    }

    const communityId = [...communityHistogram.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackCommunityId;
    const graphDegree = degreeSum / graphRows.length;
    const dependencyBreadth = relationTypes.size;
    const neighborhoodHash = hashProjection({
      clusterId,
      graphAuthority,
      communityId,
      graphDegree,
      dependencyBreadth,
      dbAffinity,
      toolAffinity,
      endpointAffinity,
      cacheAffinity,
      processIds,
      resolvedPaths,
      relationTypes: [...relationTypes].sort(),
      topFiles: fallbackPaths,
    });

    return {
      source: 'neo4j',
      graphFeatureRows: graphRows.length,
      graphAuthority,
      communityId,
      graphDegree,
      dependencyBreadth,
      dbAffinity,
      toolAffinity,
      endpointAffinity,
      cacheAffinity,
      processIds: [...new Set(processIds)].slice(0, 10),
      neighborhoodHash,
      relationTypes: [...relationTypes].sort(),
      resolvedPaths,
    };
  } catch (err) {
    return {
      source: 'fallback',
      error: err instanceof Error ? err.message : String(err),
      graphFeatureRows: 0,
      graphAuthority: Number(memberCount ?? 0),
      communityId: fallbackCommunityId,
      graphDegree: Number(Array.isArray(topFiles) ? topFiles.length : 0),
      dependencyBreadth: Number(Array.isArray(tags) ? tags.length : 0),
      dbAffinity: 0,
      toolAffinity: 0,
      endpointAffinity: 0,
      cacheAffinity: 0,
      processIds: fallbackPaths.slice(0, 8),
      neighborhoodHash: fallbackNeighborhoodHash,
      relationTypes: [],
    };
  } finally {
    await session.close().catch(() => {});
  }
}

const { rows } = await pool.query(`
  SELECT
    gpu_cluster                      AS cluster_id,
    summary, purpose, patterns, warnings, tags,
    member_count, centroid_distance_mean, summary_model,
    metadata, created_at, updated_at,
    summary_embedding::text          AS embedding_text
  FROM cluster_summaries
  WHERE repo_id = $1 AND summary_embedding IS NOT NULL
  ORDER BY gpu_cluster
`, [REPO]);

const selectedRows = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

console.log(`✓ Loaded ${rows.length} cluster summaries with embeddings from Postgres`);
if (LIMIT > 0) {
  console.log(`[cfg] limit=${LIMIT} -> processing ${selectedRows.length} rows`);
}

await ensureCollection();
console.log(`[qdrant] ensured collection ${COLLECTION}`);

let qdrantOk = 0, redisOk = 0, failed = 0, skipped = 0, graphFeatureRows = 0, neo4jRows = 0, fallbackRows = 0;
const QDRANT_BATCH = 16;
const payloadDigests = [];

for (let i = 0; i < selectedRows.length; i += QDRANT_BATCH) {
  const batch = selectedRows.slice(i, i + QDRANT_BATCH);
  const points = [];

  for (const row of batch) {
    // pgvector returns "[0.1,0.2,...]" — parse to float array
    let vector;
    try {
      vector = JSON.parse(row.embedding_text);
      if (!Array.isArray(vector) || vector.length !== 768) {
        console.warn(`  cluster #${row.cluster_id}: bad embedding shape ${vector?.length}`);
        failed++;
        continue;
      }
    } catch (err) {
      console.warn(`  cluster #${row.cluster_id}: parse error ${err.message}`);
      failed++;
      continue;
    }

    const topFiles = Array.isArray(row.metadata?.topFiles)
      ? row.metadata.topFiles.filter((value) => typeof value === 'string')
      : Array.isArray(row.metadata?.representativeFiles)
        ? row.metadata.representativeFiles.filter((value) => typeof value === 'string')
        : [];

    const graphFeatures = await deriveGraphFeatures({
      clusterId: row.cluster_id,
      topFiles,
      tags: row.tags ?? [],
      memberCount: row.member_count ?? 0,
    });

    graphFeatureRows += 1;
    if (graphFeatures.source === 'neo4j') neo4jRows += 1;
    else fallbackRows += 1;
    if (graphFeatures.error) {
      console.warn(`  cluster #${row.cluster_id}: ${graphFeatures.error}`);
    }

  const payload = {
      clusterId:            row.cluster_id,
      repoId:               REPO,
      summary:              row.summary,
      purpose:              row.purpose,
      patterns:             row.patterns ?? [],
      warnings:             row.warnings ?? [],
      tags:                 row.tags ?? [],
      memberCount:          row.member_count,
      centroidDistanceMean: row.centroid_distance_mean,
      summaryModel:         row.summary_model,
      metadata:             row.metadata,
      createdAt:            row.created_at?.toISOString?.() ?? null,
      updatedAt:            row.updated_at?.toISOString?.() ?? null,
      graphRevision:        GRAPH_REVISION,
      projectionRevision:   PROJECTION_REVISION,
      graphAuthority:       graphFeatures.graphAuthority,
      graphAuthorityScore:  graphFeatures.graphAuthority,
      communityId:          graphFeatures.communityId,
      graphDegree:          graphFeatures.graphDegree,
      dependencyBreadth:    graphFeatures.dependencyBreadth,
      dbAffinity:           graphFeatures.dbAffinity,
      toolAffinity:         graphFeatures.toolAffinity,
      endpointAffinity:     graphFeatures.endpointAffinity,
      cacheAffinity:        graphFeatures.cacheAffinity,
      processIds:           graphFeatures.processIds,
      graphFreshness:       row.updated_at?.toISOString?.() ?? row.created_at?.toISOString?.() ?? null,
      neighborhoodHash:     graphFeatures.neighborhoodHash,
    };

    payloadDigests.push(hashProjection({
      clusterId: row.cluster_id,
      payload,
    }));

    points.push({
      id:      row.cluster_id,
      vector:  { narrative: vector },
      payload,
    });

    // Redis cache (fire-and-forget alongside Qdrant batch)
    if (!DRY_RUN) {
      void redis.setex(
        `cluster:summary:${row.cluster_id}`,
        REDIS_TTL,
        JSON.stringify(payload),
      ).then(() => { redisOk++; }).catch(() => null);
    }
  }

  if (!points.length) continue;

  try {
    if (!DRY_RUN) {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        qdrantOk += points.length;
        console.log(`  ✓ batch ${i / QDRANT_BATCH + 1}: ${points.length} points → Qdrant`);
      } else {
        const body = await res.text();
        console.warn(`  ✗ batch ${i / QDRANT_BATCH + 1}: HTTP ${res.status} — ${body.slice(0, 120)}`);
        failed += points.length;
      }
    } else {
      qdrantOk += points.length;
      console.log(`  · dry-run batch ${i / QDRANT_BATCH + 1}: ${points.length} points`);
    }
  } catch (err) {
    console.warn(`  ✗ batch ${i / QDRANT_BATCH + 1}: ${err.message}`);
    failed += points.length;
  }
}

// Settle Redis writes
await new Promise((r) => setTimeout(r, 250));

const info = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then((r) => r.json()).catch(() => null);
const payloadHash = hashProjection(payloadDigests.sort());

const receipt = {
  receiptKind: 'CLUSTER_NARRATIVES_QDRANT_PROJECTION',
  status: DRY_RUN ? 'DRY_RUN' : (failed === 0 ? 'PROVEN' : 'PARTIAL'),
  graphRevision: GRAPH_REVISION,
  projectionRevision: PROJECTION_REVISION,
  collection: COLLECTION,
  repoId: REPO,
  inputRows: selectedRows.length,
  affectedPacketKeys: selectedRows.length,
  qdrantProjected: qdrantOk,
  qdrantUpserts: qdrantOk,
  qdrantDeletes: 0,
  unchanged: skipped,
  redisProjected: redisOk,
  failed,
  graphFeatureRows,
  neo4jRows,
  fallbackRows,
  payloadHash,
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
};

await mkdir(REPORT_DIR, { recursive: true });
await writeFile(REPORT_JSON, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
await writeFile(REPORT_MD, [
  '# Cluster Narratives Projection Receipt',
  '',
  `- status: ${receipt.status}`,
  `- graphRevision: ${receipt.graphRevision}`,
  `- projectionRevision: ${receipt.projectionRevision}`,
  `- repoId: ${receipt.repoId}`,
  `- inputRows: ${receipt.inputRows}`,
  `- affectedPacketKeys: ${receipt.affectedPacketKeys}`,
  `- qdrantProjected: ${receipt.qdrantProjected}`,
  `- qdrantUpserts: ${receipt.qdrantUpserts}`,
  `- qdrantDeletes: ${receipt.qdrantDeletes}`,
  `- unchanged: ${receipt.unchanged}`,
  `- redisProjected: ${receipt.redisProjected}`,
  `- failed: ${receipt.failed}`,
  `- graphFeatureRows: ${receipt.graphFeatureRows}`,
  `- neo4jRows: ${receipt.neo4jRows}`,
  `- fallbackRows: ${receipt.fallbackRows}`,
  `- payloadHash: ${receipt.payloadHash}`,
  `- generatedAt: ${receipt.generatedAt}`,
].join('\n') + '\n', 'utf8');

console.log(`\nSync complete:`);
console.log(`  Qdrant ${COLLECTION}: ${qdrantOk} points (collection holds ${info?.result?.points_count ?? '?'})`);
console.log(`  Redis cluster:summary:*: ${redisOk} keys, ${REDIS_TTL / 3600}h TTL`);
console.log(`  Graph features: ${graphFeatureRows} rows (${neo4jRows} neo4j / ${fallbackRows} fallback)`);
console.log(`  Failed: ${failed}`);
console.log(`  Receipt: ${REPORT_JSON}`);
console.log(`  Report:  ${REPORT_MD}`);

await redis.quit();
await pool.end();
if (neo4jDriver) {
  await neo4jDriver.close().catch(() => {});
}
