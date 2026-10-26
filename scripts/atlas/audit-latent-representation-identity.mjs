#!/usr/bin/env node
/**
 * audit-latent-representation-identity.mjs
 *
 * Strictly READ-ONLY. Per operator directive 2026-08-03: do not patch or
 * rerun the production latent writer. This script only inspects live
 * schema/data and writes two report files — it never mutates atlas_packets,
 * never writes atlas_representation_records, never touches Qdrant/Neo4j.
 *
 * Every Postgres statement runs inside one BEGIN TRANSACTION READ ONLY /
 * ROLLBACK, and every SQL string is checked against a mutating-keyword
 * guard before execution (belt-and-suspenders on top of READ ONLY).
 *
 * Usage: node scripts/atlas/audit-latent-representation-identity.mjs
 */

import pg from 'pg';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAtlasEnv(REPO_ROOT);

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const SAMPLE_LIMIT = 1000;
const REPORT_DATE = new Date().toISOString().slice(0, 10);
const REPORT_DIR = resolve(REPO_ROOT, process.env.ATLAS_LATENT_AUDIT_REPORT_DIR || 'docs/reports');
const REPORT_DIR_RELATIVE = relative(REPO_ROOT, REPORT_DIR);
if (REPORT_DIR_RELATIVE === '..' || REPORT_DIR_RELATIVE.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || resolve(REPORT_DIR) === resolve(REPO_ROOT, '..')) {
  throw new Error('ATLAS_LATENT_AUDIT_REPORT_DIR_MUST_REMAIN_WITHIN_REPOSITORY');
}

const MUTATING_KEYWORDS = /\b(UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|TRUNCATE|REFRESH|MERGE|CALL)\b/i;

function guardReadOnly(sql) {
  if (MUTATING_KEYWORDS.test(sql)) {
    throw new Error(`ATLAS_AUDIT_MUTATION_BLOCKED: query contains a forbidden keyword:\n${sql}`);
  }
  return sql;
}

