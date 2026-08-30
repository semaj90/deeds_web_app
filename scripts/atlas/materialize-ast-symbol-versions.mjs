#!/usr/bin/env node
/**
 * Materialize reviewed AST nominations into revision-specific symbol versions.
 * Default is read-only. Apply requires an explicit bounded limit.
 * Variables are never eligible; canonical identity must already exist in the registry.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAstNodeKind } from './lib/ast-source-ref-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number((args.find((arg) => arg.startsWith('--limit=')) || '').split('=')[1] || 0) || null;
const SKIP = Math.max(0, Number((args.find((arg) => arg.startsWith('--skip=')) || '').split('=')[1] || 0) || 0);
const inputPath = path.resolve(ROOT, (args.find((arg) => arg.startsWith('--input=')) || '').slice(8)
  || '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const resolutionPath = path.resolve(ROOT, (args.find((arg) => arg.startsWith('--resolution=')) || '').slice(13)
  || '.tmp/atlas/graphify-file-index-v1/ast-symbol-resolution.jsonl');
const astSnapshotPath = path.resolve(ROOT, (args.find((arg) => arg.startsWith('--ast-snapshot=')) || '').slice(15)
  || '.tmp/atlas/current-source-ast-snapshot-v1.ndjson');
const PROMOTABLE_KINDS = new Set(['function', 'method', 'class', 'interface', 'type', 'enum']);
const PRODUCER_REVISION = 'atlas-ast-symbol-version-materializer-v1';

function astNodeKindFor(kind) {
  // The live atlas_ast_nodes extractor normalizes TypeScript interfaces to
  // `type` and class methods to `function`; preserve the nomination kind in
  // callable_metadata while using the storage kind for the bridge lookup.
  return normalizeAstNodeKind(kind);
}

function canonicalAstSourceRef(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^sveltekit-frontend\//, '');
}

const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeReport = async (report) => {
  const reportPath = path.resolve(ROOT, 'docs/reports/ast-symbol-version-materialization-v1.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[AST-VERSION-MATERIALIZER] report=${reportPath}`);
};

async function main() {
  if (APPLY && !LIMIT) throw new Error('--apply requires an explicit --limit=N');
  const [nominations, resolutions, astSnapshot] = await Promise.all([
    readJsonl(inputPath),
    readJsonl(resolutionPath),
    readJsonl(astSnapshotPath),
  ]);
  const resolutionByNomination = new Map(resolutions.map((row) => [row.nomination_id, row]));
  const candidates = nominations.filter((row) => {
    const resolution = resolutionByNomination.get(row.nomination_id);
    return PROMOTABLE_KINDS.has(row.kind) && resolution?.status === 'CANONICAL' && resolution.stable_symbol_id;
  });
  const unique = new Map(candidates.map((row) => [
    `${row.nomination_id}:${row.declaration_hash}:${row.upstream_node_id}`,
    row,
  ]));
  const rows = [...unique.values()];
  const revisionQualifiedRows = rows.filter((row) => row.source_revision && row.workspace_revision);
  const selectedRows = revisionQualifiedRows.slice(SKIP, LIMIT ? SKIP + LIMIT : undefined);
  const report = {
    schema: 'atlas.ast-symbol-version-materialization.v1',
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    inputNominations: nominations.length,
    canonicalDeclarationCandidates: rows.length,
    revisionQualifiedCandidates: revisionQualifiedRows.length,
    missingSourceRevision: rows.filter((row) => !row.source_revision).length,
    missingWorkspaceRevision: rows.filter((row) => !row.workspace_revision).length,
    excludedVariables: nominations.filter((row) => row.kind === 'variable').length,
    skip: SKIP,
    limit: LIMIT,
    selectedCandidates: selectedRows.length,
    rowsAttempted: 0,
    rowsInserted: 0,
    rowsAlreadyPresent: 0,
    projectionRowsUpserted: 0,
    databaseWrites: false,
    sample: selectedRows.slice(0, 10).map((row) => ({ nominationId: row.nomination_id, kind: row.kind, qualifiedName: row.qualified_name, sourceRef: row.source_ref })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) { await writeReport(report); return; }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const batch = selectedRows;
  try {
    const stableIds = [...new Set(batch.map((row) => resolutionByNomination.get(row.nomination_id).stable_symbol_id))];
    const active = await pool.query(
      `SELECT stable_symbol_id FROM atlas_symbol_registry WHERE status = 'active' AND stable_symbol_id = ANY($1::text[])`,
      [stableIds],
    );
    const activeIds = new Set(active.rows.map((row) => row.stable_symbol_id));
    await pool.query('BEGIN');
    for (const row of batch) {
      const resolution = resolutionByNomination.get(row.nomination_id);
      if (!activeIds.has(resolution.stable_symbol_id)) continue;
      report.rowsAttempted++;
      const symbolVersionId = `symbol-version:${digest(`${resolution.stable_symbol_id}\0${row.source_revision}\0${row.declaration_hash}\0${row.upstream_node_id}`)}`;
      const result = await pool.query(
        `INSERT INTO atlas_symbol_versions (
           symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision,
           upstream_node_id, upstream_file_id, upstream_symbol_id, upstream_chunk_id,
           qualified_name, declaration_hash, signature_normalized, byte_start, byte_end,
           parent_route, producer_revision, callable_metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb)
         ON CONFLICT (symbol_version_id) DO NOTHING
         RETURNING symbol_version_id`,
        [
          symbolVersionId, resolution.stable_symbol_id, row.source_ref, row.source_revision,
          row.workspace_revision, row.upstream_node_id, null,
          row.upstream_symbol_id, row.upstream_chunk_id, row.qualified_name || row.name,
          row.declaration_hash, row.signature_normalized || null, row.byte_start, row.byte_end,
          JSON.stringify(row.parent_route || []), PRODUCER_REVISION,
          JSON.stringify({ kind: row.kind, language: row.language, exported: !!row.exported, extractor: row.extractor, nomination_id: row.nomination_id }),
        ],
      );
      if (result.rowCount) report.rowsInserted++; else report.rowsAlreadyPresent++;

      // NE-ID-03/04 fix (2026-08-24): atlas_ast_nodes.source_ref_key is a
      // composite key (`<path>#<kind>:<qualifiedName>` for declaration-level
      // nodes), NOT a bare path — comparing it directly against
      // v.source_ref (a bare path) matched zero rows for every declaration,
      // 100% of the time, with no error (a LEFT JOIN miss is silent by
      // design). Confirmed live: all 100 pre-existing atlas_callable_search
      // rows had tree_node_id NULL. Reconstruct the real composite key from
      // v.source_ref + the declaration kind (stored in
      // callable_metadata->>'kind') + v.qualified_name, matching the shape
      // actually written by the AST extractor
      // (e.g. "src/lib/ai/x.ts#function:foo"). candidateCount classifies
      // the outcome instead of silently accepting whatever the LEFT JOIN
      // happens to return: 0 matches -> UNRESOLVED (tree_node_id stays
      // NULL), 1 match -> RESOLVED (tree_node_id set), >1 matches ->
      // AMBIGUOUS (tree_node_id stays NULL rather than guessing which
      // candidate is correct).
      const snapshotNodes = astSnapshot.filter((node) =>
        canonicalAstSourceRef(node.sourceRef) === canonicalAstSourceRef(row.source_ref)
        && String(node.graphifySourceRevision ?? '') === String(row.source_revision ?? '')
        && Number(node.startByte) === Number(row.byte_start)
        && Number(node.endByte) === Number(row.byte_end)
        && (!row.upstream_node_id || String(node.upstreamNodeId ?? '') === String(row.upstream_node_id)),
      );
      const identityBridgeOutcome = snapshotNodes.length === 0
        ? 'UNRESOLVED'
        : snapshotNodes.length === 1
          ? 'RESOLVED'
          : 'AMBIGUOUS';
      const resolvedTreeNodeId = identityBridgeOutcome === 'RESOLVED' ? snapshotNodes[0].treeNodeId : null;
      const resolvedNodeKind = identityBridgeOutcome === 'RESOLVED' ? astNodeKindFor(snapshotNodes[0].nodeKind) : null;
      report.identityBridgeOutcomes ??= { RESOLVED: 0, UNRESOLVED: 0, AMBIGUOUS: 0 };
      report.identityBridgeOutcomes[identityBridgeOutcome]++;

      await pool.query(
        `INSERT INTO atlas_callable_search (
           symbol_version_id, stable_symbol_id, tree_node_id, source_ref, source_revision,
           workspace_revision, qualified_name, node_kind, signature_normalized,
           callable_metadata, search_vector, projection_revision, producer_revision
         )
         SELECT v.symbol_version_id, v.stable_symbol_id, $2::text, v.source_ref,
                v.source_revision, v.workspace_revision, v.qualified_name, $3::text,
                v.signature_normalized,
                v.callable_metadata || jsonb_build_object('identity_bridge_outcome', $4::text),
                to_tsvector('simple', concat_ws(' ', v.qualified_name, v.source_ref, v.signature_normalized)),
                'atlas-callable-search-v1', v.producer_revision
         FROM atlas_symbol_versions v
         WHERE v.symbol_version_id = $1
         ON CONFLICT (symbol_version_id) DO UPDATE SET
           stable_symbol_id = EXCLUDED.stable_symbol_id,
           tree_node_id = EXCLUDED.tree_node_id,
           source_ref = EXCLUDED.source_ref,
           source_revision = EXCLUDED.source_revision,
           workspace_revision = EXCLUDED.workspace_revision,
           qualified_name = EXCLUDED.qualified_name,
           node_kind = EXCLUDED.node_kind,
           signature_normalized = EXCLUDED.signature_normalized,
           callable_metadata = EXCLUDED.callable_metadata,
           search_vector = EXCLUDED.search_vector,
           projection_revision = EXCLUDED.projection_revision,
           producer_revision = EXCLUDED.producer_revision,
           updated_at = now()`,
        [symbolVersionId, resolvedTreeNodeId, resolvedNodeKind, identityBridgeOutcome],
      );
      report.projectionRowsUpserted++;
    }
    await pool.query('COMMIT');
    report.databaseWrites = true;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(`[AST-VERSION-MATERIALIZER] ${error.message}`); process.exit(1); });
