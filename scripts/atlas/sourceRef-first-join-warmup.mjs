#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');
const REPORT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-join-warmup.json');
const REPORT_MD_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-join-warmup.md');
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEFAULT_BIFROST_URL = 'http://127.0.0.1:3040';
const DEFAULT_BIFROST_MODEL = 'ollama/gemma4-rotorquant:latest';
const FALLBACK_BIFROST_MODEL = 'ollama/ibm/granite-docling:258m';
const BIFROST_REQUEST_TIMEOUT_MS = Number(process.env.SOURCE_REF_BIFROST_TIMEOUT_MS || 20_000);
const DEFAULT_CLUSTER_LIMIT = 10;
const DEFAULT_PACKET_LIMIT = 15;

dotenv.config({ path: ENV_PATH });

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitAt = trimmed.indexOf('=');
    if (splitAt === -1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => toNonEmptyString(entry)).filter(Boolean))];
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const record = item;
          return (
            (typeof record.tag === 'string' && record.tag.trim().length > 0 ? record.tag.trim() : null) ??
            (typeof record.label === 'string' && record.label.trim().length > 0 ? record.label.trim() : null) ??
            (typeof record.value === 'string' && record.value.trim().length > 0 ? record.value.trim() : null) ??
            (typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : null) ??
            (typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : null)
          );
        }
        const text = String(item ?? '').trim();
        return text.length > 0 ? text : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseClusterId(clusterKey) {
  const id = parseInt(String(clusterKey).replace('cluster:gpu:', ''), 10);
  return Number.isFinite(id) ? id : -1;
}

function buildMetadataSummary(entry) {
  const parts = [];
  if (entry.summary?.trim()) parts.push(entry.summary.trim());
  if (entry.purpose?.trim()) parts.push(`Purpose: ${entry.purpose.trim()}`);
  if (entry.riskLevel?.trim()) parts.push(`Risk: ${entry.riskLevel.trim()}`);
  if (entry.topTags?.length > 0) parts.push(`Tags: ${entry.topTags.slice(0, 8).join(', ')}`);
  if (entry.topFiles?.length > 0) parts.push(`Files: ${entry.topFiles.slice(0, 5).join(', ')}`);
  if (entry.topoClasses?.length > 0) parts.push(`Topo: ${entry.topoClasses.slice(0, 4).join(', ')}`);
  return parts.join(' | ');
}

function buildScalarSeed(hotness, fileCount, topTags, topFiles, topoClasses) {
  const hot = Math.max(0, Math.min(1, hotness));
  const diversity = Math.min(1, (topTags.length + topFiles.length + topoClasses.length) / 24);
  const sizeFactor = Math.min(1, Math.log1p(Math.max(0, fileCount)) / Math.log1p(1000));
  return Number((0.55 * hot + 0.25 * diversity + 0.2 * sizeFactor).toFixed(4));
}

async function readClusterTagHash(redis, clusterKey) {
  try {
    return await redis.hgetall(`ace:cluster:tags:${clusterKey}`);
  } catch {
    return {};
  }
}

async function hydrateCluster(redis, clusterKey, hotness, source) {
  const hash = await readClusterTagHash(redis, clusterKey);
  const summary = hash.summary ?? '';
  const purpose = hash.purpose ?? '';
  const riskLevel = hash.risk_level ?? hash.riskLevel ?? '';
  const mitigationProtocols = parseJsonArray(hash.mitigation_protocols);
  const topTags = parseJsonArray(hash.topTags);
  const topFiles = parseJsonArray(hash.topFiles);
  const topoClasses = parseJsonArray(hash.topoClasses);
  const fileCount = Number.parseInt(hash.fileCount ?? '0', 10) || 0;
  const metadataSummary = buildMetadataSummary({
    summary,
    purpose,
    riskLevel,
    topTags,
    topFiles,
    topoClasses,
  });
  return {
    clusterKey,
    clusterId: parseClusterId(clusterKey),
    hotness,
    source,
    fileCount,
    summary,
    purpose,
    riskLevel,
    mitigationProtocols,
    topTags,
    topFiles,
    topoClasses,
    metadataSummary,
    scalarSeed: buildScalarSeed(hotness, fileCount, topTags, topFiles, topoClasses),
  };
}

