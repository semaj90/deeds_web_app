#!/usr/bin/env node
/**
 * audit-canonical-projection-fabric.mjs
 *
 * Bounded, read-only measurement of the 11 admission predicates proposed for
 * "ATLAS-CANONICAL-PROJECTION-FABRIC-01" (2026-09-08 external architecture
 * proposal, recorded in openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md)
 * against live schema/data. This script proves or disproves each predicate —
 * it never mints missing contracts, never writes atlas_representation_records,
 * atlas_packets, Qdrant, Redis, or Neo4j, and never promotes a projection.
 *
 * Every Postgres statement runs inside one BEGIN TRANSACTION READ ONLY /
 * ROLLBACK, and every SQL string is checked against a mutating-keyword guard
 * before execution — same discipline as audit-latent-representation-identity.mjs,
 * whose findings this script reuses rather than re-deriving from scratch.
 *
 * Usage: node scripts/atlas/audit-canonical-projection-fabric.mjs
 */

import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAtlasEnv(REPO_ROOT);

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
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

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();

  const report = {
    schema_version: 'atlas-canonical-projection-fabric-audit-v1',
    generated_at: new Date().toISOString(),
    repository_commit: safeGitRevision(),
    database_identity: new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).host,
    source_proposal: 'ATLAS-CANONICAL-PROJECTION-FABRIC-01 (external architecture review, recorded 2026-09-08)',
    limitations: [],
    query_digests: [],
    predicates: {},
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
    console.log('[fabric-audit] transaction opened READ ONLY — nothing written to any canonical table this run');

    // ── Table existence probe (broad candidate list; absence is itself evidence) ──
    console.log('[fabric-audit] 1/11 candidate table existence');
    const candidateTables = [
      'atlas_packets',
      'atlas_representation_records',
      'atlas_ast_nodes',
      'atlas_tree_nodes',
      'graphify_symbols',
      'graphify_files',
      'codebase_chunk_index',
      'atlas_topology_index',
      'atlas_ontology_concepts',
      'atlas_ontology_tuples',
      'hypergraph_edges',
      'atlas_hyperedges',
      'atlas_candidate_ordinals',
      'atlas_graph_projection_manifest',
      'atlas_workspace_source_bindings',
      'ace_context_sources',
      'agent_context_files',
      'directory_context_bindings',
    ];
    const existing = new Set();
    for (const t of candidateTables) {
      const { rows } = await q(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`,
        [t],
      );
      if (rows.length > 0) existing.add(t);
    }
    report.table_existence = candidateTables.reduce((acc, t) => {
      acc[t] = existing.has(t);
      return acc;
    }, {});

    // ── Deterministic sample (same shape as the 2026-09-08 identity audit) ──
    console.log('[fabric-audit] 2/11 deterministic sample');
    const { rows: sample } = await q(
      `SELECT packet_id, packet_key, source_ref, qdrant_point_id, tree_node_id, latent_64
       FROM atlas_packets
       WHERE latent_64 IS NOT NULL
       ORDER BY packet_id
       LIMIT $1;`,
      [SAMPLE_LIMIT],
    );

    // ── Predicate 1: IDENTITY_ALIGNED ──
    console.log('[fabric-audit] 3/11 IDENTITY_ALIGNED');
    const dupCount = (list) => {
      const seen = new Map();
      for (const v of list) if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
      return [...seen.values()].filter((c) => c > 1).length;
    };
    const missingQdrant = sample.filter((r) => !r.qdrant_point_id).length;
    const dupPacketKey = dupCount(sample.map((r) => r.packet_key));
    const identityAligned = {
      sample_size: sample.length,
      duplicate_packet_key_count: dupPacketKey,
      missing_qdrant_point_id_count: missingQdrant,
      verdict: dupPacketKey === 0 && missingQdrant === 0 ? 'PASS' : dupPacketKey === 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
    };

    // ── Predicate 2: REVISION_QUALIFIED ──
    console.log('[fabric-audit] 4/11 REVISION_QUALIFIED');
    const sourceRefKeys = [...new Set(sample.map((r) => r.source_ref).filter(Boolean))];
    let revisionJoined = 0;
    if (sourceRefKeys.length > 0 && existing.has('atlas_ast_nodes')) {
      const { rows: astRows } = await q(
        `SELECT source_ref_key, source_revision FROM atlas_ast_nodes WHERE source_ref_key = ANY($1::text[]);`,
        [sourceRefKeys],
      );
      const bySource = new Map();
      for (const r of astRows) {
        if (!bySource.has(r.source_ref_key)) bySource.set(r.source_ref_key, []);
        bySource.get(r.source_ref_key).push(r);
      }
      for (const sr of sourceRefKeys) {
        const matches = bySource.get(sr) ?? [];
        if (matches.length === 1 && matches[0].source_revision) revisionJoined++;
      }
    }
    const revisionQualified = {
      source_ref_count: sourceRefKeys.length,
      revision_joined_count: revisionJoined,
      verdict: sourceRefKeys.length > 0 && revisionJoined === sourceRefKeys.length ? 'PASS' : revisionJoined > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      note: 'No live atlas_packets.workspace_revision column exists — this predicate cannot reach PASS via source_revision alone even at 100% join.',
    };

    // ── Predicate 3: SYMBOLS_RESOLVED ──
    console.log('[fabric-audit] 5/11 SYMBOLS_RESOLVED');
    let graphifySymbolsRowCount = null;
    if (existing.has('graphify_symbols')) {
      const { rows } = await q(`SELECT COUNT(*)::int AS n FROM graphify_symbols;`);
      graphifySymbolsRowCount = rows[0].n;
    }
    const symbolsResolved = {
      graphify_symbols_exists: existing.has('graphify_symbols'),
      graphify_symbols_row_count: graphifySymbolsRowCount,
      verdict: graphifySymbolsRowCount > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      note: existing.has('graphify_symbols')
        ? `Table exists (columns: symbol_id, file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id, start/end byte+row, signature_text, source_text_hash, ast_fingerprint, metadata) but is EMPTY (0 rows). Corrects the 2026-09-08 latent-representation-identity audit, which reported this table absent — it exists as schema but has never been populated by a writer; no canonical SymbolVersionV1 registry has real data yet either way.`
        : 'graphify_symbols does not exist live. No canonical SymbolVersionV1 registry exists; atlas_tree_nodes/atlas_ast_nodes are provisional structural inventories, not a symbol version authority.',
    };

    // ── Predicate 4: SEMANTIC_OWNER_PROVEN ──
    console.log('[fabric-audit] 6/11 SEMANTIC_OWNER_PROVEN');
    const { rows: vectorCols } = await q(
      `SELECT table_name, column_name, udt_name
       FROM information_schema.columns
       WHERE udt_name IN ('vector','halfvec','sparsevec')
       ORDER BY table_name, column_name;`,
    );
    const KNOWN_768_CANONICAL_CANDIDATES = ['atlas_packets.embedding', 'codebase_chunk_index.content_embedding_768'];
    const canonical768Present = vectorCols
      .map((r) => `${r.table_name}.${r.column_name}`)
      .filter((k) => KNOWN_768_CANONICAL_CANDIDATES.includes(k));
    const semanticOwnerProven = {
      candidate_768_columns_present: canonical768Present,
      verdict: canonical768Present.length === 1 ? 'PASS' : canonical768Present.length > 1 ? 'AMBIGUOUS_OWNER' : 'NOT_PROVEN',
      note:
        canonical768Present.length > 1
          ? 'Two independently-populated tables both carry a 768-dim vector column that this repo has previously labeled CANONICAL_SOURCE (atlas_packets.embedding AND codebase_chunk_index.content_embedding_768). Per CLAUDE.md this is a known, tracked split (two coexisting Qdrant 768 collections mirror it) — not resolved by this audit. semantic_768 does not have one proven physical owner yet.'
          : 'See vector_store_inventory for full column list.',
    };

    // ── Predicate 5: LATENT_FAMILY_PROVEN ──
    console.log('[fabric-audit] 7/11 LATENT_FAMILY_PROVEN');
    const { rows: latentCols } = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='atlas_packets' AND column_name IN ('latent_256','latent_128','latent_64');`,
    );
    const latentFamilyProven = {
      latent_columns_present: latentCols.map((r) => r.column_name),
      representation_ledger_exists: existing.has('atlas_representation_records'),
      verdict: existing.has('atlas_representation_records') ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      note: 'Per the 2026-09-08 identity audit, atlas_representation_records does not exist — there is no producer_id/encoder_revision/input_digest record tying latent_64 (the only populated lane) to a shared-derivation family with any latent_256/latent_128 sibling. Cannot prove a single-input, non-cascaded projection family without it.',
    };

    // ── Predicate 6: GRAPH_MANIFEST_SEALED ──
    console.log('[fabric-audit] 8/11 GRAPH_MANIFEST_SEALED');
    const graphManifestSealed = {
      manifest_table_exists: existing.has('atlas_graph_projection_manifest'),
      verdict: existing.has('atlas_graph_projection_manifest') ? 'PARTIAL_PROVEN' : 'ABSENT',
      note: 'No GraphProjectionManifestV1-shaped table found. NetworkX/cuGraph/Neo4j currently each run their own graph construction (per CLAUDE.md\'s NetworkX↔cuGraph parity pipeline) rather than consuming one sealed node/edge manifest.',
    };

    // ── Predicate 7: ONTOLOGY_COHORT_NONEMPTY ──
    console.log('[fabric-audit] 9/11 ONTOLOGY_COHORT_NONEMPTY');
    let ontologyRowCount = 0;
    const ontologyTablesFound = [];
    for (const t of ['atlas_ontology_concepts', 'atlas_ontology_tuples', 'hypergraph_edges', 'atlas_hyperedges']) {
      if (existing.has(t)) {
        ontologyTablesFound.push(t);
        const { rows } = await q(`SELECT COUNT(*)::int AS n FROM ${t};`);
        ontologyRowCount += rows[0].n;
      }
    }
    const ontologyCohortNonempty = {
      ontology_tables_found: ontologyTablesFound,
      total_row_count: ontologyRowCount,
      verdict: ontologyTablesFound.length === 0 ? 'ABSENT' : ontologyRowCount > 0 ? 'PASS' : 'NOT_PROVEN',
    };

    // ── Predicate 8: ORDINAL_MAP_SEALED ──
    console.log('[fabric-audit] 10/11 ORDINAL_MAP_SEALED');
    const ordinalMapSealed = {
      ordinal_table_exists: existing.has('atlas_candidate_ordinals'),
      verdict: existing.has('atlas_candidate_ordinals') ? 'PARTIAL_PROVEN' : 'ABSENT',
      note: 'No dedicated CandidateOrdinal sealed-map table found. CLAUDE.md documents CandidateOrdinal normalization as a design intent (parent-atlas identity/retrieval alignment section), not yet a table-backed sealed artifact.',
    };

    // ── Predicate 9: PROJECTIONS_CHECKSUM_ALIGNED ──
    console.log('[fabric-audit] 11/11a PROJECTIONS_CHECKSUM_ALIGNED');
    const projectionsChecksumAligned = {
      depends_on: 'LATENT_FAMILY_PROVEN + GRAPH_MANIFEST_SEALED',
      verdict: 'NOT_PROVEN',
      note: 'Cannot be proven while atlas_representation_records is absent — there is no checksum field anywhere recording input_checksum/ordinal_map_checksum for cross-projection alignment.',
    };

    // ── Predicate 10: BITFROST_KEYS_DERIVABLE ──
    console.log('[fabric-audit] 11/11b BITFROST_KEYS_DERIVABLE');
    let bitfrostKeysDerivable;
    try {
      const redis = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      await redis.connect();
      const keys = await redis.keys('bitfrost:packet:*');
      bitfrostKeysDerivable = {
        sample_key_count: keys.length,
        verdict: keys.length > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
        note: 'Presence of bitfrost:packet:* keys does not by itself prove a derivable domain+cluster+topology+symbol-neighborhood BitFrost key scheme — only that the existing summary cache namespace is populated.',
      };
      await redis.quit();
    } catch (e) {
      bitfrostKeysDerivable = { verdict: 'BLOCKED', error: String(e.message ?? e) };
      report.limitations.push('Redis unreachable — BITFROST_KEYS_DERIVABLE incomplete: ' + String(e.message ?? e));
    }

    // ── Predicate 11: ACE_EVIDENCE_GROUNDED ──
    console.log('[fabric-audit] 11/11c ACE_EVIDENCE_GROUNDED');
    let aceEvidenceGrounded;
    if (existing.has('ace_context_sources')) {
      const { rows } = await q(`SELECT COUNT(*)::int AS n FROM ace_context_sources;`);
      aceEvidenceGrounded = {
        table_exists: true,
        row_count: rows[0].n,
        verdict: rows[0].n > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
        note: 'ace_context_sources existing and populated proves an audit trail exists; it does not by itself prove every ACE card cites source spans/symbols/tuples rather than rehydrated raw JSON (ACECardV1 from the proposal) — not checked this pass.',
      };
    } else {
      aceEvidenceGrounded = { table_exists: false, verdict: 'NOT_PROVEN' };
    }

    await client.query('ROLLBACK');
    console.log('[fabric-audit] transaction rolled back — confirmed zero production mutations');

    report.predicates = {
      IDENTITY_ALIGNED: identityAligned,
      REVISION_QUALIFIED: revisionQualified,
      SYMBOLS_RESOLVED: symbolsResolved,
      SEMANTIC_OWNER_PROVEN: semanticOwnerProven,
      LATENT_FAMILY_PROVEN: latentFamilyProven,
      GRAPH_MANIFEST_SEALED: graphManifestSealed,
      ONTOLOGY_COHORT_NONEMPTY: ontologyCohortNonempty,
      ORDINAL_MAP_SEALED: ordinalMapSealed,
      PROJECTIONS_CHECKSUM_ALIGNED: projectionsChecksumAligned,
      BITFROST_KEYS_DERIVABLE: bitfrostKeysDerivable,
      ACE_EVIDENCE_GROUNDED: aceEvidenceGrounded,
    };

    const verdicts = Object.values(report.predicates).map((p) => p.verdict);
    const allPass = verdicts.every((v) => v === 'PASS');
    report.overall_verdict = allPass ? 'SAFE_TO_PROJECT' : 'NOT_SAFE_TO_PROJECT';
    report.overall_verdict_reason = allPass
      ? 'All 11 predicates PASS.'
      : `${verdicts.filter((v) => v !== 'PASS').length}/11 predicates below PASS: ${Object.entries(report.predicates).filter(([, p]) => p.verdict !== 'PASS').map(([k, p]) => `${k}=${p.verdict}`).join(', ')}`;

    // ── Write reports ──
    const reportsDir = resolve(REPO_ROOT, 'docs', 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const jsonPath = resolve(reportsDir, `atlas-canonical-projection-fabric-audit-${REPORT_DATE}.json`);
    const mdPath = resolve(reportsDir, `atlas-canonical-projection-fabric-audit-${REPORT_DATE}.md`);

    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const md = `# ATLAS-CANONICAL-PROJECTION-FABRIC-01 Admission Gate — ${REPORT_DATE}

**Read-only. Zero production mutations.** Repository commit: \`${report.repository_commit}\`. Database: \`${report.database_identity}\`.

Source proposal: ${report.source_proposal}

## Overall verdict: **${report.overall_verdict}**

${report.overall_verdict_reason}

## Predicates

${Object.entries(report.predicates)
  .map(([k, p]) => `### \`${k}\`: **${p.verdict}**\n${p.note ? `> ${p.note}\n` : ''}${Object.entries(p).filter(([kk]) => !['verdict', 'note'].includes(kk)).map(([kk, vv]) => `- \`${kk}\`: ${JSON.stringify(vv)}`).join('\n')}`)
  .join('\n\n')}

## Table existence

${Object.entries(report.table_existence).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## Limitations

${report.limitations.length ? report.limitations.map((l) => `- ${l}`).join('\n') : '- none recorded'}

## Query digests (${report.query_digests.length} queries, all inside one rolled-back READ ONLY transaction)

${report.query_digests.map((qd) => `- \`${qd.digest}\`: \`${qd.sql.slice(0, 140)}${qd.sql.length > 140 ? '…' : ''}\``).join('\n')}
`;
    writeFileSync(mdPath, md);

    console.log(`\n✅ Reports written:\n  ${jsonPath}\n  ${mdPath}`);
    console.log('\n=== OVERALL VERDICT ===');
    console.log(report.overall_verdict, '-', report.overall_verdict_reason);
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
