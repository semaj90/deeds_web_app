#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-packet-payload-verify.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-packet-payload-verify.md');

const argv = process.argv.slice(2);
const limitFlag = argv.find((arg) => arg === '--limit' || arg.startsWith('--limit='));
const SAMPLE_LIMIT = Number(
  limitFlag
    ? (limitFlag.includes('=') ? limitFlag.split('=', 2)[1] : argv[argv.indexOf('--limit') + 1])
    : 50,
) || 50;

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const QDRANT_URL = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').trim();
const COLLECTION = String(env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_768').trim();

const fieldAliases = {
  source_ref: ['source_ref', 'sourceRef', 'source_refs'],
  feature_id: ['feature_id', 'featureId'],
  feature_label: ['feature_label', 'featureLabel', 'label', 'title'],
  qdrant_tag_id: ['qdrant_tag_id', 'qdrantTagId'],
  cluster_id: ['cluster_id', 'clusterId'],
  community_id: ['community_id', 'communityId'],
  som_cluster: ['som_cluster', 'somCluster'],
  domain_class: ['domain_class', 'domainClass'],
  domain: ['domain'],
  neo4j_node: ['neo4j_node', 'neo4jNode', 'node_id', 'nodeId'],
  metadata: ['metadata'],
};

function pickField(obj, aliases) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of aliases) {
    const value = obj[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    return value;
  }
  return null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, /** @type {Record<string, unknown>} */ ({}));
  }
  return value;
}

function valuesMatch(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  if (typeof left === 'number' || typeof right === 'number') return Number(left) === Number(right);
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  }
  return String(left) === String(right);
}

async function retrieveById(client, pointId) {
  try {
    const response = await client.retrieve(COLLECTION, {
      ids: [pointId],
      with_payload: true,
      with_vector: false,
    });
    const points = Array.isArray(response) ? response : response?.result ?? response?.points ?? [];
    return Array.isArray(points) ? points[0] ?? null : null;
  } catch {
    return null;
  }
}

