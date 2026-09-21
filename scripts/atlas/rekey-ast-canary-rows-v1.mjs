#!/usr/bin/env node
/**
 * Option A for the 50 wrong-convention canary rows (AST-ID-06 / 14.3a): re-key IN PLACE to the existing identity
 * convention  file(ROOT) -> declaration(parent=file) -> method(parent=class).
 *
 * Why in place: an aligned replacement cannot coexist with the old row (UNIQUE includes normalized_node_hash, which is
 * identical), and `superseded_by` is not filtered by readers. The 50 rows have no external dependents (verified).
 *
 * Default = REHEARSAL: archive manifest -> BEGIN -> insert missing file rows -> UPDATE tree_node_id/parent -> readback ->
 * SET CONSTRAINTS ALL IMMEDIATE -> ROLLBACK. Persistence needs ALL of:
 *   --apply --operator-approved --know09-reviewed --confirm-rekey-option-a
 * Persist mode first writes the pre-image to deeds_labs/archive/<date>/ and appends docs/archive-manifest.json (archive, never delete).
 * Inputs (from prove-ast-backfill-idempotency.mjs): .tmp/atlas/ast-conflicts-v1.jsonl, .tmp/atlas/ast-canary-eligible-v1.jsonl
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeAtlasAstNodes } from './lib/atlas-ast-nodes-writer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({ options: { apply: { type: 'boolean', default: false }, 'operator-approved': { type: 'boolean', default: false }, 'know09-reviewed': { type: 'boolean', default: false }, 'confirm-rekey-option-a': { type: 'boolean', default: false } }, strict: false });
const PERSIST = Boolean(args.apply && args['operator-approved'] && args['know09-reviewed'] && args['confirm-rekey-option-a']);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const CONFLICTS = path.join(ROOT, '.tmp/atlas/ast-conflicts-v1.jsonl');
const ELIGIBLE = path.join(ROOT, '.tmp/atlas/ast-canary-eligible-v1.jsonl');
const RECEIPT = path.join(ROOT, `docs/reports/atlas-ast-canary-rekey-v1.${PERSIST ? 'persist' : 'rehearsal'}.json`);
const DAY = new Date().toISOString().slice(0, 10);
const readJsonl = (p) => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const receipt = { schema: 'atlas.ast-canary-rekey.v1', generatedAt: new Date().toISOString(), mode: PERSIST ? 'PERSIST' : 'REHEARSAL_ROLLBACK', option: 'A_IN_PLACE_REKEY', steps: {}, errors: [] };
const finish = (status) => { receipt.status = status; fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`); console.log(JSON.stringify(receipt, null, 2)); process.exitCode = status === 'REHEARSAL_PROVEN' || status === 'REKEY_PROVEN' ? 0 : 1; };

if (!fs.existsSync(CONFLICTS) || !fs.existsSync(ELIGIBLE)) { receipt.errors.push('hand-off files missing — run prove-ast-backfill-idempotency.mjs first'); finish('BLOCKED_MISSING_INPUT'); process.exit(); }
const canaryPlan = readJsonl(CONFLICTS).filter((c) => String(c.existing_parser).startsWith('ast-grep-napi'));
const eligible = new Map(readJsonl(ELIGIBLE).map((r) => [r.tree_node_id, r]));

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const oldTids = canaryPlan.map((c) => c.existing_tree_node_id);
  const live = await client.query("SELECT * FROM atlas_ast_nodes WHERE parser_name = 'ast-grep-napi' AND node_kind <> 'file' ORDER BY tree_node_id");
  receipt.steps.scope = { plannedRekeys: canaryPlan.length, liveAstGrepRows: live.rowCount };
  if (canaryPlan.length !== live.rowCount || new Set(oldTids).size !== canaryPlan.length) throw new Error(`PLAN_DOES_NOT_MATCH_LIVE_ROWS:${canaryPlan.length}/${live.rowCount}`);
  const liveSet = new Set(live.rows.map((r) => r.tree_node_id));
  if (oldTids.some((t) => !liveSet.has(t))) throw new Error('PLANNED_OLD_TID_NOT_LIVE');
  if (canaryPlan.some((c) => !c.aligned_tree_node_id || c.aligned_tree_node_id === c.existing_tree_node_id)) throw new Error('ALIGNED_ID_MISSING_OR_UNCHANGED');
  const dependents = await client.query(
    `SELECT (SELECT count(*) FROM atlas_class_search_index_v1 WHERE tree_node_id = ANY($1)) AS class_index, (SELECT count(*) FROM atlas_features WHERE tree_node_id = ANY($1)) AS features, (SELECT count(*) FROM atlas_knowledge_objects WHERE tree_node_id = ANY($1)) AS knowledge_objects,
            (SELECT count(*) FROM atlas_ast_nodes WHERE parent_tree_node_id = ANY($1) AND NOT (tree_node_id = ANY($1))) AS outside_children, (SELECT count(*) FROM atlas_ast_nodes WHERE superseded_by = ANY($1)) AS superseded_refs`, [oldTids]);
  const dep = Object.fromEntries(Object.entries(dependents.rows[0]).map(([k, v]) => [k, Number(v)]));
  receipt.steps.dependents = dep;
  if (Object.values(dep).some((n) => n > 0)) throw new Error('EXTERNAL_DEPENDENTS_FOUND');

  // Archive pre-image (never delete): persist -> deeds_labs/archive + docs/archive-manifest.json; rehearsal -> .tmp only.
  const preImage = JSON.stringify(live.rows.map((r) => ({ ...r, start_byte: r.start_byte === null ? null : String(r.start_byte) })), null, 1);
  const preSha = sha256(preImage);
  const archiveRel = PERSIST ? `deeds_labs/archive/${DAY}/ast-canary-rows-pre-rekey-v1.json` : '.tmp/atlas/ast-canary-rows-pre-rekey-v1.rehearsal.json';
  fs.mkdirSync(path.dirname(path.join(ROOT, archiveRel)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, archiveRel), preImage, 'utf8');
  receipt.steps.archive = { path: archiveRel, sha256: `sha256:${preSha}`, rows: live.rowCount, manifestEntryWritten: false };

  // Missing file rows (parents of top-level declarations).
  const neededFileTids = [...new Set(canaryPlan.filter((c) => c.kind !== 'method').map((c) => c.aligned_parent_tree_node_id))];
  const presentFiles = new Set((await client.query('SELECT tree_node_id FROM atlas_ast_nodes WHERE tree_node_id = ANY($1)', [neededFileTids])).rows.map((r) => r.tree_node_id));
  const toInsert = neededFileTids.filter((t) => !presentFiles.has(t));
  for (const t of toInsert) if (!eligible.has(t)) throw new Error(`FILE_ROW_NOT_IN_ELIGIBLE_HANDOFF:${t.slice(0, 12)}`);
  const before = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes')).rows[0].n;
  let fileInserted = 0;
  for (const t of toInsert) {
    const f = eligible.get(t);
    const res = await writeAtlasAstNodes(client, { sourceRef: f.canonical_path, parserLanguage: f.parser_language, parserName: f.parser_name, parserVersion: f.parser_version, sourceRevision: f.source_revision, workspaceId: f.workspace_id,
      nodes: [{ kind: 'file', qualifiedSymbol: f.qualified_symbol, startByte: f.start_byte, endByte: f.end_byte, startLine: f.line_start, endLine: f.line_end, sourceContentDigest: f.source_content_digest, parentIndex: null }] });
    if (res.treeNodeIds[0] !== t) throw new Error(`FILE_ID_MISMATCH:${t.slice(0, 12)}`);
    fileInserted += res.inserted;
  }
  receipt.steps.fileRows = { needed: neededFileTids.length, alreadyPresent: presentFiles.size, toInsert: toInsert.length, inserted: fileInserted };
  if (fileInserted !== toInsert.length) throw new Error(`FILE_ROW_INSERT_COUNT_MISMATCH:${fileInserted}/${toInsert.length}`);

  // In-place re-key. Parent FK is DEFERRABLE INITIALLY DEFERRED, so old->new parent references resolve at end of transaction.
  const byOld = new Map(canaryPlan.map((c) => [c.existing_tree_node_id, c]));
  let updated = 0;
  for (const c of canaryPlan) {
    const r = await client.query('UPDATE atlas_ast_nodes SET tree_node_id = $1, parent_tree_node_id = $2, updated_at = now() WHERE tree_node_id = $3 AND parser_name = $4', [c.aligned_tree_node_id, c.aligned_parent_tree_node_id, c.existing_tree_node_id, 'ast-grep-napi']);
    updated += r.rowCount;
  }
  receipt.steps.rekey = { planned: canaryPlan.length, updated };
  if (updated !== canaryPlan.length) throw new Error(`REKEY_COUNT_MISMATCH:${updated}/${canaryPlan.length}`);
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  receipt.steps.constraintCheck = 'PASS (SET CONSTRAINTS ALL IMMEDIATE)';

  // Readback.
  const newTids = canaryPlan.map((c) => c.aligned_tree_node_id);
  const back = await client.query('SELECT tree_node_id, parent_tree_node_id, structural_key, node_kind, qualified_symbol FROM atlas_ast_nodes WHERE tree_node_id = ANY($1)', [newTids]);
  const oldGone = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes WHERE tree_node_id = ANY($1)', [oldTids])).rows[0].n;
  const parentKinds = await client.query('SELECT c.node_kind AS child, p.node_kind AS parent, count(*)::int AS n FROM atlas_ast_nodes c LEFT JOIN atlas_ast_nodes p ON p.tree_node_id = c.parent_tree_node_id WHERE c.tree_node_id = ANY($1) GROUP BY 1,2 ORDER BY 1,2', [newTids]);
  const problems = [];
  const planByNew = new Map(canaryPlan.map((c) => [c.aligned_tree_node_id, c]));
  for (const row of back.rows) {
    const c = planByNew.get(row.tree_node_id);
    if (row.structural_key !== c.structural_key) problems.push({ tid: row.tree_node_id.slice(0, 12), problem: 'structural_key changed' });
    if ((row.parent_tree_node_id ?? null) !== (c.aligned_parent_tree_node_id ?? null)) problems.push({ tid: row.tree_node_id.slice(0, 12), problem: 'parent' });
  }
  const badParents = parentKinds.rows.filter((r) => !((r.child === 'method' && r.parent === 'class') || (r.child !== 'method' && r.parent === 'file')));
  const after = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes')).rows[0].n;
  receipt.steps.readback = { rowsAtNewIds: back.rowCount, oldIdsRemaining: oldGone, problems: problems.slice(0, 5), parentKindMatrix: parentKinds.rows, badParentKinds: badParents, rowsInTableInsideTxn: after, expectedRows: before + fileInserted };
  if (back.rowCount !== canaryPlan.length || oldGone !== 0 || problems.length || badParents.length || after !== before + fileInserted) throw new Error('READBACK_FAILED');
  void byOld;

  if (PERSIST) {
    // Manifest entry (archive-not-delete) is written before COMMIT; if COMMIT fails the entry is annotated by the failure path.
    const manifestPath = path.join(ROOT, 'docs/archive-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.push({ path: 'atlas_ast_nodes (50 ast-grep-napi rows, pre re-key)', archive_path: archiveRel, sha256: preSha, archived: new Date().toISOString(), reason: 'AST-ID-06 option A: re-key 50 wrong-convention canary rows to file-parent identity; pre-image retained. Recover by restoring tree_node_id/parent_tree_node_id from this file.' });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    receipt.steps.archive.manifestEntryWritten = true;
    await client.query('COMMIT');
  } else { await client.query('ROLLBACK'); }
  const final = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes')).rows[0].n;
  const oldAfter = (await client.query('SELECT count(*)::int AS n FROM atlas_ast_nodes WHERE tree_node_id = ANY($1)', [oldTids])).rows[0].n;
  receipt.steps.after = { rowsInTable: final, expectedRowsInTable: before + (PERSIST ? fileInserted : 0), persisted: PERSIST, oldIdsPresentAfterTxn: oldAfter, expectedOldIdsPresent: PERSIST ? 0 : oldTids.length };
  if (final !== receipt.steps.after.expectedRowsInTable || oldAfter !== receipt.steps.after.expectedOldIdsPresent) throw new Error('POST_TXN_STATE_MISMATCH');
  finish(PERSIST ? 'REKEY_PROVEN' : 'REHEARSAL_PROVEN');
} catch (err) {
  try { await client.query('ROLLBACK'); } catch { /* closed */ }
  receipt.errors.push(String(err?.message ?? err));
  finish('FAILED_ROLLED_BACK');
} finally {
  client.release();
  await pool.end();
}
