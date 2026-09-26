#!/usr/bin/env node

/**
 * Sealed local EnrichedIndexRecordV1 shards for the current admitted cohort.
 * Reads PostgreSQL read-only; writes only local files under .tmp/atlas/ plus one
 * report. Exact source_ref joins only. Lineage is never inferred:
 *   summary present != revision-qualified; embedding present != identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { classifyFileCapabilityV1, extensionOf } from './lib/current-file-capability-classification-v1.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
const outputRoot = path.resolve(REPO_ROOT, arg('--output-root') ?? '.tmp/atlas/current-enriched-index-shards-v1');
const reportPath = path.resolve(REPO_ROOT, arg('--report-path') ?? 'docs/reports/current-enriched-index-shards-v1.json');
const SHARD_SIZE = 5000;
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '')) throw new Error('EXPLICIT_WORKSPACE_REVISION_REQUIRED');
if (!/^[0-9a-f-]{36}$/.test(executionId ?? '')) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 180000 });
const client = await pool.connect();
let rows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await client.query(`
    WITH m AS (
      SELECT DISTINCT source_ref, lower(code_source_revision) AS rev, lower(content_hash) AS chash
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision::text = $2 AND repository_id = 'repo:root'),
    ck AS (
      SELECT m.source_ref, count(DISTINCT c.id)::int AS chunk_rows,
             count(DISTINCT c.id) FILTER (WHERE c.summary_text IS NOT NULL AND btrim(c.summary_text) <> '')::int AS chunk_summary_text_rows,
             count(DISTINCT c.id) FILTER (WHERE c.summary_provenance IS NOT NULL)::int AS chunk_summary_provenance_rows,
             count(DISTINCT c.id) FILTER (WHERE c.summary_provenance->>'sourceRevision' = m.rev
               AND c.summary_provenance->>'workspaceRevision' = $2)::int AS chunk_summary_revision_bound_rows,
             array_agg(DISTINCT c.summary_model) FILTER (WHERE c.summary_text IS NOT NULL AND c.summary_model IS NOT NULL) AS chunk_summary_models,
             array_agg(DISTINCT c.summary_provenance->>'modelRevision') FILTER (WHERE NULLIF(c.summary_provenance->>'modelRevision', '') IS NOT NULL) AS chunk_summary_model_revisions,
             jsonb_agg(DISTINCT c.summary_provenance->'generationParameters') FILTER (
               WHERE c.summary_provenance->'generationParameters' IS NOT NULL
                 AND c.summary_provenance->'generationParameters' <> 'null'::jsonb) AS chunk_summary_generation_parameters,
             bool_or(c.summary_text IS NOT NULL AND btrim(c.summary_text) <> '') AS chunk_has_summary,
             bool_or(c.content_embedding IS NOT NULL) AS chunk_has_semantic_768,
             bool_or(c.source_revision IS NOT NULL) AS chunk_has_revision
      FROM m
      JOIN public.atlas_packet_chunk_lineage l
        ON l.source_ref = m.source_ref AND l.source_revision = m.rev AND l.revision_status = 'PROVEN'
      JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
      GROUP BY m.source_ref, m.rev)
    SELECT m.source_ref, m.rev, m.chash,
           ap.packet_key, lower(ap.source_revision) AS packet_source_revision, ap.content_hash AS packet_content_hash, lower(replace(ap.sha256, 'sha256:', '')) AS packet_sha256,
           (ap.summary IS NOT NULL AND btrim(ap.summary) <> '') AS packet_has_summary,
           length(ap.summary)::int AS packet_summary_length, ap.summary_hash,
           coalesce(ap.domain_class, ap.primary_domain) AS domain_class,
           ap.community_id, coalesce(ap.kmeans_cluster, ap.kmeans_cluster_id) AS cluster_id,
           ap.som_cell_x, ap.som_cell_y, (ap.embedding IS NOT NULL) AS packet_has_embedding,
           coalesce(ap.pagerank_raw, ap.pagerank_score) AS pagerank,
           coalesce(ck.chunk_rows, 0) AS chunk_rows, coalesce(ck.chunk_has_summary, false) AS chunk_has_summary,
           coalesce(ck.chunk_summary_text_rows, 0) AS chunk_summary_text_rows,
           coalesce(ck.chunk_summary_provenance_rows, 0) AS chunk_summary_provenance_rows,
           coalesce(ck.chunk_summary_revision_bound_rows, 0) AS chunk_summary_revision_bound_rows,
           ck.chunk_summary_models, ck.chunk_summary_model_revisions, ck.chunk_summary_generation_parameters,
           coalesce(ck.chunk_has_semantic_768, false) AS chunk_has_semantic_768, coalesce(ck.chunk_has_revision, false) AS chunk_has_revision
    FROM m LEFT JOIN public.atlas_packets ap ON ap.source_ref = m.source_ref
           LEFT JOIN ck ON ck.source_ref = m.source_ref
    ORDER BY m.source_ref`, [executionId, workspaceRevision])).rows;
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* already closed */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}

function lineageState(r) {
  if (r.packet_key) {
    if (!r.packet_source_revision) return 'REVISION_MISSING';
    if (r.packet_source_revision !== r.rev) return 'REVISION_CONFLICT';
    // packet.sha256 is a whole-file hash; if present it must agree with the admitted hash.
    if (r.packet_sha256 && r.packet_sha256 !== String(r.chash).replace(/^sha256:/, '')) return 'REVISION_HASH_CONFLICT';
    return 'REVISION_QUALIFIED';
  }
  return r.chunk_rows > 0 ? 'LEGACY_ONLY' : 'IDENTITY_UNRESOLVED';
}

