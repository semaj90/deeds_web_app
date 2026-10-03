#!/usr/bin/env node
/**
 * LEGACY-SUMMARY-01 (READ-ONLY, no model, no writes): classifies EVERY codebase_chunk_index.summary row.
 * Text integrity is modelled separately from source freshness. Precedence: phase8_5_quarantine overrides the detector.
 *   LEGACY_QUARANTINED            metadata ? 'phase8_5_quarantine' (regardless of detector)
 *   LEGACY_CONTAMINATED           not quarantined, detector fails (shared summary-quality-v1)
 *   LEGACY_HINT_LINEAGE_BOUND     clean, not quarantined, exact current lineage (PROVEN + workspace binding)
 *   LEGACY_HINT_UNQUALIFIED       clean, not quarantined, no exact current lineage (still valid for candidate discovery)
 * Sealed NDJSON stores chunkRowId + exact summary sha256 (not the text). None of these is CURRENT.
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
const reportPath = path.resolve(REPO_ROOT, args.get('report') ?? 'docs/reports/legacy-summary-census-v1.json');
const reportsRoot = path.resolve(REPO_ROOT, 'docs/reports') + path.sep;
if (!reportPath.startsWith(reportsRoot) || fs.existsSync(reportPath)) throw new Error('REPORT_MUST_BE_NEW_FILE_UNDER_DOCS_REPORTS');
const batch = 2000;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
const counts = async () => (await client.query(`SELECT (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_text IS NOT NULL)::int st, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_embedding IS NOT NULL)::int se, (SELECT count(*) FROM public.codebase_chunk_index)::int chunks`)).rows[0];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const before = await counts();
  const tally = { totalLegacy: 0, cleanDetector: 0, quarantined: 0, cleanAndQuarantined: 0, cleanNotQuarantined: 0, cleanNotQuarantinedLineageBound: 0, cleanNotQuarantinedUnqualified: 0, contaminatedNotQuarantined: 0, byClass: {}, contaminationReasons: {}, models: {} };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-census-v1'); fs.mkdirSync(dir, { recursive: true });
  const shard = path.join(dir, `census-${stamp}.ndjson`);
  const out = fs.createWriteStream(shard, { flags: 'wx' }); const hash = crypto.createHash('sha256');
  let last = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = (await client.query(`
      SELECT ci.id::text AS chunk_row_id, ci.chunk_id, ci.summary, ci.summary_model, (ci.metadata ? 'phase8_5_quarantine') AS quarantined,
        EXISTS (SELECT 1 FROM public.atlas_packet_chunk_lineage l JOIN public.atlas_workspace_source_bindings b
                  ON b.repo_id = $1 AND b.workspace_revision = $2 AND b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
                WHERE l.chunk_row_id = ci.id AND l.revision_status = 'PROVEN') AS lineage_exact
      FROM public.codebase_chunk_index ci WHERE ci.id > $3::uuid AND ci.summary IS NOT NULL AND btrim(ci.summary) <> '' ORDER BY ci.id LIMIT $4`, [repositoryId, workspaceRevision, last, batch])).rows;
    if (!rows.length) break;
    for (const r of rows) {
      last = r.chunk_row_id; tally.totalLegacy++;
      const a = analyzeSummaryContaminationV1(r.summary);
      if (a.clean) tally.cleanDetector++;
      let cls;
      if (r.quarantined) { cls = 'LEGACY_QUARANTINED'; tally.quarantined++; if (a.clean) tally.cleanAndQuarantined++; }
      else if (!a.clean) { cls = 'LEGACY_CONTAMINATED'; tally.contaminatedNotQuarantined++; for (const x of a.reasons) tally.contaminationReasons[x] = (tally.contaminationReasons[x] ?? 0) + 1; }
      else if (r.lineage_exact) { cls = 'LEGACY_HINT_LINEAGE_BOUND'; tally.cleanNotQuarantined++; tally.cleanNotQuarantinedLineageBound++; }
      else { cls = 'LEGACY_HINT_UNQUALIFIED'; tally.cleanNotQuarantined++; tally.cleanNotQuarantinedUnqualified++; }
      tally.byClass[cls] = (tally.byClass[cls] ?? 0) + 1;
      if (cls.startsWith('LEGACY_HINT')) tally.models[r.summary_model ?? 'null'] = (tally.models[r.summary_model ?? 'null'] ?? 0) + 1;
      const line = JSON.stringify({ schema: 'atlas.legacy-summary-census-row.v1', chunkRowId: r.chunk_row_id, chunkId: r.chunk_id, summaryDigest: sha256Text(r.summary), class: cls, quarantined: r.quarantined, detectorClean: a.clean, lineageExact: r.lineage_exact }) + '\n';
      out.write(line); hash.update(line);
    }
    if (tally.totalLegacy % 10000 < batch) console.log(`progress rows=${tally.totalLegacy}`);
  }
  await new Promise((r) => out.end(r));
  const after = await counts();
  await client.query('ROLLBACK');
  const guard = Object.fromEntries(Object.keys(before).map((k) => [k, { before: before[k], after: after[k], unchanged: before[k] === after[k] }]));
  const receipt = { schema: 'atlas.legacy-summary-census.v1', gate: 'LEGACY-SUMMARY-01', mode: 'READ_ONLY', workspaceRevision, repositoryId, tally,
    conservation: { classified: Object.values(tally.byClass).reduce((a, b) => a + b, 0), total: tally.totalLegacy, pass: Object.values(tally.byClass).reduce((a, b) => a + b, 0) === tally.totalLegacy },
    shardPath: path.relative(REPO_ROOT, shard).split(path.sep).join('/'), shardSha256: `sha256:${hash.digest('hex')}`,
    readOnlyGuard: { populations: guard, pass: Object.values(guard).every((g) => g.unchanged), databaseWrites: 0, modelCalls: 0 },
    semantics: 'quarantine overrides detector; none is CURRENT; summary digest is exact bytes; lineage-bound != describes current source', generatedAt: new Date().toISOString() };
  fs.writeFileSync(reportPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ tally, conservation: receipt.conservation, guardPass: receipt.readOnlyGuard.pass }, null, 1));
} catch (e) { try { await client.query('ROLLBACK'); } catch { /* ended */ } throw e; } finally { client.release(); await pool.end(); }
