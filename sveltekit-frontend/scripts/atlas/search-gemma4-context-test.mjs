#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'gemma4-context-test.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'gemma4-context-test.md');

const env = loadRepoEnv(process.env);
const APP_URL = String(env.PUBLIC_APP_URL ?? env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173').trim();
const DATABASE_URL = resolveDatabaseUrl(env);

const REQUIRED_FIELDS = [
  'feature_id',
  'source_ref',
  'metadata',
  'qdrant_tag_id',
  'cluster_id',
  'community_id',
  'som_cluster',
  'karpathy_score',
  'redis_hot_key',
  'neo4j_node',
  'domain',
  'ontology',
];

function firstRow(row) {
  return {
    id: row.row_id,
    source_ref: row.source_ref,
    feature_id: row.feature_id,
    feature_label: row.feature_label,
    qdrant_tag_id: row.qdrant_tag_id,
    cluster_id: row.cluster_id,
    community_id: row.community_id,
    som_cluster: row.som_cluster,
    domain_class: row.domain_class,
  };
}

function pickPacketField(packet, key) {
  if (!packet || typeof packet !== 'object') return null;
  const value = packet[key];
  if (value !== null && value !== undefined && !(typeof value === 'string' && value.trim().length === 0)) return value;
  return null;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const startedAt = new Date().toISOString();

  let report;
  try {
    const atlasColumns = await pool.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'atlas_packets'
    `);
    const atlasColumnSet = new Set(atlasColumns.rows.map((row) => row.column_name));
    const idColumn = atlasColumnSet.has('id')
      ? 'id'
      : atlasColumnSet.has('packet_id')
        ? 'packet_id'
        : atlasColumnSet.has('packet_key')
          ? 'packet_key'
          : null;
    if (!idColumn) {
      throw new Error('atlas_packets does not expose an id, packet_id, or packet_key column');
    }

    const selectParts = [
      `${idColumn} as row_id`,
      atlasColumnSet.has('source_ref') ? 'source_ref' : 'NULL::text as source_ref',
      atlasColumnSet.has('feature_id') ? 'feature_id' : 'NULL::text as feature_id',
      atlasColumnSet.has('feature_label') ? 'feature_label' : 'NULL::text as feature_label',
      atlasColumnSet.has('qdrant_tag_id') ? 'qdrant_tag_id' : 'NULL::text as qdrant_tag_id',
      atlasColumnSet.has('cluster_id') ? 'cluster_id' : 'NULL::text as cluster_id',
      atlasColumnSet.has('community_id') ? 'community_id' : 'NULL::text as community_id',
      atlasColumnSet.has('som_cluster') ? 'som_cluster' : 'NULL::text as som_cluster',
      atlasColumnSet.has('domain_class') ? 'domain_class' : 'NULL::text as domain_class',
    ];

    const { rows } = await pool.query(
      `
        select ${selectParts.join(', ')}
        from atlas_packets
        where ${atlasColumnSet.has('source_ref') ? 'source_ref is not null' : 'true'}
          and ${atlasColumnSet.has('feature_id') ? 'feature_id is not null' : 'true'}
        order by updated_at desc nulls last, ${idColumn} desc
        limit 1
      `,
    );

    if (rows.length === 0) {
      throw new Error('No atlas_packets candidate rows with source_ref + feature_id found');
    }

    const seed = firstRow(rows[0]);
    const query = [
      seed.feature_label,
      seed.feature_id,
      seed.source_ref,
    ].filter(Boolean).join(' ').slice(0, 240);

    const res = await fetch(`${APP_URL}/api/atlas/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        top_k: 5,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = await res.json().catch(() => ({}));
    const results = Array.isArray(body.results) ? body.results : Array.isArray(body.packets) ? body.packets : [];

    const fieldCoverage = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, 0]));
    const visibleSamples = [];
    const packetShapes = [];
    for (const packet of results.slice(0, 5)) {
      const sample = {
        feature_id: pickPacketField(packet, 'feature_id'),
        source_ref: pickPacketField(packet, 'source_ref'),
        metadata: pickPacketField(packet, 'metadata'),
        qdrant_tag_id: pickPacketField(packet, 'qdrant_tag_id'),
        cluster_id: pickPacketField(packet, 'cluster_id'),
        community_id: pickPacketField(packet, 'community_id'),
        som_cluster: pickPacketField(packet, 'som_cluster'),
        karpathy_score: pickPacketField(packet, 'karpathy_score'),
        redis_hot_key: pickPacketField(packet, 'redis_hot_key'),
        neo4j_node: pickPacketField(packet, 'neo4j_node'),
        domain: pickPacketField(packet, 'domain'),
        ontology: pickPacketField(packet, 'ontology'),
      };
      packetShapes.push({
        packet_key: packet.packet_key ?? null,
        source_ref: packet.source_ref ?? null,
        feature_id: packet.feature_id ?? null,
        feature_label: packet.feature_label ?? null,
      });
      for (const field of REQUIRED_FIELDS) {
        if (sample[field] !== null && sample[field] !== undefined) {
          fieldCoverage[field] += 1;
        }
      }
      visibleSamples.push(sample);
    }

    const allRequiredVisible = REQUIRED_FIELDS.every((field) => fieldCoverage[field] > 0);
    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      appUrl: APP_URL,
      seed,
      query,
      status: res.status,
      ok: res.ok,
      resultCount: results.length,
      fieldCoverage,
      allRequiredVisible,
      packetShapes,
      visibleSamples,
      responsePreview: body,
    };

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!results.length) {
      throw new Error('No search results returned from /api/atlas/search');
    }
    if (!allRequiredVisible) {
      throw new Error('Gemma4 context sample is missing one or more required identity fields');
    }
  } catch (error) {
    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      appUrl: APP_URL,
      error: error instanceof Error ? error.message : String(error),
      seed: null,
      query: null,
      status: null,
      ok: false,
      resultCount: 0,
      fieldCoverage: Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, 0])),
      allRequiredVisible: false,
      packetShapes: [],
      visibleSamples: [],
      responsePreview: null,
    };
  } finally {
    await pool.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Gemma4 Context Test',
      '',
      `Generated: ${report.generatedAt}`,
      `App URL: ${report.appUrl}`,
      `Query: ${report.query ?? 'n/a'}`,
      '',
      '## Summary',
      '',
      `- Status: ${report.ok ? 'ok' : 'fail'}`,
      `- Result count: ${report.resultCount}`,
      `- All required visible: ${report.allRequiredVisible ? 'yes' : 'no'}`,
      '',
      '## Field Coverage',
      '',
      ...REQUIRED_FIELDS.map((field) => `- ${field}: ${report.fieldCoverage[field] ?? 0}`),
      '',
      '## Gemma4 Visible Context Sample',
      '',
      '```json',
      JSON.stringify(report.visibleSamples.slice(0, 1)[0] ?? {}, null, 2),
      '```',
      '',
      '## Seed',
      '',
      '```json',
      JSON.stringify(report.seed ?? {}, null, 2),
      '```',
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify({ ok: report.ok && report.allRequiredVisible, report }, null, 2));
  process.exit(report.ok && report.allRequiredVisible ? 0 : 1);
}

main().catch((error) => {
  console.error('[atlas:search:gemma4-context:test] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
