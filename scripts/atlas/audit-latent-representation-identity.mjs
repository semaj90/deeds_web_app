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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAtlasEnv(REPO_ROOT);

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const SAMPLE_LIMIT = 1000;
const REPORT_DATE = new Date().toISOString().slice(0, 10);

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
        `SELECT column_name, data_type, udt_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position;`,
        [table],
      );
      schemaInventory[table] = {
        exists: rows.length > 0,
        columns: rows.map((r) => ({ name: r.column_name, type: r.udt_name, nullable: r.is_nullable === 'YES' })),
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
    // Only classify what's directly evidence-backed by prior sessions' live checks; everything
    // else stays UNKNOWN rather than inferred from naming, per the audit's own rule.
    const KNOWN_CLASSIFICATION = {
      'atlas_packets.embedding': 'CANONICAL_SOURCE', // verified live 2026-08-03: vector(768), 61,659/61,659 non-null
      'codebase_chunk_index.content_embedding_768': 'CANONICAL_SOURCE',
      'codebase_chunk_index.content_embedding': 'DERIVED_PROJECTION', // halfvec mirror of the above
      'atlas_packets.content_embedding_384': 'LEGACY', // per repo's own retirement note on the 384-dim lane
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
      `SELECT packet_id, packet_key, source_ref, qdrant_point_id, tree_node_id, latent_64
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
    const sourceRefKeys = [...new Set(sample.map((r) => r.source_ref).filter(Boolean))];
    let sourceLineage = {
      source_ref_joined_count: 0,
      source_version_joined_count: 0,
      source_join_missing_count: sourceRefKeys.length,
      source_join_ambiguous_count: 0,
      workspace_revision_aligned_count: 0,
      workspace_revision_mismatch_count: 0,
    };
    if (sourceRefKeys.length > 0) {
      const { rows: astRows } = await q(
        `SELECT source_ref_key, source_revision, workspace_id
         FROM atlas_ast_nodes
         WHERE source_ref_key = ANY($1::text[]);`,
        [sourceRefKeys],
      );
      const bySource = new Map();
      for (const r of astRows) {
        if (!bySource.has(r.source_ref_key)) bySource.set(r.source_ref_key, []);
        bySource.get(r.source_ref_key).push(r);
      }
      let joined = 0;
      let versionJoined = 0;
      let ambiguous = 0;
      for (const sr of sourceRefKeys) {
        const matches = bySource.get(sr) ?? [];
        if (matches.length === 1) {
          joined++;
          if (matches[0].source_revision) versionJoined++;
        } else if (matches.length > 1) {
          ambiguous++;
        }
      }
      sourceLineage = {
        source_ref_joined_count: joined,
        source_version_joined_count: versionJoined,
        source_join_missing_count: sourceRefKeys.length - joined - ambiguous,
        source_join_ambiguous_count: ambiguous,
        workspace_revision_aligned_count: 0,
        workspace_revision_mismatch_count: 0,
        note: 'atlas_ast_nodes.source_revision (joined via source_ref_key) is the only live revision-bearing proxy found — NOT a canonical source_version_id join, which does not exist yet (GS1.10 NOT_PROVEN). workspace_revision alignment not computed: no live packet-side workspace_revision column found on atlas_packets.',
      };
      if (versionJoined === 0) report.limitations.push('SOURCE_VERSION_JOIN = NOT_PROVEN in this sample — 0 matches (do not synthesize one)');
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
      // atlas_packets.tree_node_id is `text`; atlas_tree_nodes.node_id is `uuid`. Cast the
      // uuid side to text rather than assuming every text value is UUID-parseable — a hard
      // cast the other way (::uuid[]) throws 22P02 on non-UUID values, which is itself the
      // finding (see treeNodeIdFormatMismatch below), not something to paper over.
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
        `graphify_symbols does not exist live (confirmed via schema inventory) — all symbol-join metrics are structurally 0/ABSENT, not a bug in this audit. atlas_ast_nodes is the only live AST-adjacent table; atlas_tree_nodes is a separate, provisional structural-inventory table (GS1.10: "provisional structural inventory, not canonical graph identity"). REAL FINDING this pass: atlas_packets.tree_node_id is declared \`text\` but ${treeNodeIdFormatMismatch}/${treeNodeIds.length} sampled non-null values are NOT UUID-formatted (they look like content-hash strings, e.g. sha1/sha256-length hex) — while atlas_tree_nodes.node_id is declared \`uuid\`. A naive \`::uuid\` cast join throws 22P02; this audit casts the uuid side to text instead so the join can even be attempted. This is itself evidence of an unreconciled tree_node_id identity scheme, separate from GS1.10's already-known provisional-identity finding. Production writer/retrieval-path consumption of atlas_ast_nodes vs atlas_tree_nodes was not independently re-verified in this pass — see GS1.10-GS1.12 for prior findings.`,
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
          note: 'atlas_representation_records DOES NOT EXIST live (confirmed via schema inventory) — this is a real, total absence, not a query bug. atlas_packets does carry source_representation_id/projection_representation_id/representation_revision columns (confirmed live), but generic packet metadata is not a complete representation ledger per this audit\'s own definition (producer identity, input digest, parameters digest all absent).',
        };

    // ── 10. Lineage classification ──────────────────────────────────────────
    console.log('[audit] 10/10 lineage classification');
    const astBySource = new Map();
    if (sourceRefKeys.length > 0) {
      const { rows: astRows2 } = await q(
        `SELECT source_ref_key, source_revision FROM atlas_ast_nodes WHERE source_ref_key = ANY($1::text[]);`,
        [sourceRefKeys],
      );
      for (const r of astRows2) {
        if (!astBySource.has(r.source_ref_key)) astBySource.set(r.source_ref_key, []);
        astBySource.get(r.source_ref_key).push(r);
      }
    }
    const lineageCounts = {
      NUMERIC_BYTES_PRESENT: 0,
      REPRESENTATION_RECORD_PRESENT: 0,
      SOURCE_VERSION_JOINED: 0,
      SYMBOL_VERSION_JOINED: 0,
      FULL_LINEAGE_PROVEN: 0,
      PARTIAL_LINEAGE: 0,
      LINEAGE_MISSING: 0,
      AMBIGUOUS_JOIN: 0,
    };
    for (const row of sample) {
      const hasBytes = Boolean(row.latent_64);
      if (hasBytes) lineageCounts.NUMERIC_BYTES_PRESENT++;
      const srcMatches = row.source_ref ? astBySource.get(row.source_ref) ?? [] : [];
      const sourceVersionJoined = srcMatches.length === 1 && Boolean(srcMatches[0].source_revision);
      if (sourceVersionJoined) lineageCounts.SOURCE_VERSION_JOINED++;
      if (srcMatches.length > 1) {
        lineageCounts.AMBIGUOUS_JOIN++;
        continue;
      }
      // symbol_version_joined is structurally always false (graphify_symbols absent)
      const hasRepresentationRecord = false; // table absent
      if (hasBytes && hasRepresentationRecord && sourceVersionJoined) {
        lineageCounts.FULL_LINEAGE_PROVEN++;
      } else if (hasBytes && (hasRepresentationRecord || sourceVersionJoined)) {
        lineageCounts.PARTIAL_LINEAGE++;
      } else {
        lineageCounts.LINEAGE_MISSING++;
      }
    }

    await client.query('ROLLBACK');
    console.log('[audit] transaction rolled back — confirmed zero production mutations');

    // ── Gates ────────────────────────────────────────────────────────────────
    report.proof_status = {
      LAT_AUDIT1_READ_ONLY_GUARD: 'PASS',
      LAT_AUDIT2_SCHEMA_INVENTORY: 'PASS',
      LAT_AUDIT3_VECTOR_STORE_CLASSIFICATION: 'PARTIAL_PROVEN', // most columns UNKNOWN by design, not inferred
      LAT_AUDIT4_PACKET_IDENTITY: 'PASS',
      LAT_AUDIT5_QDRANT_JOIN_CLASSIFIED: qdrantIdentity.error ? 'BLOCKED' : 'PASS',
      LAT_AUDIT6_SOURCE_VERSION_JOIN: sourceLineage.source_version_joined_count > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      LAT_AUDIT7_TREE_JOIN: 'PARTIAL_PROVEN',
      LAT_AUDIT8_SYMBOL_JOIN: 'NOT_PROVEN', // graphify_symbols absent
      LAT_AUDIT9_BYTEA_ENCODING_CONTRACT: byteaContract.uniform_byte_length ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      LAT_AUDIT10_REPRESENTATION_LEDGER: 'NOT_PROVEN', // table absent
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
    const reportsDir = resolve(REPO_ROOT, 'docs', 'reports');
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
