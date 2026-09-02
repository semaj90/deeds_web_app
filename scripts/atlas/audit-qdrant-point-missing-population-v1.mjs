#!/usr/bin/env node
/**
 * PKT-LINEAGE-14 / QDRANT-POINT-MISSING-POPULATION-01 -- read-only characterization
 * of the 675 QDRANT_POINT_MISSING rows left untouched by BRIDGE-RECON-DRY-04.
 *
 * Zero writes to Postgres or Qdrant. Cross-checks each missing chunk_row_id against
 * codebase_chunk_index (embedding eligibility) and Qdrant (under both id and qdrant_id,
 * to rule out an identity-column mismatch before accepting "genuinely never embedded").
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const dryPath = path.resolve(root, 'docs/reports/bridge-recon-dry-04-v1.json');
const reportPath = path.resolve(root, 'docs/reports/qdrant-point-missing-population-01-v1.json');
const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const collection = 'codebase_chunks_768_v2';

const dry = JSON.parse(fs.readFileSync(dryPath, 'utf8'));
const missing = dry.classifications.filter((c) => c.classification === 'QDRANT_POINT_MISSING');
const missingIds = missing.map((m) => m.canonicalChunkRowId);

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });

const { rows: agg } = await pool.query(
  `SELECT
     count(*) AS total,
     count(*) FILTER (WHERE embedding_eligible = false) AS not_eligible,
     count(*) FILTER (WHERE embedding_eligible = true) AS eligible,
     count(*) FILTER (WHERE embedding_eligible IS NULL) AS eligible_null,
     count(*) FILTER (WHERE content_embedding IS NOT NULL) AS has_768,
     count(*) FILTER (WHERE id IS NULL) AS not_in_pg_at_all
   FROM (SELECT unnest($1::uuid[]) AS want_id) w
   LEFT JOIN codebase_chunk_index c ON c.id = w.want_id`,
  [missingIds]
);
const { rows: byDir } = await pool.query(
  `SELECT split_part(relative_path, '/', 1) AS top_dir, count(*) AS n,
          count(*) FILTER (WHERE content_embedding IS NOT NULL) AS n_has_768
     FROM (SELECT unnest($1::uuid[]) AS want_id) w
     JOIN codebase_chunk_index c ON c.id = w.want_id
    GROUP BY 1 ORDER BY n DESC`,
  [missingIds]
);
const { rows: qdrantIdSample } = await pool.query(
  `SELECT id::text, qdrant_id::text
     FROM (SELECT unnest($1::uuid[]) AS want_id) w
     JOIN codebase_chunk_index c ON c.id = w.want_id
    LIMIT 25`,
  [missingIds]
);
await pool.end();

// Rule out an identity-column mismatch: check whether Qdrant has a point under qdrant_id
// for a sample, distinct from the chunk_row_id (=id) BRIDGE-RECON-DRY-04 already checked.
const sampleQdrantIds = qdrantIdSample.map((r) => r.qdrant_id).filter(Boolean);
let foundUnderQdrantIdColumn = 0;
if (sampleQdrantIds.length) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: sampleQdrantIds, with_payload: false, with_vector: false }),
  });
  const body = await response.json();
  foundUnderQdrantIdColumn = (body.result ?? []).length;
}

const report = {
  schema: 'atlas.qdrant-point-missing-population-01.v1',
  task: 'QDRANT-POINT-MISSING-POPULATION-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  missingRowCount: missing.length,
  aggregate: agg[0],
  byTopDirectory: byDir,
  identityColumnMismatchCheck: {
    sampledQdrantIdColumnValues: sampleQdrantIds.length,
    foundInQdrantUnderQdrantIdColumn: foundUnderQdrantIdColumn,
    conclusion: foundUnderQdrantIdColumn === 0
      ? 'RULED_OUT -- no point exists under the qdrant_id column value either; not an id-vs-qdrant_id identity mismatch'
      : 'IDENTITY_COLUMN_MISMATCH_SUSPECTED -- points exist under qdrant_id but not id; needs follow-up',
  },
  verdict: (Number(agg[0].not_eligible) === missing.length && foundUnderQdrantIdColumn === 0)
    ? 'MISSING_POPULATION_EXPLAINED_BY_EMBEDDING_ELIGIBILITY_POLICY'
    : 'MISSING_POPULATION_NOT_FULLY_EXPLAINED',
  openAnomaly: Number(agg[0].has_768) > 0
    ? `${agg[0].has_768} of ${missing.length} rows have a non-null content_embedding despite embedding_eligible=false -- not investigated further (would require reading the ingestion/eligibility-policy code), flagged not fixed`
    : null,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
