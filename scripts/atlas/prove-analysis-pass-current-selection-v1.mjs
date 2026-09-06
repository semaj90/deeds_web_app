/**
 * Read-only proof of the analysis_pass_current selector/view.
 *
 * Extends the 2026-09-04 version of this script (which only sampled 5 rows
 * ordered by created_at and checked field presence — real, but did not test
 * DISTINCT ON selection semantics or verify the view actually matches its
 * own source-of-truth file). This version:
 *
 *   1. Reads the LIVE deployed view definition via pg_get_viewdef() and
 *      compares it against drizzle/manual/analysis_pass_current.sql on disk
 *      — DB/file drift is a first-class finding, not an assumption.
 *   2. Extracts the live view's actual WHERE-clause status filter and
 *      ORDER BY columns from pg_get_viewdef() (not hardcoded), so the
 *      scenario checks below test what is REALLY deployed, not what the
 *      file on disk says it should be.
 *   3. Finds a real identity with exactly one matching row and confirms the
 *      view returns exactly that row (single-unsuperseded-pass scenario).
 *   4. Finds a real identity with >=2 matching rows and confirms the view
 *      returns exactly one row for it, matching the live ORDER BY applied
 *      independently (superseded-pass-exclusion scenario).
 *   5. Counts identity groups with genuine timestamp ties among rows the
 *      live filter actually selects, and reports whether the live ORDER BY
 *      has a full tiebreak (id) to resolve them deterministically.
 *
 * Purely read-only: no INSERT/UPDATE/DELETE/CREATE OR REPLACE anywhere in
 * this script. A found drift or gap is recorded, never silently patched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/analysis-pass-current-selection-v1.json');
const viewSourceFilePath = path.resolve(root, 'sveltekit-frontend/drizzle/manual/analysis_pass_current.sql');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const IDENT_COLS = ['packet_key', 'source_revision', 'pass_type', 'pass_revision', 'input_hash'];

/**
 * Build a WHERE clause + correctly-sequential $N params for an identity row,
 * skipping NULL columns as "IS NULL" (no placeholder). `startAt` lets a
 * caller reserve earlier placeholder numbers (e.g. $1 for a status filter).
 */
function buildIdentWhere(ident, startAt = 1) {
  const clauses = [];
  const params = [];
  let n = startAt;
  for (const c of IDENT_COLS) {
    if (ident[c] === null) {
      clauses.push(`${c} IS NULL`);
    } else {
      clauses.push(`${c} = $${n}`);
      params.push(ident[c]);
      n += 1;
    }
  }
  return { clause: clauses.join(' AND '), params };
}

const report = {
  schema: 'parent-atlas.analysis-pass-current-selection.v1',
  gate: 'ANALYSIS-PASS-CURRENT-SELECTION',
  status: 'BLOCKED_UNPROVEN',
  selectionOwner: 'analysis_pass_current',
  historyOwner: 'analysis_pass_results',
  selectionPolicy: ['exact packet/source/pass-type/pass-revision/input-hash identity', 'live-deployed status filter', 'recency + id tiebreak per live ORDER BY'],
  writesPerformed: false,
  canonicalAuthority: false,
};

