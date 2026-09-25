#!/usr/bin/env node

/**
 * JULY_SUMMARY_PROVENANCE_RECONCILIATION_01 — read-only. No regeneration, no writes, no Graphify.
 * Correlates: July summary populations x real vs placeholder packet embeddings x current packet/chunk summaries.
 * Emits a sealed per-packet manifest (.tmp/atlas) and a receipt (docs/reports). Exact keys only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const EXEC = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
let rows; let embeddedTotal;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await client.query(`
    WITH emb AS (SELECT packet_key, md5(embedding::text) AS h FROM public.atlas_packets WHERE embedding IS NOT NULL),
    grp AS (SELECT h, count(*)::int AS n FROM emb GROUP BY h),
    lim AS (SELECT greatest(1, floor(count(*) * 0.01))::int AS t FROM emb),
    cohort AS (SELECT DISTINCT source_ref, lower(code_source_revision) AS rev FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $1::uuid AND repository_id = 'repo:root'),
    l4 AS (SELECT packet_key, max(summary) AS layer_summary, count(*)::int AS layer_rows FROM public.atlas_summary_layers WHERE generated_at::date = date '2026-07-04' AND layer_type = 'gemma4_offline' GROUP BY packet_key),
    lany AS (SELECT packet_key, count(*)::int AS layer_rows_any FROM public.atlas_summary_layers GROUP BY packet_key),
    ck AS (SELECT source_ref, count(*)::int AS chunk_summaries, count(*) FILTER (WHERE metadata ? 'phase8_5_quarantine')::int AS chunk_quarantined
           FROM public.codebase_chunk_index WHERE summary IS NOT NULL AND btrim(summary) <> '' AND summary_model IS NULL GROUP BY source_ref)
    SELECT ap.packet_key, ap.source_ref, lower(ap.source_revision) AS packet_rev,
           (ap.summary IS NOT NULL AND btrim(ap.summary) <> '') AS has_summary,
           ap.summary_hash, encode(sha256(convert_to(coalesce(ap.summary,''), 'UTF8')), 'hex') AS summary_sha256,
           (ap.embedding IS NOT NULL) AS has_embedding, CASE WHEN ap.embedding IS NULL THEN NULL WHEN g.n > lim.t THEN 'PLACEHOLDER' ELSE 'REAL' END AS emb_class,
           ap.embedding_status, ap.embedding_eligible, ap.embedding_version, ap.embedding_timestamp::date AS emb_date, ap.embedding_digest,
           (l4.packet_key IS NOT NULL) AS in_july4_layer, (l4.layer_summary = ap.summary) AS summary_equals_july4_layer,
           coalesce(lany.layer_rows_any, 0) AS layer_rows_any,
           coalesce(ck.chunk_summaries, 0) AS chunk_summaries, coalesce(ck.chunk_quarantined, 0) AS chunk_quarantined,
           c.rev AS cohort_rev
    FROM public.atlas_packets ap
    LEFT JOIN emb ON emb.packet_key = ap.packet_key LEFT JOIN grp g ON g.h = emb.h CROSS JOIN lim
    LEFT JOIN l4 ON l4.packet_key = ap.packet_key LEFT JOIN lany ON lany.packet_key = ap.packet_key
    LEFT JOIN ck ON ck.source_ref = ap.source_ref LEFT JOIN cohort c ON c.source_ref = ap.source_ref
    WHERE ap.summary IS NOT NULL AND btrim(ap.summary) <> '' OR l4.packet_key IS NOT NULL OR ck.source_ref IS NOT NULL OR (emb.h IS NOT NULL AND g.n <= lim.t)`, [EXEC])).rows;
  embeddedTotal = (await client.query(`SELECT count(*)::int AS n FROM public.atlas_packets WHERE embedding IS NOT NULL`)).rows[0].n;
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

const tally = (fn, arr = rows) => arr.reduce((a, r) => { const k = fn(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});
const manifest = rows.map((r) => {
  const revClass = !r.packet_rev ? 'JULY_SUMMARY_REVISION_UNKNOWN' : !r.cohort_rev ? 'JULY_SUMMARY_REVISION_NOT_IN_CURRENT_COHORT' : r.packet_rev === r.cohort_rev ? 'JULY_SUMMARY_EXACT_CURRENT_REVISION' : 'JULY_SUMMARY_STALE_REVISION';
  return {
    packetKey: r.packet_key, sourceRef: r.source_ref, revisionClass: revClass, embeddingClass: r.emb_class === 'REAL' ? 'JULY_EMBEDDING_REAL' : r.emb_class === 'PLACEHOLDER' ? 'JULY_EMBEDDING_PLACEHOLDER' : 'NO_EMBEDDING',
    hasPacketSummary: r.has_summary, summaryHashEqualsSha256OfSummary: r.summary_hash ? r.summary_hash === r.summary_sha256 : null,
    inJuly4Layer: r.in_july4_layer, packetSummaryEqualsJuly4Layer: r.summary_equals_july4_layer ?? null, layerRowsAny: r.layer_rows_any,
    chunkSummariesSameRef: r.chunk_summaries, chunkQuarantinedSameRef: r.chunk_quarantined,
    embeddingStatus: r.embedding_status, embeddingEligible: r.embedding_eligible, embeddingVersionPresent: !!r.embedding_version, embeddingDate: r.emb_date ? String(r.emb_date).slice(0, 10) : null, embeddingDigestPresent: !!r.embedding_digest,
  };
});
const outDir = path.join(REPO_ROOT, '.tmp/atlas/july-summary-provenance-v1'); fs.mkdirSync(outDir, { recursive: true });
const body = manifest.map((m) => JSON.stringify(m)).join('\n') + '\n';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
fs.writeFileSync(path.join(outDir, `manifest-${stamp}.ndjson`), body, { flag: 'wx' });
const sha = crypto.createHash('sha256').update(body).digest('hex');

const M = manifest;
const inter = {
  packetsWithSummary: M.filter((m) => m.hasPacketSummary).length,
  realEmbedding: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL').length,
  placeholderEmbedding: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_PLACEHOLDER').length,
  july4LayerPackets: M.filter((m) => m.inJuly4Layer).length,
  realAndSummary: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL' && m.hasPacketSummary).length,
  realAndJuly4Layer: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL' && m.inJuly4Layer).length,
  realAndSummaryAndJuly4Layer: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL' && m.hasPacketSummary && m.inJuly4Layer).length,
  realAndChunkSummaries: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL' && m.chunkSummariesSameRef > 0).length,
  placeholderAndSummary: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_PLACEHOLDER' && m.hasPacketSummary).length,
  placeholderAndJuly4Layer: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_PLACEHOLDER' && m.inJuly4Layer).length,
  placeholderAndChunkSummaries: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_PLACEHOLDER' && m.chunkSummariesSameRef > 0).length,
  realWithoutAnySummary: M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL' && !m.hasPacketSummary).length,
};
const receipt = {
  schema: 'atlas.july-summary-provenance-reconciliation.v1', gate: 'JULY_SUMMARY_PROVENANCE_RECONCILIATION_01', mode: 'READ_ONLY', writesPerformed: false, regenerated: false,
  scope: { universe: 'all atlas_packets with a packet summary, a 2026-07-04 gemma4_offline layer row, same-ref July-era chunk summary, or a non-placeholder embedding', currentCohortExecutionId: EXEC },
  globalEmbedded: embeddedTotal, manifestRows: M.length, manifestPath: `.tmp/atlas/july-summary-provenance-v1/manifest-${stamp}.ndjson`, manifestSha256: sha,
  placeholderRule: 'embedding vector shared by >1% of all embedded packets',
  intersections: inter,
  revisionClasses: tally((m) => m.revisionClass, M), embeddingClasses: tally((m) => m.embeddingClass, M),
  embeddingByStatus: tally((m) => `${m.embeddingClass}|status=${m.embeddingStatus}|eligible=${m.embeddingEligible}|versioned=${m.embeddingVersionPresent}|digest=${m.embeddingDigestPresent}`, M),
  embeddingDates: { real: tally((m) => m.embeddingDate ?? 'null', M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_REAL')), placeholder: tally((m) => m.embeddingDate ?? 'null', M.filter((m) => m.embeddingClass === 'JULY_EMBEDDING_PLACEHOLDER')) },
  summaryHashSemantics: { hashEqualsSha256OfCurrentSummary: tally((m) => String(m.summaryHashEqualsSha256OfSummary), M.filter((m) => m.hasPacketSummary)) },
  packetSummaryVsJuly4Layer: tally((m) => String(m.packetSummaryEqualsJuly4Layer), M.filter((m) => m.inJuly4Layer)),
  notProven: ['exact writer of atlas_packets.summary for these rows', 'that embeddings were generated from these summaries (no embedding-input record found in row data)', 'go-retrieval indexing input (see go-retrieval trace)'],
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/july-summary-provenance-reconciliation-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