async function readHotSet(redis, topK) {
  const raw = await redis.zrevrange('ace:cluster:hot', 0, Math.max(0, topK - 1), 'WITHSCORES');
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    const clusterKey = raw[i];
    const hotness = Number.parseFloat(raw[i + 1]);
    if (!clusterKey || !Number.isFinite(hotness)) continue;
    result.push({ clusterKey, hotness });
  }
  return result;
}

async function readClusterKeysFromMeta(redis, topK) {
  const metaRaw = await redis.get('ace:cluster:tags:__meta');
  if (!metaRaw) return [];
  try {
    const meta = JSON.parse(metaRaw);
    return (meta.clusterKeys ?? []).slice(0, topK);
  } catch {
    return [];
  }
}

async function readHotClusters(redis, topK = 10, options = {}) {
  const preferHotSet = options.preferHotSet ?? true;
  try {
    const hotSet = preferHotSet ? await readHotSet(redis, topK) : [];
    if (hotSet.length > 0) {
      const result = [];
      for (const entry of hotSet) {
        result.push(await hydrateCluster(redis, entry.clusterKey, entry.hotness, 'ace:cluster:hot'));
      }
      return result;
    }
    const fallbackKeys = await readClusterKeysFromMeta(redis, topK);
    if (fallbackKeys.length === 0) return [];
    const result = [];
    for (const clusterKey of fallbackKeys) {
      result.push(await hydrateCluster(redis, clusterKey, 0, 'ace:cluster:tags:__meta'));
    }
    return result;
  } catch {
    return [];
  }
}

function buildClusterWarmupPrompt(cluster) {
  return [
    `Cluster ${cluster.clusterKey} context`,
    `Hotness: ${cluster.hotness.toFixed(4)}`,
    `Scalar seed: ${cluster.scalarSeed.toFixed(4)}`,
    cluster.metadataSummary,
  ].filter(Boolean).join('\n');
}

function normalizeFeatureId(value) {
  const text = toNonEmptyString(value);
  return text ?? 'unknown';
}

function normalizeBifrostModel(model) {
  const text = toNonEmptyString(model) ?? DEFAULT_BIFROST_MODEL;
  return text.includes('/') ? text : `ollama/${text}`;
}

function uniqueModels(models) {
  return [...new Set(models.map((model) => normalizeBifrostModel(model)).filter(Boolean))];
}

function buildPacketWarmupPrompt(packet, communityContexts) {
  const sourceRefs = toStringArray(packet.source_refs);
  const hitRefs = toStringArray(packet.hit_source_refs);
  const contextLines = Array.isArray(communityContexts) && communityContexts.length > 0
    ? communityContexts.map((ctx) => `Community ${ctx.id}: ${ctx.purpose} | ${ctx.tags.join(', ')} | ${ctx.summary}`)
    : [];

  return [
    `SourceRef-first packet warmup for feature ${normalizeFeatureId(packet.feature_id)}`,
    `Primary sourceRef: ${toNonEmptyString(packet.source_ref) ?? 'unknown'}`,
    `Query hash: ${toNonEmptyString(packet.query_hash) ?? 'unknown'}`,
    `Chunk id: ${toNonEmptyString(packet.chunk_id) ?? 'unknown'}`,
    `Packet summary: ${toNonEmptyString(packet.summary) ?? 'none'}`,
    `Packet sourceRefs: ${sourceRefs.slice(0, 5).join(', ') || 'none'}`,
    `Hit sourceRefs: ${hitRefs.slice(0, 5).join(', ') || 'none'}`,
    ...(contextLines.length > 0 ? ['', 'Community context:', ...contextLines.slice(0, 3)] : []),
  ].join('\n');
}

function buildClusterWarmupRecord(cluster) {
  return {
    kind: 'cluster',
    clusterKey: cluster.clusterKey,
    clusterId: cluster.clusterId,
    hotness: cluster.hotness,
    source: cluster.source,
    fileCount: cluster.fileCount,
    topFiles: cluster.topFiles.slice(0, 6),
    topTags: cluster.topTags.slice(0, 6),
    prompt: buildClusterWarmupPrompt(cluster),
  };
}

function buildPacketWarmupRecord(packet, prompt, communityContexts) {
  return {
    kind: 'nes_packet',
    packetId: packet.id,
    packetKey: packet.packet_key,
    queryHash: packet.query_hash,
    chunkId: packet.chunk_id,
    featureId: packet.feature_id,
    sourceRef: packet.source_ref,
    sourceRefs: toStringArray(packet.source_refs),
    hitCount: Number(packet.hit_count ?? 0),
    hitSourceRefs: toStringArray(packet.hit_source_refs),
    prompt,
    communityCount: Array.isArray(communityContexts) ? communityContexts.length : 0,
  };
}

