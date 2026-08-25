#!/usr/bin/env node
/**
 * Export a read-only review set for packet -> AST span reconciliation.
 * This deliberately does not infer tree_node_id or write canonical rows.
 */

import pg from 'pg';
import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

loadEnv({ path: path.resolve(process.cwd(), '.env') });

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT = path.join(ROOT, 'docs/reports/ast-packet-span-review-v1.json');
const REVIEW = path.join(ROOT, 'docs/reports/ast-packet-span-review-v1.jsonl');

function normalizePath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^sveltekit-frontend\//i, '')
    .toLowerCase();
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).length > 0;
}

function statusFor(packet, exactRows, pathRows) {
  if (!nonEmpty(packet.tree_node_id)) return 'NO_PACKET_TREE_NODE_ID';
  if (exactRows.length === 1) {
    const ast = exactRows[0];
    const hasPacketSpan = packet.byte_start != null && packet.byte_end != null;
    const hasAstSpan = ast.start_byte != null && ast.end_byte != null;
    if (hasPacketSpan && hasAstSpan &&
        Number(packet.byte_start) === Number(ast.start_byte) &&
        Number(packet.byte_end) === Number(ast.end_byte)) {
      return 'EXACT_TREE_AND_SPAN_MATCH';
    }
    return 'TREE_NODE_MATCH_NO_SPAN_PROOF';
  }
  if (exactRows.length > 1) return 'AMBIGUOUS_TREE_NODE_ID';
  if (pathRows.length === 1) return 'PATH_ONLY_REVIEW_REQUIRED';
  if (pathRows.length > 1) return 'PATH_MATCH_AMBIGUOUS';
  return 'NO_AST_CANDIDATE';
}

