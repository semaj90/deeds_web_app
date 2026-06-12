#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'route-runtime-packets-materialization-report.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'route-runtime-packets-materialization-report.md');
const APPLY = process.argv.includes('--apply');

function tryArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined) return [];
  return [value].filter(Boolean);
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeScore(telemetry, sourceRefs, featureIds, edges, stateKey) {
  const retrievalTemperature = clamp01(Number(telemetry?.fusion_score ?? telemetry?.fusionScore ?? 0));
  const conceptTemperature = clamp01((sourceRefs.length + featureIds.length) / 4);
  const routeSuccess = stateKey ? 1 : 0;
  const graphScore = clamp01((edges.length || 0) / 10);
  const score = 0.40 * retrievalTemperature + 0.25 * conceptTemperature + 0.20 * routeSuccess + 0.15 * graphScore;
  return {
    score: Number(score.toFixed(4)),
    retrievalTemperature,
    conceptTemperature,
    routeSuccess,
    graphScore,
  };
}

async function tableExists(pool, tableName) {
  const { rows } = await pool.query(
    `select 1
       from information_schema.tables
      where table_schema = 'public'
        and table_name = $1
      limit 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function loadGroupedRows(pool, tableName, sqlText) {
  if (!(await tableExists(pool, tableName))) return [];
  const { rows } = await pool.query(sqlText);
  return rows;
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = resolveDatabaseUrl(process.env);
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  const generatedAt = new Date().toISOString();
  const hasSourceRefs = await tableExists(pool, 'route_packet_source_refs');
  const hasTelemetry = await tableExists(pool, 'retrieval_telemetry');

  let report;
  try {
    const snapshotRows = await loadGroupedRows(
      pool,
      'route_state_snapshots',
      `
        select packet_uuid, state_key, compressed_state, token_map, created_at
        from route_state_snapshots
        order by created_at desc
      `,
    );

    const factsRows = await loadGroupedRows(
      pool,
      'route_packet_facts',
      `
        select packet_uuid,
               jsonb_agg(jsonb_build_object(
                 'fact_type', fact_type,
                 'fact_key', fact_key,
                 'fact_value', fact_value,
                 'score', score,
                 'metadata', metadata
               ) order by created_at asc) as facts
        from route_packet_facts
        group by packet_uuid
      `,
    );

    const edgeRows = await loadGroupedRows(
      pool,
      'route_packet_edges',
      `
        select packet_uuid,
               jsonb_agg(jsonb_build_object(
                 'src', src,
                 'dst', dst,
                 'edge_type', edge_type,
                 'weight', weight,
                 'metadata', metadata
               ) order by created_at asc) as edges
        from route_packet_edges
        group by packet_uuid
      `,
    );

    const sourceRefRows = hasSourceRefs
      ? await loadGroupedRows(
          pool,
          'route_packet_source_refs',
          `
            select packet_uuid,
                   jsonb_agg(jsonb_build_object(
                     'source_ref', source_ref,
                     'feature_id', feature_id,
                     'ref_index', ref_index
                   ) order by ref_index asc) as source_refs
            from route_packet_source_refs
            group by packet_uuid
          `,
        )
      : [];

    const telemetryRows = hasTelemetry
      ? await loadGroupedRows(
          pool,
          'retrieval_telemetry',
          `
            select query_hash, query, latency_ms, vector_hits, trigram_hits, fts_hits,
                   selected_packet_key, selected_packet_keys, selected_feature_id,
                   feature_ids, fusion_score, cache_hit, surface, environment,
                   retrieval_strategy, created_at
            from retrieval_telemetry
            order by created_at desc
          `,
        )
      : [];

    const factsByPacket = new Map(factsRows.map((row) => [String(row.packet_uuid), row.facts ?? []]));
    const edgesByPacket = new Map(edgeRows.map((row) => [String(row.packet_uuid), row.edges ?? []]));
    const refsByPacket = new Map(sourceRefRows.map((row) => [String(row.packet_uuid), row.source_refs ?? []]));
    const telemetryByPacket = new Map();

    for (const telemetry of telemetryRows) {
      const keys = new Set([
        telemetry.selected_packet_key,
        ...tryArray(telemetry.selected_packet_keys),
        telemetry.selected_feature_id,
      ].filter(Boolean).map(String));
      for (const key of keys) {
        if (!telemetryByPacket.has(key)) telemetryByPacket.set(key, telemetry);
      }
    }

    const candidates = snapshotRows.map((row) => {
      const packetUuid = String(row.packet_uuid);
      const facts = factsByPacket.get(packetUuid) ?? [];
      const edges = edgesByPacket.get(packetUuid) ?? [];
      const refEntries = refsByPacket.get(packetUuid) ?? [];
      const sourceRefs = refEntries.map((entry) => entry?.source_ref ?? entry?.sourceRef ?? null).filter(Boolean).map(String);
      const featureIds = refEntries.map((entry) => entry?.feature_id ?? entry?.featureId ?? null).filter(Boolean).map(String);
      const telemetry = telemetryByPacket.get(packetUuid) ?? null;
      const score = computeScore(telemetry, sourceRefs, featureIds, edges, row.state_key);
      const raw = {
        packet_uuid: packetUuid,
        route: {
          state: row.state_key ?? null,
          packet_uuid: packetUuid,
        },
        feature_id: featureIds[0] ?? telemetry?.selected_feature_id ?? null,
        source_refs: sourceRefs,
        feature_ids: featureIds,
        evidence: {
          facts,
          edges,
          token_map: row.token_map ?? {},
        },
        telemetry: telemetry
          ? {
              query_hash: telemetry.query_hash,
              query: telemetry.query,
              latency_ms: telemetry.latency_ms,
              vector_hits: telemetry.vector_hits,
              trigram_hits: telemetry.trigram_hits,
              fts_hits: telemetry.fts_hits,
              selected_packet_keys: tryArray(telemetry.selected_packet_keys),
              selected_feature_id: telemetry.selected_feature_id ?? null,
              fusion_score: telemetry.fusion_score ?? null,
              cache_hit: telemetry.cache_hit ?? false,
              surface: telemetry.surface ?? null,
              environment: telemetry.environment ?? null,
              retrieval_strategy: telemetry.retrieval_strategy ?? null,
            }
          : null,
        score,
        provenance: {
          retrieval_temperature: score.retrievalTemperature,
          concept_temperature: score.conceptTemperature,
          route_success: score.routeSuccess,
          graph_score: score.graphScore,
          source_ref_source: hasSourceRefs ? 'route_packet_source_refs' : null,
          telemetry_source: telemetry ? 'retrieval_telemetry' : null,
        },
      };

      return {
        packet_uuid: packetUuid,
        route: row.state_key ?? null,
        source_ref: sourceRefs[0] ?? null,
        feature_id: raw.feature_id,
        score: score.score,
        state: row.state_key ?? null,
        last_seen_at: row.created_at ?? null,
        source_refs: sourceRefs,
        feature_ids: featureIds,
        raw,
      };
    });

    let written = 0;
    if (APPLY) {
      for (const row of candidates) {
        await pool.query(
          `
            insert into route_runtime_packets (
              packet_uuid,
              raw,
              reward,
              query_hash,
              query_preview,
              source_refs,
              feature_ids,
              lane_ids,
              cluster_id,
              som_cluster,
              qdrant_hits,
              redis_hot_keys,
              latency_ms,
              cache_hit,
              cache_tier,
              response_tokens
            ) values (
              $1::uuid,
              $2::jsonb,
              $3,
              $4,
              $5,
              $6::jsonb,
              $7::jsonb,
              $8::jsonb,
              $9,
              $10,
              $11,
              $12::jsonb,
              $13,
              $14,
              $15,
              $16
            )
            on conflict (packet_uuid) do update set
              raw = excluded.raw,
              reward = excluded.reward,
              query_hash = excluded.query_hash,
              query_preview = excluded.query_preview,
              source_refs = excluded.source_refs,
              feature_ids = excluded.feature_ids,
              lane_ids = excluded.lane_ids,
              cluster_id = excluded.cluster_id,
              som_cluster = excluded.som_cluster,
              qdrant_hits = excluded.qdrant_hits,
              redis_hot_keys = excluded.redis_hot_keys,
              latency_ms = excluded.latency_ms,
              cache_hit = excluded.cache_hit,
              cache_tier = excluded.cache_tier,
              response_tokens = excluded.response_tokens
          `,
          [
            row.packet_uuid,
            JSON.stringify(row.raw),
            row.score,
            row.raw.telemetry?.query_hash ?? null,
            row.raw.telemetry?.query ?? row.raw.route?.state ?? null,
            JSON.stringify(row.source_refs),
            JSON.stringify(row.feature_ids),
            JSON.stringify([row.raw.provenance.retrieval_temperature, row.raw.provenance.concept_temperature].filter((value) => Number.isFinite(value))),
            row.raw.feature_id ?? null,
            row.raw.provenance.route_success ? row.raw.route?.state ?? null : null,
            row.raw.telemetry?.vector_hits ?? row.raw.telemetry?.fts_hits ?? 0,
            JSON.stringify(tryArray(row.raw.telemetry?.selected_packet_keys)),
            row.raw.telemetry?.latency_ms ?? null,
            Boolean(row.raw.telemetry?.cache_hit ?? false),
            row.raw.telemetry?.retrieval_strategy ?? 'fusion',
            null,
          ],
        );
        written += 1;
      }
    }

    report = {
      generatedAt,
      dbReachable: true,
      apply: APPLY,
      sourceRefsTable: hasSourceRefs,
      telemetryTable: hasTelemetry,
      candidates: candidates.length,
      written,
      sample: candidates.slice(0, 25).map((row) => ({
        packet_uuid: row.packet_uuid,
        route: row.route,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        score: row.score,
        state: row.state,
        last_seen_at: row.last_seen_at,
      })),
      notes: [
        'Dry-run default; inserts only happen with --apply.',
        'route_runtime_packets is materialized from packet facts, state snapshots, optional source-ref joins, and retrieval telemetry where available.',
        'Missing values default to zero/null but provenance is preserved in the raw payload.',
      ],
    };
  } catch (error) {
    report = {
      generatedAt,
      dbReachable: false,
      apply: APPLY,
      error: error instanceof Error ? error.message : String(error),
      candidates: 0,
      written: 0,
      sample: [],
      notes: ['Materialization audit could not reach Postgres.'],
    };
  } finally {
    await pool.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    OUT_MD,
    [
      '# Route Runtime Packets Materialization',
      '',
      `Generated: ${report.generatedAt}`,
      `Mode: ${report.apply ? 'apply' : 'dry-run'}`,
      `Postgres reachable: ${report.dbReachable ? 'yes' : 'no'}`,
      '',
      '## Summary',
      '',
      `- candidates: ${report.candidates}`,
      `- written: ${report.written}`,
      `- route_packet_source_refs table present: ${report.sourceRefsTable ? 'yes' : 'no'}`,
      `- retrieval_telemetry table present: ${report.telemetryTable ? 'yes' : 'no'}`,
      '',
      '## Samples',
      '',
      ...report.sample.map((row) => `- ${row.packet_uuid} | ${row.state ?? 'n/a'} | ${row.source_ref ?? 'n/a'} | ${row.feature_id ?? 'n/a'} | score=${row.score}`),
      ...(report.sample.length === 0 ? ['- none'] : []),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
