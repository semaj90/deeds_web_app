#!/usr/bin/env node
/**
 * SUM-ROUTE-03/06 materializer: real PostgreSQL adapter, REPEATABLE READ READ ONLY, bounded to frozen chunk_row_ids.
 * No UPDATE/INSERT, no model call, no RabbitMQ, no Qdrant, no Valkey. Emits an immutable sealed set:
 *   .tmp/atlas/summary-routing-payload-v1/<timestamp>/{summary-routing-00001.ndjson, layer-hints-00001.ndjson, manifest.json}
 * Usage: npx tsx scripts/atlas/materialize-summary-routing-payloads-v1.mts --from-manifest=<proposal manifest.json> | --chunk-row-ids=a,b
 *        [--workspace-revision=sha256:..] [--repository-id=deeds-web-app]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { createSummaryRoutingPostgresRepositoryV1, compileSummaryRoutingRowV1 } from '../../sveltekit-frontend/src/lib/server/atlas/summary/summary-routing-postgres-repository-v1.ts';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';
import { projectSummaryEmbeddingJobV1 } from '../../sveltekit-frontend/src/lib/server/atlas/summary/summary-routing-payload-v1.ts';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return (i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]) as [string, string]; }));
const workspaceRevision = args.get('workspace-revision') ?? 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const repositoryId = args.get('repository-id') ?? 'deeds-web-app';
let chunkRowIds: string[] = args.get('chunk-row-ids')?.split(',').filter(Boolean) ?? [];
if (args.get('from-manifest')) {
  const mp = path.resolve(REPO_ROOT, args.get('from-manifest')!);
  const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
  for (const s of man.shards) {
    for (const line of fs.readFileSync(path.resolve(path.dirname(mp), s.path), 'utf8').split('\n')) if (line.trim()) chunkRowIds.push(JSON.parse(line).chunkRowId);
  }
}
if (args.get('from-census')) { // --from-census=<legacy census ndjson> [--class=LEGACY_HINT_LINEAGE_BOUND]
  const cls = args.get('class') ?? 'LEGACY_HINT_LINEAGE_BOUND';
  for (const line of fs.readFileSync(path.resolve(REPO_ROOT, args.get('from-census')!), 'utf8').split(String.fromCharCode(10))) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.class === cls) chunkRowIds.push(r.chunkRowId);
  }
}
chunkRowIds = [...new Set(chunkRowIds)].sort();
if (chunkRowIds.length === 0) { console.error('no chunk row ids'); process.exit(2); }

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
const counts = async () => (await client.query(`SELECT (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_text IS NOT NULL)::int st, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_embedding IS NOT NULL)::int se, (SELECT count(*) FROM public.atlas_packets)::int packets, (SELECT count(*) FROM public.atlas_summary_layers)::int layers`)).rows[0];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const before = await counts();
  const repo = createSummaryRoutingPostgresRepositoryV1(client as never);
  const rows = await repo.readByChunkRowIds({ repositoryId, workspaceRevision, chunkRowIds });
  const hints = await repo.readSummaryLayerHints([...new Set(rows.map((r) => r.packet_key))]);
  const after = await counts();
  await client.query('ROLLBACK');

  const payloads = rows.map((r) => compileSummaryRoutingRowV1(r, (t: string) => analyzeSummaryContaminationV1(t)));
  const state: Record<string, number> = {};
  const hintClasses: Record<string, number> = {};
  for (const p of payloads) { const k = p.summary.hintClass ?? 'none'; hintClasses[k] = (hintClasses[k] ?? 0) + 1; }
  for (const p of payloads) state[p.summary.state] = (state[p.summary.state] ?? 0) + 1;
  const jobs = payloads.filter((p) => projectSummaryEmbeddingJobV1(p, 'materialize-summary-routing-payloads-v1')).length;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dir = path.join(REPO_ROOT, '.tmp/atlas/summary-routing-payload-v1', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const body = payloads.map((p) => JSON.stringify(p)).join('\n') + '\n';
  const hintBody = hints.map((h) => JSON.stringify(h)).join('\n') + (hints.length ? '\n' : '');
  fs.writeFileSync(path.join(dir, 'summary-routing-00001.ndjson'), body, { flag: 'wx' });
  fs.writeFileSync(path.join(dir, 'layer-hints-00001.ndjson'), hintBody, { flag: 'wx' });
  const sha = (s: string) => `sha256:${crypto.createHash('sha256').update(s, 'utf8').digest('hex')}`;
  const guard = Object.fromEntries(Object.keys(before).map((k) => [k, { before: before[k], after: after[k], unchanged: before[k] === after[k] }]));
  const manifest = {
    schema: 'atlas.summary-routing-payload-set.v1', mode: 'READ_ONLY_POSTGRES_REPLAY', workspaceRevision, repositoryId,
    requestedRows: chunkRowIds.length, compiledRows: payloads.length, currentSummaries: state.CURRENT ?? 0, hintSummaries: state.HINT ?? 0, blockedSummaries: state.BLOCKED ?? 0, missingSummaries: state.MISSING ?? 0,
    embeddingJobsEligible: jobs, layerHintRefs: hints.length, hintClasses,
    legacyInvariants: {
      legacySummaryPresent: rows.filter((r) => !!r.legacy_summary).length,
      quarantineAbsent: rows.filter((r) => r.legacy_quarantined === false).length,
      qualityClean: payloads.filter((p) => p.summary.quality.clean === true).length,
      alignmentExact: payloads.filter((p) => p.summary.sourceAlignment.status === 'CURRENT_LINEAGE_EXACT').length,
      digestValid: payloads.filter((p) => /^sha256:[0-9a-f]{64}$/.test(p.summary.textDigest ?? '')).length,
      summaryTextEmpty: rows.filter((r) => r.summary_text === null).length,
      blockedCount: state.BLOCKED ?? 0,
    },
    invariants: { requested: chunkRowIds.length, rowsReturned: rows.length, uniqueChunkRowIds: new Set(rows.map((r) => r.chunk_row_id)).size, exactBindings: rows.filter((r) => r.source_revision === r.binding_source_revision && !!r.binding_checksum).length, provenLineage: rows.filter((r) => r.revision_status === 'PROVEN').length, chunkIdentityExact: rows.filter((r) => r.chunk_id === r.canonical_chunk_id).length },
    shards: [{ path: 'summary-routing-00001.ndjson', rows: payloads.length, sha256: sha(body) }, { path: 'layer-hints-00001.ndjson', rows: hints.length, sha256: sha(hintBody) }],
    rootChecksum: sha(JSON.stringify(payloads.map((p) => p.payloadChecksum))),
    readOnlyGuard: { populations: guard, pass: Object.values(guard).every((g) => g.unchanged) },
    databaseWrites: 0, rabbitmqPublishes: 0, llmCalls: 0, embeddingCalls: 0, qdrantWrites: 0, valkeyWrites: 0, generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ dir: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), ...manifest, shards: undefined }, null, 1));
} catch (e) { try { await client.query('ROLLBACK'); } catch { /* ended */ } console.error(String((e as Error).message)); process.exitCode = 1; } finally { client.release(); await pool.end(); }
