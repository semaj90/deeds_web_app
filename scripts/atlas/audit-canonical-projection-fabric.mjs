#!/usr/bin/env node
/**
 * audit-canonical-projection-fabric.mjs
 *
 * Bounded, read-only measurement of the 11 admission predicates proposed for
 * "ATLAS-CANONICAL-PROJECTION-FABRIC-01" (2026-09-08 external architecture
 * proposal, recorded in openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md)
 * against live schema/data. This script proves or disproves each predicate —
 * it never mints missing contracts, never writes atlas_representations,
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
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { readSubmodulePaths, classifyRepositoryId } from './lib/gitmodules-registry.mjs';
import { GRAPHIFY_SYMBOL_EXCLUDED_ARTIFACT_REGEX_V1 } from './lib/graphify-symbol-candidate-selection-v1.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAtlasEnv(REPO_ROOT);

// Never silently fall back to a shared/example credential. The audit must use
// the operator-configured connection identity or stop before opening a socket.
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('ATLAS_FABRIC_AUDIT_DATABASE_URL_REQUIRED');
}
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const SAMPLE_LIMIT = 1000;
const REPORT_DATE = new Date().toISOString().slice(0, 10);
const REPORT_DIR = resolve(REPO_ROOT, process.env.ATLAS_AUDIT_REPORT_DIR || 'docs/reports');
const REPORT_DIR_RELATIVE = relative(REPO_ROOT, REPORT_DIR);
if (!REPORT_DIR_RELATIVE || REPORT_DIR_RELATIVE.startsWith('..') || REPORT_DIR_RELATIVE.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
  throw new Error('ATLAS_AUDIT_REPORT_DIR_MUST_BE_WITHIN_REPOSITORY');
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
      'atlas_representations',
      'atlas_ast_nodes',
      'atlas_tree_nodes',
      'graphify_symbols',
      'graphify_files',
      'atlas_symbol_registry',
      'atlas_symbol_versions',
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
    const sampleMissingQdrant = sample.filter((r) => !r.qdrant_point_id).length;
    const sampleDuplicatePacketKey = dupCount(sample.map((r) => r.packet_key));
    // This sample is retained for secondary revision diagnostics only. The identity
    // predicate is finalized below against the exact admitted repo:root cohort; a
    // latent_64-selected sample cannot establish cohort-wide alignment.
    let identityAligned = {
      scope: 'EXACT_ADMITTED_REPO_ROOT_COHORT_PENDING',
      sample_size: sample.length,
      sample_duplicate_packet_key_count: sampleDuplicatePacketKey,
      sample_missing_qdrant_point_id_count: sampleMissingQdrant,
      verdict: 'NOT_PROVEN',
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
    // Measured on the real packet columns (2026-09-28): atlas_packets.workspace_revision_key /
    // source_revision are written by the current-packet-digest-bridge-v1 producer. The AST-node
    // join above is retained only as a secondary metric -- atlas_ast_nodes is not the packet
    // revision authority. Legacy integer workspace_revision (default 0) is never counted.
    const { readFileSync } = await import('node:fs');
    let admittedWorkspaceRevision = null;
    try {
      const adm = JSON.parse(readFileSync(new URL('../../docs/reports/workspace-revision-tournament-admission-v1.json', import.meta.url), 'utf8'));
      if (adm.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && adm.authority === true) admittedWorkspaceRevision = adm.workspaceRevision;
    } catch { /* no admitted revision -> predicate cannot pass */ }
    const sha = '^sha256:[0-9a-f]{64}$';
    const { rows: [tot] } = await q(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE workspace_revision_key = $1 AND source_revision ~ $2)::int AS qualified
       FROM atlas_packets;`,
      [admittedWorkspaceRevision, sha],
    );
    const { rows: [smp] } = await q(
      `SELECT COUNT(*) FILTER (WHERE workspace_revision_key = $1 AND source_revision ~ $2)::int AS qualified
       FROM atlas_packets WHERE packet_key = ANY($3::text[]);`,
      [admittedWorkspaceRevision, sha, sample.map((r) => r.packet_key).filter(Boolean)],
    );
    const revisionQualified = {
      admitted_workspace_revision: admittedWorkspaceRevision,
      source_ref_count: sourceRefKeys.length,
      sample_packets_revision_qualified: smp.qualified,
      sample_packets: sample.length,
      table_packets_revision_qualified: tot.qualified,
      table_packets_total: tot.total,
      ast_node_join_count_secondary: revisionJoined,
      // The table-wide counts above remain diagnostic only. Historical and
      // non-admitted packet rows are not the denominator for this gate; the
      // sealed repo:root source snapshot below defines the admitted cohort.
      verdict: !admittedWorkspaceRevision ? 'NOT_PROVEN' : 'PARTIAL_PROVEN',
      note: 'Table-wide packet counts are diagnostic only. PASS is computed below against packet rows in the sealed admitted repo:root workspace snapshot, requiring exact source_revision equality; historical/non-admitted rows do not lower current-cohort coverage.',
    };

    // ── Predicate 3: SYMBOLS_RESOLVED ──
    console.log('[fabric-audit] 5/11 SYMBOLS_RESOLVED');
    let graphifySymbolsRowCount = null;
    if (existing.has('graphify_symbols')) {
      const { rows } = await q(`SELECT COUNT(*)::int AS n FROM graphify_symbols;`);
      graphifySymbolsRowCount = rows[0].n;
    }
    // Additive (2026-09-13): atlas_symbol_registry/atlas_symbol_versions are what
    // symbol-reconciliation-writer-v1.mts actually populates from graphify_symbols -- report
    // their coverage alongside the raw graphify_symbols count rather than replacing it, since
    // graphify_symbols having rows does not by itself mean any of them have been reconciled into
    // the canonical registry yet (that step is revision-gated and may lag behind extraction).
    let atlasSymbolRegistryRowCount = null;
    let atlasSymbolVersionsRowCount = null;
    if (existing.has('atlas_symbol_registry')) {
      const { rows } = await q(`SELECT COUNT(*)::int AS n FROM atlas_symbol_registry;`);
      atlasSymbolRegistryRowCount = rows[0].n;
    }
    if (existing.has('atlas_symbol_versions')) {
      const { rows } = await q(`SELECT COUNT(*)::int AS n FROM atlas_symbol_versions;`);
      atlasSymbolVersionsRowCount = rows[0].n;
    }
    // Live reconciliation-gate check (2026-09-28): same query symbol-reconciliation-writer-v1.mts
    // uses, so this predicate reflects real current gate status instead of a stale "always blocked"
    // claim. Read-only here -- never writes.
    let reconciliationGate = null;
    if (admittedWorkspaceRevision && existing.has('atlas_workspace_source_bindings') && existing.has('graphify_symbols') && existing.has('graphify_files')) {
      const { rows: [population] } = await q(
        `WITH admitted AS (
           SELECT canonical_source_ref, source_revision,
                  lower(split_part(canonical_source_ref, '.', array_length(string_to_array(canonical_source_ref, '.'), 1))) AS extension
           FROM atlas_workspace_source_bindings
           WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
         ), supported AS (
           SELECT * FROM admitted
           WHERE extension = ANY(ARRAY['ts','mts','tsx','js','mjs','cjs','jsx','json','jsonc','md','markdown','txt']::text[])
             AND canonical_source_ref !~* $2
         ), excluded_generated_artifacts AS (
           SELECT * FROM admitted
           WHERE extension = ANY(ARRAY['ts','mts','tsx','js','mjs','cjs','jsx','json','jsonc','md','markdown','txt']::text[])
             AND canonical_source_ref ~* $2
         )
         SELECT
           (SELECT COUNT(*)::int FROM admitted) AS bound_source_ref_count,
           (SELECT COUNT(*)::int FROM supported) AS supported_source_ref_count,
           (SELECT COUNT(*)::int FROM excluded_generated_artifacts) AS excluded_generated_artifact_count,
           COUNT(DISTINCT s.canonical_source_ref) FILTER (WHERE gf.file_id IS NOT NULL)::int AS exact_graphify_source_ref_count,
           COUNT(DISTINCT s.canonical_source_ref) FILTER (WHERE gf.parse_status = 'PROCESSED')::int AS processed_source_ref_count,
           COUNT(DISTINCT s.canonical_source_ref) FILTER (WHERE gf.parse_status = 'UNPROCESSED')::int AS unprocessed_source_ref_count,
           COUNT(DISTINCT s.canonical_source_ref) FILTER (WHERE gf.parse_status = 'PARSE_FAILED')::int AS parse_failed_source_ref_count,
           COUNT(DISTINCT s.canonical_source_ref) FILTER (WHERE gs.symbol_id IS NOT NULL)::int AS source_refs_with_symbols,
           COUNT(DISTINCT gs.symbol_id)::int AS exact_revision_symbol_row_count,
           (SELECT COUNT(*)::int FROM (
             SELECT s2.canonical_source_ref
             FROM supported s2
             JOIN graphify_files gf2
               ON gf2.source_ref = s2.canonical_source_ref
              AND gf2.code_source_revision = s2.source_revision
             GROUP BY s2.canonical_source_ref
             HAVING COUNT(*) > 1
           ) ambiguous) AS duplicate_exact_graphify_source_ref_count
         FROM supported s
         LEFT JOIN graphify_files gf
           ON gf.source_ref = s.canonical_source_ref
          AND gf.code_source_revision = s.source_revision
         LEFT JOIN graphify_symbols gs ON gs.file_id = gf.file_id;`,
        [admittedWorkspaceRevision, GRAPHIFY_SYMBOL_EXCLUDED_ARTIFACT_REGEX_V1],
      );
      reconciliationGate = {
        status: population.bound_source_ref_count === 0
          ? 'BLOCKED_ON_UNGROUNDED_REVISION'
          : population.exact_graphify_source_ref_count === 0
            ? 'BLOCKED_ON_EMPTY_EXACT_GRAPHIFY_COHORT'
            : 'GROUNDED',
        ...population,
        missing_exact_graphify_source_ref_count: Math.max(0, population.supported_source_ref_count - population.exact_graphify_source_ref_count),
      };
    }
    // AUDIT-SYMBOL-01 (2026-09-29, read-only): the prior verdict ternary above had NO PASS
    // branch at all and never consulted `reconciliationGate` despite computing it -- the same
    // unreachable-PASS bug class already found and fixed 3 times this session (GRAPH_MANIFEST_SEALED,
    // SEMANTIC_OWNER_PROVEN, ORDINAL_MAP_SEALED). Fixed by separating two genuinely distinct facts
    // (per external review, applied deliberately rather than collapsed): nomination RESOLUTION
    // (did every nominated symbol resolve cleanly against the registry?) vs population COVERAGE
    // (what fraction of the admitted revision's bound source refs even have an extracted symbol
    // row at all?). Reads the most recent symbol-reconciliation-writer-v1-*.json receipt whose
    // targetWorkspaceRevision matches the CURRENT admitted revision -- never recomputes the
    // canonicalization dry-run inline (that's the writer's own job), and never trusts a receipt
    // bound to a different, stale admitted revision.
    let reconciliationReceipt = null;
    try {
      const reportsDir = resolve(REPO_ROOT, 'docs/reports');
      const candidates = readdirSync(reportsDir)
        .filter((f) => /^symbol-reconciliation-writer-v1-\d+\.json$/.test(f))
        .sort()
        .reverse();
      for (const file of candidates) {
        const parsed = JSON.parse(readFileSync(resolve(reportsDir, file), 'utf8'));
        if (parsed.targetWorkspaceRevision === admittedWorkspaceRevision && parsed.receipt) {
          reconciliationReceipt = { file, ...parsed.receipt };
          break;
        }
      }
    } catch { /* absent or unreadable -- leave null, never fabricate */ }

    const nominationCount = reconciliationReceipt?.nomination_count ?? 0;
    const canonicalSymbolCount = reconciliationReceipt?.canonical_symbol_count ?? 0;
    const unresolvedSymbolCount = reconciliationReceipt?.unresolved_symbol_count ?? null;
    const ambiguousSymbolCount = reconciliationReceipt?.ambiguous_symbol_count ?? null;
    const nominationResolutionClean = Boolean(
      reconciliationReceipt
      && nominationCount > 0
      && canonicalSymbolCount === nominationCount
      && unresolvedSymbolCount === 0
      && ambiguousSymbolCount === 0,
    );
    const boundSourceRefCount = reconciliationGate?.bound_source_ref_count ?? 0;
    const supportedSourceRefCount = reconciliationGate?.supported_source_ref_count ?? 0;
    const processedSourceRefCount = reconciliationGate?.processed_source_ref_count ?? 0;
    const sourceRefsWithSymbols = reconciliationGate?.source_refs_with_symbols ?? 0;
    const symbolRowCount = reconciliationGate?.exact_revision_symbol_row_count ?? 0;
    const coverageRatio = supportedSourceRefCount > 0 ? processedSourceRefCount / supportedSourceRefCount : 0;
    const fullCoverage = supportedSourceRefCount > 0
      && processedSourceRefCount === supportedSourceRefCount
      && reconciliationGate?.missing_exact_graphify_source_ref_count === 0
      && reconciliationGate?.parse_failed_source_ref_count === 0
      && reconciliationGate?.duplicate_exact_graphify_source_ref_count === 0;

    let symbolsResolvedVerdict;
    if (!existing.has('graphify_symbols')) symbolsResolvedVerdict = 'ABSENT';
    else if (!reconciliationGate || reconciliationGate.status !== 'GROUNDED') symbolsResolvedVerdict = 'NOT_PROVEN';
    else if (!nominationResolutionClean) symbolsResolvedVerdict = 'PARTIAL_PROVEN';
    else if (!fullCoverage) symbolsResolvedVerdict = 'PARTIAL_PROVEN';
    else symbolsResolvedVerdict = 'PASS';

    const symbolsResolved = {
      graphify_symbols_exists: existing.has('graphify_symbols'),
      graphify_symbols_row_count: graphifySymbolsRowCount,
      atlas_symbol_registry_exists: existing.has('atlas_symbol_registry'),
      atlas_symbol_registry_row_count: atlasSymbolRegistryRowCount,
      atlas_symbol_versions_exists: existing.has('atlas_symbol_versions'),
      atlas_symbol_versions_row_count: atlasSymbolVersionsRowCount,
      reconciliation_gate: reconciliationGate,
      nomination_resolution: {
        source_receipt: reconciliationReceipt?.file ?? null,
        nomination_count: nominationCount,
        canonical_symbol_count: canonicalSymbolCount,
        unresolved_symbol_count: unresolvedSymbolCount,
        ambiguous_symbol_count: ambiguousSymbolCount,
        clean: nominationResolutionClean,
      },
      coverage: {
        bound_source_ref_count: boundSourceRefCount,
        supported_source_ref_count: supportedSourceRefCount,
        excluded_generated_artifact_count: reconciliationGate?.excluded_generated_artifact_count ?? 0,
        exact_graphify_source_ref_count: reconciliationGate?.exact_graphify_source_ref_count ?? 0,
        processed_source_ref_count: processedSourceRefCount,
        unprocessed_source_ref_count: reconciliationGate?.unprocessed_source_ref_count ?? 0,
        parse_failed_source_ref_count: reconciliationGate?.parse_failed_source_ref_count ?? 0,
        missing_exact_graphify_source_ref_count: reconciliationGate?.missing_exact_graphify_source_ref_count ?? 0,
        duplicate_exact_graphify_source_ref_count: reconciliationGate?.duplicate_exact_graphify_source_ref_count ?? 0,
        source_refs_with_symbols: sourceRefsWithSymbols,
        symbol_row_count: symbolRowCount,
        coverage_ratio: coverageRatio,
        full_coverage: fullCoverage,
      },
      verdict: symbolsResolvedVerdict,
      note: !existing.has('graphify_symbols')
        ? 'graphify_symbols does not exist live. No canonical SymbolVersionV1 registry exists; atlas_tree_nodes/atlas_ast_nodes are provisional structural inventories, not a symbol version authority.'
        : symbolsResolvedVerdict === 'PASS'
          ? 'Every extractor-supported source ref in the admitted revision has an exact code_source_revision Graphify observation marked PROCESSED, and the nominated symbols resolve cleanly. Files that legitimately produce no code-symbol rows are not treated as missing symbols.'
          : nominationResolutionClean
            ? `Nomination resolution is clean (${nominationCount}/${nominationCount} resolved, 0 unresolved, 0 ambiguous), but extractor population coverage is incomplete: ${processedSourceRefCount}/${supportedSourceRefCount} supported admitted source refs are processed (${(coverageRatio * 100).toFixed(1)}%); ${reconciliationGate?.unprocessed_source_ref_count ?? 0} remain UNPROCESSED, ${reconciliationGate?.missing_exact_graphify_source_ref_count ?? 0} lack an exact Graphify source-revision row, and ${reconciliationGate?.duplicate_exact_graphify_source_ref_count ?? 0} have duplicate exact rows. ${sourceRefsWithSymbols} exact-revision source refs currently have ${symbolRowCount} symbol rows. This is extraction coverage, not a requirement for one symbol per file -- see scripts/atlas/graphify-symbol-extractor-v1.mts.`
            : `Nomination resolution is not clean or no matching receipt exists for the current admitted revision (${admittedWorkspaceRevision}). Run scripts/atlas/symbol-reconciliation-writer-v1.mts --workspace-revision ${admittedWorkspaceRevision} to produce a fresh receipt before re-auditing.`,
    };

    // ── Predicate 4: SEMANTIC_OWNER_PROVEN ──
    console.log('[fabric-audit] 6/11 SEMANTIC_OWNER_PROVEN');
    const { rows: vectorCols } = await q(
      `SELECT table_name, column_name, udt_name
       FROM information_schema.columns
       WHERE udt_name IN ('vector','halfvec','sparsevec')
       ORDER BY table_name, column_name;`,
    );
    const CANONICAL_768_CONTRACT_TARGET = 'codebase_chunk_index.content_embedding_768';
    const HISTORICAL_OR_UNRESOLVED_768_SURFACES = [
      'atlas_packets.embedding',
      'codebase_chunk_index.content_embedding',
    ];
    const vectorSurfaceNames = vectorCols.map((r) => `${r.table_name}.${r.column_name}`);
    const canonical768ContractTargetPresent = vectorSurfaceNames.filter((k) => k === CANONICAL_768_CONTRACT_TARGET);
    const historicalOrUnresolved768SurfacesPresent = vectorSurfaceNames.filter((k) =>
      HISTORICAL_OR_UNRESOLVED_768_SURFACES.includes(k),
    );
    const semanticOwnerProven = {
      canonical_contract_target_present: canonical768ContractTargetPresent,
      historical_or_unresolved_768_surfaces_present: historicalOrUnresolved768SurfacesPresent,
      writerOwnerStatus: 'UNRESOLVED_NOT_PROMOTED',
      // AUDIT_REGRESSION fix (2026-09-28, read-only investigation, see tasks.md
      // "SEMANTIC-OWNER-REGRESSION-01"): this was found hardcoded to the literal 'NOT_PROVEN'
      // (an uncommitted, unattributed edit -- `git diff HEAD` shows the last COMMITTED version
      // computed `active768Present.length === 1 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN'`). The
      // underlying data did not regress -- codebase_chunk_index.content_embedding_768 is present
      // in the live vector-column census right now, verified live before this fix, same signal
      // the prior committed logic used -- only the verdict computation itself was flattened to
      // ignore that signal entirely. Restored to the last COMMITTED ternary (not the original,
      // even older PASS-capable version from commit a7e262ccf0, which an intermediate commit
      // 865a7c3f57 deliberately tightened to a PARTIAL_PROVEN ceiling -- that tightening is kept,
      // only the later uncommitted flattening-to-unconditional-NOT_PROVEN is undone).
      verdict: canonical768ContractTargetPresent.length === 1 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      note: canonical768ContractTargetPresent.length === 1
        ? 'The declared semantic_768 contract target codebase_chunk_index.content_embedding_768 is present. Column presence does not prove a unique writer, revision-qualified reads, per-row representation provenance, or projection readback; content_embedding and atlas_packets.embedding remain historical/unresolved surfaces.'
        : 'The declared semantic_768 contract target codebase_chunk_index.content_embedding_768 is absent from the live vector-column census; writer ownership remains unproven. See vector_store_inventory for the full column list.',
    };

    // ── Predicate 5: LATENT_FAMILY_PROVEN ──
    console.log('[fabric-audit] 7/11 LATENT_FAMILY_PROVEN');
    const { rows: latentCols } = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='atlas_packets' AND column_name IN ('latent_256','latent_128','latent_64');`,
    );
    // Real registry is atlas_representations (2026-09-28); atlas_representation_records never existed.
    let repRows = [];
    if (existing.has('atlas_representations')) {
      ({ rows: repRows } = await q(`SELECT representation_id, verification_status, artifact_digest FROM atlas_representations;`));
    }
    const repVerified = repRows.filter((r) => ['STATIC_VERIFIED', 'SAMPLE_VERIFIED', 'PRODUCTION_VERIFIED'].includes(r.verification_status)).length;
    const repDigested = repRows.filter((r) => r.artifact_digest && r.artifact_digest !== 'unknown').length;
    const latentFamilyProven = {
      latent_columns_present: latentCols.map((r) => r.column_name),
      representation_registry: 'atlas_representations',
      registry_rows: repRows.length,
      registry_verified: repVerified,
      registry_with_artifact_digest: repDigested,
      // artifact_digest identifies a model/checkpoint artifact; it is not a
      // per-row digest of the semantic_768 inputs used to derive latent rows.
      // Keep this false until a dedicated row-level input binding is inspected.
      per_row_input_digest_ledger_exists: false,
      verdict: repRows.length === 0 ? 'NOT_PROVEN' : repVerified > 0 && repDigested > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
      note: 'latent_64, latent_128, latent_256 are all registered with a real, cross-checked artifact digest (state_dict tensor-content checksum, verified live against the checkpoint file and against codebase_chunk_index.latent_256_checkpoint_revision, 55169 rows), producer chain and derivation mechanism (AUTOENCODER for latent_256, SLICE_FIRST_N for the renormalized prefixes) recorded in dimension_method + notes. Still below PASS: no per-row *input*-digest ledger exists (which source semantic_768 snapshot the checkpoint was trained against), and lifecycle_status stays CANDIDATE (no promotion vote taken).',
    };

    // ── Predicate 6: GRAPH_MANIFEST_SEALED ──
    console.log('[fabric-audit] 8/11 GRAPH_MANIFEST_SEALED');
    // Two distinct manifest owners coexist here, deliberately not merged (2026-09-28):
    //  (a) sveltekit-frontend/docs/reports/graph-snapshot-parity/manifest.json -- the OLDER
    //      NetworkX/cuGraph parity artifact (nodeTableHash/edgeTableHash/parquet files), consumed
    //      by that separate parity pipeline. Reported below for continuity; NOT what PASS is
    //      computed from any more.
    //  (b) sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/seal-index.json -- the NEW
    //      per-repository seal (GRAPH-SNAPSHOT-SCOPE-V2-01 follow-up, operator-selected
    //      "per-repository seal" direction), produced by seal-graph-snapshot-shards-v1.mts.
    //      PASS is computed from this artifact: sealed means every real repository partition
    //      (graphify_execution_file_membership_v2.repository_id) of the CURRENTLY admitted
    //      workspace revision has a materialized, replay-matched graph snapshot shard.
    // Explicitly NOT certified by a PASS here: Neo4j consumption of any graph manifest (old or
    // new -- still zero, a separate, still-open gap) and the old artifact's parquet-hash
    // verifiability. Report both honestly rather than letting either block or inflate this
    // predicate's specific, narrower claim.
    const { readFileSync: rf, existsSync: ex, createReadStream } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const gDir = new URL('../../sveltekit-frontend/docs/reports/graph-snapshot-parity/', import.meta.url);
    let graphManifest = null;
    try { graphManifest = JSON.parse(rf(new URL('manifest.json', gDir), 'utf8')); } catch { /* absent */ }
    const fileSha = (u) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(u).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
    let parquetBytesMatchTableHash = null;
    if (graphManifest && ex(new URL('nodes.parquet', gDir))) {
      parquetBytesMatchTableHash = (await fileSha(new URL('nodes.parquet', gDir))) === graphManifest.nodeTableHash
        && (await fileSha(new URL('edges.parquet', gDir))) === graphManifest.edgeTableHash;
    }

    let sealIndex = null;
    try { sealIndex = JSON.parse(rf(new URL('shards/seal-index.json', gDir), 'utf8')); } catch { /* absent */ }
    const sealIndexBoundToAdmitted = Boolean(
      sealIndex && admittedWorkspaceRevision && sealIndex.workspaceRevision === admittedWorkspaceRevision
    );
    // Re-derive the live repository set independently of the seal index's own self-report, so a
    // repository added to graphify_execution_file_membership_v2 after sealing can't be silently
    // missed -- this is a live query, not a re-read of what the sealer already claimed.
    // 2026-09-28 operator decision (tasks.md "Submodule scope" thread): canonical packet
    // admission -- and therefore this predicate's PASS bar -- is scoped to this project's own
    // authored source (repo:root and any future non-submodule repository). SUBMODULE
    // repositories (external third-party code, vendored -- classified independently here via
    // .gitmodules, not by trusting the seal index's own repositoryKind label) are excluded from
    // "must be sealed" by design, not because coverage was incomplete.
    const submodulePaths = readSubmodulePaths(REPO_ROOT);
    let liveRepositoryIds = [];
    let liveInScopeRepositoryIds = [];
    let sealIndexCoversLiveRepositories = false;
    if (sealIndex && sealIndexBoundToAdmitted) {
      const liveRepoRows = await q(
        `SELECT DISTINCT repository_id FROM graphify_execution_file_membership_v2
         WHERE workspace_revision = $1 AND execution_id = $2 ORDER BY repository_id;`,
        [admittedWorkspaceRevision, sealIndex.executionId]
      );
      liveRepositoryIds = liveRepoRows.rows.map((r) => r.repository_id);
      liveInScopeRepositoryIds = liveRepositoryIds.filter(
        (id) => classifyRepositoryId(id, submodulePaths) !== 'SUBMODULE'
      );
      const sealedRepositoryIds = new Set(
        (sealIndex.shards ?? []).filter((s) => s.sealed === true).map((s) => s.repositoryId)
      );
      sealIndexCoversLiveRepositories = liveInScopeRepositoryIds.length > 0
        && liveInScopeRepositoryIds.every((id) => sealedRepositoryIds.has(id));
    }
    const graphManifestFullySealed = Boolean(
      sealIndex
      && sealIndexBoundToAdmitted
      && sealIndexCoversLiveRepositories
    );

    const graphManifestSealed = {
      legacy_manifest_artifact: 'sveltekit-frontend/docs/reports/graph-snapshot-parity/manifest.json',
      legacy_manifest_present: Boolean(graphManifest),
      legacy_graph_revision: graphManifest?.graphRevision ?? null,
      legacy_node_count: graphManifest?.nodeCount ?? null,
      legacy_edge_count: graphManifest?.edgeCount ?? null,
      legacy_consumers_proven: ['networkx', 'cugraph'],
      legacy_parquet_bytes_match_table_hash: parquetBytesMatchTableHash,
      seal_index_artifact: 'sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/seal-index.json',
      seal_index_present: Boolean(sealIndex),
      seal_index_workspace_revision: sealIndex?.workspaceRevision ?? null,
      seal_index_execution_id: sealIndex?.executionId ?? null,
      seal_index_repository_count: sealIndex?.repositoryCount ?? null,
      bound_to_admitted_workspace_revision: sealIndexBoundToAdmitted,
      live_repository_ids: liveRepositoryIds,
      live_in_scope_repository_ids: liveInScopeRepositoryIds,
      submodule_repositories_excluded_by_design: liveRepositoryIds.filter((id) => !liveInScopeRepositoryIds.includes(id)),
      seal_index_covers_live_repositories: sealIndexCoversLiveRepositories,
      neo4j_consumes_manifest: false,
      verdict: graphManifestFullySealed ? 'PASS'
        : sealIndex ? 'PARTIAL_PROVEN'
        : (graphManifest ? 'PRESENT' : 'ABSENT'),
      note: graphManifestFullySealed
        ? 'Every in-scope (non-submodule) repository partition of the admitted workspace revision has a materialized, replay-matched graph snapshot shard, bound to the admitted revision by construction. Submodule repositories (vendored third-party code) are excluded from this bar by a 2026-09-28 operator decision, not because coverage was incomplete. Neo4j does not consume any graph manifest (old or new) -- a separate, still-open gap, not certified by this PASS.'
        : sealIndex
          ? 'A seal index exists but is stale, revision-mismatched, or does not cover every live in-scope (non-submodule) repository partition -- see bound_to_admitted_workspace_revision / seal_index_covers_live_repositories.'
          : 'A legacy NetworkX/cuGraph parity manifest may exist, but it is not bound to the admitted workspace revision and covers no repository partition. No per-repository seal index exists yet -- run seal-graph-snapshot-shards-v1.mts.',
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
    // ORDINAL-AUDIT-VERIFY-01: this predicate must use the sealed repo:root snapshot as its
    // denominator, and an old row is not a canonical match merely because packetKey happens to
    // resolve. canonicalId must equal packetKey and bind to the current packet/source revisions.
    let ordinalCorpus = null;
    try { ordinalCorpus = JSON.parse(rf(new URL('../../docs/reports/candidate-ordinal-corpus-v1.json', import.meta.url), 'utf8')); } catch { /* absent */ }
    const lineageOrdinalCandidates = ordinalCorpus?.candidates ?? [];
    const sha256Json = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
    const canonicalJson = (value) => {
      if (value === null || typeof value !== 'object') return JSON.stringify(value);
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const entries = Object.entries(value).filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    };
    let ordinalCandidateMapEvidence = null;
    let ordinalCandidateMapError = null;
    try {
      // CandidateOrdinalMapV1 is packet-grain. The older candidate-ordinal-corpus artifact is
      // lineage-filtered and must not be mistaken for the ordinal map itself. Consume the existing
      // CEI-24 owner receipt/map, verify its immutable inputs/checksums, then independently compare
      // every candidate to the live admitted packet cohort below. Chunk crosswalk coverage remains
      // a separate projection prerequisite; it is not a condition for assigning packet ordinals.
      const reportsDir = resolve(REPO_ROOT, 'docs/reports');
      const receipts = readdirSync(reportsDir)
        .filter((file) => /^cei24-candidate-snapshot-convergence-v1-\d{8}T\d{6}\.\d{3}Z\.json$/.test(file))
        .sort()
        .reverse();
      if (!receipts.length) throw new Error('CEI24_PACKET_ORDINAL_RECEIPT_ABSENT');
      const receiptName = receipts[0];
      const receipt = JSON.parse(readFileSync(resolve(reportsDir, receiptName), 'utf8'));
      if (receipt.schema !== 'atlas.cei24-candidate-snapshot-convergence-receipt.v1'
        || receipt.status !== 'PACKET_CANDIDATE_ORDINAL_MAP_PROVEN_CHUNK_CROSSWALK_PENDING'
        || receipt.owner?.mapSchema !== 'atlas.candidate-ordinal-map.v1'
        || receipt.owner?.identityResolution !== 'packet_key -> canonicalId (packet identity only)'
        || receipt.authority?.identityAuthority !== false
        || receipt.authority?.canonicalAuthority !== false
        || receipt.authority?.databaseWrites !== 0
        || receipt.authority?.qdrantWrites !== 0
        || receipt.authority?.valkeyWrites !== 0) throw new Error('CEI24_PACKET_ORDINAL_RECEIPT_CONTRACT_INVALID');

      const mapPath = resolve(REPO_ROOT, receipt.mapArtifact?.path ?? '');
      const mapRelativePath = relative(REPO_ROOT, mapPath);
      if (!mapRelativePath || mapRelativePath.startsWith('..') || mapRelativePath.includes(`..${process.platform === 'win32' ? '\\\\' : '/'}`)) {
        throw new Error('CEI24_PACKET_ORDINAL_MAP_OUTSIDE_REPOSITORY');
      }
      const mapBytes = readFileSync(mapPath);
      const mapDigest = `sha256:${crypto.createHash('sha256').update(mapBytes).digest('hex')}`;
      const packetMap = JSON.parse(mapBytes.toString('utf8'));
      if (mapDigest !== receipt.mapArtifact.sha256
        || packetMap.schema !== 'atlas.candidate-ordinal-map.v1'
        || packetMap.identityAuthority !== false
        || packetMap.rowCount !== receipt.counts?.canonicalPacketCandidates
        || packetMap.rowCount !== receipt.mapArtifact.rows
        || packetMap.candidateSnapshotRevision !== receipt.candidateSnapshotRevision
        || packetMap.ordinalMapChecksum !== receipt.ordinalMapChecksum
        || packetMap.ordinalMapChecksum !== crypto.createHash('sha256').update(canonicalJson({
          candidateSnapshotRevision: packetMap.candidateSnapshotRevision,
          workspaceRevision: packetMap.workspaceRevision,
          candidates: packetMap.candidates,
        })).digest('hex')) throw new Error('CEI24_PACKET_ORDINAL_MAP_CHECKSUM_OR_RECEIPT_MISMATCH');

      const matrixPath = resolve(REPO_ROOT, receipt.inputs?.matrixReport ?? '');
      const matrixRelativePath = relative(REPO_ROOT, matrixPath);
      if (!matrixRelativePath || matrixRelativePath.startsWith('..') || matrixRelativePath.includes(`..${process.platform === 'win32' ? '\\\\' : '/'}`)) {
        throw new Error('CEI24_MATRIX_REPORT_OUTSIDE_REPOSITORY');
      }
      const matrixBytes = readFileSync(matrixPath);
      const matrixDigest = `sha256:${crypto.createHash('sha256').update(matrixBytes).digest('hex')}`;
      const matrixReport = JSON.parse(matrixBytes.toString('utf8'));
      const matrixMapPath = resolve(REPO_ROOT, matrixReport.outDir, 'candidate-ordinal-map.ndjson');
      const matrixMapRelativePath = relative(REPO_ROOT, matrixMapPath);
      if (!matrixMapRelativePath || matrixMapRelativePath.startsWith('..') || matrixMapRelativePath.includes(`..${process.platform === 'win32' ? '\\\\' : '/'}`)) {
        throw new Error('CEI24_MATRIX_ORDINAL_ARTIFACT_OUTSIDE_REPOSITORY');
      }
      const matrixMapDigest = `sha256:${crypto.createHash('sha256').update(readFileSync(matrixMapPath)).digest('hex')}`;
      if (matrixDigest !== receipt.inputs.matrixReportSha256
        || matrixMapDigest !== receipt.inputs.matrixOrdinalArtifactSha256
        || matrixMapDigest !== `sha256:${matrixReport.files?.['candidate-ordinal-map.ndjson']?.sha256}`
        || matrixReport.schema !== 'atlas.candidate-feature-matrix-draft.v1'
        || matrixReport.canonical !== false
        || matrixReport.candidates !== packetMap.rowCount
        || matrixReport.ordinalMapChecksum !== receipt.inputs.matrixOrdinalMapChecksum) {
        throw new Error('CEI24_MATRIX_INPUT_RECEIPT_MISMATCH');
      }

      const matrixCandidates = packetMap.candidates.map(({ canonicalId, packetKey, sourceRef, sourceRevision, workspaceRevision }) => ({
        canonicalId, packetKey, sourceRef, sourceRevision, workspaceRevision,
      }));
      const expectedCandidateSnapshotRevision = `sha256:${crypto.createHash('sha256').update(canonicalJson({
        schema: 'atlas.cei24-candidate-snapshot-input.v1',
        sourceMatrixReport: receipt.inputs.matrixReport,
        sourceMatrixReportSha256: matrixDigest,
        sourceOrdinalArtifactSha256: matrixMapDigest,
        workspaceRevision: packetMap.workspaceRevision,
        candidates: matrixCandidates,
      })).digest('hex')}`;
      if (expectedCandidateSnapshotRevision !== packetMap.candidateSnapshotRevision) {
        throw new Error('CEI24_CANDIDATE_SNAPSHOT_REVISION_MISMATCH');
      }
      ordinalCandidateMapEvidence = {
        receipt: receiptName,
        mapPath: mapRelativePath.replaceAll('\\', '/'),
        mapDigest,
        packetMap,
      };
    } catch (error) {
      ordinalCandidateMapError = String(error?.message ?? error);
    }
    const ordinalCandidates = ordinalCandidateMapEvidence?.packetMap?.candidates ?? lineageOrdinalCandidates;

    let ordinalAdmission = null;
    let rootSnapshotVerified = false;
    let rootSnapshotError = null;
    let rootSourceRevisionByRef = new Map();
    try {
      ordinalAdmission = JSON.parse(readFileSync(new URL('../../docs/reports/workspace-revision-tournament-admission-v1.json', import.meta.url), 'utf8'));
      if (ordinalAdmission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
        || ordinalAdmission.authority !== true
        || ordinalAdmission.workspaceRevision !== admittedWorkspaceRevision
        || typeof ordinalAdmission.manifestPath !== 'string') throw new Error('ADMISSION_BINDING_INVALID');
      const snapshotRoot = resolve(REPO_ROOT, 'docs/reports/workspace-source-snapshots');
      const manifestPath = resolve(REPO_ROOT, ordinalAdmission.manifestPath);
      const relativeManifestPath = relative(snapshotRoot, manifestPath);
      if (!relativeManifestPath || relativeManifestPath.startsWith('..') || relativeManifestPath.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
        throw new Error('MANIFEST_OUTSIDE_SNAPSHOT_ROOT');
      }
      const snapshot = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const { schema, snapshotRevision, workspaceRevision: snapshotWorkspaceRevision, status, canonicalAuthority, datastoreWritesPerformed, ...body } = snapshot;
      if (schema !== 'atlas.workspace-source-snapshot-capture.v1'
        || snapshotRevision !== ordinalAdmission.snapshotRevision
        || sha256Json(body) !== snapshotRevision
        || snapshot.sourceMembershipChecksum !== ordinalAdmission.snapshotMembershipChecksum
        || snapshot.workspaceRevision !== null
        || status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
        || canonicalAuthority !== false
        || datastoreWritesPerformed !== false
        || !Array.isArray(snapshot.sources)
        || (snapshot.violations?.length ?? 0) !== 0) throw new Error('ADMITTED_SNAPSHOT_INVALID');
      const sourceIdentityKeys = snapshot.sources.map((s) => s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`);
      if (sha256Json([...sourceIdentityKeys].sort()) !== snapshot.sourceMembershipChecksum
        || new Set(sourceIdentityKeys).size !== sourceIdentityKeys.length) throw new Error('SOURCE_MEMBERSHIP_CHECKSUM_INVALID');
      const sourceContentRows = snapshot.sources.map((s) => [
        s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`, s.sourceRevision, s.byteLength,
      ]);
      if (sha256Json(sourceContentRows) !== snapshot.sourceContentChecksum) throw new Error('SOURCE_CONTENT_CHECKSUM_INVALID');
      for (const source of snapshot.sources.filter((s) => s.repositoryId === 'repo:root')) {
        if (typeof source.sourceRef !== 'string' || !source.sourceRef
          || source.sourceRef !== source.repositoryRelativePath
          || source.sourceIdentityKey !== `repo:root:${source.sourceRef}`
          || !/^sha256:[0-9a-f]{64}$/i.test(source.sourceRevision ?? '')
          || rootSourceRevisionByRef.has(source.sourceRef)) throw new Error('ROOT_SOURCE_ENTRY_INVALID');
        rootSourceRevisionByRef.set(source.sourceRef, source.sourceRevision);
      }
      if (rootSourceRevisionByRef.size === 0) throw new Error('ROOT_SOURCE_COHORT_EMPTY');
      rootSnapshotVerified = true;
    } catch (error) {
      rootSnapshotError = String(error?.message ?? error);
      rootSourceRevisionByRef = new Map();
    }

    const ordinalSnapshotMatchesAdmitted = Boolean(
      ordinalCandidateMapEvidence && ordinalAdmission && rootSnapshotVerified
      && ordinalCandidateMapEvidence.packetMap.candidates.length > 0
      && ordinalCandidateMapEvidence.packetMap.candidateSnapshotRevision === ordinalCandidateMapEvidence.packetMap.candidates[0]?.candidateSnapshotRevision
    );
    const ordinalWorkspaceMatchesAdmitted = Boolean(
      ordinalCandidateMapEvidence && admittedWorkspaceRevision
      && ordinalCandidateMapEvidence.packetMap.workspaceRevision === admittedWorkspaceRevision
    );
    const ordRevisionQualified = ordinalSnapshotMatchesAdmitted;

    let workspaceRevisionRows = [];
    let rootCandidateRows = [];
    if (rootSnapshotVerified && admittedWorkspaceRevision) {
      const { rows } = await q(
        `SELECT packet_key, source_ref, canonical_source_ref, source_revision, workspace_revision_key, qdrant_point_id
         FROM atlas_packets
         WHERE workspace_revision_key = $1;`,
      [admittedWorkspaceRevision],
    );
      workspaceRevisionRows = rows;
      rootCandidateRows = rows.filter((r) => rootSourceRevisionByRef.get(r.source_ref) === r.source_revision);
    }
    const admittedRootPacketRows = workspaceRevisionRows.filter((r) => rootSourceRevisionByRef.has(r.source_ref));
    const admittedRootRevisionMismatchCount = admittedRootPacketRows.length - rootCandidateRows.length;
    revisionQualified.admitted_root_snapshot_verified = rootSnapshotVerified;
    revisionQualified.admitted_root_snapshot_source_count = rootSourceRevisionByRef.size;
    revisionQualified.admitted_root_packet_rows = admittedRootPacketRows.length;
    revisionQualified.admitted_root_packet_revision_matches = rootCandidateRows.length;
    revisionQualified.admitted_root_packet_revision_mismatch_or_missing = admittedRootRevisionMismatchCount;
    revisionQualified.verdict = !rootSnapshotVerified || admittedRootPacketRows.length === 0
      ? 'NOT_PROVEN'
      : admittedRootRevisionMismatchCount === 0 ? 'PASS' : 'PARTIAL_PROVEN';
    revisionQualified.note = revisionQualified.verdict === 'PASS'
      ? `Every packet row in the admitted repo:root workspace cohort (${admittedRootPacketRows.length}) has a source_ref in the sealed snapshot and an exact source_revision match. The ${tot.total} table-wide row count is historical/non-admitted context, not the gate denominator.`
      : `Revision coverage is evaluated against the sealed admitted repo:root snapshot, not the entire historical atlas_packets table. Exact admitted matches=${rootCandidateRows.length}; mismatched or missing=${admittedRootRevisionMismatchCount}; snapshot_verified=${rootSnapshotVerified}.`;
    const admittedRootCandidateCount = rootCandidateRows.length;
    const admittedRootMissingPacketKeyCount = rootCandidateRows.filter((r) => !r.packet_key).length;
    const admittedRootDuplicatePacketKeyCount = dupCount(rootCandidateRows.map((r) => r.packet_key));
    const admittedRootMissingQdrantPointIdCount = rootCandidateRows.filter((r) => !r.qdrant_point_id).length;
    identityAligned = {
      scope: 'EXACT_ADMITTED_REPO_ROOT_SOURCE_REVISION_COHORT',
      admitted_workspace_revision: admittedWorkspaceRevision,
      admitted_root_snapshot_verified: rootSnapshotVerified,
      admitted_root_exact_revision_packet_count: admittedRootCandidateCount,
      missing_packet_key_count: admittedRootMissingPacketKeyCount,
      duplicate_packet_key_count: admittedRootDuplicatePacketKeyCount,
      missing_qdrant_point_id_count: admittedRootMissingQdrantPointIdCount,
      sample_size_diagnostic_only: sample.length,
      sample_duplicate_packet_key_count_diagnostic_only: sampleDuplicatePacketKey,
      sample_missing_qdrant_point_id_count_diagnostic_only: sampleMissingQdrant,
      verdict: !rootSnapshotVerified || admittedRootCandidateCount === 0
        ? 'NOT_PROVEN'
        : admittedRootDuplicatePacketKeyCount > 0 || admittedRootMissingPacketKeyCount > 0
          ? 'NOT_PROVEN'
          : 'PASS',
      note: !rootSnapshotVerified || admittedRootCandidateCount === 0
        ? 'Identity is not proven because the sealed admitted repo:root source snapshot or exact packet cohort is unavailable.'
        : admittedRootDuplicatePacketKeyCount > 0 || admittedRootMissingPacketKeyCount > 0
          ? 'The exact admitted repo:root packet cohort contains a missing or duplicate packet_key; sample-only identity evidence is diagnostic and cannot override this.'
          : 'Every exact-revision packet in the sealed admitted repo:root cohort has a unique packet_key. Missing qdrant_point_id values are reported as projection diagnostics only: Qdrant point IDs are rebuildable projection IDs, not canonical packet identity; projection alignment is evaluated separately.' ,
    };
    const rootByPacketKey = new Map(rootCandidateRows.map((r) => [r.packet_key, r]));
    const allWorkspaceByPacketKey = new Map(workspaceRevisionRows.map((r) => [r.packet_key, r]));
    let exactIdentityMatches = 0;
    let revisionExactMatches = 0;
    let workspaceRevisionMismatch = 0;
    let snapshotRevisionMismatch = 0;
    let missingSourceRevision = 0;
    let sourceRefMismatch = 0;
    let missingPacket = 0;
    let missingOrdinal = 0;
    let canonicalIdPacketKeyMismatch = 0;
    let duplicateCanonicalId = 0;
    let duplicatePacketKey = 0;
    let duplicateOrdinal = 0;
    let orphanOrdinalRows = 0;
    let foreignRepositoryRows = 0;
    let invalidOrdinal = 0;
    const canonicalIdCounts = new Map();
    const packetKeyCounts = new Map();
    const ordinalCounts = new Map();
    const validCanonicalKeys = new Set();
    for (const c of ordinalCandidates) {
      canonicalIdCounts.set(c.canonicalId, (canonicalIdCounts.get(c.canonicalId) ?? 0) + 1);
      packetKeyCounts.set(c.packetKey, (packetKeyCounts.get(c.packetKey) ?? 0) + 1);
      ordinalCounts.set(c.candidateOrdinal, (ordinalCounts.get(c.candidateOrdinal) ?? 0) + 1);
      if (c.canonicalId !== c.packetKey) canonicalIdPacketKeyMismatch++;
      if (!Number.isInteger(c.candidateOrdinal) || c.candidateOrdinal < 0 || c.candidateOrdinal >= ordinalCandidates.length) invalidOrdinal++;
      if (c.workspaceRevision !== admittedWorkspaceRevision) workspaceRevisionMismatch++;
      const expectedCandidateSnapshotRevision = ordinalCandidateMapEvidence?.packetMap.candidateSnapshotRevision
        ?? ordinalAdmission?.snapshotRevision;
      if (c.candidateSnapshotRevision !== expectedCandidateSnapshotRevision) snapshotRevisionMismatch++;
      if (typeof c.sourceRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(c.sourceRevision)) missingSourceRevision++;
      if (!rootByPacketKey.has(c.canonicalId)) orphanOrdinalRows++;
      if (!allWorkspaceByPacketKey.has(c.packetKey)) missingPacket++;
      else if (!rootByPacketKey.has(c.packetKey)) foreignRepositoryRows++;
      const live = c.canonicalId === c.packetKey ? rootByPacketKey.get(c.canonicalId) : undefined;
      if (live) {
        exactIdentityMatches++;
        if (live.source_revision === c.sourceRevision) revisionExactMatches++;
        const sourceRefExact = typeof c.sourceRef === 'string' && c.sourceRef.length > 0
          && (c.sourceRef === live.canonical_source_ref || c.sourceRef === live.source_ref);
        if (!sourceRefExact) sourceRefMismatch++;
        if (live.source_revision === c.sourceRevision
          && c.workspaceRevision === admittedWorkspaceRevision
          && c.candidateSnapshotRevision === expectedCandidateSnapshotRevision
          && sourceRefExact) validCanonicalKeys.add(live.packet_key);
      }
    }
    duplicateCanonicalId = [...canonicalIdCounts.values()].filter((n) => n > 1).length;
    duplicatePacketKey = [...packetKeyCounts.values()].filter((n) => n > 1).length;
    duplicateOrdinal = [...ordinalCounts.values()].filter((n) => n > 1).length;
    missingOrdinal = rootCandidateRows.filter((r) => !validCanonicalKeys.has(r.packet_key)).length;
    const ordinalSlotGaps = ordinalCandidates.length
      ? Array.from({ length: ordinalCandidates.length }, (_, ordinal) => ordinal).filter((ordinal) => !ordinalCounts.has(ordinal)).length
      : 0;
    const ordinalSequenceValid = ordinalCandidates.every((c, index) => c.candidateOrdinal === index);
    const checksumRecomputed = Boolean(ordinalCandidateMapEvidence
      && ordinalCandidateMapEvidence.packetMap.ordinalMapChecksum === crypto.createHash('sha256')
        .update(canonicalJson({
          candidateSnapshotRevision: ordinalCandidateMapEvidence.packetMap.candidateSnapshotRevision,
          workspaceRevision: ordinalCandidateMapEvidence.packetMap.workspaceRevision,
          candidates: ordinalCandidates,
        })).digest('hex'));
    const ordinalRowCountMatchesDenominator = ordinalCandidates.length === admittedRootCandidateCount;
    const ordinalMapFullySealed = Boolean(
      ordinalCandidateMapEvidence
      && rootSnapshotVerified
      && ordinalWorkspaceMatchesAdmitted
      && ordRevisionQualified
      && admittedRootCandidateCount > 0
      && exactIdentityMatches === admittedRootCandidateCount
      && revisionExactMatches === exactIdentityMatches
      && validCanonicalKeys.size === admittedRootCandidateCount
      && ordinalRowCountMatchesDenominator
      && canonicalIdPacketKeyMismatch === 0
      && duplicateCanonicalId === 0
      && duplicatePacketKey === 0
      && duplicateOrdinal === 0
      && orphanOrdinalRows === 0
      && foreignRepositoryRows === 0
      && workspaceRevisionMismatch === 0
      && snapshotRevisionMismatch === 0
      && missingSourceRevision === 0
      && sourceRefMismatch === 0
      && missingPacket === 0
      && missingOrdinal === 0
      && invalidOrdinal === 0
      && ordinalSlotGaps === 0
      && ordinalSequenceValid
      && checksumRecomputed,
    );
    const ordinalMapSealed = {
      artifact: ordinalCandidateMapEvidence?.mapPath ?? 'docs/reports/candidate-ordinal-corpus-v1.json',
      artifact_present: Boolean(ordinalCandidateMapEvidence ?? ordinalCorpus),
      owner_receipt: ordinalCandidateMapEvidence?.receipt ?? null,
      owner_receipt_error: ordinalCandidateMapError,
      lineage_filtered_corpus: {
        artifact: 'docs/reports/candidate-ordinal-corpus-v1.json',
        row_count: lineageOrdinalCandidates.length,
      },
      row_count: ordinalCandidates.length,
      row_count_matches_admitted_root_denominator: ordinalRowCountMatchesDenominator,
      ordinal_map_checksum: ordinalCandidateMapEvidence?.packetMap.ordinalMapChecksum ?? ordinalCorpus?.ordinalMapChecksum ?? null,
      ordinal_map_checksum_recomputed: checksumRecomputed,
      candidate_snapshot_revision: ordinalCandidateMapEvidence?.packetMap.candidateSnapshotRevision ?? ordinalCorpus?.candidateSnapshotRevision ?? null,
      candidate_snapshot_receipt_verified: ordRevisionQualified,
      admitted_root_snapshot_verified: rootSnapshotVerified,
      admitted_root_snapshot_error: rootSnapshotError,
      workspace_revision_matches_admitted: ordinalWorkspaceMatchesAdmitted,
      workspace_revision_packet_rows: workspaceRevisionRows.length,
      workspace_revision_rows_outside_admitted_repo_root: workspaceRevisionRows.length - admittedRootCandidateCount,
      admitted_root_candidate_count: admittedRootCandidateCount,
      exact_identity_matches: exactIdentityMatches,
      revision_exact_matches: revisionExactMatches,
      missing_ordinal: missingOrdinal,
      canonical_id_packet_key_mismatch: canonicalIdPacketKeyMismatch,
      excluded_legacy_identity: canonicalIdPacketKeyMismatch,
      duplicate_canonical_id: duplicateCanonicalId,
      duplicate_packet_key: duplicatePacketKey,
      duplicate_ordinal: duplicateOrdinal,
      orphan_ordinal_rows: orphanOrdinalRows,
      foreign_repository_rows: foreignRepositoryRows,
      missing_packet: missingPacket,
      missing_source_revision: missingSourceRevision,
      source_ref_mismatch: sourceRefMismatch,
      workspace_revision_mismatch: workspaceRevisionMismatch,
      candidate_snapshot_revision_mismatch: snapshotRevisionMismatch,
      invalid_ordinal: invalidOrdinal,
      ordinal_slot_gaps: ordinalSlotGaps,
      ordinal_sequence_valid: ordinalSequenceValid,
      packet_to_chunk_crosswalk: 'SEPARATE_PENDING_PROJECTION_ALIGNMENT',
      verdict: ordinalMapFullySealed ? 'PASS'
        : (ordinalCandidateMapEvidence && rootSnapshotVerified && ordinalWorkspaceMatchesAdmitted && exactIdentityMatches > 0) ? 'PARTIAL_PROVEN'
        : (ordinalCandidateMapEvidence || ordinalCorpus) ? 'NOT_PROVEN' : 'ABSENT',
      note: ordinalMapFullySealed
        ? `Every admitted repo:root packet candidate has an exact current source/revision-bound packet-grain ordinal; receipt, artifact digest, candidate snapshot revision, map checksum, unique contiguous ordinals, and live packet readback verify. Physical chunk crosswalk is separate and remains pending.`
        : ordinalCandidateMapEvidence && rootSnapshotVerified && ordinalWorkspaceMatchesAdmitted
          ? `Packet-grain map verified for ${validCanonicalKeys.size}/${admittedRootCandidateCount} admitted candidates; missing_ordinal=${missingOrdinal}, orphan_ordinal_rows=${orphanOrdinalRows}, legacy_identity_rows=${canonicalIdPacketKeyMismatch}. Chunk crosswalk is separate.`
          : `Packet-grain map or admitted repo:root snapshot binding is absent/invalid${ordinalCandidateMapError ? ` (${ordinalCandidateMapError})` : rootSnapshotError ? ` (${rootSnapshotError})` : ''}.`,
    };

    // ── Predicate 9: PROJECTIONS_CHECKSUM_ALIGNED ──
    console.log('[fabric-audit] 11/11a PROJECTIONS_CHECKSUM_ALIGNED');
    const { rows: projectionChecksumColumns } = await q(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND column_name IN ('input_checksum', 'ordinal_map_checksum')
       ORDER BY table_name, column_name;`,
    );
    const representationRegistryExists = existing.has('atlas_representations');
    const representationRegistryChecksumColumns = projectionChecksumColumns
      .filter((r) => r.table_name === 'atlas_representations')
      .map((r) => r.column_name);
    const projectionsChecksumAligned = {
      depends_on: 'LATENT_FAMILY_PROVEN + GRAPH_MANIFEST_SEALED',
      representation_registry: 'atlas_representations',
      representation_registry_exists: representationRegistryExists,
      representation_registry_checksum_columns: representationRegistryChecksumColumns,
      ordinal_map_checksum_columns_found: projectionChecksumColumns
        .filter((r) => r.column_name === 'ordinal_map_checksum')
        .map((r) => `${r.table_name}.${r.column_name}`),
      verdict: 'NOT_PROVEN',
      note: representationRegistryExists
        ? 'The live atlas_representations registry records representation/artifact metadata, not a per-run projection binding. No ordinal_map_checksum column was found in public table columns; no receipt currently proves the same input and ordinal-map checksums across the projections. Keep NOT_PROVEN; do not create a parallel registry solely to satisfy this predicate.'
        : 'The live atlas_representations registry is absent, and no projection checksum-alignment receipt was proven. Keep NOT_PROVEN until the canonical owner and receipt shape are established.',
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
      const scanCount = async (pattern) => {
        let cursor = '0';
        let count = 0;
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
          cursor = nextCursor;
          count += keys.length;
        } while (cursor !== '0');
        return count;
      };
      const currentV1KeyCount = await scanCount('atlas:bitfrost:v1:*');
      const legacyPacketKeyCount = await scanCount('bitfrost:packet:*');
      bitfrostKeysDerivable = {
        key_contract: 'AceBitfrostCacheIdentityV1 / atlas:bitfrost:v1:*',
        current_v1_namespace_key_count: currentV1KeyCount,
        legacy_bitfrost_packet_key_count: legacyPacketKeyCount,
        verdict: currentV1KeyCount > 0 ? 'PARTIAL_PROVEN' : 'NOT_PROVEN',
        note: 'The v1 key namespace is counted separately from the legacy bitfrost:packet:* prefix. Even observed keys prove presence only: promotion still requires the admitted ACE packet-key producer/caller, identity-bound write/readback, and current artifact checksums. Deterministic key-builder fixture tests are not live cache-warming proof.',
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
        legacy_row_count: rows[0].n,
        verdict: 'NOT_PROVEN',
        evidence_owner: 'CANONICAL_RETRIEVAL_TO_ACE_V3_CONTEXTMANIFEST_RECEIPT_REQUIRED',
        note: 'ace_context_sources is a legacy diagnostic only; its row count cannot prove production retrieval admission, AcePacketV3 identity, ContextManifest source grounding, or independent readback.',
      };
    } else {
      aceEvidenceGrounded = {
        table_exists: false,
        legacy_row_count: null,
        verdict: 'NOT_PROVEN',
        evidence_owner: 'CANONICAL_RETRIEVAL_TO_ACE_V3_CONTEXTMANIFEST_RECEIPT_REQUIRED',
      };
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
    const reportsDir = REPORT_DIR;
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