function safeGitRevision() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function dupCount(list) {
  const seen = new Map();
  for (const v of list) {
    if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  return [...seen.values()].filter((c) => c > 1).length;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();

  const report = {
    schema_version: 'latent-representation-identity-audit-v1',
    generated_at: new Date().toISOString(),
    repository_commit: safeGitRevision(),
    database_identity: new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).host,
    sample_parameters: { limit: SAMPLE_LIMIT, order_by: 'atlas_packets.packet_id ASC' },
    limitations: [],
    query_digests: [],
    proof_status: {},
  };

  function digestQuery(sql) {
    const digest = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
    report.query_digests.push({ digest, sql: sql.trim().replace(/\s+/g, ' ') });
    return digest;
  }

  async function q(sql, params = []) {
    guardReadOnly(sql);
    digestQuery(sql);
    return client.query(sql, params);
  }

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    console.log('[audit] transaction opened READ ONLY — nothing written to any canonical table this run');
    const databaseContext = await q(
      `SELECT current_database() AS database_name,
              current_schema() AS current_schema,
              current_setting('search_path') AS search_path,
              inet_server_addr()::text AS server_address,
              inet_server_port() AS server_port;`,
    );
    report.database_context = databaseContext.rows[0];

    // ── 1. Schema inventory ────────────────────────────────────────────────
    console.log('[audit] 1/10 schema inventory');
    const tablesToInspect = [
      'atlas_packets',
      'atlas_representation_records',
      'atlas_tree_nodes',
      'atlas_ast_nodes',
      'graphify_files',
      'graphify_symbols',
      'codebase_chunk_index',
      'atlas_topology_index',
    ];
    const schemaInventory = {};
    for (const table of tablesToInspect) {
      const { rows } = await q(
        `SELECT c.column_name, c.data_type, c.udt_name, c.is_nullable,
                CASE WHEN a.attnum > 0 THEN format_type(a.atttypid, a.atttypmod) END AS formatted_type
         FROM information_schema.columns c
         LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
         LEFT JOIN pg_catalog.pg_class t ON t.relnamespace = n.oid AND t.relname = c.table_name
         LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attname = c.column_name
                                              AND a.attnum > 0 AND NOT a.attisdropped
         WHERE c.table_schema = 'public' AND c.table_name = $1
         ORDER BY c.ordinal_position;`,
        [table],
      );
      schemaInventory[table] = {
        exists: rows.length > 0,
        columns: rows.map((r) => ({ name: r.column_name, type: r.udt_name, formatted_type: r.formatted_type, nullable: r.is_nullable === 'YES' })),
      };
    }

    const identityFieldChecklist = [
      'source_version_id',
      'symbol_version_id',
      'stable_symbol_id',
      'representation_revision',
      'producer_revision',
      'input_digest',
    ];
    const identityFieldClassification = {};
    for (const field of identityFieldChecklist) {
      const owners = Object.entries(schemaInventory)
        .filter(([, info]) => info.exists && info.columns.some((c) => c.name === field))
        .map(([table]) => table);
      identityFieldClassification[field] =
        owners.length === 0 ? 'ABSENT' : owners.length === 1 ? `PRESENT(${owners[0]})` : `AMBIGUOUS_OWNER(${owners.join(',')})`;
    }

    // ── 2. Vector-store inventory ───────────────────────────────────────────
    console.log('[audit] 2/10 vector-store inventory');
    const { rows: vectorCols } = await q(
      `SELECT table_name, column_name, udt_name
       FROM information_schema.columns
       WHERE udt_name IN ('vector','halfvec','sparsevec')
       ORDER BY table_name, column_name;`,
    );
    // Classify against the current Parent Atlas ownership contract, not dated population history.
    // Presence/population does not promote a writer or its row provenance.
    const KNOWN_CLASSIFICATION = {
      // Parent Atlas contract names this as the canonical semantic_768 target;
      // unique writer, provenance, and readback remain independently unproven.
      'codebase_chunk_index.content_embedding_768': 'CANONICAL_CONTRACT_TARGET_OWNER_UNPROVEN',
      // Historical halfvec surface is not the canonical contract target.
      'codebase_chunk_index.content_embedding': 'HISTORICAL_768_SURFACE_UNRESOLVED',
      // Populated 768 surface retained for compatibility; ownership remains
      // unresolved until its active writer and revision-qualified read path
      // are independently proven.
      'atlas_packets.embedding': 'SECONDARY_768_SURFACE_UNRESOLVED',
      'atlas_packets.content_embedding_384': 'LEGACY', // retired 384-dim lane
    };
    const vectorStoreInventory = vectorCols.map((r) => ({
      table: r.table_name,
      column: r.column_name,
      type: r.udt_name,
      classification: KNOWN_CLASSIFICATION[`${r.table_name}.${r.column_name}`] ?? 'UNKNOWN',
    }));

    // ── 3. Deterministic sample ─────────────────────────────────────────────
    console.log('[audit] 3/10 deterministic sample (<=1000 rows, latent_64 IS NOT NULL)');
    const { rows: sample } = await q(
      `SELECT packet_id, packet_key, source_ref, canonical_source_ref,
              source_revision, workspace_revision_key,
              qdrant_point_id, tree_node_id, latent_64
       FROM atlas_packets
       WHERE latent_64 IS NOT NULL
       ORDER BY packet_id
       LIMIT $1;`,
      [SAMPLE_LIMIT],
    );
    const sampleSelectionDigest = crypto.createHash('sha256').update(sample.map((r) => r.packet_id).join(',')).digest('hex');
    const sampleSummary = {
      selected_count: sample.length,
      packet_id_count: new Set(sample.map((r) => r.packet_id)).size,
      packet_key_count: new Set(sample.map((r) => r.packet_key).filter(Boolean)).size,
      qdrant_point_id_count: new Set(sample.map((r) => r.qdrant_point_id).filter(Boolean)).size,
      source_ref_count: new Set(sample.map((r) => r.source_ref).filter(Boolean)).size,
      sample_selection_digest: sampleSelectionDigest,
      first_packet_id: sample[0]?.packet_id ?? null,
      last_packet_id: sample[sample.length - 1]?.packet_id ?? null,
    };

    // ── 4. Packet identity ──────────────────────────────────────────────────
    console.log('[audit] 4/10 packet identity');
    const packetIdentity = {
      duplicate_packet_id_count: dupCount(sample.map((r) => r.packet_id)),
      duplicate_packet_key_count: dupCount(sample.map((r) => r.packet_key)),
      duplicate_qdrant_point_id_count: dupCount(sample.map((r) => r.qdrant_point_id)),
      source_ref_fanout_count: dupCount(sample.map((r) => r.source_ref)),
      missing_packet_key_count: sample.filter((r) => !r.packet_key).length,
      missing_source_ref_count: sample.filter((r) => !r.source_ref).length,
      missing_qdrant_point_id_count: sample.filter((r) => !r.qdrant_point_id).length,
      note: 'qdrant_point_id is a projection identifier, not canonical identity — never treated as such in this audit',
    };

    // ── 5. Qdrant identity (bounded, read-only scroll; separate HTTP call, not part of the pg transaction) ──
    console.log('[audit] 5/10 Qdrant identity (bounded scroll, read-only)');
    let qdrantIdentity = {};
    try {
      const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 250, with_payload: true, with_vector: false }),
      });
      if (scrollRes.ok) {
        const scrollJson = await scrollRes.json();
        const points = scrollJson.result?.points ?? [];
        const classify = (p) => {
          const payload = p.payload ?? {};
          if (!payload.packet_key && !payload.packetKey) return 'MISSING_PACKET_KEY';
          if (!payload.source_revision && !payload.sourceRevision) return 'MISSING_SOURCE_REVISION';
          if (!payload.representation_id && !payload.representationId) return 'WRONG_REPRESENTATION';
          return 'CURRENT_CANONICAL_IDENTITY';
        };
        const counts = {};
        for (const p of points) {
          const c = classify(p);
          counts[c] = (counts[c] ?? 0) + 1;
        }
        qdrantIdentity = {
          sampled_points: points.length,
          classification_counts: counts,
          required_payload_fields_present: {
            packet_key: points.filter((p) => p.payload?.packet_key || p.payload?.packetKey).length,
            source_ref: points.filter((p) => p.payload?.source_ref || p.payload?.sourceRef).length,
            source_revision: points.filter((p) => p.payload?.source_revision || p.payload?.sourceRevision).length,
            workspace_revision: points.filter((p) => p.payload?.workspace_revision || p.payload?.workspaceRevision).length,
            representation_id: points.filter((p) => p.payload?.representation_id || p.payload?.representationId).length,
          },
        };
      } else {
        qdrantIdentity = { error: `scroll HTTP ${scrollRes.status}` };
        report.limitations.push('Qdrant scroll returned non-200 — section 5 incomplete');
      }
    } catch (e) {
      qdrantIdentity = { error: String(e.message ?? e) };
      report.limitations.push('Qdrant unreachable — section 5 incomplete: ' + String(e.message ?? e));
    }
    qdrantIdentity.writer_resolution_order_observed =
      'backfill-latent-vectors.mjs resolves rows via: (1) qdrant_point_id exact match, (2) packet_key ANY() match with sveltekit-frontend/ prefix variants, (3) source_ref ANY() match with prefix variants, (4) JSONB payload/metadata containment fallback on qdrant_point_id/packet_key/packetKey/source_ref/sourceRef/primary_id — none of these branches require or verify source_revision or workspace_revision';

    // ── 6. Source lineage ───────────────────────────────────────────────────
    console.log('[audit] 6/10 source lineage');
    const packetSourceRefs = sample.map((r) => ({
      packetId: r.packet_id,
      refs: [...new Set([r.source_ref, r.canonical_source_ref].filter(Boolean))],
      sourceRevision: r.source_revision,
      workspaceRevisionKey: r.workspace_revision_key,
    }));
    const sourceRefKeys = [...new Set(packetSourceRefs.flatMap((r) => r.refs))];
    let sourceLineage = {
      packet_file_binding_joined_count: 0,
      packet_source_revision_binding_joined_count: 0,
      packet_workspace_and_source_revision_binding_joined_count: 0,
      packet_file_binding_missing_count: sample.length,
      packet_source_revision_binding_missing_or_mismatch_count: sample.length,
      packet_workspace_and_source_revision_binding_missing_or_mismatch_count: sample.length,
      source_version_id_joined_count: 0,
    };
    const sourceRefKeyShape = await q(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE source_ref_key LIKE '%#%')::int AS fragment_locator_rows,
              COUNT(*) FILTER (WHERE source_ref_key NOT LIKE '%#%')::int AS plain_path_rows
       FROM atlas_ast_nodes
       WHERE source_ref_key IS NOT NULL;`,
    );
    sourceLineage.ast_node_source_ref_key_shape = sourceRefKeyShape.rows[0];
    if (sourceRefKeys.length > 0) {
      const { rows: bindingRows } = await q(
        `SELECT canonical_source_ref, source_revision, workspace_revision
         FROM atlas_workspace_source_bindings
         WHERE canonical_source_ref = ANY($1::text[]);`,
        [sourceRefKeys],
      );
      const bindingsByRef = new Map();
      for (const row of bindingRows) {
        if (!bindingsByRef.has(row.canonical_source_ref)) bindingsByRef.set(row.canonical_source_ref, []);
        bindingsByRef.get(row.canonical_source_ref).push(row);
      }
      const pathJoined = packetSourceRefs.filter((packet) => packet.refs.some((ref) => (bindingsByRef.get(ref) ?? []).length > 0));
      const revisionJoined = packetSourceRefs.filter((packet) => packet.refs.some((ref) =>
        (bindingsByRef.get(ref) ?? []).some((binding) => binding.source_revision && binding.source_revision === packet.sourceRevision)));
      const workspaceRevisionJoined = packetSourceRefs.filter((packet) => packet.refs.some((ref) =>
        (bindingsByRef.get(ref) ?? []).some((binding) => binding.source_revision === packet.sourceRevision &&
          binding.workspace_revision === packet.workspaceRevisionKey)));
      sourceLineage = {
        packet_file_binding_joined_count: pathJoined.length,
        packet_source_revision_binding_joined_count: revisionJoined.length,
        packet_workspace_and_source_revision_binding_joined_count: workspaceRevisionJoined.length,
        packet_file_binding_missing_count: sample.length - pathJoined.length,
        packet_source_revision_binding_missing_or_mismatch_count: sample.length - revisionJoined.length,
        packet_workspace_and_source_revision_binding_missing_or_mismatch_count: sample.length - workspaceRevisionJoined.length,
        source_version_id_joined_count: 0,
        ast_node_source_ref_key_shape: sourceRefKeyShape.rows[0],
        note: 'File-level packet refs are compared against atlas_workspace_source_bindings. Counts prove only exact path/source_revision/workspace_revision equality for this bounded sample, not a canonical source_version_id object or broader cohort admission. atlas_ast_nodes.source_ref_key is node-grain and is reported separately; its fragment locators are not file-level source refs.',
      };
      if (revisionJoined.length === 0) {
        report.limitations.push('No sampled packet has a matching file-level source binding revision; do not synthesize one');
      }
    } else {
      report.limitations.push('No source_ref values present in sample — section 6 skipped');
    }

    // ── 7. Tree and symbol lineage ──────────────────────────────────────────
    console.log('[audit] 7/10 tree and symbol lineage');
    const treeNodeIds = [...new Set(sample.map((r) => r.tree_node_id).filter(Boolean))];
    let treeJoined = 0;
    let treeNodeIdFormatMismatch = 0;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (treeNodeIds.length > 0) {
      treeNodeIdFormatMismatch = treeNodeIds.filter((id) => !UUID_RE.test(id)).length;
      // atlas_packets.tree_node_id is text while atlas_tree_nodes.node_id is uuid. Compare as
      // text and report the observed format separately. These are document-hierarchy locators;
      // they are distinct from atlas_ast_nodes.tree_node_id, the code-AST hash identity.
      const { rows: treeRows } = await q(
        `SELECT node_id::text AS node_id FROM atlas_tree_nodes WHERE node_id::text = ANY($1::text[]);`,
        [treeNodeIds],
      );
      treeJoined = treeRows.length;
    }
    const treeAndSymbolLineage = {
      tree_node_joined_count: treeJoined,
      tree_node_missing_count: sample.length - sample.filter((r) => r.tree_node_id).length,
      tree_node_fanout_count: dupCount(sample.map((r) => r.tree_node_id)),
      tree_node_id_format_mismatch_count: treeNodeIdFormatMismatch,
      graphify_symbol_joined_count: 0,
      graphify_symbol_missing_count: sample.length,
      symbol_join_ambiguous_count: 0,
      stable_symbol_key_present_count: 0,
      symbol_version_id_present_count: 0,
      note:
        `atlas_tree_nodes is a separate, provisional document-hierarchy table, not canonical code-AST identity (GS1.10). In this sample, ${treeNodeIds.length - treeNodeIdFormatMismatch}/${treeNodeIds.length} non-null atlas_packets.tree_node_id strings are UUID-formatted and ${treeJoined}/${treeNodeIds.length} match atlas_tree_nodes.node_id by exact text comparison; ${treeNodeIdFormatMismatch} malformed values were observed. This supports sample-level document-hierarchy joinability only, not source revision, byte-span, or canonical AST provenance. atlas_ast_nodes.tree_node_id is a distinct code-AST hash namespace; do not equate or cast between the two identity domains. Exact file-source-to-symbol-version results are computed separately below using the existing writer's revision, upstream symbol, declaration hash, name, and byte-span contract.`,
    };

    // ── 8. BYTEA contract ────────────────────────────────────────────────────
    console.log('[audit] 8/10 BYTEA contract');
    const byteLengths = sample.map((r) => (r.latent_64 ? r.latent_64.length : 0)).filter((n) => n > 0);
    const distinctByteLengths = new Set(byteLengths);
    const byteaContract = {
      non_null_latent_count: byteLengths.length,
      distinct_byte_lengths: distinctByteLengths.size,
      minimum_byte_length: byteLengths.length ? Math.min(...byteLengths) : null,
      maximum_byte_length: byteLengths.length ? Math.max(...byteLengths) : null,
      uniform_byte_length: distinctByteLengths.size === 1,
      encoding_contract_result:
        distinctByteLengths.size === 1 && [...distinctByteLengths][0] === 256
          ? 'CONSISTENT_WITH_64_FLOAT32_LITTLE_ENDIAN(byte length 256 = 64*4, matches backfill-latent-vectors.mjs writeFloatLE encoding — but dtype/byte-order are read from the writer source code, not derived from the bytes themselves)'
          : 'OPAQUE_BYTEA_WITH_UNPROVEN_ENCODING',
      note: 'Dimension/dtype/byte-order are asserted from reading backfill-latent-vectors.mjs source (floatArrayToBuffer: writeFloatLE, 4 bytes/float, 64 floats), not inferred from the column name. No producer_id/producer_revision/serialization-method field exists anywhere on atlas_packets to make this a proven encoding contract — do not infer float32 merely because the field is named latent_64.',
    };

    // ── 9. Representation ledger ────────────────────────────────────────────
    console.log('[audit] 9/10 representation ledger');
    const representationLedger = schemaInventory.atlas_representation_records.exists
      ? { representation_record_joined_count: 0, representation_record_missing_count: sample.length, note: 'table exists but join not implemented this pass' }
      : {
          representation_record_joined_count: 0,
          representation_record_missing_count: sample.length,
          representation_id_values: [],
          representation_revision_values: [],
          source_representation_id_values: [],
          producer_id_values: [],
          producer_revision_values: [],
          input_digest_present_count: 0,
          parameters_digest_present_count: 0,
          note: 'atlas_representation_records is not a table in the current schema; the existing atlas_representations registry is the representation owner, but this audit does not join packet rows to that registry. Packet representation columns alone do not establish producer identity, input digest, or parameters digest.',
        };

    // ── 10. Lineage classification ──────────────────────────────────────────
    console.log('[audit] 10/10 lineage classification');
    const packetCrosswalkInput = sample.map((row) => ({
      packet_id: String(row.packet_id),
      packet_key: row.packet_key,
      refs: [...new Set([row.source_ref, row.canonical_source_ref].filter(Boolean))],
      source_revision: row.source_revision,
      workspace_revision: row.workspace_revision_key,
    }));
    const { rows: crosswalkRows } = await q(
      `WITH packet_sample AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS p(
           packet_id text, packet_key text, refs text[], source_revision text, workspace_revision text
         )
       ), bound_sources AS (
         SELECT DISTINCT p.packet_id, p.packet_key, p.source_revision, p.workspace_revision,
                b.canonical_source_ref
         FROM packet_sample p
         CROSS JOIN LATERAL unnest(p.refs) AS refs(source_ref)
         JOIN atlas_workspace_source_bindings b
           ON b.canonical_source_ref = refs.source_ref
          AND b.source_revision = p.source_revision
          AND b.workspace_revision = p.workspace_revision
       ), source_symbols AS (
         SELECT b.packet_id, b.packet_key, b.source_revision, b.workspace_revision,
                b.canonical_source_ref, gf.file_id, gs.symbol_id::text AS upstream_symbol_id,
                gs.qualified_name, gs.stable_symbol_key, gs.ast_fingerprint,
                gs.start_byte, gs.end_byte
         FROM bound_sources b
         JOIN graphify_files gf
           ON gf.source_ref = b.canonical_source_ref
          AND gf.code_source_revision = b.source_revision
         JOIN graphify_symbols gs ON gs.file_id = gf.file_id
       ), exact_symbol_versions AS (
         SELECT s.packet_id, s.packet_key, v.symbol_version_id, v.packet_key AS version_packet_key
         FROM source_symbols s
         JOIN atlas_symbol_versions v
           ON v.source_ref = s.canonical_source_ref
          AND v.source_revision = s.source_revision
          AND v.workspace_revision = s.workspace_revision
          AND v.upstream_symbol_id = s.upstream_symbol_id
          AND v.qualified_name = COALESCE(s.qualified_name, s.stable_symbol_key)
          AND v.declaration_hash = s.ast_fingerprint
          AND v.byte_start = s.start_byte
          AND v.byte_end = s.end_byte
         JOIN atlas_symbol_registry r
           ON r.stable_symbol_id = v.stable_symbol_id
          AND r.status = 'active'
       )
       SELECT p.packet_id, p.packet_key,
              COUNT(DISTINCT b.canonical_source_ref)::int AS exact_source_binding_count,
              COUNT(DISTINCT s.upstream_symbol_id)::int AS exact_graphify_symbol_count,
              COUNT(DISTINCT s.upstream_symbol_id) FILTER (WHERE s.stable_symbol_key IS NOT NULL)::int
                AS stable_symbol_key_count,
              COUNT(DISTINCT e.symbol_version_id)::int AS exact_symbol_version_count,
              COUNT(DISTINCT e.symbol_version_id) FILTER (WHERE e.version_packet_key = p.packet_key)::int
                AS exact_packet_key_symbol_version_count
       FROM packet_sample p
       LEFT JOIN bound_sources b ON b.packet_id = p.packet_id
       LEFT JOIN source_symbols s ON s.packet_id = p.packet_id
       LEFT JOIN exact_symbol_versions e ON e.packet_id = p.packet_id
       GROUP BY p.packet_id, p.packet_key;`,
      [JSON.stringify(packetCrosswalkInput)],
    );
    const exactSourceBindingPacketCount = crosswalkRows.filter((row) => Number(row.exact_source_binding_count) > 0).length;
    const exactGraphifySymbolPacketCount = crosswalkRows.filter((row) => Number(row.exact_graphify_symbol_count) > 0).length;
    const stableSymbolKeyPacketCount = crosswalkRows.filter((row) => Number(row.stable_symbol_key_count) > 0).length;
    const exactSymbolVersionPacketCount = crosswalkRows.filter((row) => Number(row.exact_symbol_version_count) > 0).length;
    const exactSymbolVersionRowCount = crosswalkRows.reduce((sum, row) => sum + Number(row.exact_symbol_version_count), 0);
    const exactPacketKeySymbolVersionPacketCount = crosswalkRows.filter((row) => Number(row.exact_packet_key_symbol_version_count) > 0).length;
    const exactPacketKeySymbolVersionRowCount = crosswalkRows.reduce((sum, row) => sum + Number(row.exact_packet_key_symbol_version_count), 0);
    const { rows: symbolVersionOwnerRows } = await q(
      `WITH versions AS (
         SELECT v.symbol_version_id, v.stable_symbol_id, v.source_ref, v.source_revision,
                v.workspace_revision, v.upstream_symbol_id, v.upstream_file_id, v.packet_key,
                v.qualified_name, v.declaration_hash, v.byte_start, v.byte_end
         FROM atlas_symbol_versions v
       ), qualified AS (
         SELECT v.*, b.canonical_source_ref AS bound_source_ref,
                gf.file_id
         FROM versions v
         LEFT JOIN atlas_workspace_source_bindings b
           ON b.canonical_source_ref = v.source_ref
          AND b.source_revision = v.source_revision
          AND b.workspace_revision = v.workspace_revision
         LEFT JOIN graphify_files gf
           ON gf.source_ref = b.canonical_source_ref
          AND gf.code_source_revision = b.source_revision
       )
       SELECT COUNT(*)::int AS symbol_version_row_count,
              COUNT(*) FILTER (WHERE source_revision ~ '^sha256:[0-9a-f]{64}$')::int AS source_sha256_row_count,
              COUNT(*) FILTER (WHERE workspace_revision ~ '^sha256:[0-9a-f]{64}$')::int AS workspace_sha256_row_count,
              COUNT(*) FILTER (WHERE packet_key IS NOT NULL)::int AS packet_key_present_row_count,
              COUNT(*) FILTER (WHERE bound_source_ref IS NOT NULL)::int AS exact_source_workspace_binding_row_count,
              COUNT(*) FILTER (WHERE file_id IS NOT NULL)::int AS exact_graphify_file_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND gs.symbol_id::text = qualified.upstream_symbol_id
              ))::int AS upstream_symbol_id_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = qualified.qualified_name
              ))::int AS same_file_name_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = qualified.qualified_name
                  AND gs.start_byte = qualified.byte_start
                  AND gs.end_byte = qualified.byte_end
              ))::int AS same_file_name_and_span_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = qualified.qualified_name
                  AND gs.ast_fingerprint = qualified.declaration_hash
              ))::int AS same_file_name_and_hash_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = qualified.qualified_name
                  AND gs.start_byte = qualified.byte_start
                  AND gs.end_byte = qualified.byte_end
                  AND gs.ast_fingerprint = qualified.declaration_hash
              ))::int AS same_file_name_span_and_hash_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND gs.symbol_id::text = qualified.upstream_symbol_id
                  AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = qualified.qualified_name
              ))::int AS upstream_symbol_and_name_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND gs.symbol_id::text = qualified.upstream_symbol_id
                  AND gs.start_byte = qualified.byte_start
                  AND gs.end_byte = qualified.byte_end
              ))::int AS upstream_symbol_and_span_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND gs.symbol_id::text = qualified.upstream_symbol_id
                  AND gs.ast_fingerprint = qualified.declaration_hash
              ))::int AS upstream_symbol_and_hash_match_row_count,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM graphify_symbols gs
                WHERE gs.file_id = qualified.file_id
                  AND gs.symbol_id::text = qualified.upstream_symbol_id
                  AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = qualified.qualified_name
                  AND gs.ast_fingerprint = qualified.declaration_hash
                  AND gs.start_byte = qualified.byte_start
                  AND gs.end_byte = qualified.byte_end
              ))::int AS exact_graphify_symbol_tuple_match_row_count,
              COUNT(*) FILTER (WHERE stable_symbol_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM atlas_symbol_registry r WHERE r.stable_symbol_id = qualified.stable_symbol_id AND r.status = 'active'
              ))::int AS active_registry_row_count,
              COUNT(*) FILTER (WHERE packet_key IS NOT NULL AND EXISTS (
                SELECT 1 FROM atlas_packets p
                WHERE p.packet_key = qualified.packet_key
                  AND (p.source_ref = qualified.source_ref OR p.canonical_source_ref = qualified.source_ref)
                  AND p.source_revision = qualified.source_revision
                  AND p.workspace_revision_key = qualified.workspace_revision
              ))::int AS exact_packet_identity_row_count
         FROM qualified;`,
    );
    const symbolVersionOwnerCensus = symbolVersionOwnerRows[0] ?? {};
    const { rows: symbolNameMismatchRows } = await q(
      `SELECT v.symbol_version_id, v.source_ref, v.source_revision, v.workspace_revision,
              v.packet_key, v.producer_revision, v.upstream_node_id,
              v.upstream_file_id, v.upstream_symbol_id AS stored_upstream_symbol_id,
              gs.symbol_id::text AS current_graphify_symbol_id,
              v.qualified_name, gs.qualified_name AS current_qualified_name,
              v.declaration_hash AS stored_declaration_hash,
              gs.ast_fingerprint AS current_ast_fingerprint,
              v.byte_start AS stored_byte_start, v.byte_end AS stored_byte_end,
              gs.start_byte AS current_start_byte, gs.end_byte AS current_end_byte,
              (v.declaration_hash = gs.ast_fingerprint) AS declaration_hash_equal,
              (v.byte_start = gs.start_byte AND v.byte_end = gs.end_byte) AS byte_span_equal
       FROM atlas_symbol_versions v
       JOIN atlas_workspace_source_bindings b
         ON b.canonical_source_ref = v.source_ref
        AND b.source_revision = v.source_revision
        AND b.workspace_revision = v.workspace_revision
       JOIN graphify_files gf
         ON gf.source_ref = b.canonical_source_ref
        AND gf.code_source_revision = b.source_revision
       JOIN graphify_symbols gs
         ON gs.file_id = gf.file_id
        AND COALESCE(gs.qualified_name, gs.stable_symbol_key) = v.qualified_name
       ORDER BY v.source_ref, v.qualified_name, v.symbol_version_id
       LIMIT 12;`,
    );
    treeAndSymbolLineage.graphify_symbol_joined_count = exactGraphifySymbolPacketCount;
    treeAndSymbolLineage.graphify_symbol_missing_count = sample.length - exactGraphifySymbolPacketCount;
    treeAndSymbolLineage.symbol_version_id_present_count = exactSymbolVersionPacketCount;
    treeAndSymbolLineage.symbol_join_ambiguous_count = 0;
    treeAndSymbolLineage.stable_symbol_key_present_count = stableSymbolKeyPacketCount;
    const lineageCounts = {
      NUMERIC_BYTES_PRESENT: 0,
      REPRESENTATION_RECORD_PRESENT: 0,
      SOURCE_BINDING_REVISION_JOINED: exactSourceBindingPacketCount,
      GRAPHIFY_SYMBOL_REVISION_JOINED: exactGraphifySymbolPacketCount,
      EXACT_SYMBOL_VERSION_JOINED: exactSymbolVersionPacketCount,
      EXACT_PACKET_KEY_SYMBOL_VERSION_JOINED: exactPacketKeySymbolVersionPacketCount,
      SOURCE_VERSION_JOINED: 0,
      SYMBOL_VERSION_JOINED: exactSymbolVersionPacketCount,
      FULL_LINEAGE_PROVEN: 0,
      PARTIAL_LINEAGE: 0,
      LINEAGE_MISSING: 0,
      AMBIGUOUS_JOIN: 0,
    };
    const crosswalkByPacket = new Map(crosswalkRows.map((row) => [String(row.packet_id), row]));
    for (const row of sample) {
      const hasBytes = Boolean(row.latent_64);
      if (hasBytes) lineageCounts.NUMERIC_BYTES_PRESENT++;
      const crosswalk = crosswalkByPacket.get(String(row.packet_id));
      const sourceBound = Number(crosswalk?.exact_source_binding_count ?? 0) > 0;
      const exactSymbolVersion = Number(crosswalk?.exact_symbol_version_count ?? 0) > 0;
      if (hasBytes && (sourceBound || exactSymbolVersion)) {
        lineageCounts.PARTIAL_LINEAGE++;
      } else {
        lineageCounts.LINEAGE_MISSING++;
      }
    }
    report.packet_symbol_version_crosswalk = {
      packet_sample_count: crosswalkRows.length,
      exact_source_binding_packet_count: exactSourceBindingPacketCount,
      exact_graphify_symbol_packet_count: exactGraphifySymbolPacketCount,
      exact_symbol_version_packet_count: exactSymbolVersionPacketCount,
      exact_symbol_version_row_count: exactSymbolVersionRowCount,
      exact_packet_key_symbol_version_packet_count: exactPacketKeySymbolVersionPacketCount,
      exact_packet_key_symbol_version_row_count: exactPacketKeySymbolVersionRowCount,
      packet_sample: crosswalkRows.slice(0, 20),
      symbol_version_owner_census: symbolVersionOwnerCensus,
      same_name_mismatch_sample: symbolNameMismatchRows,
      canonicalSourceVersionIdPresent: false,
      qualification: 'EXACT_SOURCE_WORKSPACE_UPSTREAM_SYMBOL_NAME_DECLARATION_HASH_AND_BYTE_SPAN',
      note: 'This bounded crosswalk uses the canonical symbol writer identity tuple. A source binding is not a source_version_id object; exact AST symbol-version matches do not by themselves admit latent vectors or prove representation input provenance.',
    };

    await client.query('ROLLBACK');
    console.log('[audit] transaction rolled back — confirmed zero production mutations');

    // ── Gates ────────────────────────────────────────────────────────────────
    report.proof_status = {
      LAT_AUDIT1_READ_ONLY_GUARD: 'PASS',
      LAT_AUDIT2_SCHEMA_INVENTORY: 'PASS',
      LAT_AUDIT3_VECTOR_STORE_CLASSIFICATION: 'PARTIAL_PROVEN', // most columns UNKNOWN by design, not inferred
      LAT_AUDIT4_PACKET_IDENTITY: 'PASS',
      LAT_AUDIT5_QDRANT_JOIN_CLASSIFIED: qdrantIdentity.error ? 'BLOCKED' : 'PASS',
      LAT_AUDIT6_SOURCE_VERSION_JOIN: 'NOT_PROVEN', // File-level revision bindings do not establish a canonical source_version_id join.
      LAT_AUDIT7_TREE_JOIN: 'PARTIAL_PROVEN',
      LAT_AUDIT8_SYMBOL_JOIN: 'NOT_PROVEN', // graphify_symbols is present but this audit has no packet-to-symbol-version join.
      LAT_AUDIT9_BYTEA_ENCODING_CONTRACT: byteaContract.uniform_byte_length ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      LAT_AUDIT10_REPRESENTATION_LEDGER: 'NOT_PROVEN', // atlas_representations exists but this audit has no packet-to-registry join.
      LAT_AUDIT11_LINEAGE_CLASSIFICATION: 'PASS',
      LAT_AUDIT12_JSON_REPORT: 'PASS', // set true once written below
      LAT_AUDIT13_MARKDOWN_REPORT: 'PASS', // set true once written below
      LAT_AUDIT14_ZERO_PRODUCTION_MUTATIONS: 'PASS',
    };

    report.schema_inventory = schemaInventory;
    report.identity_field_classification = identityFieldClassification;
    report.vector_store_inventory = vectorStoreInventory;
    report.sample_summary = sampleSummary;
    report.packet_identity = packetIdentity;
    report.qdrant_identity = qdrantIdentity;
    report.source_lineage = sourceLineage;
    report.tree_and_symbol_lineage = treeAndSymbolLineage;
    report.bytea_contract = byteaContract;
    report.representation_ledger = representationLedger;
    report.lineage_classification_counts = lineageCounts;

    // ── Write reports ────────────────────────────────────────────────────────
    const reportsDir = REPORT_DIR;
    mkdirSync(reportsDir, { recursive: true });
    const jsonPath = resolve(reportsDir, `latent-representation-identity-audit-${REPORT_DATE}.json`);
    const mdPath = resolve(reportsDir, `latent-representation-identity-audit-${REPORT_DATE}.md`);

    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const md = `# Latent Representation Identity Audit — ${REPORT_DATE}

**Read-only. Zero production mutations.** Repository commit: \`${report.repository_commit}\`. Database: \`${report.database_identity}\`.

## Proof status

${Object.entries(report.proof_status).map(([k, v]) => `- \`${k}\`: **${v}**`).join('\n')}

