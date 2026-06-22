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

const COARSE_FEATURE_ID_VALUES = new Set([
  'db',
  'routes',
  'ai',
  'api',
  'ui',
  'graph',
  'search',
  'retrieval',
  'packet',
  'src',
  'lib',
  'server',
  'client',
  'components',
]);

function isCoarseFeatureId(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  if (COARSE_FEATURE_ID_VALUES.has(text)) return true;
  return /^[a-z]{1,4}$/.test(text) && !/[./:_-]/.test(text);
}

function chooseCanonicalFeatureId(pgFeatureId, qdrantFeatureId) {
  const pg = String(pgFeatureId ?? '').trim();
  const qdrant = String(qdrantFeatureId ?? '').trim();
  if (pg) return { feature_id: pg, qdrant_coarse_feature: isCoarseFeatureId(qdrant) ? qdrant : null };
  if (qdrant) return { feature_id: qdrant, qdrant_coarse_feature: isCoarseFeatureId(qdrant) ? qdrant : null };
  return { feature_id: null, qdrant_coarse_feature: null };
}

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
    const candidateTables = ['atlas_codebase_packets', 'atlas_feature_packets', 'atlas_packets', 'task_semantic_packets', 'parent_atlas_documents'];
    const { rows: existingTables } = await pool.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any(ARRAY[${candidateTables.map((table) => `'${table}'`).join(', ')}]::text[])
      order by table_name asc
    `);
    if (existingTables.length === 0) {
      throw new Error('No canonical packet ledger tables are available');
    }

    const rows = [];
    for (const { table_name: tableName } of existingTables) {
      const { rows: columnRows } = await pool.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
      `, [tableName]);
      const columnSet = new Set(columnRows.map((row) => row.column_name));
      const idColumn = columnSet.has('id')
        ? 'id'
        : columnSet.has('packet_id')
          ? 'packet_id'
          : columnSet.has('packet_key')
            ? 'packet_key'
            : null;
      if (!idColumn) continue;

      const selectParts = [
        `${idColumn} as row_id`,
        `'${tableName}' as source_table`,
        columnSet.has('packet_key') ? 'packet_key' : 'NULL::text as packet_key',
        columnSet.has('source_ref') ? 'source_ref' : 'NULL::text as source_ref',
        columnSet.has('feature_id') ? 'feature_id' : 'NULL::text as feature_id',
        columnSet.has('feature_label') ? 'feature_label' : 'NULL::text as feature_label',
        columnSet.has('metadata') ? 'metadata' : 'NULL::jsonb as metadata',
        columnSet.has('qdrant_tag_id') ? 'qdrant_tag_id' : 'NULL::text as qdrant_tag_id',
        columnSet.has('cluster_id') ? 'cluster_id' : 'NULL::text as cluster_id',
        columnSet.has('community_id') ? 'community_id' : 'NULL::text as community_id',
        columnSet.has('som_cluster') ? 'som_cluster' : 'NULL::text as som_cluster',
        columnSet.has('domain_class') ? 'domain_class' : 'NULL::text as domain_class',
        columnSet.has('domain') ? 'domain' : 'NULL::text as domain',
        columnSet.has('ontology') ? 'ontology' : 'NULL::jsonb as ontology',
      ];

      const tableRows = await pool.query(
        `
          select ${selectParts.join(', ')}
          from public.${tableName}
          where coalesce(${columnSet.has('source_ref') ? 'source_ref' : 'null'}, ${columnSet.has('packet_key') ? 'packet_key' : 'null'}, ${columnSet.has('feature_id') ? 'feature_id' : 'null'}) is not null
          order by ${columnSet.has('updated_at') ? 'updated_at desc nulls last,' : ''} ${idColumn} desc
          limit $1
        `,
        [SAMPLE_LIMIT],
      );
      rows.push(...tableRows.rows);
    }

    const samples = [];
    const fieldCoverage = Object.fromEntries(Object.keys(fieldAliases).map((key) => [key, 0]));
    let pointFoundCount = 0;
    let agreementCount = 0;
    let mismatchCount = 0;
    let missingCount = 0;
    let contradictionCount = 0;
    const contradictions = [];

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
      const pgFeatureId = pickField(row, ['feature_id', 'featureId']);
      const qdrantFeatureId = pickField(payload, ['feature_id', 'featureId']);
      const resolvedFeature = chooseCanonicalFeatureId(pgFeatureId, qdrantFeatureId);
      const featureContradiction =
        Boolean(pgFeatureId && qdrantFeatureId) &&
        String(pgFeatureId).trim() !== String(qdrantFeatureId).trim() &&
        isCoarseFeatureId(qdrantFeatureId) &&
        !isCoarseFeatureId(pgFeatureId);

      if (featureContradiction) {
        contradictionCount += 1;
        if (contradictions.length < 20) {
          contradictions.push({
            source_ref: sourceRef || null,
            packet_key: row.packet_key ?? null,
            postgres_feature_id: String(pgFeatureId ?? ''),
            qdrant_feature_id: String(qdrantFeatureId ?? ''),
            resolved_feature_id: resolvedFeature.feature_id,
            qdrant_coarse_feature: resolvedFeature.qdrant_coarse_feature,
          });
        }
      }

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
        feature_contradiction: featureContradiction,
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
      contradictionCount,
      agreementPct: total > 0 ? Number(((agreementCount / total) * 100).toFixed(2)) : 0,
      pointFoundPct: total > 0 ? Number(((pointFoundCount / total) * 100).toFixed(2)) : 0,
      postgresQdrantNoContradictions: contradictionCount === 0,
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
      contradictions,
    };

    if (report.agreementPct < 95 || report.pointFoundPct < 95 || contradictionCount > 0) {
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
      `- Contradictions: ${report.contradictionCount ?? 0}`,
      `- Agreement pct: ${report.agreementPct}`,
      `- Point found pct: ${report.pointFoundPct}`,
      `- postgres_qdrant_no_contradictions: ${report.postgresQdrantNoContradictions ? 'PASS' : 'FAIL'}`,
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
      '',
      '## Contradictions',
      '',
      ...(report.contradictions ?? []).length
        ? report.contradictions.map((item) =>
            `- ${item.source_ref ?? 'n/a'} | pg=${item.postgres_feature_id} | qdrant=${item.qdrant_feature_id} | resolved=${item.resolved_feature_id}`,
          )
        : ['- none'],
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify({ ok: true, report }, null, 2));
  process.exit(report.agreementPct >= 95 && report.pointFoundPct >= 95 && contradictionCount === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('[atlas:qdrant:payload:verify] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
