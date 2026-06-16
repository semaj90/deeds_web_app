#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'redis-centroid-mirror-wiring.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'redis-centroid-mirror-wiring.md');

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const LIMIT = parseIntFlag(argv, '--limit', 0);
const SAMPLE = parseIntFlag(argv, '--sample', 10);

const POSTGRES_CONTAINER = process.env.PARENT_ATLAS_POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';

function parseIntFlag(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && idx < args.length - 1) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function pct(part, total) {
  const p = Number(part ?? 0);
  const t = Number(total ?? 0);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Number(((p / t) * 100).toFixed(2));
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const normalized = stableJson(value[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value ?? null), null, 2);
}

function parseTsvRows(text, columns) {
  return String(text ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const values = line.split('\t');
      const row = {};
      for (let i = 0; i < columns.length; i += 1) row[columns[i]] = values[i] ?? '';
      return row;
    });
}

function runPsql(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 24 },
  );

  if (result.status !== 0) {
    throw new Error(String(result.stderr ?? result.stdout ?? `psql exit ${result.status}`));
  }

  return String(result.stdout ?? '').trim();
}

function runDocker(args, input = null) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
    input: input ?? undefined,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function runRedis(args, input = null) {
  const result = runDocker(args, input);
  return {
    ok: result.ok,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}

function redisSet(container, key, value, password = '') {
  return runRedisCli(container, ['-x', 'SET', key], password, value);
}

function redisGet(container, key, password = '') {
  return runRedisCli(container, ['--raw', 'GET', key], password);
}

function jsonPreview(value, maxLen = 160) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function renderMarkdown(report) {
  return [
    '# Redis Centroid Mirror Wiring',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- source table: ${report.source.table}`,
    `- qdrant-backed rows read: ${report.summary.qdrantBackedRows}`,
    `- community buckets: ${report.summary.communityBuckets}`,
    `- som buckets: ${report.summary.somBuckets}`,
    `- planned writes: ${report.summary.plannedWrites}`,
    `- applied writes: ${report.summary.appliedWrites}`,
    `- failures: ${report.summary.failures}`,
    '',
    '## Planned Keys',
    '',
    ...report.plannedKeys.map((item) => `- \`${item.key}\` (${item.kind}) -> ${item.rows} rows`),
    '',
    '## Samples',
    '',
    ...report.samples.map((item) => `- ${item.kind} | ${item.key} | ${item.preview}`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
  ].join('\n');
}

function pickTopRows(rows, keyField) {
  const sorted = [...rows].sort((a, b) => {
    const bs = Number.isFinite(b.karpathy_score) ? b.karpathy_score : -Infinity;
    const as = Number.isFinite(a.karpathy_score) ? a.karpathy_score : -Infinity;
    if (bs !== as) return bs - as;
    return String(a.packet_key || '').localeCompare(String(b.packet_key || ''));
  });
  const unique = [];
  const seen = new Set();
  for (const row of sorted) {
    const token = row[keyField] || row.packet_key || row.source_ref || '';
    if (!token || seen.has(token)) continue;
    seen.add(token);
    unique.push(row);
    if (unique.length >= 25) break;
  }
  return unique;
}

function buildMirrorPayload(kind, key, rows) {
  const topRows = pickTopRows(rows, 'packet_key');
  const unique = (field) => [...new Set(topRows.map((row) => normalizeText(row[field])).filter(Boolean))];
  return {
    mirror_type: kind,
    key,
    qdrant_backed_rows: rows.length,
    packet_keys: unique('packet_key'),
    source_refs: unique('source_ref'),
    source_ref_keys: unique('source_ref_key'),
    canonical_source_refs: unique('canonical_source_ref'),
    file_paths: unique('file_path'),
    feature_ids: unique('feature_id'),
    feature_labels: unique('feature_label'),
    qdrant_collections: unique('qdrant_collection'),
    qdrant_payload_keys: unique('qdrant_payload_key'),
    qdrant_point_ids: unique('qdrant_point_id'),
    content_hashes: unique('content_hash'),
    chunk_ids: unique('chunk_id'),
    tree_node_ids: unique('tree_node_id'),
    glyph_record_ids: unique('glyph_record_id'),
    neo4j_node_ids: unique('neo4j_node_id'),
    karpathy_score_top: topRows.length > 0 ? topRows[0].karpathy_score ?? null : null,
    samples: topRows.map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      source_ref_key: row.source_ref_key,
      canonical_source_ref: row.canonical_source_ref,
      file_path: row.file_path,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      identity_lane: row.identity_lane,
      community_id: row.community_id,
      som_cluster: row.som_cluster,
      cluster_id: row.cluster_id,
      centroid_id: row.centroid_id,
      karpathy_score: row.karpathy_score,
      qdrant_collection: row.qdrant_collection,
      qdrant_payload_key: row.qdrant_payload_key,
      qdrant_point_id: row.qdrant_point_id,
      content_hash: row.content_hash,
      chunk_id: row.chunk_id,
      tree_node_id: row.tree_node_id,
      glyph_record_id: row.glyph_record_id,
      neo4j_node_id: row.neo4j_node_id,
    })),
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const { container: redisContainer, password: redisPassword } = await resolveAtlasRedisContext(REPO_ROOT, process.env);

  const columns = parseTsvRows(
    runPsql(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'atlas_higher_hop_index'
      order by ordinal_position
    `),
    ['column_name'],
  ).map((row) => row.column_name);
  const columnSet = new Set(columns);
  const col = (name, alias = name) => (columnSet.has(name) ? `${name}::text as ${alias}` : `null::text as ${alias}`);
  const numCol = (name, alias = name) => (columnSet.has(name) ? `${name}::text as ${alias}` : `null::text as ${alias}`);

  const whereClauses = [
    columnSet.has('qdrant_collection') ? "nullif(btrim(qdrant_collection::text), '') is not null" : 'true',
    columnSet.has('qdrant_point_id') ? "nullif(btrim(qdrant_point_id::text), '') is not null" : 'false',
  ].filter(Boolean).join(' and ');

  const sql = `
    select
      ${col('packet_key')},
      ${col('source_ref_key')},
      ${col('source_ref')},
      ${col('canonical_source_ref')},
      ${col('feature_id')},
      ${col('feature_label')},
      ${col('identity_lane')},
      ${numCol('community_id')},
      ${numCol('som_cluster')},
      ${numCol('cluster_id')},
      ${col('centroid_id')},
      ${numCol('karpathy_score')},
      ${col('qdrant_collection')},
      ${col('qdrant_payload_key')},
      ${col('qdrant_point_id')},
      ${col('content_hash')},
      ${col('chunk_id')},
      ${col('tree_node_id')},
      ${col('glyph_record_id')},
      ${col('neo4j_node_id')},
      ${col('file_path')},
      ${col('metadata')}
    from public.atlas_higher_hop_index
    where ${whereClauses}
    order by
      ${columnSet.has('community_id') ? 'community_id asc nulls last,' : ''}
      ${columnSet.has('som_cluster') ? 'som_cluster asc nulls last,' : ''}
      ${columnSet.has('karpathy_score') ? 'karpathy_score desc nulls last,' : ''}
      ${columnSet.has('packet_key') ? 'packet_key asc' : '1'}
      ${LIMIT > 0 ? `limit ${LIMIT}` : ''}
  `;

  const rows = parseTsvRows(runPsql(sql), [
    'packet_key',
    'source_ref_key',
    'source_ref',
    'canonical_source_ref',
    'feature_id',
    'feature_label',
    'identity_lane',
    'community_id',
    'som_cluster',
    'cluster_id',
    'centroid_id',
    'karpathy_score',
    'qdrant_collection',
    'qdrant_payload_key',
    'qdrant_point_id',
    'content_hash',
    'chunk_id',
    'tree_node_id',
    'glyph_record_id',
    'neo4j_node_id',
    'file_path',
    'metadata',
  ]).map((row) => ({
    packet_key: normalizeText(row.packet_key),
    source_ref_key: normalizeSourceRef(row.source_ref_key),
    source_ref: normalizeSourceRef(row.source_ref || row.file_path || row.source_ref_key),
    canonical_source_ref: normalizeSourceRef(row.canonical_source_ref || row.source_ref || row.source_ref_key),
    feature_id: normalizeText(row.feature_id),
    feature_label: normalizeText(row.feature_label),
    identity_lane: normalizeText(row.identity_lane),
    community_id: normalizeText(row.community_id),
    som_cluster: normalizeText(row.som_cluster),
    cluster_id: normalizeText(row.cluster_id),
    centroid_id: normalizeText(row.centroid_id),
    karpathy_score: row.karpathy_score === '' ? null : Number(row.karpathy_score),
    qdrant_collection: normalizeText(row.qdrant_collection),
    qdrant_payload_key: normalizeText(row.qdrant_payload_key),
    qdrant_point_id: normalizeText(row.qdrant_point_id),
    content_hash: normalizeText(row.content_hash),
    chunk_id: normalizeText(row.chunk_id),
    tree_node_id: normalizeText(row.tree_node_id),
    glyph_record_id: normalizeText(row.glyph_record_id),
    neo4j_node_id: normalizeText(row.neo4j_node_id),
    file_path: normalizeText(row.file_path),
    metadata: (() => {
      try {
        return row.metadata ? JSON.parse(row.metadata) : {};
      } catch {
        return {};
      }
    })(),
  }));

  const communityGroups = new Map();
  const somGroups = new Map();
  const qdrantBackedRows = rows.length;

  for (const row of rows) {
    const communityKey = row.community_id || 'unknown';
    const somKey = row.som_cluster || 'unknown';
    if (!communityGroups.has(communityKey)) communityGroups.set(communityKey, []);
    if (!somGroups.has(somKey)) somGroups.set(somKey, []);
    communityGroups.get(communityKey).push(row);
    somGroups.get(somKey).push(row);
  }

  const plannedWrites = [];
  const centroidEntries = [];

  for (const [communityId, groupRows] of communityGroups.entries()) {
    const payload = buildMirrorPayload('centroid', communityId, groupRows);
    const key = `centroid:${communityId}`;
    plannedWrites.push({ kind: 'centroid', key, rows: groupRows.length, payload });
    centroidEntries.push({
      community_id: communityId,
      key,
      rows: groupRows.length,
      top_packet_key: payload.packet_keys[0] ?? null,
    });
  }

  const somEntries = [];
  for (const [somCluster, groupRows] of somGroups.entries()) {
    const payload = buildMirrorPayload('som', somCluster, groupRows);
    const key = `som:${somCluster}`;
    const cellKey = `som:cell:${somCluster}`;
    plannedWrites.push({ kind: 'som', key, rows: groupRows.length, payload });
    plannedWrites.push({ kind: 'som_cell', key: cellKey, rows: groupRows.length, payload });
    somEntries.push({
      som_cluster: somCluster,
      key,
      cell_key: cellKey,
      rows: groupRows.length,
      top_packet_key: payload.packet_keys[0] ?? null,
    });
  }

  const indexPayload = {
    generated_at: new Date().toISOString(),
    source_table: 'atlas_higher_hop_index',
    qdrant_backed_rows: qdrantBackedRows,
    community_count: communityGroups.size,
    som_count: somGroups.size,
    centroid_keys: centroidEntries.map((item) => item.key),
    som_keys: somEntries.flatMap((item) => [item.key, item.cell_key]),
    top_communities: centroidEntries.slice(0, SAMPLE),
    top_som_clusters: somEntries.slice(0, SAMPLE),
  };
  plannedWrites.push({ kind: 'index', key: 'atlas:centroid:index', rows: 1, payload: indexPayload });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    status: 'PASS',
    source: {
      table: 'atlas_higher_hop_index',
      rowsRead: qdrantBackedRows,
    },
    redis: {
      container: redisContainer,
      passwordConfigured: Boolean(redisPassword),
      available: Boolean(redisContainer),
    },
    summary: {
      qdrantBackedRows,
      communityBuckets: communityGroups.size,
      somBuckets: somGroups.size,
      plannedWrites: plannedWrites.length,
      appliedWrites: 0,
      failures: 0,
      sampleKeys: plannedWrites.slice(0, SAMPLE).map((item) => item.key),
    },
    plannedKeys: plannedWrites.map((item) => ({ key: item.key, kind: item.kind, rows: item.rows })),
    samples: plannedWrites.slice(0, SAMPLE).map((item) => ({
      kind: item.kind,
      key: item.key,
      preview: jsonPreview(item.payload),
    })),
    writes: [],
    nextSafeAction: redisContainer
      ? (APPLY_REQUESTED
        ? 'Re-run the mirror in dry-run mode if you want to inspect the generated keys, then proceed to Bifrost mirror wiring.'
        : 'Use --apply to write the centroid and SOM mirrors into Redis/Valkey, then move to Bifrost mirror wiring.')
      : 'Bring Redis/Valkey online, then rerun the mirror before applying writes.',
  };

  if (!redisContainer) {
    report.status = 'SOURCE_UNAVAILABLE';
  }

  if (APPLY_REQUESTED && redisContainer) {
    for (const item of plannedWrites) {
      const result = redisSet(redisContainer, item.key, stableStringify(item.payload), redisPassword);
      report.writes.push({
        key: item.key,
        kind: item.kind,
        ok: result.ok,
        status: result.status,
        stderr: result.stderr.trim() || null,
      });
      if (result.ok) report.summary.appliedWrites += 1;
      else report.summary.failures += 1;
    }
    report.status = report.summary.failures === 0 ? 'PASS' : 'PASS_WITH_WARN';
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${stableStringify(report)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  console.log(JSON.stringify({
    status: report.status,
    mode: report.mode,
    container: report.redis.container,
    qdrantBackedRows: report.summary.qdrantBackedRows,
    communityBuckets: report.summary.communityBuckets,
    somBuckets: report.summary.somBuckets,
    plannedWrites: report.summary.plannedWrites,
    appliedWrites: report.summary.appliedWrites,
    failures: report.summary.failures,
  }, null, 2));

  if (APPLY_REQUESTED && report.summary.failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[wire-redis-centroid-mirror] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