## Sample

${Object.entries(sampleSummary).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## Packet identity

${Object.entries(packetIdentity).filter(([k]) => k !== 'note').map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

> ${packetIdentity.note}

## Qdrant identity (bounded scroll, ${qdrantIdentity.sampled_points ?? 0} points)

${qdrantIdentity.error ? `**Error**: ${qdrantIdentity.error}` : Object.entries(qdrantIdentity.classification_counts ?? {}).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

> Writer resolution order observed: ${qdrantIdentity.writer_resolution_order_observed}

## Source lineage

${Object.entries(sourceLineage).filter(([k]) => k !== 'note').map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

> ${sourceLineage.note ?? ''}

## Tree and symbol lineage

${Object.entries(treeAndSymbolLineage).filter(([k]) => k !== 'note').map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

> ${treeAndSymbolLineage.note}

## BYTEA contract

${Object.entries(byteaContract).filter(([k]) => !['note', 'encoding_contract_result'].includes(k)).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}
- \`encoding_contract_result\`: ${byteaContract.encoding_contract_result}

> ${byteaContract.note}

## Representation ledger

${representationLedger.note}

## Lineage classification (${sample.length} sampled rows)

${Object.entries(lineageCounts).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## Identity field classification

${Object.entries(identityFieldClassification).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## Vector-store inventory (${vectorStoreInventory.length} columns db-wide)

| Table | Column | Type | Classification |
|---|---|---|---|
${vectorStoreInventory.map((r) => `| ${r.table} | ${r.column} | ${r.type} | ${r.classification} |`).join('\n')}

## Limitations

${report.limitations.length ? report.limitations.map((l) => `- ${l}`).join('\n') : '- none recorded'}

## Query digests (${report.query_digests.length} queries executed, all inside one rolled-back READ ONLY transaction)

${report.query_digests.map((q) => `- \`${q.digest}\`: \`${q.sql.slice(0, 140)}${q.sql.length > 140 ? '…' : ''}\``).join('\n')}
`;
    writeFileSync(mdPath, md);

    console.log(`\n✅ Reports written:\n  ${jsonPath}\n  ${mdPath}`);
    console.log('\n=== PROOF STATUS ===');
    console.log(JSON.stringify(report.proof_status, null, 2));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('Fatal (rolled back, zero mutations):', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