function buildMarkdown(report) {
  const lines = [
    '# SourceRef-First Join Warmup',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Inputs',
    '',
    `- cluster limit: ${report.inputs.clusterLimit}`,
    `- packet limit: ${report.inputs.packetLimit}`,
    `- mode: ${report.mode}`,
    `- Bifrost model: ${report.inputs.bifrostModel}`,
    '',
    '## Neo4j Expansion',
    '',
    `- applied: ${report.neo4j.applied ? 'yes' : 'no'}`,
    `- communities: ${report.neo4j.communities}`,
    `- total clusters: ${report.neo4j.totalClusters}`,
    `- total members: ${report.neo4j.totalMembers}`,
    `- turbo hits: ${report.neo4j.turboHits}`,
    `- turbo misses: ${report.neo4j.turboMisses}`,
    '',
    '## Redis / Bitfrost Warmup',
    '',
    `- clusters warmed: ${report.warmup.clustersWarmed}`,
    `- packets warmed: ${report.warmup.packetsWarmed}`,
    `- contexts registered: ${report.warmup.contextsRegistered}`,
    `- errors: ${report.warmup.errors}`,
    '',
    '## Top FeatureIds',
    '',
    ...(report.top.featureIds.length > 0
      ? report.top.featureIds.map((entry) => `- ${entry.value}: ${entry.count}`)
      : ['- none']),
    '',
    '## Top SourceRefs',
    '',
    ...(report.top.sourceRefs.length > 0
      ? report.top.sourceRefs.map((entry) => `- ${entry.value}: ${entry.count}`)
      : ['- none']),
    '',
    '## Top Clusters',
    '',
    ...(report.top.clusterKeys.length > 0
      ? report.top.clusterKeys.map((entry) => `- ${entry.value}: ${entry.count}`)
      : ['- none']),
    '',
    '## Notes',
    '',
    '- The script reuses the existing hot-cluster reader and the NES packet lane, keyed by sourceRef + featureId.',
    '- Neo4j expansion comes from the existing community graph builder; Redis/Bitfrost warmup uses the Bifrost cache gateway and KAG context registry.',
    '- Dry-run does not mutate Redis, Bifrost, Neo4j, or Postgres.',
  ];
  return `${lines.join('\n')}\n`;
}

