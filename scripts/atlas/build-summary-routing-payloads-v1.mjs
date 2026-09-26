#!/usr/bin/env node
/**
 * SUM-ROUTE-03/04 read-only repository + compiler run. Compiles SummaryRoutingPayloadV1 (Zod, checksummed) for every
 * revision-qualified chunk: exact joins codebase_chunk_index x atlas_packet_chunk_lineage (PROVEN) x
 * atlas_workspace_source_bindings x atlas_packets. REPEATABLE READ READ ONLY, keyset pagination on chunk id, no OFFSET,
 * no model call, no writes. Emits sealed NDJSON (.tmp) + a receipt (docs/reports). Uses pg directly (no docker exec).
 * Also projects SummaryEmbeddingJobV1 only for CURRENT + unbound rows (count only, not published anywhere).
 * Usage: node --import tsx scripts/atlas/build-summary-routing-payloads-v1.mjs [--workspace-revision=sha256:..] [--repository-id=deeds-web-app]
 *        [--limit=N] [--batch=1000] [--chunk-row-ids=uuid,uuid] [--query="text"]   (--query = FTS fetch over the GIN indexes, prints top hits)
 * Note: codebase_chunk_index.summary_embedding_meta is NOT applied yet, so no vector can count as bound (meta = null).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { compileSummaryRoutingPayloadV1, projectSummaryEmbeddingJobV1 } from '../../sveltekit-frontend/src/lib/server/atlas/summary/summary-routing-payload-v1.ts';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const workspaceRevision = args.get('workspace-revision') ?? 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const repositoryId = args.get('repository-id') ?? 'deeds-web-app';
const limit = Number(args.get('limit') ?? 0);
const batch = Math.min(5000, Number(args.get('batch') ?? 1000));
const only = args.get('chunk-row-ids')?.split(',').filter(Boolean) ?? null;
const query = args.get('query') ?? null;

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
const ext = (r) => (r.includes('.') ? r.split('.').pop().toLowerCase() : null);
const counts = async () => (await client.query(`SELECT (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_text IS NOT NULL)::int st, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_embedding IS NOT NULL)::int se, (SELECT count(*) FROM public.atlas_packets)::int packets, (SELECT count(*) FROM public.atlas_summary_layers)::int layers`)).rows[0];

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const before = await counts();

  if (query) { // FTS fetch over existing GIN indexes (chunk search_vector + packet summary FTS)
    const chunks = (await client.query(`SELECT ci.id::text, ci.source_ref, ci.chunk_id, ts_rank(ci.search_vector, q) AS rank, left(coalesce(ci.summary_text, ci.summary, ''), 160) AS summary
      FROM public.codebase_chunk_index ci, websearch_to_tsquery('english', $1) q WHERE ci.search_vector @@ q ORDER BY rank DESC LIMIT 10`, [query])).rows;
    const packets = (await client.query(`SELECT ap.packet_key, ap.source_ref, ts_rank(to_tsvector('english', coalesce(ap.summary,'')), q) AS rank, left(ap.summary, 160) AS summary
      FROM public.atlas_packets ap, websearch_to_tsquery('english', $1) q WHERE to_tsvector('english', coalesce(ap.summary,'')) @@ q ORDER BY rank DESC LIMIT 10`, [query])).rows;
    console.log(JSON.stringify({ query, chunkHits: chunks, packetHits: packets }, null, 1));
    await client.query('ROLLBACK'); process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const outDir = path.join(REPO_ROOT, '.tmp/atlas/summary-routing-payloads-v1'); fs.mkdirSync(outDir, { recursive: true });
  const shardPath = path.join(outDir, `payloads-${stamp}.ndjson`);
  const out = fs.createWriteStream(shardPath, { flags: 'wx' });
  const hash = crypto.createHash('sha256');
  const tally = { rows: 0, invalid: 0, jobsEligible: 0, byState: {}, bySource: {}, vector: { available: 0, legacyUnbound: 0, legacy384: 0 }, routing: { domain: 0, community: 0, cluster: 0, som: 0, pagerank: 0 }, multiPacketChunks: 0 };
  const bump = (m, k) => { m[k] = (m[k] ?? 0) + 1; };
  const invalidSamples = [];
  let last = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const remaining = limit > 0 ? limit - tally.rows : batch;
    if (remaining <= 0) break;
    const rows = (await client.query(`
      SELECT DISTINCT ON (ci.id) ci.id::text AS chunk_row_id, l.canonical_chunk_id, l.packet_key, l.source_ref, l.source_revision, b.binding_checksum,
        ci.summary_text, ci.summary_provenance, nullif(btrim(ci.summary), '') AS legacy_summary, (ci.summary_embedding IS NOT NULL) AS has_emb, (ci.summary_embedding_384 IS NOT NULL) AS has_384,
        ci.language, ap.summary AS packet_summary, ap.domain_class, ap.community_id, coalesce(ap.cluster_id, ap.kmeans_cluster) AS cluster_id,
        ap.som_cell_x, ap.som_cell_y, coalesce(ap.pagerank_score, ap.pagerank) AS pagerank,
        (SELECT coalesce(nullif(sl.summary_text, ''), nullif(sl.summary, '')) FROM public.atlas_summary_layers sl WHERE sl.packet_key = l.packet_key ORDER BY sl.generated_at DESC NULLS LAST LIMIT 1) AS layer_summary,
        count(*) OVER (PARTITION BY ci.id)::int AS n_lineage
      FROM public.codebase_chunk_index ci
      JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = ci.id AND l.revision_status = 'PROVEN'
      JOIN public.atlas_workspace_source_bindings b ON b.repo_id = $1 AND b.workspace_revision = $2 AND b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
      LEFT JOIN public.atlas_packets ap ON ap.packet_key = l.packet_key
      WHERE ci.id > $3::uuid ${only ? 'AND ci.id = ANY($5::uuid[])' : ''}
      ORDER BY ci.id, l.packet_key LIMIT $4`, only ? [repositoryId, workspaceRevision, last, Math.min(batch, remaining), only] : [repositoryId, workspaceRevision, last, Math.min(batch, remaining)])).rows;
    if (rows.length === 0) break;
    for (const r of rows) {
      last = r.chunk_row_id;
      if (r.n_lineage > 1) tally.multiPacketChunks++;
      try {
        const payload = compileSummaryRoutingPayloadV1({
          identity: { chunkRowId: r.chunk_row_id, canonicalChunkId: r.canonical_chunk_id, packetKey: r.packet_key, sourceRef: r.source_ref, sourceRevision: r.source_revision, workspaceRevision, bindingChecksum: r.binding_checksum, candidateOrdinal: null },
          summaryText: r.summary_text, summaryProvenance: r.summary_provenance, legacyChunkSummary: r.legacy_summary, packetSummary: r.packet_summary, layerSummary: r.layer_summary,
          summaryEmbeddingPresent: r.has_emb, summaryEmbeddingMeta: null, summaryEmbedding384Present: r.has_384,
          routing: { domainClass: r.domain_class || null, communityId: r.community_id, clusterId: r.cluster_id, somCell: r.som_cell_x != null && r.som_cell_y != null ? [r.som_cell_x, r.som_cell_y] : null, pagerank: r.pagerank, language: r.language || null, fileKind: ext(r.source_ref), structuralEvidenceAvailable: false },
          evidenceRefs: [`binding_checksum:${r.binding_checksum}`, `codebase_chunk_index:id=${r.chunk_row_id}`, ...(r.n_lineage > 1 ? [`multi_packet_lineage:${r.n_lineage}`] : [])],
        });
        const line = JSON.stringify(payload) + '\n'; out.write(line); hash.update(line);
        tally.rows++; bump(tally.byState, payload.summary.state); bump(tally.bySource, payload.summary.source);
        if (payload.semantic.summaryEmbeddingAvailable) tally.vector.available++; if (payload.semantic.legacyUnboundVectorPresent) tally.vector.legacyUnbound++; if (payload.semantic.legacy384Present) tally.vector.legacy384++;
        const rt = payload.routing; if (rt.domainClass) tally.routing.domain++; if (rt.communityId != null) tally.routing.community++; if (rt.clusterId != null) tally.routing.cluster++; if (rt.somCell) tally.routing.som++; if (rt.pagerank != null) tally.routing.pagerank++;
        if (projectSummaryEmbeddingJobV1(payload, 'build-summary-routing-payloads-v1')) tally.jobsEligible++;
      } catch (e) { tally.invalid++; if (invalidSamples.length < 5) invalidSamples.push({ chunkRowId: r.chunk_row_id, error: String(e.message).slice(0, 160) }); }
    }
    if (rows.length < Math.min(batch, remaining)) break;
    if (tally.rows % 5000 < batch) console.log(`progress rows=${tally.rows}`);
  }
  await new Promise((r) => out.end(r));
  const after = await counts();
  await client.query('ROLLBACK');
  const guard = Object.fromEntries(Object.keys(before).map((k) => [k, { before: before[k], after: after[k], unchanged: before[k] === after[k] }]));
  const receipt = {
    schema: 'atlas.summary-routing-payload-run.v1', mode: 'READ_ONLY', workspaceRevision, repositoryId, limit: limit || null, chunkRowIdFilter: only ? only.length : null,
    shardPath: path.relative(REPO_ROOT, shardPath).replaceAll('\\', '/'), shardSha256: `sha256:${hash.digest('hex')}`, tally, invalidSamples,
    readOnlyGuard: { populations: guard, pass: Object.values(guard).every((g) => g.unchanged), databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, modelCalls: 0 },
    notes: ['summary_embedding_meta not applied: no vector can be bound; all existing vectors are legacyUnbound', 'structural evidence not wired: structuralEvidenceAvailable=false everywhere', 'som_revision is null on packets: SOM cell is a routing HINT, not revision-qualified'],
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/summary-routing-payload-run-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ tally, guardPass: receipt.readOnlyGuard.pass, shard: receipt.shardPath }, null, 1));
} catch (e) { try { await client.query('ROLLBACK'); } catch { /* ended */ } throw e; } finally { client.release(); await pool.end(); }
