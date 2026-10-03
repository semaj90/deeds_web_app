#!/usr/bin/env node
/**
 * LEGACY_SUMMARY_CARRY_FORWARD_PLAN_01 (READ-ONLY, no writes, no model call). Plans persisting existing legacy chunk
 * summaries (codebase_chunk_index.summary, the June/July Gemma4 lane) into summary_text + summary_provenance as
 * admission.status = 'LEGACY_CARRIED': lineage-bound to the CURRENT source/workspace revision, quality-clean,
 * not quarantined. It is NOT 'ADMITTED' and never CURRENT: the summarizer's input digest was never recorded, so the
 * summary is only asserted against today's bytes. Downstream a carried summary is a persisted HINT (no embedding job).
 * Emits sealed would-be rows (.tmp) + receipt (docs/reports). Applying is a separate, operator-authorized step.
 * Usage: node scripts/atlas/plan-legacy-summary-carry-forward-v1.mjs [--workspace-revision=sha256:..] [--repository-id=deeds-web-app]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { analyzeSummaryContaminationV1, sha256Text } from './lib/summary-quality-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const workspaceRevision = args.get('workspace-revision') ?? 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const repositoryId = args.get('repository-id') ?? 'deeds-web-app';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
const counts = async () => (await client.query(`SELECT (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_text IS NOT NULL)::int st, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_provenance IS NOT NULL)::int sp, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_embedding IS NOT NULL)::int se`)).rows[0];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const before = await counts();
  const rows = (await client.query(`
    SELECT DISTINCT ON (ci.id) ci.id::text AS chunk_row_id, l.canonical_chunk_id, l.packet_key, l.source_ref, l.source_revision, b.binding_checksum,
      ci.summary, ci.summary_model, (ci.metadata ? 'phase8_5_quarantine') AS quarantined, ci.updated_at::date AS updated_date,
      encode(sha256(convert_to(ci.content, 'UTF8')), 'hex') AS content_sha256, (ci.summary_text IS NOT NULL OR ci.summary_provenance IS NOT NULL) AS target_occupied
    FROM public.codebase_chunk_index ci
    JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = ci.id AND l.revision_status = 'PROVEN'
    JOIN public.atlas_workspace_source_bindings b ON b.repo_id = $1 AND b.workspace_revision = $2 AND b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
    WHERE ci.summary IS NOT NULL AND btrim(ci.summary) <> '' ORDER BY ci.id, l.packet_key`, [repositoryId, workspaceRevision])).rows;
  const after = await counts();
  await client.query('ROLLBACK');

  const tally = { candidates: rows.length, eligible: 0, excluded: {}, updatedDates: {}, models: {} };
  const ex = (k) => { tally.excluded[k] = (tally.excluded[k] ?? 0) + 1; };
  const outDir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-carry-forward-v1'); fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [];
  for (const r of rows) {
    const a = analyzeSummaryContaminationV1(r.summary);
    if (r.target_occupied) { ex('TARGET_OCCUPIED'); continue; }
    if (r.quarantined) { ex('QUARANTINE_FLAGGED'); continue; }
    if (!a.clean) { for (const x of a.reasons) ex(`CONTAMINATED:${x}`); continue; }
    tally.eligible++;
    const d = String(r.updated_date).slice(0, 10); tally.updatedDates[d] = (tally.updatedDates[d] ?? 0) + 1;
    tally.models[r.summary_model ?? 'null'] = (tally.models[r.summary_model ?? 'null'] ?? 0) + 1;
    const summaryDigest = sha256Text(r.summary);
    lines.push(JSON.stringify({
      schema: 'atlas.legacy-summary-carry-forward-row.v1', chunkRowId: r.chunk_row_id, summary_text: r.summary,
      summary_provenance: {
        schema: 'atlas.summary-provenance.v1', canonicalChunkId: r.canonical_chunk_id, packetKey: r.packet_key, sourceRef: r.source_ref,
        workspaceRevision, sourceRevision: r.source_revision, producerId: 'legacy-gemma4-carry-forward-v1', producerRevision: null,
        modelId: r.summary_model ?? null, modelRevision: null, promptTemplateRevision: null,
        summaryInputDigest: `sha256:${r.content_sha256}`, inputDigestProof: 'CURRENT_BYTES_ASSERTED_NOT_PROVEN_AT_GENERATION',
        summaryDigest, proposalChecksum: null, bindingChecksum: r.binding_checksum, legacyRowUpdatedDate: d,
        admission: { schema: 'atlas.summary-admission.v1', status: 'LEGACY_CARRIED', reasons: ['GENERATION_INPUT_UNPROVEN'], scaffoldLeak: a.scaffoldLeak, reasoningLeak: a.reasoningLeak, controlTokenLeak: a.controlTokenLeak },
      },
    }));
  }
  const body = lines.join('\n') + (lines.length ? '\n' : '');
  const shard = path.join(outDir, `carry-forward-${stamp}.ndjson`); fs.writeFileSync(shard, body, { flag: 'wx' });
  const guard = Object.fromEntries(Object.keys(before).map((k) => [k, { before: before[k], after: after[k], unchanged: before[k] === after[k] }]));
  const receipt = {
    schema: 'atlas.legacy-summary-carry-forward-plan.v1', gate: 'LEGACY_SUMMARY_CARRY_FORWARD_PLAN_01', mode: 'READ_ONLY', workspaceRevision, repositoryId, tally,
    shardPath: path.relative(REPO_ROOT, shard).replaceAll('\\', '/'), shardSha256: `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`,
    readOnlyGuard: { populations: guard, pass: Object.values(guard).every((g) => g.unchanged), databaseWrites: 0, modelCalls: 0 },
    semantics: 'LEGACY_CARRIED = lineage-bound persisted HINT; never CURRENT; no embedding job; apply requires separate operator authorization',
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/legacy-summary-carry-forward-plan-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ tally, guardPass: receipt.readOnlyGuard.pass, shard: receipt.shardPath }, null, 1));
} catch (e) { try { await client.query('ROLLBACK'); } catch { /* ended */ } throw e; } finally { client.release(); await pool.end(); }
