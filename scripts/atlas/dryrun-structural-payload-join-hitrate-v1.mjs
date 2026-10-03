#!/usr/bin/env node
/**
 * parent-atlas-qdrant-structural-payload-enrichment task 2.1: read-only
 * measurement of how well codebase_chunks_768 Qdrant points would join to
 * the existing atlas_observation_records table (family='AST') if a
 * structural-payload enrichment writer were built. No Qdrant setPayload,
 * no Postgres writes anywhere in this file.
 *
 * Join key resolution mirrors SEMANTIC-CORPUS-ADMISSION-01's
 * resolveCanonicalId() fallback chain (canonical_id > canonical_source_ref
 * > source_ref_key > packet_key > source_ref), because that's the field
 * that already resolves cleanly for 100% of codebase_chunks_768 points
 * (see docs/reports/semantic-corpus-admission-v1.json). atlas_observation_records
 * has no canonical_id column -- it has source_ref (+ candidate_id) instead,
 * so the practical join is against source_ref, with candidate_id reported
 * separately for visibility.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'docs/reports/structural-payload-join-hitrate-dryrun-v1.json');
const env = loadRepoEnv(process.env);
const QDRANT_URL = (env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const OWNER_COLLECTION = 'codebase_chunks_768';
const SCROLL_PAGE_SIZE = 1000;

function resolveSourceRef(payload) {
  return payload.canonical_source_ref ?? payload.source_ref ?? payload.canonical_id ?? null;
}

async function scrollCollection(name) {
  const points = [];
  let offset = null;
  for (;;) {
    const body = { limit: SCROLL_PAGE_SIZE, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;
    const res = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(name)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) break;
    const json = await res.json();
    const batch = json?.result?.points ?? [];
    for (const point of batch) points.push({ id: point.id, payload: point.payload ?? {} });
    offset = json?.result?.next_page_offset ?? null;
    if (!offset || batch.length === 0) break;
  }
  return points;
}

async function main() {
  const report = {
    schema: 'atlas.structural-payload-join-hitrate-dryrun.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_MEASUREMENT',
    readOnlyInvariants: { writesPerformed: false, qdrantModified: false, postgresModified: false },
  };

  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 30000 });
  let tableExists = false;
  let astObservationCount = 0;
  let distinctSourceRefsWithAst = 0;
  try {
    const existsCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'atlas_observation_records') AS exists`,
    );
    tableExists = existsCheck.rows[0].exists;
    if (tableExists) {
      const countRes = await pool.query(`SELECT count(*)::int AS count FROM atlas_observation_records WHERE family = 'AST'`);
      astObservationCount = countRes.rows[0].count;
      const distinctRes = await pool.query(`SELECT count(DISTINCT source_ref)::int AS count FROM atlas_observation_records WHERE family = 'AST'`);
      distinctSourceRefsWithAst = distinctRes.rows[0].count;
    }
  } finally {
    // keep pool open for the per-point join query below
  }

  report.atlasObservationRecordsTableExists = tableExists;
  report.astObservationRowCount = astObservationCount;
  report.distinctSourceRefsWithAstObservation = distinctSourceRefsWithAst;

  if (!tableExists || astObservationCount === 0) {
    report.status = 'NO_STRUCTURAL_EVIDENCE_TO_JOIN';
    report.explanation = tableExists
      ? 'atlas_observation_records exists but has zero family=AST rows -- no structural evidence has actually been materialized into Postgres yet, despite the AstGrepObservationV1 adapter/schema existing in code. Enrichment cannot proceed until something populates this table.'
      : 'atlas_observation_records table does not exist in the live schema -- the persisted-observation half of this pipeline has not been applied yet, only the in-memory adapter/schema code exists.';
    await pool.end();
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: report.status, reportPath: 'docs/reports/structural-payload-join-hitrate-dryrun-v1.json' }, null, 2));
    return;
  }

  const points = await scrollCollection(OWNER_COLLECTION);
  const sourceRefs = points.map((p) => resolveSourceRef(p.payload)).filter((v) => v !== null);
  const distinctQdrantSourceRefs = [...new Set(sourceRefs)];

  let joinable = 0;
  const CHUNK = 500;
  for (let i = 0; i < distinctQdrantSourceRefs.length; i += CHUNK) {
    const slice = distinctQdrantSourceRefs.slice(i, i + CHUNK);
    const res = await pool.query(
      `SELECT DISTINCT source_ref FROM atlas_observation_records WHERE family = 'AST' AND source_ref = ANY($1::text[])`,
      [slice],
    );
    joinable += res.rows.length;
  }
  await pool.end();

  report.pointsScanned = points.length;
  report.pointsMissingSourceRef = points.length - sourceRefs.length;
  report.distinctQdrantSourceRefs = distinctQdrantSourceRefs.length;
  report.distinctSourceRefsJoinableToAstObservations = joinable;
  report.joinHitRatePercent = distinctQdrantSourceRefs.length > 0
    ? Number(((joinable / distinctQdrantSourceRefs.length) * 100).toFixed(2))
    : 0;
  report.status = joinable > 0 ? 'PARTIAL_JOIN_COVERAGE_MEASURED' : 'ZERO_JOIN_COVERAGE';
  report.explanation = `${joinable}/${distinctQdrantSourceRefs.length} distinct source_refs in ${OWNER_COLLECTION} have at least one family=AST row in atlas_observation_records (${report.joinHitRatePercent}%). This bounds the realistic coverage of any structural-payload enrichment writer built against the current data -- it cannot exceed this rate without first materializing more AST observations.`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    astObservationRowCount: report.astObservationRowCount,
    distinctQdrantSourceRefs: report.distinctQdrantSourceRefs,
    joinHitRatePercent: report.joinHitRatePercent,
    reportPath: 'docs/reports/structural-payload-join-hitrate-dryrun-v1.json',
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exit(1);
});
