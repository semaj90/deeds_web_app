#!/usr/bin/env node
/**
 * Smoke test for canonical title identity backfill.
 *
 * Selects 25 stale rows, applies canonical title generation, then repeats the
 * same apply to prove idempotency. The script writes a JSON report to
 * docs/reports/title-identity-backfill-smoke.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
  stableHash,
} from './lib/packet-audit-utils.mjs';
import {
  generateTitleIdentity,
  TITLE_GENERATOR_VERSION,
} from '../../sveltekit-frontend/src/lib/server/ace/title-id-generator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const { Pool } = pg;

const LIMIT = Math.max(1, parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '25', 10) || 25);
const APPLY = !process.argv.includes('--dry-run');

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });

function buildCanonicalTitle(row) {
  return generateTitleIdentity(row.packet_key, {
    featureLabel: row.feature_id ?? undefined,
    symbolName: row.symbol_name ?? undefined,
    symbolKind: row.symbol_kind ?? undefined,
    domain: row.domain_class ?? undefined,
    summary: row.summary ?? undefined,
    sourceFilename: row.source_ref ?? undefined,
  });
}

async function selectEligibleRows(client, limit) {
  const { rows } = await client.query(
    `
      SELECT
        packet_key,
        source_ref,
        feature_id,
        qdrant_point_id,
        title_id,
        title_generator_version,
        summary,
        domain_class,
        feature_label,
        metadata,
        payload
      FROM atlas_packets
      WHERE title_generator_version IS DISTINCT FROM $1
      ORDER BY packet_key
      LIMIT $2
    `,
    [TITLE_GENERATOR_VERSION, limit],
  );
  return rows;
}

async function updateRows(client, rows, nextVersion) {
  if (rows.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  const packetKeys = [];
  const titleIds = [];

  for (const row of rows) {
    const generated = buildCanonicalTitle(row);
    packetKeys.push(row.packet_key);
    titleIds.push(generated.titleId);
  }

  const { rowCount } = await client.query(
    `
      UPDATE atlas_packets ap
      SET
        title_id = v.title_id,
        title_generator_version = $3,
        updated_at = NOW()
      FROM (
        SELECT unnest($1::text[]) AS packet_key, unnest($2::text[]) AS title_id
      ) v
      WHERE ap.packet_key = v.packet_key
        AND (
          ap.title_id IS DISTINCT FROM v.title_id
          OR ap.title_generator_version IS DISTINCT FROM $3
        )
    `,
    [packetKeys, titleIds, nextVersion],
  );

  return {
    updated: rowCount ?? 0,
    skipped: rows.length - (rowCount ?? 0),
    packetKeys,
    titleIds,
  };
}

async function main() {
  const client = await pool.connect();
  const runId = `title-smoke-${stableHash({ ts: new Date().toISOString(), limit: LIMIT })}`;
  const startTime = Date.now();

  try {
    const firstRows = await selectEligibleRows(client, LIMIT);
    const firstPreview = firstRows.map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      qdrant_point_id: row.qdrant_point_id,
      title_id_before: row.title_id,
      title_generator_version_before: row.title_generator_version,
      canonical_title_id: buildCanonicalTitle(row).titleId,
    }));

    let firstApply = { updated: 0, skipped: firstRows.length };
    if (APPLY) {
      firstApply = await updateRows(client, firstRows, TITLE_GENERATOR_VERSION);
    }

    const secondRows = await client.query(
      `
        SELECT
          packet_key,
          source_ref,
          feature_id,
          qdrant_point_id,
          title_id,
          title_generator_version,
          summary,
          domain_class,
          feature_label,
          metadata,
          payload
        FROM atlas_packets
        WHERE packet_key = ANY($1::text[])
        ORDER BY packet_key
      `,
      [firstRows.map((row) => row.packet_key)],
    );

    const secondApplyCandidates = secondRows.rows.filter((row) => {
      const generated = buildCanonicalTitle(row);
      return row.title_id !== generated.titleId || row.title_generator_version !== TITLE_GENERATOR_VERSION;
    });

    let secondApply = { updated: 0, skipped: secondRows.rows.length };
    if (APPLY) {
      secondApply = await updateRows(client, secondRows.rows, TITLE_GENERATOR_VERSION);
    }

    const verifyRows = await client.query(
      `
        SELECT
          packet_key,
          source_ref,
          feature_id,
          qdrant_point_id,
          title_id,
          title_generator_version
        FROM atlas_packets
        WHERE packet_key = ANY($1::text[])
        ORDER BY packet_key
      `,
      [firstRows.map((row) => row.packet_key)],
    );

    const mismatches = verifyRows.rows.filter((row) => {
      const generated = buildCanonicalTitle(row);
      return row.title_id !== generated.titleId || row.title_generator_version !== TITLE_GENERATOR_VERSION;
    });

    const report = {
      generatedAt: new Date().toISOString(),
      runId,
      limit: LIMIT,
      mode: APPLY ? 'apply' : 'dry-run',
      generatorVersion: TITLE_GENERATOR_VERSION,
      totals: {
        selectedRows: firstRows.length,
        firstApplyUpdated: firstApply.updated,
        firstApplySkipped: firstApply.skipped,
        secondApplyUpdated: secondApply.updated,
        secondApplySkipped: secondApply.skipped,
        verifyMismatches: mismatches.length,
      },
      checks: {
        packetKeyStable: verifyRows.rows.every((row, index) => row.packet_key === firstRows[index]?.packet_key),
        sourceRefStable: verifyRows.rows.every((row, index) => row.source_ref === firstRows[index]?.source_ref),
        featureIdStable: verifyRows.rows.every((row, index) => row.feature_id === firstRows[index]?.feature_id),
        qdrantPointIdStable: verifyRows.rows.every((row, index) => row.qdrant_point_id === firstRows[index]?.qdrant_point_id),
        titleIdCanonical: mismatches.length === 0,
      },
      sample: firstPreview.slice(0, 10),
      mismatches: mismatches.slice(0, 10).map((row) => ({
        packet_key: row.packet_key,
        title_id: row.title_id,
        title_generator_version: row.title_generator_version,
        canonical_title_id: buildCanonicalTitle(row).titleId,
      })),
      status: APPLY && firstApply.updated > 0 && secondApply.updated === 0 && mismatches.length === 0 ? 'PASS' : 'WARN',
      durationMs: Date.now() - startTime,
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(REPORTS_DIR, 'title-identity-backfill-smoke.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));

    if (APPLY && (firstApply.updated === 0 || secondApply.updated !== 0 || mismatches.length > 0)) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[title-identity-backfill-smoke] failed:', error?.stack ?? error?.message ?? error);
  process.exit(1);
});

