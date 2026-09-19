#!/usr/bin/env node

/**
 * Read-only schema audit for the RPC packet registry boundary.
 *
 * This inventories existing PostgreSQL ownership and indexes only. It does
 * not create registry tables, apply DDL, alter rows, or inspect projections by
 * assuming that an optional relation exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'atlas-rpc-packet-registry-schema-v1.json');
const ownedRelations = [
  'workspaces',
  'atlas_packets',
  'codebase_chunk_index',
  'atlas_ast_nodes',
  'atlas_packet_features',
  'atlas_packet_chunk_lineage',
  'atlas_chunk_packet_identity_links',
  'atlas_workspace_source_bindings',
  'graphify_current_source_membership_v1',
  'atlas_packet_registry',
  'atlas_rpc_packet_registry',
  'qdrant_projection_registry',
];

const report = {
  schema: 'atlas.rpc-packet-registry-schema.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalOwner: 'postgresql',
  relations: {},
  indexes: {},
  lanes: {},
  findings: [],
};

function finding(id, severity, message, evidence = []) {
  report.findings.push({ id, severity, message, evidence });
}

async function main() {
  const env = loadRepoEnv(process.env);
  Object.assign(process.env, env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    const qdrantBaseUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
    try {
      const collectionsResponse = await fetch(`${qdrantBaseUrl}/collections`, { signal: AbortSignal.timeout(3000) });
      const collectionsPayload = await collectionsResponse.json().catch(() => ({}));
      const collectionNames = Array.isArray(collectionsPayload?.result?.collections)
        ? collectionsPayload.result.collections.map((item) => String(item.name ?? '')).filter(Boolean).sort()
        : [];
      report.lanes.qdrant = { status: collectionsResponse.ok ? 'HEALTHY' : 'UNAVAILABLE', baseUrl: qdrantBaseUrl, collections: collectionNames };
      if (!collectionsResponse.ok) finding('QDRANT_UNAVAILABLE', 'medium', `Qdrant collection census returned HTTP ${collectionsResponse.status}.`, [qdrantBaseUrl]);
      if (collectionNames.includes('codebase_chunks_768')) {
        const infoResponse = await fetch(`${qdrantBaseUrl}/collections/codebase_chunks_768`, { signal: AbortSignal.timeout(3000) });
        const infoPayload = await infoResponse.json().catch(() => ({}));
        const result = infoPayload?.result ?? {};
        report.lanes.qdrant.semantic768 = {
          status: infoResponse.ok ? 'HEALTHY' : 'UNAVAILABLE',
          points: result.points_count ?? null,
          indexedVectors: result.indexed_vectors_count ?? null,
          vectors: result.config?.params?.vectors ?? null,
        };
      }
    } catch (error) {
      report.lanes.qdrant = { status: 'UNAVAILABLE', baseUrl: qdrantBaseUrl };
      finding('QDRANT_UNAVAILABLE', 'medium', error instanceof Error ? error.message : String(error), [qdrantBaseUrl]);
    }

    for (const [lane, configuredUrl] of [['cuvs_rapids', env.ATLAS_RAPIDS_SIDECAR_URL ?? env.CUVS_SIDECAR_URL], ['fastapi_gpu', env.FASTAPI_URL]]) {
      if (!configuredUrl) {
        report.lanes[lane] = { status: 'UNCONFIGURED' };
        continue;
      }
      const baseUrl = String(configuredUrl).replace(/\/+$/, '');
      try {
        const healthResponse = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
        report.lanes[lane] = { status: healthResponse.ok ? 'HEALTHY' : 'UNAVAILABLE', baseUrl, httpStatus: healthResponse.status };
      } catch (error) {
        report.lanes[lane] = { status: 'UNAVAILABLE', baseUrl };
        finding(`${lane.toUpperCase()}_UNAVAILABLE`, 'medium', error instanceof Error ? error.message : String(error), [`${baseUrl}/health`]);
      }
    }

    const relationRows = await pool.query(
      `SELECT n.nspname AS schema_name, c.relname AS relation_name,
              c.relkind AS relation_kind,
              to_regclass(format('%I.%I', n.nspname, c.relname)) IS NOT NULL AS exists
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        ORDER BY c.relname`,
      [ownedRelations],
    );
    const existing = new Set(relationRows.rows.filter((row) => row.exists).map((row) => row.relation_name));
    for (const name of ownedRelations) {
      const row = relationRows.rows.find((candidate) => candidate.relation_name === name);
      report.relations[name] = row
        ? { exists: Boolean(row.exists), kind: row.relation_kind }
        : { exists: false, kind: null };
    }

    const columnRows = existing.size === 0 ? [] : (await pool.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [[...existing]],
    )).rows;
    for (const row of columnRows) {
      report.relations[row.table_name].columns ??= [];
      report.relations[row.table_name].columns.push({
        name: row.column_name,
        dataType: row.data_type,
        udt: row.udt_name,
        nullable: row.is_nullable === 'YES',
      });
    }

    const indexRows = existing.size === 0 ? [] : (await pool.query(
      `SELECT tablename, indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ANY($1::text[])
        ORDER BY tablename, indexname`,
      [[...existing]],
    )).rows;
    for (const row of indexRows) {
      report.indexes[row.tablename] ??= [];
      report.indexes[row.tablename].push({ name: row.indexname, definition: row.indexdef });
    }

    report.readbacks = {};
    if (existing.has('workspaces') && existing.has('atlas_packets')) {
      report.readbacks.workspacePacketJoin = (await pool.query(
        `SELECT count(*)::bigint AS total,
                count(*) FILTER (WHERE w.id IS NOT NULL)::bigint AS workspace_owned
           FROM public.atlas_packets p
           LEFT JOIN public.workspaces w ON w.id::text = p.workspace_id::text`,
      )).rows[0];
      if (Number(report.readbacks.workspacePacketJoin.workspace_owned ?? 0) === 0) {
        finding('WORKSPACE_PACKET_JOIN_EMPTY', 'high', 'No atlas_packets rows currently join to workspaces.id; workspace_id is not presently a proven canonical workspace foreign key.', ['public.workspaces.id', 'public.atlas_packets.workspace_id']);
      }
    }
    if (existing.has('atlas_packets') && existing.has('codebase_chunk_index')) {
      report.readbacks.packetChunkSourceRevisionJoin = (await pool.query(
        `SELECT count(*)::bigint AS matched
           FROM public.atlas_packets p
           JOIN public.codebase_chunk_index c
             ON c.source_ref = p.source_ref
            AND c.workspace_revision::text = p.workspace_revision::text`,
      )).rows[0];
      if (Number(report.readbacks.packetChunkSourceRevisionJoin.matched ?? 0) === 0) {
        finding('PACKET_CHUNK_LINEAGE_JOIN_EMPTY', 'high', 'No packet rows currently close to codebase chunks on source_ref and workspace_revision.', ['public.atlas_packets', 'public.codebase_chunk_index']);
      }
    }
    if (existing.has('atlas_packet_chunk_lineage') && existing.has('atlas_packets') && existing.has('codebase_chunk_index')) {
      report.readbacks.canonicalPacketChunkLineage = (await pool.query(
        `SELECT count(*)::bigint AS lineage_rows,
                count(*) FILTER (WHERE p.packet_key IS NOT NULL)::bigint AS packet_join,
                count(*) FILTER (WHERE c.chunk_id IS NOT NULL)::bigint AS chunk_join,
                count(*) FILTER (WHERE l.source_revision IS NOT NULL AND b.source_revision IS NOT NULL AND l.source_revision = b.source_revision)::bigint AS exact_source_revision_join
           FROM public.atlas_packet_chunk_lineage l
           LEFT JOIN public.atlas_packets p ON p.packet_key = l.packet_key
           LEFT JOIN public.codebase_chunk_index c ON c.chunk_id::text = l.canonical_chunk_id::text
           LEFT JOIN public.atlas_workspace_source_bindings b
             ON b.canonical_source_ref = l.source_ref`)).rows[0];
      if (Number(report.readbacks.canonicalPacketChunkLineage.lineage_rows ?? 0) > 0
          && Number(report.readbacks.canonicalPacketChunkLineage.exact_source_revision_join ?? 0) === 0) {
        finding('PACKET_CHUNK_CURRENT_REVISION_UNQUALIFIED', 'high', 'The canonical packet→chunk lineage bridge exists, but its rows do not currently prove an exact workspace/source revision join.', ['public.atlas_packet_chunk_lineage', 'public.atlas_workspace_source_bindings']);
      }
    }
    if (existing.has('atlas_chunk_packet_identity_links')) {
      report.readbacks.projectionIdentityLinks = (await pool.query(
        `SELECT count(*)::bigint AS rows,
                count(*) FILTER (WHERE canonical_packet_key IS NOT NULL)::bigint AS canonical_packet_keys,
                count(*) FILTER (WHERE source_revision IS NOT NULL)::bigint AS source_revision_rows,
                count(*) FILTER (WHERE canonical_writes_allowed)::bigint AS canonical_write_rows,
                count(*) FILTER (WHERE canonical_packet_minted)::bigint AS minted_rows
           FROM public.atlas_chunk_packet_identity_links`)).rows[0];
      if (Number(report.readbacks.projectionIdentityLinks.canonical_write_rows ?? 0) === 0) {
        finding('PROJECTION_IDENTITY_NOT_CANONICAL_OWNER', 'medium', 'atlas_chunk_packet_identity_links contains projection identity observations but no rows authorize canonical writes; it cannot supply packet_revision ownership.', ['public.atlas_chunk_packet_identity_links']);
      }
    }
    if (existing.has('atlas_packets') && existing.has('atlas_ast_nodes')) {
      report.readbacks.packetAstTreeNodeJoin = (await pool.query(
        `SELECT count(*)::bigint AS matched
           FROM public.atlas_packets p
           JOIN public.atlas_ast_nodes a ON a.tree_node_id::text = p.tree_node_id::text`,
      )).rows[0];
      if (Number(report.readbacks.packetAstTreeNodeJoin.matched ?? 0) === 0) {
        finding('PACKET_AST_JOIN_EMPTY', 'high', 'No packet rows currently close to AST nodes on tree_node_id.', ['public.atlas_packets.tree_node_id', 'public.atlas_ast_nodes.tree_node_id']);
      }
    }

    const packets = report.relations.atlas_packets;
    const workspaces = report.relations.workspaces;
    const ast = report.relations.atlas_ast_nodes;
    if (!workspaces?.exists || !packets?.exists || !ast?.exists) {
      finding('CANONICAL_RELATION_MISSING', 'high', 'Workspace, packet, and AST ownership relations are not all present.', ['public.workspaces', 'public.atlas_packets', 'public.atlas_ast_nodes']);
    }
    if (packets?.exists && !packets.columns?.some((column) => column.name === 'packet_revision')) {
      finding('PACKET_REVISION_OWNER_MISSING', 'high', 'atlas_packets has no packet_revision column; live RPC rows must remain unavailable until an admitted canonical owner exists.', ['public.atlas_packets']);
    }
    const optionalRegistryPresent = ['atlas_packet_registry', 'atlas_rpc_packet_registry', 'qdrant_projection_registry']
      .some((name) => report.relations[name]?.exists);
    if (!optionalRegistryPresent) {
      finding('REGISTRY_RELATION_ABSENT', 'medium', 'No dedicated registry relation is present; the RPC contract remains read-only and schema-only.', ['to_regclass guards']);
    }
    report.status = report.findings.some((item) => item.id === 'PACKET_REVISION_OWNER_MISSING')
      ? 'BLOCKED_CANONICAL_REVISION_OWNER'
      : report.findings.some((item) => item.severity === 'high')
        ? 'BLOCKED_CANONICAL_LINEAGE_JOIN'
        : 'SCHEMA_AUDIT_COMPLETE';
  } catch (error) {
    report.status = 'POSTGRES_UNAVAILABLE';
    finding('POSTGRES_UNAVAILABLE', 'high', error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  } finally {
    await pool.end();
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, reportPath: path.relative(repoRoot, reportPath), findings: report.findings.length, writesPerformed: false }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
