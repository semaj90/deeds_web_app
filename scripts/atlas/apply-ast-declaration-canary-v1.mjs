#!/usr/bin/env node
/**
 * Guarded canary writer for atlas_ast_nodes code-declaration rows (AST-ID-06 / 14.3a).
 *
 * Default = REHEARSAL: performs the real inserts and the full readback inside a transaction, then ROLLS BACK.
 * Persistence requires BOTH `--apply` and `--operator-approved`, and a bounded `--limit` (default 50, max 200).
 * Input is the proof's hand-off `.tmp/atlas/ast-canary-eligible-v1.jsonl` (already lineage-stamped from the admitted
 * snapshot, ambiguity-excluded, net-new only). Reuses the existing `writeAtlasAstNodes` owner (no second writer).
 * Column alignment: workspace_id/source_revision from the admitted snapshot binding; source_content_hash = whole-file
 * raw digest; parser_version = ast-grep-napi version; grammar_version NULL (not established); created_at/updated_at
 * left to DB defaults (now()); no file_path column exists (relative_path is the path).
 * Never deletes. Rollback of a persisted canary is via `superseded_by`, not DELETE.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeAtlasAstNodes } from './lib/atlas-ast-nodes-writer.mjs';
import { decodeSourceTextEnvelope } from './lib/source-text-envelope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({ options: { apply: { type: 'boolean', default: false }, 'operator-approved': { type: 'boolean', default: false }, 'know09-reviewed': { type: 'boolean', default: false }, eligible: { type: 'string', default: '' }, limit: { type: 'string', default: '50' }, cohort: { type: 'string', default: '' }, 'ast-generation': { type: 'string', default: '' }, 'rehearse-migration': { type: 'boolean', default: false } }, strict: false });
// Persistence needs ALL of: --apply, --operator-approved, --know09-reviewed (current-source-authority gate acknowledged by a human).
const PERSIST = Boolean(args.apply && args['operator-approved'] && args['know09-reviewed']);
// COHORT mode (AST_BULK_WRITER_REHEARSAL_01, 2026-09-20): rehearsal-ONLY. Scopes the eligible rows to the checksummed
// SAFE_TO_STAMP cohort and lifts the row cap (rollback-only, so nothing persists). It can never persist: the 200-row cap
// and the three persistence flags below still govern any real write, and PERSIST + COHORT is refused outright.
const COHORT = args.cohort ? path.resolve(ROOT, String(args.cohort)) : null;
const AST_GENERATION = args['ast-generation'] ? String(args['ast-generation']) : null;
const REHEARSE_MIGRATION = Boolean(args['rehearse-migration']);
const LIMIT = Math.min(Math.max(parseInt(String(args.limit), 10) || 50, 1), COHORT && !PERSIST ? 30000 : 200);
const ELIGIBLE = args.eligible ? path.resolve(ROOT, String(args.eligible)) : path.join(ROOT, '.tmp/atlas/ast-canary-eligible-v1.jsonl');
const PROOF = path.join(ROOT, 'docs/reports/atlas-ast-backfill-idempotency-proof-v1.json');
// One receipt per mode so a rehearsal can never overwrite the evidence of a persisted run.
// Cohort tranche rehearsals get their OWN receipt so they never overwrite the 50-row AST_BF_19 rehearsal evidence.
const RECEIPT = COHORT ? path.join(ROOT, 'docs/reports/atlas-ast-tranche-rehearsal-v1.json') : path.join(ROOT, `docs/reports/atlas-ast-canary-apply-v1.${PERSIST ? 'persist' : 'rehearsal'}.json`);
const MIGRATION_SQL = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20260920_atlas_ast_nodes_generation.sql');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const receipt = { schema: 'atlas.ast-canary-apply.v1', generatedAt: new Date().toISOString(), mode: PERSIST ? 'PERSIST' : 'REHEARSAL_ROLLBACK', limit: LIMIT, bindings: { parserName: 'ast-grep-napi', grammarVersion: null, sourceTextEncodingRevision: 'SOURCE-TEXT-ENCODING-01', offsetBasis: 'UTF8_PARSER_BUFFER_V1', lineBasis: 'ONE_BASED_STORAGE', identityConvention: 'file(ROOT)->declaration(parent=file)->method(parent=class)' }, steps: {}, errors: [] };
const finish = (status) => { receipt.status = status; fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`); console.log(JSON.stringify(receipt, null, 2)); process.exitCode = status.startsWith('APPLY_PROVEN') || status === 'REHEARSAL_PROVEN' ? 0 : 1; };

if (!fs.existsSync(PROOF) || !fs.existsSync(ELIGIBLE)) { receipt.errors.push('proof receipt or eligible hand-off missing — run prove-ast-backfill-idempotency.mjs first'); finish('BLOCKED_MISSING_INPUT'); process.exit(); }
const proof = JSON.parse(fs.readFileSync(PROOF, 'utf8'));
const gate = proof.steps?.AST_BF_10_apply_gate;
if (!gate?.allDryRunGatesPass) { receipt.errors.push('proof gates do not all pass'); finish('BLOCKED_GATES'); process.exit(); }
receipt.steps.proof = { candidatesInput: proof.candidatesInput, gates: gate.gates, canaryEligibleRows: gate.canaryEligibleRows };

if (COHORT && (PERSIST || args.apply)) { receipt.errors.push('COHORT mode is rehearsal-only: persisting a cohort tranche is not authorized by this script'); finish('BLOCKED_COHORT_PERSIST_NOT_AUTHORIZED'); process.exit(); }
if (REHEARSE_MIGRATION && (PERSIST || args.apply)) { receipt.errors.push('--rehearse-migration is rehearsal-only'); finish('BLOCKED_MIGRATION_PERSIST_NOT_AUTHORIZED'); process.exit(); }
let all = fs.readFileSync(ELIGIBLE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (COHORT) {
  // Integrity of the cohort artifact first: its stored checksum must equal the checksum of its own sorted SAFE list.
  const cohort = JSON.parse(fs.readFileSync(COHORT, 'utf8'));
  const safeList = [...cohort.buckets.SAFE_TO_STAMP].sort();
  const recomputed = `sha256:${crypto.createHash('sha256').update(safeList.join('\n')).digest('hex')}`;
  if (recomputed !== cohort.safeToStampChecksum) { receipt.errors.push(`COHORT_CHECKSUM_MISMATCH:${recomputed}!=${cohort.safeToStampChecksum}`); finish('BLOCKED_COHORT_INTEGRITY'); process.exit(); }
  const safe = new Set(safeList);
  const before = all.length;
  all = all.filter((r) => safe.has(r.raw_source_ref));
  receipt.steps.cohort = { path: path.relative(ROOT, COHORT), safeToStampChecksum: cohort.safeToStampChecksum, cohortFiles: safeList.length, eligibleRowsBefore: before, eligibleRowsInCohort: all.length, rowsOutsideCohortDropped: before - all.length };
}
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
let committed = false;
try {
  await client.query('BEGIN');
  const generationColumnExists = async () => (await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='ast_generation'")).rows[0].n === 1;
  receipt.steps.generationColumnBefore = await generationColumnExists();
  if (REHEARSE_MIGRATION) {
    // Applied INSIDE this transaction only (DDL is transactional in Postgres) so the writer + column are proven together
    // and the whole thing — DDL included — is rolled back below. Lock is bounded so a busy table fails the rehearsal fast.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(fs.readFileSync(MIGRATION_SQL, 'utf8'));
    receipt.steps.migrationRehearsal = { file: path.relative(ROOT, MIGRATION_SQL), appliedInsideTransaction: true, columnVisibleInsideTxn: await generationColumnExists() };
  }
  if (AST_GENERATION && !(await generationColumnExists())) throw new Error('AST_GENERATION_REQUESTED_BUT_COLUMN_MISSING (pass --rehearse-migration to prove it inside the rolled-back transaction)');
  const tidSet = new Set(all.map((r) => r.tree_node_id));
  // A parent may be another eligible row OR a row that already exists in atlas_ast_nodes (e.g. a pre-existing file row).
  const externalParents = [...new Set(all.filter((r) => r.parent_tree_node_id && !tidSet.has(r.parent_tree_node_id)).map((r) => r.parent_tree_node_id))];
  const existingParents = new Set((await client.query('SELECT tree_node_id FROM atlas_ast_nodes WHERE tree_node_id = ANY($1::text[])', [externalParents])).rows.map((x) => x.tree_node_id));
  const parentResolvable = all.filter((r) => !r.parent_tree_node_id || tidSet.has(r.parent_tree_node_id) || existingParents.has(r.parent_tree_node_id));
  // NAME-COLLISION GUARD (found 2026-09-20 by the full-cohort rehearsal): the table's UNIQUE(repo_id, relative_path, node_kind,
  // qualified_symbol, normalized_node_hash) has no parent component and normalized_node_hash = sha256(path#kind:qualified_symbol), so
  // two rows with the same (path, kind, qualified_symbol) but different parents (same-named methods in different classes of one file)
  // collide even though their tree_node_ids differ. ON CONFLICT DO NOTHING would silently keep an ARBITRARY one — ambiguous, so the whole
  // group is deferred, never partially written. Deferred rows are reported, not dropped silently.
  const nameGroups = new Map();
  for (const r of parentResolvable) { const k = `${r.np}\u0000${r.kind}\u0000${r.qualified_symbol}`; (nameGroups.get(k) ?? nameGroups.set(k, []).get(k)).push(r); }
  const collidingGroups = [...nameGroups.values()].filter((g) => g.length > 1);
  const deferredCollisionIds = new Set(collidingGroups.flat().map((r) => r.tree_node_id));
  const usable = parentResolvable.filter((r) => !deferredCollisionIds.has(r.tree_node_id));
  receipt.steps.nameCollisionGuard = { deferredRows: deferredCollisionIds.size, collidingGroups: collidingGroups.length, extraRowsThatWouldHaveBeenSkipped: deferredCollisionIds.size - collidingGroups.length, kinds: [...new Set(collidingGroups.flat().map((r) => r.kind))], sample: collidingGroups.slice(0, 5).map((g) => ({ path: g[0].np, kind: g[0].kind, qualifiedSymbol: g[0].qualified_symbol, rows: g.length })), status: 'DEFERRED_PENDING_QUALIFIED_SYMBOL_CONVENTION' };
  const byFile = new Map();
  for (const r of usable) (byFile.get(r.np) ?? byFile.set(r.np, []).get(r.np)).push(r);
  const files = [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b));
  const picked = [];
  let total = 0;
  const hasMethod = (rows) => rows.some((r) => r.kind === 'method');
  const withMethod = files.find(([, rows]) => hasMethod(rows) && rows.length <= Math.min(30, LIMIT));
  if (withMethod) { picked.push(withMethod); total += withMethod[1].length; }
  for (const f of files) { if (f === withMethod) continue; if (total + f[1].length > LIMIT) continue; picked.push(f); total += f[1].length; if (total >= LIMIT) break; }
  receipt.steps.selection = { eligibleRows: all.length, usableRows: usable.length, droppedUnresolvableParent: all.length - parentResolvable.length, droppedNameCollision: parentResolvable.length - usable.length, externalParentsExisting: existingParents.size, filesPicked: picked.length, rowsPicked: total, includesTwoPhaseFile: Boolean(withMethod), twoPhaseFile: withMethod?.[0] ?? null };
  if (!total) throw new Error('NO_ROWS_SELECTED');

  // WRITE-TIME digest re-check: other sessions edit files continuously, so re-read each picked file through the
  // SOURCE-TEXT-ENCODING-01 envelope and require its raw digest to still equal the admitted digest. Diverged/missing files are skipped, never stamped.
  const writeTimeCheck = { filesChecked: 0, skippedDiverged: [], skippedMissing: [], skippedNoRawRef: [] };
  for (let i = picked.length - 1; i >= 0; i -= 1) {
    const [np, rows] = picked[i];
    const raw = rows[0].raw_source_ref;
    writeTimeCheck.filesChecked += 1;
    if (!raw) { writeTimeCheck.skippedNoRawRef.push(np); picked.splice(i, 1); continue; }
    let env;
    try { env = decodeSourceTextEnvelope(fs.readFileSync(path.join(ROOT, raw)), raw); } catch { writeTimeCheck.skippedMissing.push(np); picked.splice(i, 1); continue; }
    if (rows.some((r) => r.source_content_digest !== env.rawContentHash)) { writeTimeCheck.skippedDiverged.push(np); picked.splice(i, 1); }
  }
  receipt.steps.writeTimeDigestCheck = { ...writeTimeCheck, filesRemaining: picked.length };
  if (!picked.length) throw new Error('ALL_FILES_FAILED_WRITE_TIME_DIGEST_CHECK');

  const expected = new Map();
  for (const [, rows] of picked) for (const r of rows) expected.set(r.tree_node_id, r);
  const pre = await client.query('SELECT tree_node_id FROM atlas_ast_nodes WHERE tree_node_id = ANY($1::text[])', [[...expected.keys()]]);
  if (pre.rowCount) throw new Error(`PRE_EXISTING_TREE_NODE_IDS:${pre.rowCount}`);
  receipt.steps.before = { existingRows: (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes')).rows[0].n };

  let inserted = 0, idMismatch = 0;
  for (const [np, rows] of picked) {
    // Phase A first (non-methods, no parent), then Phase B (methods bound to their class) — indexes reference the array.
    const inBatch = new Set(rows.map((r) => r.tree_node_id));
    const depth = new Map();
    const depthOf = (r) => { if (depth.has(r.tree_node_id)) return depth.get(r.tree_node_id); const parent = rows.find((x) => x.tree_node_id === r.parent_tree_node_id); const d = parent ? depthOf(parent) + 1 : 0; depth.set(r.tree_node_id, d); return d; };
    const ordered = [...rows].sort((x, y) => depthOf(x) - depthOf(y) || x.start_byte - y.start_byte);
    const indexOf = new Map(ordered.map((r, i) => [r.tree_node_id, i]));
    const first = ordered[0];
    const res = await writeAtlasAstNodes(client, {
      sourceRef: first.canonical_path, parserLanguage: first.parser_language, parserName: first.parser_name, parserVersion: first.parser_version,
      sourceRevision: first.source_revision, workspaceId: first.workspace_id,
      ...(AST_GENERATION ? { astGeneration: AST_GENERATION } : {}),
      nodes: ordered.map((r) => ({ kind: r.kind, qualifiedSymbol: r.qualified_symbol, startByte: r.start_byte, endByte: r.end_byte, startLine: r.line_start, endLine: r.line_end, sourceContentDigest: r.source_content_digest, parentIndex: r.parent_tree_node_id && inBatch.has(r.parent_tree_node_id) ? indexOf.get(r.parent_tree_node_id) : null, parentTreeNodeId: r.parent_tree_node_id && !inBatch.has(r.parent_tree_node_id) ? r.parent_tree_node_id : null })),
    });
    inserted += res.inserted;
    const skipped = (res.insertedFlags ?? []).flatMap((didInsert, i) => didInsert ? [] : [{
      np,
      tree_node_id: ordered[i].tree_node_id,
      parent_tree_node_id: ordered[i].parent_tree_node_id ?? null,
      node_kind: ordered[i].kind,
      qualified_symbol: ordered[i].qualified_symbol,
    }]);
    if (!receipt.steps.writeConflicts) receipt.steps.writeConflicts = [];
    receipt.steps.writeConflicts.push(...skipped);
    res.treeNodeIds.forEach((tid, i) => { if (tid !== ordered[i].tree_node_id) idMismatch += 1; });
    void np;
  }
  receipt.steps.write = {
    inserted,
    expectedRows: expected.size,
    skippedByConflict: receipt.steps.writeConflicts?.length ?? 0,
    writerVsProofIdMismatch: idMismatch,
  };
  if (idMismatch) throw new Error(`WRITER_ID_DIVERGES_FROM_PROOF:${idMismatch}`);
  if (inserted !== expected.size) throw new Error(`INSERT_COUNT_MISMATCH:${inserted}/${expected.size}`);

  const back = await client.query(
    `SELECT tree_node_id, parent_tree_node_id, relative_path, node_kind, qualified_symbol, start_byte, end_byte, line_start, line_end, workspace_id, source_revision, source_content_hash, parser_name, parser_version, grammar_version, created_at IS NOT NULL AS has_created, updated_at IS NOT NULL AS has_updated${AST_GENERATION ? ', ast_generation' : ''}
       FROM atlas_ast_nodes WHERE tree_node_id = ANY($1::text[])`, [[...expected.keys()]]);
  const bad = [];
  for (const row of back.rows) {
    const e = expected.get(row.tree_node_id);
    const problems = [];
    if (row.relative_path !== e.np) problems.push('relative_path');
    if (row.node_kind !== e.kind || row.qualified_symbol !== e.qualified_symbol) problems.push('kind/symbol');
    if (Number(row.start_byte) !== e.start_byte || Number(row.end_byte) !== e.end_byte) problems.push('span');
    if (Number(row.line_start) !== e.line_start || Number(row.line_end) !== e.line_end) problems.push('lines');
    if (row.workspace_id !== e.workspace_id) problems.push('workspace_id');
    if (row.source_revision !== e.source_revision) problems.push('source_revision');
    if (row.source_content_hash !== e.source_content_digest) problems.push('source_content_hash');
    if (row.parser_version !== e.parser_version || row.parser_name !== e.parser_name) problems.push('parser');
    if (row.grammar_version !== null) problems.push('grammar_version_not_null');
    if ((row.parent_tree_node_id ?? null) !== (e.parent_tree_node_id ?? null)) problems.push('parent');
    if (!row.has_created || !row.has_updated) problems.push('timestamps');
    if (AST_GENERATION && row.ast_generation !== AST_GENERATION) problems.push('ast_generation');
    if (problems.length) bad.push({ tree_node_id: row.tree_node_id, problems });
  }
  const orphan = await client.query(`SELECT count(*)::int AS n FROM atlas_ast_nodes c LEFT JOIN atlas_ast_nodes p ON p.tree_node_id = c.parent_tree_node_id WHERE c.tree_node_id = ANY($1::text[]) AND c.parent_tree_node_id IS NOT NULL AND p.tree_node_id IS NULL`, [[...expected.keys()]]);
  const after = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes')).rows[0].n;
  receipt.steps.readback = { parity: { treeNodeId: `${back.rowCount - bad.filter((b) => b.problems.length).length}/${expected.size}`, note: 'per-field mismatches listed in sampleMismatches' }, persistentRowsAdded: PERSIST ? expected.size : 0, rowsRead: back.rowCount, fieldMismatches: bad.length, sampleMismatches: bad.slice(0, 5), orphanParents: orphan.rows[0].n, rowsInTableInsideTxn: after };
  if (back.rowCount !== expected.size || bad.length || orphan.rows[0].n) throw new Error('READBACK_FAILED');
  // Fire DEFERRABLE INITIALLY DEFERRED FKs now so a successful rehearsal proves the transaction WOULD commit.
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  receipt.steps.constraintCheck = 'PASS (SET CONSTRAINTS ALL IMMEDIATE)';

  if (PERSIST) { await client.query('COMMIT'); committed = true; } else { await client.query('ROLLBACK'); }
  const final = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes')).rows[0].n; // same client: pool max=1, pool.query here would deadlock
  receipt.steps.after = { rowsInTable: final, persisted: committed, expectedRowsInTable: receipt.steps.before.existingRows + (committed ? expected.size : 0), generationColumnAfter: await generationColumnExists() };
  // A rehearsal must leave the schema exactly as it found it (the in-transaction migration included).
  if (!committed && receipt.steps.after.generationColumnAfter !== receipt.steps.generationColumnBefore) throw new Error('SCHEMA_CHANGED_BY_REHEARSAL');
  if (final !== receipt.steps.after.expectedRowsInTable) throw new Error('POST_TXN_ROW_COUNT_MISMATCH');
  finish(committed ? 'APPLY_PROVEN_CANARY' : 'REHEARSAL_PROVEN');
} catch (err) {
  try { await client.query('ROLLBACK'); } catch { /* already closed */ }
  receipt.errors.push(String(err?.message ?? err));
  finish('FAILED_ROLLED_BACK');
} finally {
  client.release();
  await pool.end();
}
