#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { bestSourceRefMatch, normalizeSourceRef } from '../../../scripts/atlas/lib/normalize-source-ref.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'atlas-feature-parent-join-gap.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'atlas-feature-parent-join-gap.md');

function firstPresent(...values) {
  for (const value of values) {
    const normalized = normalizeSourceRef(value);
    if (normalized) return normalized;
  }
  return null;
}

async function loadTableColumns(pool, tableName) {
  const { rows } = await pool.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
    `,
    [tableName],
  );
  return new Set(rows.map((row) => String(row.column_name)));
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = resolveDatabaseUrl(process.env);
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  const generatedAt = new Date().toISOString();
  let report;

  try {
    const [featureMapColumns, parentColumns] = await Promise.all([
      loadTableColumns(pool, 'atlas_feature_map'),
      loadTableColumns(pool, 'parent_atlas_documents'),
    ]);

    const featureMapSelect = [
      featureMapColumns.has('source_ref') ? 'source_ref' : 'NULL::text AS source_ref',
      featureMapColumns.has('feature_id') ? 'feature_id' : 'NULL::text AS feature_id',
      featureMapColumns.has('normalized_path') ? 'normalized_path' : 'NULL::text AS normalized_path',
      featureMapColumns.has('cluster_id') ? 'cluster_id' : 'NULL::text AS cluster_id',
      featureMapColumns.has('som_cluster') ? 'som_cluster' : 'NULL::text AS som_cluster',
      featureMapColumns.has('qdrant_point_id') ? 'qdrant_point_id' : 'NULL::text AS qdrant_point_id',
    ].join(', ');

    const parentSelect = [
      parentColumns.has('source_ref') ? 'source_ref' : 'NULL::text AS source_ref',
      parentColumns.has('rel_path') ? 'rel_path' : 'NULL::text AS rel_path',
      parentColumns.has('directory_path') ? 'directory_path' : 'NULL::text AS directory_path',
      parentColumns.has('feature_id') ? 'feature_id' : 'NULL::text AS feature_id',
      parentColumns.has('workspace_id') ? 'workspace_id' : 'NULL::text AS workspace_id',
      parentColumns.has('qdrant_point_id') ? 'qdrant_point_id' : 'NULL::text AS qdrant_point_id',
      parentColumns.has('updated_at') ? 'updated_at' : 'NULL::timestamptz AS updated_at',
      parentColumns.has('id') ? 'id' : 'NULL::text AS id',
    ].join(', ');

    const [featureMapRows, parentRows] = await Promise.all([
      pool.query(`select ${featureMapSelect} from atlas_feature_map`),
      pool.query(`select ${parentSelect} from parent_atlas_documents`),
    ]);

    const parentIndex = new Map();
    for (const row of parentRows.rows) {
      const key = firstPresent(row.source_ref, row.rel_path, row.directory_path);
      if (key) parentIndex.set(key, row);
    }

    const joined = [];
    const gaps = [];
    const matchReasonCounts = {};
    const parentKeys = [...parentIndex.keys()];

    for (const row of featureMapRows.rows) {
      const candidateKeys = [firstPresent(row.source_ref, row.normalized_path)].filter(Boolean);
      const best = bestSourceRefMatch(row.source_ref ?? row.normalized_path ?? null, parentKeys);
      const matchedKey = candidateKeys.find((key) => parentIndex.has(key)) ?? (best?.target ?? null);
      const match = matchedKey ? parentIndex.get(matchedKey) : null;

      if (match) {
        const reason = best?.reason ?? (candidateKeys.includes(matchedKey) ? 'normalized' : 'unmatched');
        matchReasonCounts[reason] = (matchReasonCounts[reason] || 0) + 1;
        joined.push({
          source_ref: row.source_ref ?? null,
          feature_id: row.feature_id ?? null,
          normalized_path: row.normalized_path ?? null,
          parent_source_ref: match.source_ref ?? null,
          parent_rel_path: match.rel_path ?? null,
          workspace_id: match.workspace_id ?? null,
          match_reason: reason,
        });
      } else {
        gaps.push({
          source_ref: row.source_ref ?? null,
          feature_id: row.feature_id ?? null,
          normalized_path: row.normalized_path ?? null,
          candidate_keys: candidateKeys,
          match_reason: 'unmatched',
        });
      }
    }

    report = {
      generatedAt,
      dbReachable: true,
      totalAtlasFeatureMapRows: featureMapRows.rows.length,
      totalParentAtlasDocumentRows: parentRows.rows.length,
      joinedRows: joined.length,
      gapRows: gaps.length,
      gapCoveragePct: featureMapRows.rows.length > 0 ? Number(((joined.length / featureMapRows.rows.length) * 100).toFixed(2)) : 0,
      matchReasonCounts,
      sampleGaps: gaps.slice(0, 50),
      notes: [
        'Read-only join audit.',
        'Normalization handles backslashes, leading ./ and ../ segments, and repo-root prefixes.',
        'No inserts or updates were performed.',
      ],
    };
  } catch (error) {
    report = {
      generatedAt,
      dbReachable: false,
      error: error instanceof Error ? error.message : String(error),
      totalAtlasFeatureMapRows: 0,
      totalParentAtlasDocumentRows: 0,
      joinedRows: 0,
      gapRows: 0,
      gapCoveragePct: 0,
      matchReasonCounts: {},
      sampleGaps: [],
      notes: ['Postgres unavailable or query failed.'],
    };
  } finally {
    await pool.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    OUT_MD,
    [
      '# Atlas Feature ↔ Parent Atlas Join Gap',
      '',
      `Generated: ${report.generatedAt}`,
      `Postgres reachable: ${report.dbReachable ? 'yes' : 'no'}`,
      '',
      '## Summary',
      '',
      `- atlas_feature_map rows: ${report.totalAtlasFeatureMapRows}`,
      `- parent_atlas_documents rows: ${report.totalParentAtlasDocumentRows}`,
      `- joined rows: ${report.joinedRows}`,
      `- gap rows: ${report.gapRows}`,
      `- join coverage: ${report.gapCoveragePct}%`,
      '',
      '## Sample Gaps',
      '',
      ...report.sampleGaps.map((row) => `- ${row.source_ref ?? 'n/a'} | ${row.feature_id ?? 'n/a'} | norm=${(row.candidate_keys ?? []).join(', ') || 'n/a'}`),
      ...(report.sampleGaps.length === 0 ? ['- none'] : []),
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
