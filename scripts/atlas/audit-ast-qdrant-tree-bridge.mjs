#!/usr/bin/env node
/**
 * Read-only AST -> packet -> Qdrant tree-node bridge audit.
 * No database, vector, or cache writes are performed.
 */

import pg from 'pg';
import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

loadEnv({ path: path.resolve(process.cwd(), '.env') });

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT = path.join(ROOT, 'docs/reports/ast-qdrant-tree-bridge-v1.json');
const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const DATABASE_URL = process.env.DATABASE_URL;

async function scrollTreeNodes() {
  const rows = [];
  let offset = null;
  for (;;) {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: 1000,
        ...(offset === null ? {} : { offset }),
        with_payload: true,
        with_vector: false,
      }),
    });
    if (!response.ok) throw new Error(`Qdrant scroll failed: ${response.status}`);
    const result = await response.json();
    const points = result.result?.points ?? [];
    for (const point of points) {
      const payload = point.payload ?? {};
      if (payload.tree_node_id) {
        rows.push({
          point_id: String(point.id),
          tree_node_id: String(payload.tree_node_id),
          source_ref: payload.source_ref ? String(payload.source_ref) : null,
          content_hash: payload.content_hash ? String(payload.content_hash) : null,
          chunk_id: payload.chunk_id ? String(payload.chunk_id) : null,
          packet_key: payload.packet_key ? String(payload.packet_key) : null,
        });
      }
    }
    offset = result.result?.next_page_offset ?? null;
    if (offset === null || points.length === 0) break;
  }
  return rows;
}

function groupCount(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return {
    distinct: counts.size,
    unique: [...counts.values()].filter((count) => count === 1).length,
    ambiguous: [...counts.values()].filter((count) => count > 1).length,
  };
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const qdrantRows = await scrollTreeNodes();
  const treeNodeIds = [...new Set(qdrantRows.map((row) => row.tree_node_id))];
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    const astByTreeId = treeNodeIds.length
      ? (await pool.query(`
          SELECT tree_node_id, relative_path, start_byte, end_byte,
                 source_revision, source_content_hash
          FROM atlas_ast_nodes
          WHERE tree_node_id = ANY($1::text[])
        `, [treeNodeIds])).rows
      : [];
    const astAll = (await pool.query(`
      SELECT tree_node_id, relative_path, start_byte, end_byte,
             source_revision, source_content_hash
      FROM atlas_ast_nodes
    `)).rows;
    const packets = treeNodeIds.length
      ? (await pool.query(`
          SELECT tree_node_id, packet_key, source_ref, chunk_id,
                 byte_start, byte_end, workspace_revision
          FROM atlas_packets
          WHERE tree_node_id = ANY($1::text[])
        `, [treeNodeIds])).rows
      : [];

    const report = {
      schema_version: 'atlas-ast-qdrant-tree-bridge-v1',
      generated_at: new Date().toISOString(),
      collection: COLLECTION,
      read_only: true,
      qdrant: {
        points_with_tree_node_id: qdrantRows.length,
        distinct_tree_node_ids: treeNodeIds.length,
        duplicate_tree_node_point_groups: groupCount(qdrantRows, 'tree_node_id').ambiguous,
      },
      atlas_ast_nodes: {
        matched_rows: astByTreeId.length,
        matched_tree_node_ids: new Set(astByTreeId.map((row) => row.tree_node_id)).size,
        ambiguous_tree_node_ids: groupCount(astByTreeId, 'tree_node_id').ambiguous,
      },
      atlas_packets: {
        matched_rows: packets.length,
        matched_tree_node_ids: new Set(packets.map((row) => row.tree_node_id)).size,
        ambiguous_tree_node_ids: groupCount(packets, 'tree_node_id').ambiguous,
      },
      span_resolution: {
        qdrant_carries_byte_span: false,
        ast_carries_byte_span: astAll.length > 0,
        packet_rows_with_byte_span: packets.filter((row) => row.byte_start != null && row.byte_end != null).length,
        packet_carries_byte_span: packets.some((row) => row.byte_start != null && row.byte_end != null),
        packet_path_only_ast_matches: 0,
        packet_exact_span_ast_matches: 0,
        status: 'REQUIRES_QDRANT_SPAN_OR_REVIEWED_CHUNK_BRIDGE',
      },
      gates: {
        qdrant_tree_nodes_present: qdrantRows.length > 0,
        ast_tree_node_join_visible: astByTreeId.length > 0,
        packet_tree_node_join_visible: packets.length > 0,
        unique_packet_tree_node_identity: packets.length > 0 && groupCount(packets, 'tree_node_id').ambiguous === 0,
        span_identity_proven: false,
      },
    };
    const astByPath = new Map();
    for (const row of astAll) {
      const key = normalizePath(row.relative_path);
      const list = astByPath.get(key) ?? [];
      list.push(row);
      astByPath.set(key, list);
    }
    let pathOnlyMatches = 0;
    let exactSpanMatches = 0;
    for (const packet of packets) {
      const candidates = astByPath.get(normalizePath(packet.source_ref)) ?? [];
      if (candidates.length > 0) pathOnlyMatches += 1;
      if (candidates.some((ast) =>
        packet.byte_start != null && packet.byte_end != null &&
        ast.start_byte != null && ast.end_byte != null &&
        Number(packet.byte_start) === Number(ast.start_byte) &&
        Number(packet.byte_end) === Number(ast.end_byte)
      )) exactSpanMatches += 1;
    }
    report.span_resolution.packet_path_only_ast_matches = pathOnlyMatches;
    report.span_resolution.packet_exact_span_ast_matches = exactSpanMatches;
    mkdirSync(path.dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
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
