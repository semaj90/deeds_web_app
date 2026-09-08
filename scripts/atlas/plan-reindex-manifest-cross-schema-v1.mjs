#!/usr/bin/env node

/**
 * Read-only cross-schema reindex admission planner.
 *
 * This produces an auditable plan; it never INSERTs, UPDATEs, UPSERTs, or
 * calls a projection API. PostgreSQL remains the source of the census and
 * every downstream operation is represented as an intended action only.
 */
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = join(ROOT, 'docs', 'reports', 'reindex-cross-schema-admission-v1.json');
const SAMPLE_LIMIT = Math.min(100, Math.max(1, Number(process.env.ATLAS_REINDEX_SAMPLE_LIMIT ?? 25)));
const env = loadRepoEnv(process.env);
Object.assign(process.env, env);

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function has(columns, name) {
  return columns.has(name);
}

function col(columns, name, fallback = 'NULL') {
  return has(columns, name) ? quoteIdentifier(name) : fallback;
}

function tableCol(alias, columns, name, fallback = 'NULL') {
  return has(columns, name) ? `${alias}.${quoteIdentifier(name)}` : fallback;
}

function readJsonlSummary(filePath, fields = {}) {
  if (!existsSync(filePath)) return { present: false, rows: 0, counts: {} };
  const rows = readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const counts = Object.fromEntries(Object.entries(fields).map(([name, predicate]) => [
    name, rows.filter(predicate).length,
  ]));
  return { present: true, rows: rows.length, counts };
}

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();
  try {
    const tableRows = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [[
      'atlas_packets',
      'codebase_chunk_index',
      'graphify_files',
      'graphify_symbols',
      'graphify_edges',
      'feature_domain_facts',
      'atlas_ontology_linked_tuples',
      'atlas_representation_records',
    ]]);
    const present = new Set(tableRows.rows.map((row) => row.table_name));
    const tableInfo = {};
    for (const table of present) {
      const rows = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      tableInfo[table] = {
        columns: new Set(rows.rows.map((row) => row.column_name)),
        columnTypes: Object.fromEntries(rows.rows.map((row) => [row.column_name, {
          dataType: row.data_type,
          udtName: row.udt_name,
        }])),
      };
    }

    const count = async (table) => present.has(table)
      ? Number((await client.query(`SELECT count(*)::bigint AS count FROM ${quoteIdentifier(table)}`)).rows[0].count)
      : 0;
    const counts = {};
    for (const table of [
      'atlas_packets', 'codebase_chunk_index', 'graphify_files', 'graphify_symbols',
      'graphify_edges', 'feature_domain_facts', 'atlas_ontology_linked_tuples',
      'atlas_representation_records',
    ]) counts[table] = await count(table);

    const chunkColumns = tableInfo.codebase_chunk_index?.columns ?? new Set();
    const packetColumns = tableInfo.atlas_packets?.columns ?? new Set();
    const graphFileColumns = tableInfo.graphify_files?.columns ?? new Set();
    const domainColumns = tableInfo.feature_domain_facts?.columns ?? new Set();
    const tupleColumns = tableInfo.atlas_ontology_linked_tuples?.columns ?? new Set();
    const representationColumns = tableInfo.atlas_representation_records?.columns ?? new Set();

    const identityExpr = has(chunkColumns, 'chunk_id') ? 'c.chunk_id::text' : 'c.id::text';
    const graphSourceRevision = has(graphFileColumns, 'code_source_revision')
      ? 'g.code_source_revision::text'
      : has(graphFileColumns, 'source_revision') ? 'g.source_revision::text' : 'NULL::text';
    const graphWorkspaceRevision = has(graphFileColumns, 'workspace_revision')
      ? 'g.workspace_revision::text' : 'NULL::text';
    const sourceRevisionExpr = has(chunkColumns, 'source_revision') ? 'c.source_revision::text' : graphSourceRevision;
    const workspaceRevisionExpr = has(chunkColumns, 'workspace_revision') ? 'c.workspace_revision::text' : graphWorkspaceRevision;
    const chunkWhere = [
      has(chunkColumns, 'source_ref') ? 'NULLIF(BTRIM(c.source_ref), \'\') IS NOT NULL' : 'FALSE',
      has(chunkColumns, 'content_embedding_768') ? 'c.content_embedding_768 IS NOT NULL' : 'FALSE',
    ].join(' AND ');
    const lineageJoin = present.has('graphify_files') && has(chunkColumns, 'source_ref')
      ? `LEFT JOIN (
          SELECT lower(source_ref::text) AS source_ref,
                 max(${has(graphFileColumns, 'code_source_revision') ? 'code_source_revision' : has(graphFileColumns, 'source_revision') ? 'source_revision' : 'NULL::text'})::text AS code_source_revision,
                 max(${has(graphFileColumns, 'workspace_revision') ? 'workspace_revision' : 'NULL::text'})::text AS workspace_revision
          FROM graphify_files
          WHERE NULLIF(BTRIM(source_ref::text), '') IS NOT NULL
          GROUP BY lower(source_ref::text)
        ) g ON lower(c.source_ref::text) = g.source_ref`
      : '';
    const cohort = present.has('codebase_chunk_index')
      ? (await client.query(`
          SELECT
            ${identityExpr} AS chunk_identity,
            ${tableCol('c', chunkColumns, 'source_ref')}::text AS source_ref,
            ${sourceRevisionExpr} AS source_revision,
            ${workspaceRevisionExpr} AS workspace_revision,
            ${tableCol('c', chunkColumns, 'packet_key')}::text AS packet_key,
            ${tableCol('c', chunkColumns, 'tree_node_id')}::text AS tree_node_id,
            ${tableCol('c', chunkColumns, 'symbol_version_id')}::text AS symbol_version_id,
            ${tableCol('c', chunkColumns, 'content_hash')}::text AS content_hash,
            ${tableCol('c', chunkColumns, 'representation_revision')}::text AS representation_revision
          FROM codebase_chunk_index c
          ${lineageJoin}
          WHERE ${chunkWhere}
          ORDER BY c.source_ref, ${identityExpr}
          LIMIT $1
        `, [SAMPLE_LIMIT])).rows
      : [];

    const eligibleCounts = present.has('codebase_chunk_index')
      ? (await client.query(`
          SELECT
            count(*)::bigint AS total,
            count(*) FILTER (WHERE ${chunkWhere})::bigint AS semantic_768_eligible,
            count(*) FILTER (WHERE ${has(chunkColumns, 'source_ref') ? "NULLIF(BTRIM(c.source_ref::text), '') IS NOT NULL" : 'FALSE'})::bigint AS source_ref_present,
            count(*) FILTER (WHERE NULLIF(BTRIM((${sourceRevisionExpr})::text), '') IS NOT NULL)::bigint AS source_revision_present,
            count(*) FILTER (WHERE NULLIF(BTRIM((${workspaceRevisionExpr})::text), '') IS NOT NULL)::bigint AS workspace_revision_present,
            count(*) FILTER (WHERE ${has(chunkColumns, 'tree_node_id') ? "NULLIF(BTRIM(c.tree_node_id::text), '') IS NOT NULL" : 'FALSE'})::bigint AS tree_node_id_present,
            count(*) FILTER (WHERE ${has(chunkColumns, 'symbol_version_id') ? "NULLIF(BTRIM(c.symbol_version_id::text), '') IS NOT NULL" : 'FALSE'})::bigint AS symbol_version_id_present,
            count(*) FILTER (WHERE ${has(chunkColumns, 'packet_key') ? "NULLIF(BTRIM(c.packet_key::text), '') IS NOT NULL" : 'FALSE'})::bigint AS packet_key_present
          FROM codebase_chunk_index c
          ${lineageJoin}
        `)).rows[0]
      : {};

    const domainSummary = present.has('feature_domain_facts')
      ? (await client.query(`
          SELECT count(*)::bigint AS rows,
                 count(DISTINCT ${col(domainColumns, 'domain_class', 'NULL')}::text)::bigint AS distinct_domain_classes,
                 count(*) FILTER (WHERE ${col(domainColumns, 'source_revision', 'NULL')} IS NOT NULL)::bigint AS source_revision_bound
          FROM feature_domain_facts
        `)).rows[0]
      : { rows: 0, distinct_domain_classes: 0, source_revision_bound: 0 };

    const tupleSummary = present.has('atlas_ontology_linked_tuples')
      ? (await client.query(`
          SELECT count(*)::bigint AS rows,
                 count(*) FILTER (WHERE ${col(tupleColumns, 'source_revision', 'NULL')} IS NOT NULL)::bigint AS source_revision_bound,
                 count(*) FILTER (WHERE ${col(tupleColumns, 'workspace_revision', 'NULL')} IS NOT NULL)::bigint AS workspace_revision_bound
          FROM atlas_ontology_linked_tuples
        `)).rows[0]
      : { rows: 0, source_revision_bound: 0, workspace_revision_bound: 0 };

    const representationSpecs = [
      ['semantic_768_transition', 'content_embedding_768'],
      ['semantic_768_populated', 'content_embedding'],
      ['latent_256', 'latent_256'],
      ['latent_128', 'latent_128'],
      ['latent_64', 'latent_64'],
      ['summary_768', 'summary_embedding'],
    ];
    const representationCounts = {};
    for (const [name, column] of representationSpecs) {
      representationCounts[name] = {
        column,
        present: has(chunkColumns, column),
        nonNullRows: has(chunkColumns, column)
          ? Number((await client.query(`SELECT count(*)::bigint AS count FROM ${quoteIdentifier('codebase_chunk_index')} WHERE ${quoteIdentifier(column)} IS NOT NULL`)).rows[0].count)
          : 0,
      };
    }

    const localArtifacts = {
      currentSymbolNominations: readJsonlSummary(join(ROOT, '.tmp', 'atlas', 'current-graphify-symbol-nominations-v1.jsonl')),
      treeBoundResolution: readJsonlSummary(join(ROOT, '.tmp', 'atlas', 'tree-bound-symbol-registry-resolution-v1.ndjson'), {
        exactRegistry: (row) => row.registryResolution === 'EXACT_CANONICAL_KEY',
        exactSymbolVersion: (row) => row.symbolVersionResolution === 'EXACT',
        missingSymbolVersion: (row) => row.symbolVersionResolution === 'MISSING',
      }),
      currentStructuralAst: readJsonlSummary(join(ROOT, '.tmp', 'atlas', 'current-structural-symbol-resolution-v1.ndjson'), {
        exactTreeBound: (row) => row.resolution === 'EXACT_FULL',
      }),
      symbolMaterializationDryRun: existsSync(join(ROOT, 'docs', 'reports', 'ast-symbol-version-materialization-v1.json'))
        ? JSON.parse(readFileSync(join(ROOT, 'docs', 'reports', 'ast-symbol-version-materialization-v1.json'), 'utf8'))
        : null,
    };

    const manifestRows = cohort.map((row, ordinal) => ({
      candidateOrdinal: ordinal,
      chunkIdentity: row.chunk_identity,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision,
      packetKey: row.packet_key,
      treeNodeId: row.tree_node_id,
      symbolVersionId: row.symbol_version_id,
      contentHash: row.content_hash,
      representationRevision: row.representation_revision,
      admission: row.source_ref && row.source_revision && row.workspace_revision && row.content_hash
        ? 'CANDIDATE_REQUIRES_LINEAGE_CONFIRMATION'
        : 'EXCLUDED_INCOMPLETE_LINEAGE',
    }));

    const excluded = {
      missingSourceRef: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.source_ref_present ?? 0),
      missingSourceRevision: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.source_revision_present ?? 0),
      missingWorkspaceRevision: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.workspace_revision_present ?? 0),
      missingTreeNodeId: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.tree_node_id_present ?? 0),
      missingSymbolVersionId: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.symbol_version_id_present ?? 0),
      missingPacketKey: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.packet_key_present ?? 0),
      semantic768Ineligible: Number(eligibleCounts.total ?? 0) - Number(eligibleCounts.semantic_768_eligible ?? 0),
    };
    const gateValues = {
      postgresReachable: true,
      packetTablePresent: present.has('atlas_packets'),
      chunkTablePresent: present.has('codebase_chunk_index'),
      semantic768ColumnPresent: has(chunkColumns, 'content_embedding_768'),
      domainSignalTablePresent: present.has('feature_domain_facts'),
      ontologyTupleTablePresent: present.has('atlas_ontology_linked_tuples'),
      graphInputsPresent: present.has('graphify_files') || present.has('graphify_edges'),
      sampleHasCurrentLineage: manifestRows.length > 0 && manifestRows.every((row) => row.admission !== 'EXCLUDED_INCOMPLETE_LINEAGE'),
      writesPerformed: false,
      safeToApply: false,
    };
    const canonicalManifest = {
      schema: 'atlas.reindex-cross-schema-admission.v1',
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_PLAN',
      writesPerformed: false,
      authority: 'PostgreSQL canonical metadata and source/revision joins',
      identityModel: {
        treeNodeId: 'parse occurrence / provenance coordinate',
        symbolId: 'stable logical symbol',
        symbolVersionId: 'revision-bound symbol identity',
        chunkId: 'retrieval chunk identity',
        packetKey: 'canonical packet identity',
        graphNodeKey: 'derived graph projection identity',
      },
      admissionModel: {
        sources: manifestRows.map((row) => ({
          sourceRef: row.sourceRef,
          sourceRevision: row.sourceRevision,
          contentChecksum: row.contentHash,
        })),
        parseNodes: manifestRows.filter((row) => row.treeNodeId).map((row) => ({
          parseNodeId: row.treeNodeId,
          sourceRef: row.sourceRef,
          sourceRevision: row.sourceRevision,
        })),
        symbols: manifestRows.filter((row) => row.symbolVersionId).map((row) => ({
          symbolId: null,
          symbolVersionId: row.symbolVersionId,
          sourceRevision: row.sourceRevision,
        })),
        packets: manifestRows.filter((row) => row.packetKey).map((row) => ({
          packetKey: row.packetKey,
          symbolVersionId: row.symbolVersionId,
          parseNodeId: row.treeNodeId,
          chunkId: row.chunkIdentity,
        })),
        representations: manifestRows.filter((row) => row.representationRevision).map((row) => ({
          representationRevision: row.representationRevision,
          semanticDimension: 768,
          candidateOrdinal: row.candidateOrdinal,
        })),
        domainSignals: {
          table: 'feature_domain_facts',
          rowCount: Number(domainSummary.rows ?? 0),
          sourceRevisionBound: Number(domainSummary.source_revision_bound ?? 0),
          status: Number(domainSummary.source_revision_bound ?? 0) > 0 ? 'OBSERVED' : 'UNQUALIFIED',
        },
        ontologyTupleCandidates: {
          table: 'atlas_ontology_linked_tuples',
          rowCount: Number(tupleSummary.rows ?? 0),
          status: Number(tupleSummary.rows ?? 0) > 0 ? 'OBSERVED' : 'EMPTY',
        },
        graphEdgeCandidates: {
          table: 'graphify_edges',
          rowCount: counts.graphify_edges,
          status: counts.graphify_edges > 0 ? 'OBSERVED' : 'EMPTY',
        },
        excluded: Object.entries(excluded).filter(([, value]) => value > 0).map(([reason, count]) => ({ reason, count })),
        ambiguous: [],
      },
      sourceTables: Object.fromEntries(Object.entries(tableInfo).map(([table, info]) => [table, {
        present: true,
        rowCount: counts[table],
        columns: [...info.columns],
        columnTypes: info.columnTypes,
      }])),
      census: {
        rowCounts: counts,
        semanticCohort: eligibleCounts,
        domainSignals: domainSummary,
        ontologyTuples: tupleSummary,
        representations: representationCounts,
        localArtifacts,
      },
      candidateOrdinalMap: {
        order: 'source_ref UTF-8 ascending, then chunk identity ascending',
        sampleLimit: SAMPLE_LIMIT,
        sampleRows: manifestRows,
        sampleChecksum: checksum(manifestRows),
      },
      intendedUpserts: {
        postgres: [
          { target: 'atlas_packets', operation: 'GUARDED_INSERT_OR_RECONCILE', rows: 0, reason: 'lineage manifest not yet sealed' },
          { target: 'atlas_ontology_linked_tuples', operation: 'PROPOSAL_ONLY', rows: 0, reason: 'no broad ontology admission in read-only phase' },
          { target: 'representation/artifact ledger', operation: 'PROPOSAL_ONLY', rows: 0, reason: 'representation revision must be proven per cohort' },
        ],
        qdrant: { operation: 'BLOCKED_UNTIL_SEALED', rows: 0 },
        neo4j: { operation: 'BLOCKED_UNTIL_SEALED', rows: 0 },
        valkey: { operation: 'BLOCKED_UNTIL_SEALED', rows: 0 },
      },
      implementationPlan: [
        {
          stage: 'SOURCE_LINEAGE_RECONCILIATION',
          owner: 'Graphify/source-authority bridge',
          prerequisite: 'current workspace binding and source-byte ownership',
          action: 'read-only normalized source, revision, and content-hash join',
          status: gateValues.sampleHasCurrentLineage ? 'PARTIAL' : 'BLOCKED',
          promotionCondition: 'every admitted source has one exact current source binding',
        },
        {
          stage: 'STRUCTURAL_SYMBOL_RECONCILIATION',
          owner: 'Tree-sitter, AST-grep, LSP/Graphify resolver',
          prerequisite: 'source lineage reconciliation',
          action: 'compare byte spans and resolve parse_node_id, symbol_id, symbol_version_id',
          status: 'BLOCKED',
          promotionCondition: 'ambiguous and revision-mismatched rows are zero',
        },
        {
          stage: 'CANONICAL_PACKET_JOIN',
          owner: 'PostgreSQL packet/lineage owner',
          prerequisite: 'structural symbol reconciliation',
          action: 'build guarded packet/chunk candidate rows; no synthetic IDs',
          status: 'BLOCKED',
          promotionCondition: 'packet_key and chunk_id join exactly for the current cohort',
        },
        {
          stage: 'SNAPSHOT_SEAL',
          owner: 'Graphify compiler/lowering',
          prerequisite: 'exact packet, source, symbol, and representation joins',
          action: 'seal ordinal maps and artifact digests',
          status: 'BLOCKED',
          promotionCondition: 'manifest checksum and all section checksums are reproducible',
        },
        {
          stage: 'BOUNDED_CANARY',
          owner: 'PostgreSQL guarded writer',
          prerequisite: 'sealed snapshot and explicit authorization',
          action: 'apply tiny guarded batch with independent readback',
          status: 'BLOCKED',
          promotionCondition: 'zero identity/revision/hash drift after commit',
        },
        {
          stage: 'PROJECTION_FANOUT',
          owner: 'Qdrant, Neo4j, cuVS/cuGraph, Valkey consumers',
          prerequisite: 'successful canonical canary and receipt',
          action: 'publish revision-qualified derived projections and invalidate stale cache',
          status: 'BLOCKED',
          promotionCondition: 'projection counts, identities, revisions, and checksums read back',
        },
        {
          stage: 'ACE_PROMOTION',
          owner: 'ACE/ContextManifest policy',
          prerequisite: 'projection readback and evidence sufficiency',
          action: 'admit bounded evidence handles to ContextManifest',
          status: 'BLOCKED',
          promotionCondition: 'grounding, relevance, and residency receipts pass',
        },
      ],
      excluded,
      gates: gateValues,
      manifestChecksum: checksum({ counts, eligibleCounts, domainSummary, tupleSummary, manifestRows, gateValues }),
      nextGate: 'REINDEX-MANIFEST-LIVE-LINEAGE-AND-ORDINAL-PROOF',
    };
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(canonicalManifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      status: 'READ_ONLY_REINDEX_MANIFEST_WRITTEN',
      reportPath: 'docs/reports/reindex-cross-schema-admission-v1.json',
      tables: Object.keys(tableInfo),
      semantic768Eligible: eligibleCounts.semantic_768_eligible ?? 0,
      sampleRows: manifestRows.length,
      writesPerformed: false,
      safeToApply: false,
      manifestChecksum: canonicalManifest.manifestChecksum,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'READ_ONLY_REINDEX_MANIFEST_FAILED', error: String(error.message ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