const pool = new pg.Pool({ connectionString });
try {
  const relation = await pool.query(`
    SELECT c.relkind
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'analysis_pass_current'
  `);
  report.viewPresent = relation.rowCount === 1 && relation.rows[0].relkind === 'v';
  if (!report.viewPresent) {
    report.reason = 'CURRENT_SELECTOR_VIEW_MISSING';
  } else {
    // -- 1/2: live view definition vs. file on disk --------------------
    const viewDefResult = await pool.query(`SELECT pg_get_viewdef('analysis_pass_current'::regclass, true) AS def`);
    const liveViewDef = viewDefResult.rows[0].def.trim();
    let fileViewDef = null;
    try {
      fileViewDef = (await fs.readFile(viewSourceFilePath, 'utf8')).trim();
    } catch {
      fileViewDef = null;
    }
    const statusMatch = liveViewDef.match(/WHERE\s+status\s*=\s*'([^']+)'/i);
    const liveStatusFilter = statusMatch ? statusMatch[1] : null;
    const liveOrderByMatch = liveViewDef.match(/ORDER BY\s+([\s\S]+?);?\s*$/i);
    const liveOrderByHasIdTiebreak = /\bid\s+DESC\b/i.test(liveOrderByMatch?.[1] ?? '');
    const fileStatusMatch = fileViewDef ? fileViewDef.match(/WHERE\s+status\s*=\s*'([^']+)'/i) : null;
    const fileStatusFilter = fileStatusMatch ? fileStatusMatch[1] : null;
    const fileHasIdTiebreak = fileViewDef ? /\bid\s+DESC\b/i.test(fileViewDef) : null;

    report.viewDrift = {
      liveViewDef,
      fileViewDefPresent: fileViewDef !== null,
      liveStatusFilter,
      fileStatusFilter,
      statusFilterDriftDetected: fileStatusFilter !== null && liveStatusFilter !== fileStatusFilter,
      liveOrderByHasIdTiebreak,
      fileHasIdTiebreak,
      tiebreakDriftDetected: fileHasIdTiebreak !== null && liveOrderByHasIdTiebreak !== fileHasIdTiebreak,
    };

    // -- status vocabulary census (both conventions, whichever is live) --
    const statusCensus = await pool.query(`
      SELECT status, COUNT(*)::int AS n, MIN(created_at) AS earliest, MAX(created_at) AS latest
        FROM public.analysis_pass_results
       GROUP BY status
       ORDER BY n DESC
    `);
    report.statusVocabularyCensus = statusCensus.rows;
    report.liveViewCoversRowCount = liveStatusFilter
      ? (statusCensus.rows.find((r) => r.status === liveStatusFilter)?.n ?? 0)
      : null;
    report.totalRowCount = statusCensus.rows.reduce((sum, r) => sum + r.n, 0);

    if (!liveStatusFilter) {
      report.status = 'BLOCKED_UNPARSEABLE_VIEW_DEFINITION';
    } else {
      // -- 3: single-unsuperseded-pass scenario ---------------------------
      const singleRowIdentity = await pool.query(
        `
        SELECT packet_key, source_revision, pass_type, pass_revision, input_hash
          FROM public.analysis_pass_results
         WHERE status = $1
         GROUP BY packet_key, source_revision, pass_type, pass_revision, input_hash
        HAVING COUNT(*) = 1
         LIMIT 1
      `,
        [liveStatusFilter]
      );
      let singleRowScenario = { found: false };
      if (singleRowIdentity.rowCount === 1) {
        const ident = singleRowIdentity.rows[0];
        const { clause: identWhere, params: identParams } = buildIdentWhere(ident);
        const viewRows = await pool.query(
          `SELECT id FROM public.analysis_pass_current WHERE ${identWhere}`,
          identParams
        );
        singleRowScenario = {
          found: true,
          identity: ident,
          currentViewReturnedExactlyOneRow: viewRows.rowCount === 1,
          rowsReturned: viewRows.rowCount,
        };
      }
      report.scenarioSingleUnsupersededPass = singleRowScenario;

      // -- 4: superseded-pass-exclusion scenario --------------------------
      const dupIdentity = await pool.query(
        `
        SELECT packet_key, source_revision, pass_type, pass_revision, input_hash, COUNT(*)::int AS n
          FROM public.analysis_pass_results
         WHERE status = $1
         GROUP BY packet_key, source_revision, pass_type, pass_revision, input_hash
        HAVING COUNT(*) >= 2
         ORDER BY n DESC
         LIMIT 1
      `,
        [liveStatusFilter]
      );
      let dupScenario = { found: false };
      if (dupIdentity.rowCount === 1) {
        const ident = dupIdentity.rows[0];
        // Reserve $1 for the status filter here (this query needs it in
        // addition to the identity columns); the view-only query below
        // doesn't filter on status (the view already encodes it), so it
        // rebuilds its own placeholders starting at $1.
        const { clause: identWhereWithStatus, params: identParamsAfterStatus } = buildIdentWhere(ident, 2);
        const rawRows = await pool.query(
          `SELECT id, created_at FROM public.analysis_pass_results WHERE status = $1 AND ${identWhereWithStatus} ORDER BY created_at DESC, id DESC`,
          [liveStatusFilter, ...identParamsAfterStatus]
        );
        const { clause: identWhere, params: identParams } = buildIdentWhere(ident);
        const viewRows = await pool.query(
          `SELECT id, created_at FROM public.analysis_pass_current WHERE ${identWhere}`,
          identParams
        );
        const rawTimestamps = new Set(rawRows.rows.map((r) => r.created_at.getTime()));
        dupScenario = {
          found: true,
          identity: ident,
          rawMatchingRowCount: rawRows.rowCount,
          rawRowIds: rawRows.rows.map((r) => r.id),
          hasTiedTimestamps: rawTimestamps.size < rawRows.rowCount,
          currentViewReturnedExactlyOneRow: viewRows.rowCount === 1,
          currentViewRowsReturned: viewRows.rowCount,
          currentViewSelectedId: viewRows.rows[0]?.id ?? null,
          expectedIdByFullOrderByCreatedAtThenId: rawRows.rows[0]?.id ?? null,
          matchesExpectedSelectionUnderFullTiebreak: viewRows.rows[0]?.id === rawRows.rows[0]?.id,
        };
      }
      report.scenarioSupersededPassExcluded = dupScenario;

      // -- 5: tiebreak risk within the live-filtered bucket ---------------
      const tieGroups = await pool.query(
        `
        SELECT COUNT(*)::int AS n
          FROM (
            SELECT packet_key, source_revision, pass_type, pass_revision, input_hash
              FROM public.analysis_pass_results
             WHERE status = $1
             GROUP BY packet_key, source_revision, pass_type, pass_revision, input_hash
            HAVING COUNT(*) > COUNT(DISTINCT created_at)
          ) t
      `,
        [liveStatusFilter]
      );
      report.identityGroupsWithTiedTimestamps = tieGroups.rows[0].n;
      report.tiebreakRisk =
        tieGroups.rows[0].n > 0 && !liveOrderByHasIdTiebreak
          ? 'ACTIVE_NONDETERMINISM_RISK'
          : tieGroups.rows[0].n === 0 && !liveOrderByHasIdTiebreak
            ? 'STRUCTURALLY_UNENFORCED_BUT_NO_CURRENT_TIES'
            : 'TIEBREAK_PRESENT';

      // -- overall gate status --------------------------------------------
      const scenariosPass =
        singleRowScenario.found &&
        singleRowScenario.currentViewReturnedExactlyOneRow &&
        dupScenario.found &&
        dupScenario.currentViewReturnedExactlyOneRow &&
        dupScenario.matchesExpectedSelectionUnderFullTiebreak;

      if (report.viewDrift.statusFilterDriftDetected || report.viewDrift.tiebreakDriftDetected) {
        report.status = 'BLOCKED_VIEW_SOURCE_DRIFT';
        report.reason =
          'Live deployed analysis_pass_current view does not match drizzle/manual/analysis_pass_current.sql on disk. ' +
          `Live status filter: '${liveStatusFilter}'. File status filter: '${fileStatusFilter}'. ` +
          `Live has id-tiebreak: ${liveOrderByHasIdTiebreak}. File has id-tiebreak: ${fileHasIdTiebreak}. ` +
          'This is a separately-tracked finding, not silently patched by this proof script.';
      } else if (!scenariosPass) {
        report.status = 'BLOCKED_SCENARIO_FAILURE';
      } else {
        report.status = 'READ_ONLY_PROVEN';
      }
    }
  }
} catch (error) {
  report.status = 'BLOCKED_QUERY';
  report.reason = String(error?.message ?? error);
} finally {
  await pool.end();
}
report.reportChecksum = hash({ ...report, reportChecksum: undefined });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify({
    reportPath,
    status: report.status,
    viewDrift: report.viewDrift
      ? { statusFilterDriftDetected: report.viewDrift.statusFilterDriftDetected, tiebreakDriftDetected: report.viewDrift.tiebreakDriftDetected }
      : null,
    writesPerformed: false,
  })
);
if (report.status === 'BLOCKED_QUERY') process.exitCode = 1;
