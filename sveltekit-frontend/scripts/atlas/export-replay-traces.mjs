#!/usr/bin/env node
/**
 * Export HyperRAG replay traces from Redis into a read-only report.
 *
 * Outputs:
 *   docs/reports/replay-trace.jsonl
 *   docs/reports/replay-trace.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveRedisConfig } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSONL = path.join(REPORTS_DIR, 'replay-trace.jsonl');
const OUT_MD = path.join(REPORTS_DIR, 'replay-trace.md');
const TRACE_INDEX_KEY = 'hyperrag:replay:index';
const TRACE_KEY_PREFIX = 'hyperrag:replay:trace:';

function parseArgs(argv) {
  const out = {
    limit: 250,
  };
  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) out.limit = Math.trunc(n);
    }
  }
  return out;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function asString(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map(asString).filter(Boolean))];
}

function extractPackets(result) {
  const packets = Array.isArray(result?.response?.packets)
    ? result.response.packets
    : Array.isArray(result?.packets)
      ? result.packets
      : [];
  return packets;
}

function buildRow(indexRow, traceEntry) {
  const entry = traceEntry ?? {};
  const response = entry.response ?? {};
  const packets = extractPackets(entry);
  const trace = response.trace ?? {};
  const resultCount = packets.length || Number(indexRow?.packet_count ?? 0) || 0;
  const query = asString(entry.query ?? indexRow?.query ?? '');
  const queryNormalized = query.toLowerCase().trim();
  const sourceRefs = uniqueStrings([
    ...packets.map((packet) => packet.source_ref),
    ...(Array.isArray(response.source_refs) ? response.source_refs : []),
  ]);
  const packetKeys = uniqueStrings([
    ...packets.map((packet) => packet.packet_key),
    ...(Array.isArray(response.packet_keys) ? response.packet_keys : []),
  ]);
  const featureIds = uniqueStrings([
    ...packets.map((packet) => packet.feature_id),
    ...(Array.isArray(response.feature_ids) ? response.feature_ids : []),
  ]);
  const createdAt = asString(entry.timestamp ?? indexRow?.timestamp ?? new Date().toISOString());
  const cacheHit = Boolean(entry.metadata?.cache_hit ?? indexRow?.cache_hit ?? false);
  const cacheSource = asString(entry.metadata?.cache_source ?? trace.cache_source ?? (cacheHit ? 'redis_exact_match' : 'live_fusion'));
  const cacheNamespace = asString(entry.metadata?.cache_namespace ?? trace.cache_namespace ?? 'hyperrag:query');
  const replayId = asString(entry.metadata?.replay_id ?? entry.id ?? indexRow?.id ?? sha256(`${query}:${createdAt}`));
  const topPacket = packets[0] ?? {};
  const graphStageStatus = asString(entry.metadata?.graph_stage_status ?? trace.graph_stage_status ?? (
    Number(trace.neo4j_expansions ?? 0) > 0
      ? 'GRAPH_ENABLED'
      : (Number(trace.qdrant_hits ?? 0) > 0 || Number(trace.postgres_hits ?? 0) > 0)
        ? 'GRAPH_DEGRADED'
        : 'GRAPH_DISABLED'
  ));
  const graphStageReason =
    asString(entry.metadata?.graph_stage_reason ?? trace.graph_stage_reason ?? (
    Number(trace.neo4j_expansions ?? 0) > 0
      ? 'neo4j expansions available'
      : Number(trace.qdrant_hits ?? 0) > 0 || Number(trace.postgres_hits ?? 0) > 0
        ? 'neo4j expansion not returned for this replay entry'
        : 'no retrieval hits recorded'
  ));
  const traversalPath = [
    'packet_rpc',
    ...(cacheHit ? ['redis'] : []),
    ...(Number(trace.postgres_hits ?? 0) > 0 ? ['postgres'] : []),
    ...(Number(trace.qdrant_hits ?? 0) > 0 ? ['qdrant'] : []),
    ...(Number(trace.neo4j_expansions ?? 0) > 0 ? ['neo4j'] : []),
    ...(Number(trace.rrf_hits ?? 0) > 0 ? ['rrf'] : []),
  ];

  return {
    trace_id: replayId,
    task_id: asString(entry.metadata?.task_id ?? response?.trace?.task_id ?? null) || null,
    worker_id: asString(entry.metadata?.worker_id ?? response?.trace?.worker_id ?? response?.packets?.[0]?.worker ?? 'sveltekit-frontend'),
    query,
    query_normalized: queryNormalized,
    query_hash: sha256(query),
    route: asString(entry?.request?.route ?? response?.route ?? '/api/hyperrag/packet-rpc'),
    replay_id: replayId,
    retrieval_path: Array.isArray(response.trace?.retrieval_path) ? response.trace.retrieval_path : traversalPath,
    packet_key: asString(topPacket?.packet_key ?? packetKeys[0] ?? null) || null,
    source_ref: asString(topPacket?.source_ref ?? sourceRefs[0] ?? null) || null,
    feature_id: asString(topPacket?.feature_id ?? featureIds[0] ?? null) || null,
    bm25_hits: Number(trace.postgres_hits ?? trace.bm25_hits ?? 0) || 0,
    qdrant_hits: Number(trace.qdrant_hits ?? 0) || 0,
    neo4j_hits: Number(trace.neo4j_expansions ?? trace.neo4j_hits ?? 0) || 0,
    redis_hits: cacheHit ? 1 : 0,
    rrf_hits: Number(trace.rrf_hits ?? packets.length ?? 0) || 0,
    source_refs: sourceRefs,
    packet_keys: packetKeys,
    feature_ids: featureIds,
    result_count: resultCount,
    error: entry.error ?? null,
    created_at: createdAt,
    cache_hit: cacheHit,
    cache_hit_source: cacheSource,
    cache_namespace: cacheNamespace,
    cache_key: `hyperrag:query:${sha256(query)}`,
    latency_ms: Number(trace.latency_ms ?? entry?.metadata?.duration_ms ?? 0) || 0,
    retrieval_strategy: asString(trace.retrieval_strategy ?? response.strategy ?? 'fusion'),
    graph_stage_status: graphStageStatus,
    graph_stage_reason: graphStageReason,
    source_ref_key: sourceRefs[0] ?? null,
    feature_label: packets[0]?.feature_label ?? null,
    qdrant_point_id: packets[0]?.qdrant_point_id ?? null,
    qdrant_collection: packets[0]?.qdrant_collection ?? null,
    domain_class: packets[0]?.domain_class ?? null,
    ontology_label: packets[0]?.ontology_label ?? null,
    topology_label: packets[0]?.topology_label ?? null,
    traversal_path: traversalPath,
    provenance: Array.isArray(response.provenance) ? response.provenance : [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadAtlasEnv(REPO_ROOT);
  const redisConfig = resolveRedisConfig(process.env);
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const summary = {
    generated_at: new Date().toISOString(),
    limit: args.limit,
    redis: { status: 'UNKNOWN', url: redisConfig.url, error: null },
    traces_exported: 0,
    rows_with_packets: 0,
    rows_with_error: 0,
    output_jsonl: path.relative(REPO_ROOT, OUT_JSONL),
    output_md: path.relative(REPO_ROOT, OUT_MD),
  };

  let redis = null;
  try {
    redis = new Redis(redisConfig.url, {
      password: redisConfig.password,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    const pong = await redis.ping();
    summary.redis.status = pong === 'PONG' ? 'READY' : 'ERROR';
    if (summary.redis.status !== 'READY') {
      throw new Error(`Redis ping returned ${pong}`);
    }

    const members = await redis.zrevrange(TRACE_INDEX_KEY, 0, Math.max(0, args.limit - 1));
    const rows = [];
    for (const member of members) {
      let indexRow = null;
      try {
        indexRow = JSON.parse(member);
      } catch {
        indexRow = { id: member, query: '', timestamp: null, packet_count: 0 };
      }
      const traceId = asString(indexRow?.id ?? '');
      let traceEntry = null;
      if (traceId) {
        const raw = await redis.get(`${TRACE_KEY_PREFIX}${traceId}`);
        if (raw) {
          try {
            traceEntry = JSON.parse(raw);
          } catch (err) {
            traceEntry = { id: traceId, query: indexRow?.query ?? '', error: `parse-error: ${err instanceof Error ? err.message : String(err)}` };
          }
        }
      }
      const row = buildRow(indexRow, traceEntry);
      rows.push(row);
    }

    summary.traces_exported = rows.length;
    summary.rows_with_packets = rows.filter((row) => row.result_count > 0).length;
    summary.rows_with_error = rows.filter((row) => Boolean(row.error)).length;

    await fs.writeFile(OUT_JSONL, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
    const md = [
      '# HyperRAG Replay Trace Export',
      '',
      `Generated: ${summary.generated_at}`,
      '',
      '## Summary',
      '',
      `- traces exported: ${summary.traces_exported}`,
      `- rows with packets: ${summary.rows_with_packets}`,
      `- rows with error: ${summary.rows_with_error}`,
      `- redis status: ${summary.redis.status}`,
      '',
      '## Fields',
      '',
      '- query_hash',
      '- trace_id',
      '- task_id',
      '- worker_id',
      '- route',
      '- replay_id',
      '- bm25_hits',
      '- qdrant_hits',
      '- neo4j_hits',
      '- redis_hits',
      '- rrf_hits',
      '- source_refs',
      '- packet_keys',
      '- feature_ids',
      '- result_count',
      '- error',
      '- created_at',
      '- cache_hit_source',
      '- cache_namespace',
      '- cache_key',
      '- graph_stage_status',
      '- graph_stage_reason',
      '- retrieval_path',
      '- source_ref_key',
      '- feature_label',
      '- qdrant_point_id',
      '- qdrant_collection',
      '- domain_class',
      '- ontology_label',
      '- topology_label',
      '- traversal_path',
      '',
    ].join('\n');
    await fs.writeFile(OUT_MD, md, 'utf8');
  } catch (error) {
    summary.redis.status = summary.redis.status === 'UNKNOWN' ? 'ERROR' : summary.redis.status;
    summary.redis.error = error instanceof Error ? error.message : String(error);
    await fs.writeFile(OUT_JSONL, '', 'utf8').catch(() => {});
    await fs.writeFile(
      OUT_MD,
      [
        '# HyperRAG Replay Trace Export',
        '',
        `Generated: ${summary.generated_at}`,
        '',
        `Redis status: ${summary.redis.status}`,
        '',
        `Error: ${summary.redis.error}`,
        '',
      ].join('\n'),
      'utf8',
    ).catch(() => {});
    console.error('[export-replay-traces] failed:', summary.redis.error);
    process.exitCode = 1;
  } finally {
    if (redis) {
      try {
        redis.disconnect();
      } catch {}
    }
    await fs.writeFile(path.join(REPORTS_DIR, 'replay-trace-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8').catch(() => {});
  }
}

main().catch((error) => {
  console.error('[export-replay-traces] fatal:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