const records = rows.map((r) => {
  const cap = classifyFileCapabilityV1({ sourceRef: r.source_ref, lineageClass: 'AST_EVIDENCE_ABSENT' });
  const astEligibility = cap.outcome === 'NOT_AST_ELIGIBLE' ? 'NOT_ELIGIBLE' : 'ELIGIBLE';
  const state = lineageState(r);
  return {
    schema: 'atlas.enriched-index-record.v1',
    packetKey: r.packet_key ?? null,
    sourceRef: r.source_ref,
    sourceRevision: r.rev,
    workspaceRevision,
    sourceContentHash: r.chash,
    fileKind: extensionOf(r.source_ref) || 'none',
    language: cap.language,
    summary: { present: r.packet_has_summary === true, length: r.packet_summary_length ?? null, hash: r.summary_hash ?? null, revisionQualified: r.packet_has_summary === true && state === 'REVISION_QUALIFIED' },
    chunkSummaryMetadata: {
      exactLineageChunkRows: r.chunk_rows,
      canonicalSummaryTextRows: r.chunk_summary_text_rows,
      provenanceRows: r.chunk_summary_provenance_rows,
      revisionBoundProvenanceRows: r.chunk_summary_revision_bound_rows,
      modelIds: r.chunk_summary_models ?? null,
      modelRevisions: r.chunk_summary_model_revisions ?? null,
      generationParameters: r.chunk_summary_generation_parameters ?? null,
      canonicalAuthority: false,
    },
    representation: { packetEmbedding: r.packet_has_embedding === true, chunkSemantic768: r.chunk_has_semantic_768, chunkRows: r.chunk_rows, chunkRowsRevisionQualified: r.chunk_has_revision, isIdentity: false },
    astEligibility,
    astState: astEligibility === 'NOT_ELIGIBLE' ? 'NOT_APPLICABLE' : cap.outcome === 'ELIGIBLE_PARSER_UNAVAILABLE' ? 'PARSER_UNAVAILABLE' : 'NOT_JOINED_IN_THIS_PASS',
    domainClass: r.domain_class ?? null,
    communityId: r.community_id ?? null,
    clusterId: r.cluster_id ?? null,
    somCell: r.som_cell_x != null && r.som_cell_y != null ? [r.som_cell_x, r.som_cell_y] : null,
    pagerank: r.pagerank ?? null,
    lineageState: state,
    packetSha256MatchesAdmitted: r.packet_sha256 ? r.packet_sha256 === String(r.chash).replace(/^sha256:/, '') : null,
    evidenceRefs: ['graphify_execution_file_membership_v2', ...(r.packet_key ? ['atlas_packets:exact_source_ref'] : []), ...(r.chunk_rows > 0 ? ['codebase_chunk_index:exact_source_ref'] : [])],
  };
});

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(outputRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });
const shards = [];
for (let i = 0; i * SHARD_SIZE < records.length; i += 1) {
  const body = records.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE).map((r) => JSON.stringify(r)).join('\n') + '\n';
  const name = `enriched-index-${String(i + 1).padStart(5, '0')}.ndjson`;
  fs.writeFileSync(path.join(outDir, name), body, { flag: 'wx' });
  shards.push({ path: name, records: Math.min(SHARD_SIZE, records.length - i * SHARD_SIZE), sha256: crypto.createHash('sha256').update(body).digest('hex') });
}
const rootSha256 = crypto.createHash('sha256').update(shards.map((s) => `${s.path}:${s.sha256}`).join('\n')).digest('hex');
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ schema: 'atlas.enriched-index-shards-manifest.v1', workspaceRevision, executionId, records: records.length, shards, rootSha256 }, null, 2) + '\n', { flag: 'wx' });

const tally = (fn) => records.reduce((a, r) => { const k = fn(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});
const noPacketByExt = {};
for (const r of records) if (!r.packetKey) noPacketByExt[r.fileKind] = (noPacketByExt[r.fileKind] ?? 0) + 1;
const report = {
  schema: 'atlas.current-enriched-index-shards.v1', mode: 'READ_ONLY_DB_LOCAL_SHARDS', databaseWrites: 0, valkeyWrites: 0, llmCalls: 0,
  scope: { workspaceRevision, executionId }, manifestPath: path.relative(REPO_ROOT, path.join(outDir, 'manifest.json')), rootSha256,
  records: records.length, lineageStates: tally((r) => r.lineageState),
  noPacketByExtension: Object.fromEntries(Object.entries(noPacketByExt).sort((a, b) => b[1] - a[1])),
  astEligibility: tally((r) => r.astEligibility),
  revisionQualifiedWithSummary: records.filter((r) => r.summary.revisionQualified).length,
  revisionQualifiedWithoutSummary: records.filter((r) => r.lineageState === 'REVISION_QUALIFIED' && !r.summary.present).length,
  packetSha256: { matchesAdmitted: records.filter((r) => r.packetSha256MatchesAdmitted === true).length, differs: records.filter((r) => r.packetSha256MatchesAdmitted === false).length, absent: records.filter((r) => r.packetSha256MatchesAdmitted === null).length },
  notes: ['astState is NOT_JOINED_IN_THIS_PASS for eligible files; see current-workspace-ast-lineage-v1 receipts', 'summary text is not copied into shards; length and hash only', 'exact source_ref join; not canonical identity by itself', 'packet.content_hash is a different-scope hash (0/100 match) and is ignored; packet.sha256 is the whole-file hash and gates REVISION_QUALIFIED when present'],
  generatedAt: new Date().toISOString(),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