async function warmBifrostPrompt({ bifrostUrl, bifrostModels, cacheKey, prompt, dryRun }) {
  if (dryRun) {
    return { ok: true, dryRun: true, cacheKey };
  }

  const models = uniqueModels([...(Array.isArray(bifrostModels) ? bifrostModels : []), DEFAULT_BIFROST_MODEL, FALLBACK_BIFROST_MODEL]);
  let lastError = null;

  for (const model of models) {
    const res = await fetch(`${bifrostUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bf-cache-ttl': String(3600),
        'x-bf-cache-type': 'semantic',
        'x-bf-cache-key': cacheKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a legal AI codebase assistant. Answer concisely.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 48,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(BIFROST_REQUEST_TIMEOUT_MS),
    });

    if (res.ok) {
      return { ok: true, dryRun: false, cacheKey, model };
    }

    const body = await res.text().catch(() => '');
    lastError = new Error(`Bifrost HTTP ${res.status} with ${model}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  throw lastError ?? new Error('Bifrost warmup failed');
}

async function loadRecentPackets(pool, limit) {
  const { rows } = await pool.query(
    `
      SELECT
        p.id,
        p.packet_key,
        p.query_hash,
        p.chunk_id,
        p.source_ref,
        p.source_refs,
        p.feature_id,
        p.summary,
        p.payload,
        p.created_at,
        COUNT(h.id)::int AS hit_count,
        COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT h.source_ref), NULL), '{}'::text[]) AS hit_source_refs
      FROM nes_chrom_packets p
      LEFT JOIN nes_chrom_kag_dag_hits h ON h.packet_id = p.id
      GROUP BY p.id, p.packet_key, p.query_hash, p.chunk_id, p.source_ref, p.source_refs, p.feature_id, p.summary, p.payload, p.created_at
      ORDER BY p.created_at DESC
      LIMIT $1
    `,
    [limit],
  );
  return rows;
}

async function main() {
  const env = loadEnv();
  const { values } = parseArgs({
    options: {
      dryRun: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      skipNeo4j: { type: 'boolean', default: false },
      skipBifrost: { type: 'boolean', default: false },
      clusterLimit: { type: 'string' },
      packetLimit: { type: 'string' },
    },
    allowPositionals: false,
    strict: false,
  });

  const dryRun = Boolean(values.dryRun) || !Boolean(values.apply);
  const skipNeo4j = Boolean(values.skipNeo4j);
  const skipBifrost = Boolean(values.skipBifrost);
  const clusterLimit = clampInt(values.clusterLimit, DEFAULT_CLUSTER_LIMIT, 1, 100);
  const packetLimit = clampInt(values.packetLimit, DEFAULT_PACKET_LIMIT, 1, 100);
  console.log(`[sourceRef-warmup] start mode=${dryRun ? 'dry-run' : 'apply'} clusterLimit=${clusterLimit} packetLimit=${packetLimit}`);

  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const bifrostUrl = process.env.BIFROST_URL || env.BIFROST_URL || DEFAULT_BIFROST_URL;
  const bifrostModel = normalizeBifrostModel(
    process.env.BIFROST_MODEL ||
    env.BIFROST_MODEL ||
    process.env.ROTORQUANT_CHAT_MODEL ||
    env.ROTORQUANT_CHAT_MODEL ||
    process.env.OLLAMA_CHAT_MODEL ||
    env.OLLAMA_CHAT_MODEL ||
    DEFAULT_BIFROST_MODEL
  );
  const bifrostModelCandidates = uniqueModels([
    bifrostModel,
    process.env.BIFROST_MODEL_ALT || env.BIFROST_MODEL_ALT,
    process.env.OLLAMA_MODEL || env.OLLAMA_MODEL,
    FALLBACK_BIFROST_MODEL,
  ]);
  const redisPassword = process.env.REDIS_PASSWORD || env.REDIS_PASSWORD || null;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

  const report = {
    schema: 'sourceRef_first_join_warmup_report.v1',
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'apply',
    inputs: {
      clusterLimit,
      packetLimit,
      bifrostModel,
      bifrostModelCandidates,
    },
    neo4j: {
      applied: false,
      communities: 0,
      totalClusters: 0,
      totalMembers: 0,
      turboHits: 0,
      turboMisses: 0,
    },
    warmup: {
      clustersWarmed: 0,
      packetsWarmed: 0,
      contextsRegistered: 0,
      errors: 0,
    },
    top: {
      featureIds: [],
      sourceRefs: [],
      clusterKeys: [],
    },
    samples: {
      clusters: [],
      packets: [],
    },
  };

  let redis = null;
  try {
    const redisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    };
    if (redisPassword) {
      redisOptions.password = redisPassword;
    }
    redis = new (await import('ioredis')).default(process.env.REDIS_URL || env.REDIS_URL || 'redis://127.0.0.1:6379', redisOptions);
    redis.on('error', () => {});
    console.log('[sourceRef-warmup] connecting redis...');
    await redis.connect().catch(() => null);
    console.log('[sourceRef-warmup] redis connected');

    console.log('[sourceRef-warmup] reading hot clusters...');
    const clusters = await readHotClusters(redis, clusterLimit, { preferHotSet: true }).catch(() => []);
    console.log(`[sourceRef-warmup] hot clusters loaded: ${clusters.length}`);
    report.top.clusterKeys = clusters
      .slice(0, 10)
      .map((cluster) => ({ value: cluster.clusterKey, count: cluster.fileCount }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    if (!skipNeo4j && !dryRun) {
      report.neo4j.applied = false;
      report.neo4j.note = 'Neo4j community expansion is skipped in the plain-Node warmup runner to avoid TS-loader coupling.';
    } else {
      const [{ rows }] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS community_count, COALESCE(SUM(member_count), 0)::int AS total_members, COALESCE(SUM(cardinality(cluster_ids)), 0)::int AS total_clusters FROM community_reports`),
      ]);
      const row = rows[0] ?? {};
      report.neo4j.communities = Number(row.community_count ?? 0);
      report.neo4j.totalMembers = Number(row.total_members ?? 0);
      report.neo4j.totalClusters = Number(row.total_clusters ?? 0);
    }

    console.log('[sourceRef-warmup] loading recent NES packets...');
    const packets = await loadRecentPackets(pool, packetLimit).catch(() => []);
    console.log(`[sourceRef-warmup] recent NES packets loaded: ${packets.length}`);
    const packetsByFeature = new Map();
    const sourceRefCounts = new Map();
    for (const packet of packets) {
      const featureId = normalizeFeatureId(packet.feature_id);
      const sourceRef = toNonEmptyString(packet.source_ref);
      packetsByFeature.set(featureId, (packetsByFeature.get(featureId) ?? 0) + 1);
      if (sourceRef) sourceRefCounts.set(sourceRef, (sourceRefCounts.get(sourceRef) ?? 0) + 1);
    }

    report.top.featureIds = [...packetsByFeature.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 10);
    report.top.sourceRefs = [...sourceRefCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 10);

    for (const cluster of clusters) {
      const prompt = buildClusterWarmupPrompt(cluster);
      const cacheKey = `sourceRef-first:cluster:${cluster.clusterKey}`;
      report.samples.clusters.push(buildClusterWarmupRecord(cluster));

      try {
        if (!dryRun) {
          await redis?.set(`bifrost:kag:${cacheKey}`, JSON.stringify({
            kind: 'cluster',
            clusterKey: cluster.clusterKey,
            clusterId: cluster.clusterId,
            hotness: cluster.hotness,
            source: cluster.source,
            fileCount: cluster.fileCount,
            topFiles: cluster.topFiles.slice(0, 6),
            topTags: cluster.topTags.slice(0, 6),
            metadataSummary: cluster.metadataSummary,
            prompt,
          }), 'EX', 3600 * 4).catch(() => null);
          report.warmup.contextsRegistered += 1;
        }
        if (!skipBifrost) {
          await warmBifrostPrompt({
            bifrostUrl,
            bifrostModels: bifrostModelCandidates,
            cacheKey,
            prompt,
            dryRun,
          });
          report.warmup.clustersWarmed += 1;
        }
      } catch (err) {
        report.warmup.errors += 1;
        console.warn('[sourceRef-warmup] cluster warmup failed:', err?.message ?? err);
      }
    }

    for (const packet of packets) {
      const communityContexts = [];
      const prompt = buildPacketWarmupPrompt(packet, communityContexts);
      const cacheKey = `sourceRef-first:packet:${normalizeFeatureId(packet.feature_id)}:${String(packet.query_hash ?? '').slice(0, 16)}`;
      report.samples.packets.push(buildPacketWarmupRecord(packet, prompt, communityContexts));

      try {
        if (!dryRun) {
          await redis?.set(`bifrost:kag:${cacheKey}`, JSON.stringify({
            kind: 'nes_packet',
            packetId: packet.id,
            packetKey: packet.packet_key,
            queryHash: packet.query_hash,
            chunkId: packet.chunk_id,
            sourceRef: packet.source_ref,
            sourceRefs: toStringArray(packet.source_refs),
            featureId: normalizeFeatureId(packet.feature_id),
            hitCount: Number(packet.hit_count ?? 0),
            hitSourceRefs: toStringArray(packet.hit_source_refs),
            summary: packet.summary ?? '',
            payload: packet.payload ?? {},
            communityContexts,
            prompt,
          }), 'EX', 3600 * 4).catch(() => null);
          report.warmup.contextsRegistered += 1;
        }
        if (!skipBifrost) {
          await warmBifrostPrompt({
            bifrostUrl,
            bifrostModels: bifrostModelCandidates,
            cacheKey,
            prompt,
            dryRun,
          });
          report.warmup.packetsWarmed += 1;
        }
      } catch (err) {
        report.warmup.errors += 1;
        console.warn('[sourceRef-warmup] packet warmup failed:', err?.message ?? err);
      }
    }

    fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
    fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(REPORT_MD_PATH, buildMarkdown(report), 'utf8');

    console.log(`[sourceRef-warmup] clusters=${report.warmup.clustersWarmed} packets=${report.warmup.packetsWarmed} contexts=${report.warmup.contextsRegistered} errors=${report.warmup.errors}`);
    console.log(`[sourceRef-warmup] json=${REPORT_JSON_PATH}`);
    console.log(`[sourceRef-warmup] md=${REPORT_MD_PATH}`);
  } finally {
    if (redis) {
      await redis.quit().catch(() => {});
    }
    await pool.end().catch(() => {});
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[sourceRef-warmup] fatal:', err?.message ?? err);
    process.exit(1);
  });
