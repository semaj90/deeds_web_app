#!/usr/bin/env node
/**
 * CHUNK-LINEAGE-BACKFILL-CANARY-PLAN-01 (READ ONLY; writesPerformed=false). Prepares the receipt for a larger exact-match mirror backfill
 * canary using the SAME selection rule as apply-codebase-chunk-lineage-backfill-v1.mjs (case-insensitive source_ref + whole-file digest against
 * atlas_workspace_source_bindings at the admitted workspace), and reports what it would fill, skip, and refuse. It never updates a row.
 * representationRevision is NEVER filled by this plan: it has no canonical producer.
 *   node scripts/atlas/plan-chunk-lineage-backfill-canary-v1.mjs [--limit=5000]
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : 5000;
if (!Number.isInteger(LIMIT) || LIMIT < 1 || LIMIT > 5000) throw new Error('INVALID_LIMIT (1..5000, same cap as the apply script)');
const admission = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const WS = admission.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && admission.authority === true ? admission.workspaceRevision : null;
if (!WS) throw new Error('NO_ADMITTED_WORKSPACE_REVISION');
const applyScript = fs.readFileSync(path.join(REPO_ROOT, 'scripts/atlas/apply-codebase-chunk-lineage-backfill-v1.mjs'), 'utf8');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 180_000, application_name: 'atlas-chunk-lineage-backfill-canary-plan-v1' });
const report = { schema: 'atlas.chunk-lineage-backfill-canary-plan.v1', generatedAt: new Date().toISOString(), gate: 'CHUNK-LINEAGE-BACKFILL-CANARY-PLAN-01', mode: 'READ_ONLY_PLAN',
  writesPerformed: false, authorizationRequired: true, authorizationNote: 'apply needs the operator confirmation token; this plan sets none', workspaceRevision: WS, limit: LIMIT,
  representationRevision: null, representationRevisionPolicy: 'REMAIN_NULL_UNTIL_CANONICAL_PRODUCER_PROVEN',
  applyScriptFacts: { alwaysRollsBack: /await pool\.query\('ROLLBACK'\);\s*\n\s*report\.readbackCount/.test(applyScript), hasCommitStatement: /query\('COMMIT'\)/.test(applyScript),
    note: 'the existing script has no commit path: --apply only proves the UPDATE and rolls back; a real apply needs an explicit, reviewed commit variant' } };
try {
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
  report.population = await q(`SELECT count(*)::int chunks,
      count(*) FILTER (WHERE source_ref IS NULL)::int source_ref_null,
      count(*) FILTER (WHERE file_content_hash IS NULL)::int file_hash_null,
      count(*) FILTER (WHERE workspace_revision IS NOT NULL)::int workspace_revision_filled,
      count(*) FILTER (WHERE source_revision IS NOT NULL)::int source_revision_filled,
      count(*) FILTER (WHERE lineage_binding_checksum IS NOT NULL)::int binding_checksum_filled,
      count(*) FILTER (WHERE lineage_producer_revision IS NOT NULL)::int producer_revision_filled,
      count(*) FILTER (WHERE representation_revision IS NOT NULL)::int representation_revision_filled FROM public.codebase_chunk_index`);
  report.matching = await q(`WITH j AS (
      SELECT c.id, c.file_content_hash, b.canonical_source_ref IS NOT NULL AS ref_bound,
             (b.content_digest IS NOT NULL AND lower(b.content_digest) = lower(c.file_content_hash)) AS exact
        FROM public.codebase_chunk_index c
        LEFT JOIN public.atlas_workspace_source_bindings b ON b.repo_id = 'deeds-web-app' AND b.workspace_revision = $1 AND lower(b.canonical_source_ref) = lower(c.source_ref)
       WHERE c.source_ref IS NOT NULL AND c.file_content_hash IS NOT NULL)
    SELECT count(*)::int scanned_with_ref_and_hash,
           count(*) FILTER (WHERE exact)::int exact_source_ref_and_digest,
           count(*) FILTER (WHERE ref_bound AND NOT exact)::int hash_mismatch,
           count(*) FILTER (WHERE NOT ref_bound)::int missing_binding FROM j`, [WS]);
  report.exactBreakdown = await q(`WITH ex AS (
      SELECT c.id, b.source_revision AS b_src, b.binding_checksum,
             (c.workspace_revision IS NULL OR c.source_revision IS NULL OR c.lineage_binding_checksum IS NULL OR c.lineage_producer_revision IS NULL) AS would_update,
             l.packet_key, l.source_revision AS l_src, l.evidence_refs
        FROM public.codebase_chunk_index c
        JOIN public.atlas_workspace_source_bindings b ON b.repo_id = 'deeds-web-app' AND b.workspace_revision = $1 AND lower(b.canonical_source_ref) = lower(c.source_ref) AND lower(b.content_digest) = lower(c.file_content_hash)
        LEFT JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id AND l.revision_status = 'PROVEN'
       WHERE c.file_content_hash IS NOT NULL)
    SELECT count(*)::int exact_rows,
           count(*) FILTER (WHERE would_update)::int rows_that_would_update,
           count(*) FILTER (WHERE NOT would_update)::int rows_already_filled_skipped,
           count(*) FILTER (WHERE would_update AND b_src IS NOT NULL)::int source_revision_fillable,
           count(*) FILTER (WHERE would_update AND binding_checksum IS NOT NULL)::int binding_checksum_fillable,
           count(*) FILTER (WHERE packet_key IS NOT NULL)::int with_proven_bridge,
           count(*) FILTER (WHERE packet_key IS NULL)::int missing_bridge,
           count(*) FILTER (WHERE packet_key IS NOT NULL AND l_src IS DISTINCT FROM b_src)::int bridge_binding_source_revision_conflicts,
           count(*) FILTER (WHERE packet_key IS NOT NULL AND evidence_refs IS NOT NULL)::int evidence_refs_available FROM ex`, [WS]);
  report.canarySlice = await q(`WITH sel AS (
      SELECT c.id, l.packet_key, l.source_revision AS l_src, b.source_revision AS b_src
        FROM public.codebase_chunk_index c
        JOIN public.atlas_workspace_source_bindings b ON b.repo_id = 'deeds-web-app' AND b.workspace_revision = $1 AND lower(b.canonical_source_ref) = lower(c.source_ref) AND lower(b.content_digest) = lower(c.file_content_hash)
        LEFT JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id AND l.revision_status = 'PROVEN'
       WHERE c.file_content_hash IS NOT NULL AND (c.workspace_revision IS NULL OR c.source_revision IS NULL OR c.lineage_binding_checksum IS NULL OR c.lineage_producer_revision IS NULL)
       ORDER BY c.id LIMIT $2)
    SELECT count(*)::int slice_rows, count(*) FILTER (WHERE packet_key IS NOT NULL)::int with_bridge,
           count(*) FILTER (WHERE packet_key IS NOT NULL AND l_src IS DISTINCT FROM b_src)::int conflicts FROM sel`, [WS, LIMIT]);
  report.conflictRule = 'a row whose bridge source_revision differs from the binding source_revision must be EXCLUDED from any apply (never pick one); the apply script does not check the bridge, so a reviewed variant must add that guard';
  report.contract = { mayMirror: ['workspace_revision', 'source_revision', 'lineage_binding_checksum', 'lineage_producer_revision'], source: 'exact proven binding only (source_ref + whole-file digest at the admitted workspace)', mustRemainNull: ['representation_revision'] };
  report.status = 'CANARY_PLAN_READY_APPLY_NOT_AUTHORIZED';
} catch (error) { report.status = 'PLAN_FAILED'; report.error = String(error?.message ?? error).slice(0, 200); } finally { await pool.end(); }
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/chunk-lineage-backfill-canary-plan-v1.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, error: report.error, applyScriptFacts: report.applyScriptFacts, population: report.population, matching: report.matching, exactBreakdown: report.exactBreakdown, canarySlice: report.canarySlice }, null, 1));
