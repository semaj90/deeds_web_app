#!/usr/bin/env node
/**
 * Phase 16-H gap classifier
 *
 * Classifies atlas_higher_hop_index rows missing qdrant_point_id into:
 *  - non_vector_identity
 *  - source_ref_collision
 *  - not_indexed_in_qdrant
 *
 * Default: read-only report.
 * --apply: mark non-vector stub rows as partial in repair_status and add
 *          qdrant_missing_reason into metadata only.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdir, writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');
const REPORTS = resolve(ROOT, 'docs', 'reports');

dotenv.config({ path: resolve(ROOT, '.env') });

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getArg = (name) => {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return null;
};

const APPLY = hasFlag('--apply');
const LIMIT = parseInt(getArg('limit') || '0', 10);
const DB_URL = process.env.DATABASE_URL;

const pool = new pg.Pool({ connectionString: DB_URL });

const log = {
  info: (msg) => console.log(`[phase-16-h-gap] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

function normalize(v) {
  return String(v ?? '').trim();
}

function missingReason(row, sourceCounts) {
  const lane = normalize(row.identity_lane).toLowerCase();
  if (['mcp_tool_stub', 'schema_stub', 'non_vector_identity', 'tool_stub', 'schema_only'].some((x) => lane.includes(x))) {
    return { category: 'A', reason: 'non_vector_identity', repairStatus: 'partial', confidence: 0.95 };
  }

  const sourceRefKey = normalize(row.source_ref_key);
  const sourceRef = normalize(row.source_ref);
  const key = sourceRefKey || sourceRef;
  const sourceCount = key ? (sourceCounts.get(key) || 0) : 0;

  if (key && sourceCount > 1) {
    const disambiguators = [];
    if (normalize(row.chunk_id)) disambiguators.push('chunk_id');
    if (normalize(row.content_hash)) disambiguators.push('content_hash');
    if (normalize(row.qdrant_collection)) disambiguators.push('qdrant_collection');
    if (normalize(row.packet_key)) disambiguators.push('packet_key');
    if (disambiguators.length > 0) {
      return {
        category: 'B',
        reason: 'source_ref_collision',
        repairStatus: 'partial',
        confidence: 0.7,
        disambiguators,
      };
    }
    return {
      category: 'B',
      reason: 'source_ref_collision',
      repairStatus: 'partial',
      confidence: 0.55,
      disambiguators: [],
    };
  }

  if (key) {
    return { category: 'C', reason: 'not_indexed_in_qdrant', repairStatus: 'pending', confidence: 0.4 };
  }

  return { category: 'C', reason: 'not_indexed_in_qdrant', repairStatus: 'pending', confidence: 0.2 };
}

async function main() {
  await mkdir(REPORTS, { recursive: true });
  const client = await pool.connect();

  try {
    log.info('Phase 16-H Qdrant gap classifier');
    log.info(APPLY ? 'Mode: APPLY' : 'Mode: REPORT');

    const { rows } = await client.query(`
      SELECT
        id,
        packet_key,
        source_ref,
        source_ref_key,
        chunk_id,
        content_hash,
        qdrant_collection,
        qdrant_point_id,
        identity_lane,
        repair_status,
        metadata
      FROM atlas_higher_hop_index
      WHERE qdrant_point_id IS NULL
      ORDER BY packet_key NULLS LAST, source_ref_key NULLS LAST, id
      ${LIMIT > 0 ? 'LIMIT $1' : ''}
    `, LIMIT > 0 ? [LIMIT] : []);

    const sourceCounts = new Map();
    for (const row of rows) {
      const key = normalize(row.source_ref_key) || normalize(row.source_ref);
      if (!key) continue;
      sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
    }

    const classified = [];
    const counts = {
      total: rows.length,
      A: 0,
      B: 0,
      C: 0,
      partial: 0,
      pending: 0,
    };

    for (const row of rows) {
      const cls = missingReason(row, sourceCounts);
      classified.push({
        id: row.id,
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        source_ref_key: row.source_ref_key,
        chunk_id: row.chunk_id,
        content_hash: row.content_hash,
        qdrant_collection: row.qdrant_collection,
        identity_lane: row.identity_lane,
        ...cls,
      });
      counts[cls.category]++;
      counts[cls.repairStatus]++;
    }

    const report = {
      generated_at: new Date().toISOString(),
      limit: LIMIT || null,
      apply: APPLY,
      total_missing_qdrant_point_id: rows.length,
      counts,
      categories: {
        A: classified.filter((r) => r.category === 'A').length,
        B: classified.filter((r) => r.category === 'B').length,
        C: classified.filter((r) => r.category === 'C').length,
      },
      examples: classified.slice(0, 25),
    };

    const jsonPath = resolve(REPORTS, 'phase-16-h-qdrant-gap-classifier.json');
    const mdPath = resolve(REPORTS, 'phase-16-h-qdrant-gap-classifier.md');

    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(
      mdPath,
      [
        '# Phase 16-H Qdrant Gap Classifier',
        '',
        `Generated: ${report.generated_at}`,
        `Mode: ${APPLY ? 'APPLY' : 'REPORT'}`,
        `Rows missing qdrant_point_id: ${report.total_missing_qdrant_point_id}`,
        '',
        '## Counts',
        '',
        `- A non_vector_identity: ${report.categories.A}`,
        `- B source_ref_collision: ${report.categories.B}`,
        `- C not_indexed_in_qdrant: ${report.categories.C}`,
        '',
        '## Repair status',
        '',
        `- partial: ${report.counts.partial}`,
        `- pending: ${report.counts.pending}`,
        '',
        '## Notes',
        '',
        '- A rows can be marked partial safely.',
        '- B rows need compound-key resolution.',
        '- C rows are unresolved Qdrant misses.',
      ].join('\n'),
      'utf8'
    );

    if (APPLY) {
      const applyRows = classified.filter((r) => r.category === 'A');
      let updated = 0;
      for (const row of applyRows) {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        metadata.qdrant_missing_reason = row.reason;
        metadata.qdrant_gap_class = row.category;
        metadata.qdrant_gap_confidence = row.confidence;
        const res = await client.query(
          `
            UPDATE atlas_higher_hop_index
            SET repair_status = $2,
                metadata = jsonb_set(
                  jsonb_set(
                    jsonb_set(COALESCE(metadata, '{}'::jsonb), '{qdrant_missing_reason}', to_jsonb($3::text), true),
                    '{qdrant_gap_class}', to_jsonb($4::text), true
                  ),
                  '{qdrant_gap_confidence}', to_jsonb($5::float8), true
                ),
                updated_at = NOW()
            WHERE id = $1
          `,
          [row.id, row.repairStatus, row.reason, row.category, row.confidence]
        );
        updated += res.rowCount;
      }
      report.updated_partial_rows = updated;
      await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      await writeFile(
        mdPath,
        [
          '# Phase 16-H Qdrant Gap Classifier',
          '',
          `Generated: ${report.generated_at}`,
          `Mode: APPLY`,
          `Rows missing qdrant_point_id: ${report.total_missing_qdrant_point_id}`,
          `Rows updated to partial: ${updated}`,
          '',
          '## Counts',
          '',
          `- A non_vector_identity: ${report.categories.A}`,
          `- B source_ref_collision: ${report.categories.B}`,
          `- C not_indexed_in_qdrant: ${report.categories.C}`,
          '',
          '## Repair status',
          '',
          `- partial: ${report.counts.partial}`,
          `- pending: ${report.counts.pending}`,
        ].join('\n'),
        'utf8'
      );
    }

    log.ok(`Classified ${rows.length} missing qdrant rows`);
    log.ok(`A non_vector_identity: ${report.categories.A}`);
    log.ok(`B source_ref_collision: ${report.categories.B}`);
    log.ok(`C not_indexed_in_qdrant: ${report.categories.C}`);
    log.ok(`Reports written: ${jsonPath}, ${mdPath}`);
  } catch (err) {
    log.error(err.message);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