function pathEvidenceStatus(packet, pathRows) {
  if (pathRows.length === 0) return 'NO_PATH_EVIDENCE';
  if (pathRows.length > 1) return 'PATH_MATCH_AMBIGUOUS';
  const ast = pathRows[0];
  const packetHash = String(packet.content_hash ?? '');
  const astHash = String(ast.source_content_hash ?? '');
  if (packetHash && astHash) return packetHash === astHash
    ? 'PATH_HASH_MATCH'
    : 'PATH_HASH_MISMATCH';
  if (packet.source_revision && ast.source_revision) {
    return String(packet.source_revision) === String(ast.source_revision)
      ? 'PATH_REVISION_MATCH'
      : 'PATH_REVISION_MISMATCH';
  }
  return 'PATH_NO_HASH_OR_REVISION_EVIDENCE';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const columnResult = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('atlas_packets', 'atlas_ast_nodes')
    `);
    const columns = new Map();
    for (const row of columnResult.rows) {
      const set = columns.get(row.table_name) ?? new Set();
      set.add(row.column_name);
      columns.set(row.table_name, set);
    }
    const packetColumns = columns.get('atlas_packets') ?? new Set();
    const astColumns = columns.get('atlas_ast_nodes') ?? new Set();
    const optionalSelect = (set, name, alias = name) =>
      set.has(name) ? `p.${name} AS ${alias}` : `NULL AS ${alias}`;
    const optionalAstSelect = (set, name, alias = name) =>
      set.has(name) ? `a.${name} AS ${alias}` : `NULL AS ${alias}`;
    const [packetsResult, astResult] = await Promise.all([
      pool.query(`
        SELECT ${[
          'p.packet_key', 'p.source_ref', 'p.tree_node_id', 'p.chunk_id',
          'p.byte_start', 'p.byte_end',
          optionalSelect(packetColumns, 'source_revision'),
          optionalSelect(packetColumns, 'content_hash'),
          optionalSelect(packetColumns, 'workspace_revision'),
        ].join(', ')}
        FROM atlas_packets p
        ORDER BY packet_key
      `),
      pool.query(`
        SELECT ${[
          'a.tree_node_id', 'a.relative_path', 'a.node_kind', 'a.qualified_symbol',
          'a.start_byte', 'a.end_byte',
          optionalAstSelect(astColumns, 'source_revision'),
          optionalAstSelect(astColumns, 'source_content_hash'),
        ].join(', ')}
        FROM atlas_ast_nodes a
        ORDER BY relative_path, start_byte NULLS LAST, tree_node_id
      `),
    ]);

    const astByTree = new Map();
    const astByPath = new Map();
    for (const ast of astResult.rows) {
      const treeKey = String(ast.tree_node_id ?? '');
      if (treeKey) {
        const rows = astByTree.get(treeKey) ?? [];
        rows.push(ast);
        astByTree.set(treeKey, rows);
      }
      const pathKey = normalizePath(ast.relative_path);
      if (pathKey) {
        const rows = astByPath.get(pathKey) ?? [];
        rows.push(ast);
        astByPath.set(pathKey, rows);
      }
    }

    const counts = {};
    const lines = [];
    for (const packet of packetsResult.rows) {
      const exactRows = astByTree.get(String(packet.tree_node_id ?? '')) ?? [];
      const pathRows = astByPath.get(normalizePath(packet.source_ref)) ?? [];
      const status = statusFor(packet, exactRows, pathRows);
      const pathEvidence = pathEvidenceStatus(packet, pathRows);
      counts[status] = (counts[status] ?? 0) + 1;
      counts[`evidence:${pathEvidence}`] = (counts[`evidence:${pathEvidence}`] ?? 0) + 1;
      lines.push(JSON.stringify({
        schema_version: 'atlas-ast-packet-span-review-v1',
        read_only: true,
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        source_revision: packet.source_revision,
        workspace_revision: packet.workspace_revision,
        tree_node_id: packet.tree_node_id,
        chunk_id: packet.chunk_id,
        content_hash: packet.content_hash,
        packet_span: packet.byte_start == null || packet.byte_end == null
          ? null
          : { start_byte: Number(packet.byte_start), end_byte: Number(packet.byte_end) },
        status,
        path_evidence_status: pathEvidence,
        ast_tree_candidates: exactRows.slice(0, 5).map((ast) => ({
          tree_node_id: ast.tree_node_id,
          relative_path: ast.relative_path,
          node_kind: ast.node_kind,
          qualified_symbol: ast.qualified_symbol,
          start_byte: ast.start_byte,
          end_byte: ast.end_byte,
          source_revision: ast.source_revision,
          source_content_hash: ast.source_content_hash,
        })),
        ast_path_candidate_count: pathRows.length,
        canonical_identity_promoted: false,
      }));
    }

    const report = {
      schema_version: 'atlas-ast-packet-span-review-v1',
      generated_at: new Date().toISOString(),
      read_only: true,
      canonical_identity_promoted: false,
      output_jsonl: path.relative(ROOT, REVIEW).replaceAll('\\', '/'),
      packet_rows: packetsResult.rowCount,
      ast_rows: astResult.rowCount,
      schema_columns: {
        atlas_packets: [...packetColumns].sort(),
        atlas_ast_nodes: [...astColumns].sort(),
      },
      status_counts: counts,
      gates: {
        exact_tree_and_span_match: (counts.EXACT_TREE_AND_SPAN_MATCH ?? 0) > 0,
        tree_node_match_without_span: counts.TREE_NODE_MATCH_NO_SPAN_PROOF ?? 0,
        path_only_review_required: counts.PATH_ONLY_REVIEW_REQUIRED ?? 0,
        ambiguous_identity: (counts.AMBIGUOUS_TREE_NODE_ID ?? 0) +
          (counts.PATH_MATCH_AMBIGUOUS ?? 0),
        path_hash_matches: counts['evidence:PATH_HASH_MATCH'] ?? 0,
        path_hash_mismatches: counts['evidence:PATH_HASH_MISMATCH'] ?? 0,
        path_revision_matches: counts['evidence:PATH_REVISION_MATCH'] ?? 0,
        path_revision_mismatches: counts['evidence:PATH_REVISION_MISMATCH'] ?? 0,
        safe_for_canonical_apply: false,
      },
    };
    mkdirSync(path.dirname(REPORT), { recursive: true });
    writeFileSync(REVIEW, `${lines.join('\n')}\n`, 'utf8');
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
