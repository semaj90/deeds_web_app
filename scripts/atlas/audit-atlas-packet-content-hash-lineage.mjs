#!/usr/bin/env node
/**
 * Read-only hash-lineage reconciliation for the Postgres FTS identity gate.
 *
 * It compares candidate hash authorities without assuming that file hashes,
 * artifact hashes, and chunk hashes have the same semantics. No writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/atlas-packet-content-hash-lineage-v1.json');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 120000,
});

const report = {
  schema: 'atlas.atlas-packet-content-hash-lineage.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  status: 'UNKNOWN',
  authorities: {},
  classifications: {},
  samples: {},
  recommendation: null,
};

function numbers(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

try {
  await pool.query('BEGIN READ ONLY');

  const authorities = await pool.query(`
    SELECT
      (SELECT count(*) FROM public.atlas_packets) AS packets,
      (SELECT count(*) FROM public.atlas_packets WHERE content_hash IS NOT NULL) AS packets_content_hash,
      (SELECT count(*) FROM public.atlas_packets WHERE sha256 IS NOT NULL) AS packets_sha256,
      (SELECT count(*) FROM public.atlas_artifacts) AS artifacts,
      (SELECT count(*) FROM public.atlas_artifacts WHERE content_hash IS NOT NULL) AS artifacts_content_hash,
      (SELECT count(*) FROM public.atlas_source_refs) AS source_refs,
      (SELECT count(*) FROM public.atlas_source_refs WHERE content_hash IS NOT NULL) AS source_refs_content_hash,
      (SELECT count(*) FROM public.codebase_chunk_index) AS chunks,
      (SELECT count(*) FROM public.codebase_chunk_index WHERE content_hash IS NOT NULL) AS chunks_content_hash
  `);
  report.authorities = numbers(authorities.rows[0]);

  const classifications = await pool.query(`
    WITH packet_artifacts AS (
      SELECT p.packet_key,
             count(a.content_hash) AS artifact_hash_rows,
             count(DISTINCT a.content_hash) AS distinct_artifact_hashes
      FROM public.atlas_packets p
      LEFT JOIN public.atlas_artifacts a ON a.packet_key = p.packet_key
      GROUP BY p.packet_key
    ), source_candidates AS (
      SELECT p.packet_key,
             count(DISTINCT s.content_hash) AS distinct_source_hashes
      FROM public.atlas_packets p
      LEFT JOIN public.atlas_source_refs s
        ON s.relative_path = p.source_ref
        OR p.source_ref = 'sveltekit-frontend/' || s.relative_path
      GROUP BY p.packet_key
    ), chunk_candidates AS (
      SELECT p.packet_key,
             count(DISTINCT c.content_hash) AS distinct_chunk_hashes
      FROM public.atlas_packets p
      LEFT JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
      GROUP BY p.packet_key
    )
    SELECT
      count(*) FILTER (WHERE pa.artifact_hash_rows = 0) AS no_artifact_hash,
      count(*) FILTER (WHERE pa.distinct_artifact_hashes = 1) AS artifact_hash_unique,
      count(*) FILTER (WHERE pa.distinct_artifact_hashes > 1) AS artifact_hash_ambiguous,
      count(*) FILTER (WHERE sc.distinct_source_hashes = 0) AS no_source_ref_hash,
      count(*) FILTER (WHERE sc.distinct_source_hashes = 1) AS source_ref_hash_unique,
      count(*) FILTER (WHERE sc.distinct_source_hashes > 1) AS source_ref_hash_ambiguous,
      count(*) FILTER (WHERE cc.distinct_chunk_hashes = 0) AS no_chunk_hash,
      count(*) FILTER (WHERE cc.distinct_chunk_hashes = 1) AS chunk_hash_unique,
      count(*) FILTER (WHERE cc.distinct_chunk_hashes > 1) AS chunk_hash_ambiguous
    FROM packet_artifacts pa
    JOIN source_candidates sc USING (packet_key)
    JOIN chunk_candidates cc USING (packet_key)
  `);
  report.classifications = numbers(classifications.rows[0]);

  const compatible = await pool.query(`
    SELECT
      (SELECT count(*) FROM (
        SELECT p.packet_key
        FROM public.atlas_packets p
        JOIN public.atlas_artifacts a ON a.packet_key = p.packet_key
        WHERE p.content_hash IS NULL AND a.content_hash IS NOT NULL
        GROUP BY p.packet_key HAVING count(DISTINCT a.content_hash) = 1
      ) unique_packets) AS packets_with_unique_artifact_hash,
      (SELECT count(*) FROM public.codebase_chunk_index c
        JOIN public.atlas_source_refs s
          ON s.relative_path = c.source_ref AND s.content_hash = c.content_hash) AS chunk_source_hash_agreements,
      (SELECT count(*) FROM public.codebase_chunk_index c
        JOIN public.atlas_artifacts a
          ON a.source_ref = c.source_ref AND a.content_hash = c.content_hash) AS chunk_artifact_hash_agreements
  `);
  report.classifications = { ...report.classifications, ...numbers(compatible.rows[0]) };

  const samples = await pool.query(`
    SELECT p.packet_key, p.source_ref, p.sha256 AS packet_sha256,
           a.content_hash AS artifact_content_hash,
           length(a.content_hash) AS artifact_hash_length
    FROM public.atlas_packets p
    JOIN public.atlas_artifacts a ON a.packet_key = p.packet_key
    WHERE p.content_hash IS NULL AND a.content_hash IS NOT NULL
    ORDER BY p.packet_key, a.content_hash
    LIMIT 10
  `);
  report.samples.unique_artifact_candidates = samples.rows;
  report.status = 'READY';
  await pool.query('ROLLBACK');

  const c = report.classifications;
  report.recommendation = c.packets_with_unique_artifact_hash > 0
    ? 'REVIEW_REQUIRED: atlas_artifacts provides packet-keyed candidate hashes, but hash equivalence to codebase_chunk_index chunks is not proven. Generate an apply-bounded preview only after confirming whether the FTS index is chunk- or file-hash based.'
    : 'BLOCKED: no unique packet-keyed artifact hash candidates are available.';
} catch (error) {
  report.status = 'ERROR';
  report.error = error instanceof Error ? error.message : String(error);
  try { await pool.query('ROLLBACK'); } catch { /* connection may already be closed */ }
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  authorities: report.authorities,
  classifications: report.classifications,
  recommendation: report.recommendation,
  reportPath: path.relative(REPO_ROOT, REPORT_PATH).replaceAll('\\', '/'),
}, null, 2));