async function retrieveBySourceRef(client, sourceRef) {
  try {
    const stripped = sourceRef.replace(/^sveltekit-frontend\//, '');
    const prefixed = sourceRef.startsWith('sveltekit-frontend/') ? sourceRef : 'sveltekit-frontend/' + sourceRef;
    const response = await client.scroll(COLLECTION, {
      limit: 1,
      with_payload: true,
      with_vector: false,
      filter: {
        should: [
          { key: 'canonicalSourceRef', match: { value: prefixed } },
          { key: 'canonicalSourceRef', match: { value: stripped } },
          { key: 'source_ref', match: { value: prefixed } },
          { key: 'source_ref', match: { value: stripped } },
          { key: 'path', match: { value: prefixed } },
          { key: 'path', match: { value: stripped } }
        ]
      },
    });
    const points = Array.isArray(response) ? response : response?.result?.points ?? response?.points ?? [];
    return Array.isArray(points) ? points[0] ?? null : null;
  } catch {
    return null;
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const startedAt = new Date().toISOString();

  let report;
  try {
    const tableCheck = await pool.query(`
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'atlas_packets'
      limit 1
    `);
    if (tableCheck.rowCount === 0) {
      throw new Error('atlas_packets table is missing');
    }

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
      atlasColumnSet.has('packet_key') ? 'packet_key' : 'NULL::text as packet_key',
      atlasColumnSet.has('source_ref') ? 'source_ref' : 'NULL::text as source_ref',
      atlasColumnSet.has('feature_id') ? 'feature_id' : 'NULL::text as feature_id',
      atlasColumnSet.has('feature_label') ? 'feature_label' : 'NULL::text as feature_label',
      atlasColumnSet.has('metadata') ? 'metadata' : 'NULL::jsonb as metadata',
      atlasColumnSet.has('qdrant_tag_id') ? 'qdrant_tag_id' : 'NULL::text as qdrant_tag_id',
      atlasColumnSet.has('cluster_id') ? 'cluster_id' : 'NULL::text as cluster_id',
      atlasColumnSet.has('community_id') ? 'community_id' : 'NULL::text as community_id',
      atlasColumnSet.has('som_cluster') ? 'som_cluster' : 'NULL::text as som_cluster',
      atlasColumnSet.has('domain_class') ? 'domain_class' : 'NULL::text as domain_class',
      atlasColumnSet.has('domain') ? 'domain' : 'NULL::text as domain',
      atlasColumnSet.has('ontology') ? 'ontology' : 'NULL::jsonb as ontology',
    ];

    const { rows } = await pool.query(
      `
        select ${selectParts.join(', ')}
        from atlas_packets
        where source_ref is not null
        order by updated_at desc nulls last, ${idColumn} desc
        limit $1
      `,
      [SAMPLE_LIMIT],
    );

    const samples = [];
    const fieldCoverage = Object.fromEntries(Object.keys(fieldAliases).map((key) => [key, 0]));
    let pointFoundCount = 0;
    let agreementCount = 0;
    let mismatchCount = 0;
    let missingCount = 0;

    for (const row of rows) {
      const sourceRef = String(row.source_ref ?? '').trim();
      let qPoint = null;
      if (row.qdrant_tag_id !== null && row.qdrant_tag_id !== undefined && String(row.qdrant_tag_id).trim()) {
        qPoint = await retrieveById(qdrant, row.qdrant_tag_id);
      }
      if (!qPoint && sourceRef) {
        qPoint = await retrieveBySourceRef(qdrant, sourceRef);
      }

      const payload = qPoint?.payload ?? {};
      if (qPoint) pointFoundCount += 1;
      else missingCount += 1;

      const comparison = {};
      let comparable = 0;
      let matched = 0;
      for (const [field, aliases] of Object.entries(fieldAliases)) {
        const pgValue = pickField(row, [field, ...aliases]);
        const qValue = pickField(payload, [field, ...aliases]);
        const match = valuesMatch(pgValue, qValue);
        comparison[field] = {
          pg: pgValue ?? null,
          qdrant: qValue ?? null,
          match,
        };
        if (pgValue !== null && pgValue !== undefined) {
          comparable += 1;
          if (match) {
            matched += 1;
            fieldCoverage[field] += 1;
          }
        }
      }

      const allComparableMatch = comparable > 0 && matched === comparable;
      if (allComparableMatch) agreementCount += 1;
      else if (qPoint) mismatchCount += 1;

      samples.push({
        id: row.row_id,
        source_ref: sourceRef || null,
        packet_key: row.packet_key ?? null,
        qdrant_point_id: qPoint?.id ?? null,
        comparable,
        matched,
        allComparableMatch,
        comparison,
      });
    }

    const total = rows.length;
    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      databaseUrl: DATABASE_URL.replace(/:[^:@/]+@/, ':***@'),
      qdrantUrl: QDRANT_URL,
      collection: COLLECTION,
      sampleLimit: SAMPLE_LIMIT,
      total,
      pointFoundCount,
      agreementCount,
      mismatchCount,
      missingCount,
      agreementPct: total > 0 ? Number(((agreementCount / total) * 100).toFixed(2)) : 0,
      pointFoundPct: total > 0 ? Number(((pointFoundCount / total) * 100).toFixed(2)) : 0,
      fieldCoverage: Object.fromEntries(
        Object.entries(fieldCoverage).map(([field, count]) => [
          field,
          {
            count,
            pct: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
          },
        ]),
      ),
      samples,
    };

    if (report.agreementPct < 95 || report.pointFoundPct < 95) {
      report.warning = 'Coverage below 95% on sampled atlas packets';
    }
  } catch (error) {
    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      databaseUrl: DATABASE_URL.replace(/:[^:@/]+@/, ':***@'),
      qdrantUrl: QDRANT_URL,
      collection: COLLECTION,
      sampleLimit: SAMPLE_LIMIT,
      error: error instanceof Error ? error.message : String(error),
      total: 0,
      pointFoundCount: 0,
      agreementCount: 0,
      mismatchCount: 0,
      missingCount: 0,
      agreementPct: 0,
      pointFoundPct: 0,
      fieldCoverage: {},
      samples: [],
    };
  } finally {
    await pool.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Qdrant Packet Payload Verify',
      '',
      `Generated: ${report.generatedAt}`,
      `Qdrant: ${report.qdrantUrl}`,
      `Collection: ${report.collection}`,
      `Sample limit: ${report.sampleLimit}`,
      '',
      '## Summary',
      '',
      `- Sample rows: ${report.total}`,
      `- Qdrant points found: ${report.pointFoundCount}`,
      `- Agreements: ${report.agreementCount}`,
      `- Mismatches: ${report.mismatchCount}`,
      `- Missing points: ${report.missingCount}`,
      `- Agreement pct: ${report.agreementPct}`,
      `- Point found pct: ${report.pointFoundPct}`,
      '',
      '## Field Coverage',
      '',
      ...Object.entries(report.fieldCoverage ?? {}).map(
        ([field, stats]) => `- ${field}: ${stats.count}/${report.total} (${stats.pct}%)`,
      ),
      '',
      '## Sample',
      '',
      ...report.samples.slice(0, 10).map((sample) =>
        `- ${sample.source_ref ?? 'n/a'} | point=${sample.qdrant_point_id ?? 'n/a'} | matched=${sample.matched}/${sample.comparable}`,
      ),
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify({ ok: true, report }, null, 2));
  process.exit(report.agreementPct >= 95 && report.pointFoundPct >= 95 ? 0 : 1);
}

main().catch((error) => {
  console.error('[atlas:qdrant:payload:verify] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
