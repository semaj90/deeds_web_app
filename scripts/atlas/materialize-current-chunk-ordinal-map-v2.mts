#!/usr/bin/env tsx
/**
 * CANDIDATE-ORDINAL-MAP-CURRENT-CHUNK-02
 *
 * Read-only current-workspace CandidateOrdinalMap producer at canonical chunk
 * grain. This supersedes the old packet-grain canary producer for RichChunk /
 * semantic-corpus admission without rewriting the historical v1 artifact.
 *
 * Identity:
 *   canonicalId       = atlas_packet_chunk_lineage.canonical_chunk_id
 *   packetKey         = atlas_packet_chunk_lineage.packet_key
 *   sourceRef         = atlas_packet_chunk_lineage.source_ref
 *   sourceRevision    = atlas_packet_chunk_lineage.source_revision
 *   workspaceRevision = exact atlas_workspace_source_bindings revision
 *
 * No semantic or graph revision is manufactured. Those remain nullable until
 * independently qualified by their owners.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';
import {
  materializeCandidateOrdinalMap,
  type CanonicalCandidateIdentityInput,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });

const arg = (name: string, fallback: string | null = null): string | null => {
  const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const workspaceRevision = String(arg('workspace-revision', '') ?? '').trim();
const limit = Math.max(1, Math.min(100000, Number(arg('limit', '100000'))));
const output = path.resolve(arg('output', '.tmp/atlas/current-chunk-ordinal-map-v2.json')!);
const reportPath = path.resolve(arg('report', 'docs/reports/current-chunk-ordinal-map-v2.json')!);

if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision)) {
  throw new Error('CURRENT_CHUNK_ORDINAL_MAP_EXPLICIT_WORKSPACE_REVISION_REQUIRED');
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
  max: 1,
});

const sha256 = (value: string): string => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const compareUtf8 = (a: string, b: string): number => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

type ChunkRow = {
  chunk_row_id: string;
  canonical_chunk_id: string;
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
};

async function requireSchema(): Promise<void> {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'atlas_packet_chunk_lineage' AND column_name IN (
          'chunk_row_id', 'canonical_chunk_id', 'packet_key', 'source_ref', 'source_revision', 'revision_status'
        ))
        OR (table_name = 'atlas_workspace_source_bindings' AND column_name IN (
          'canonical_source_ref', 'workspace_revision', 'source_revision'
        ))
        OR (table_name = 'codebase_chunk_index' AND column_name IN ('id', 'source_ref'))
      )
  `);
  const present = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const required = [
    'atlas_packet_chunk_lineage.chunk_row_id',
    'atlas_packet_chunk_lineage.canonical_chunk_id',
    'atlas_packet_chunk_lineage.packet_key',
    'atlas_packet_chunk_lineage.source_ref',
    'atlas_packet_chunk_lineage.source_revision',
    'atlas_packet_chunk_lineage.revision_status',
    'atlas_workspace_source_bindings.canonical_source_ref',
    'atlas_workspace_source_bindings.workspace_revision',
    'atlas_workspace_source_bindings.source_revision',
    'codebase_chunk_index.id',
    'codebase_chunk_index.source_ref',
  ];
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) throw new Error(`CURRENT_CHUNK_ORDINAL_MAP_SCHEMA_REQUIRED:${missing.join(',')}`);
}

async function main(): Promise<void> {
  await requireSchema();

  const bindingCount = await pool.query(`
    SELECT count(*)::int AS count
    FROM public.atlas_workspace_source_bindings
    WHERE workspace_revision::text = $1
  `, [workspaceRevision]);
  if (bindingCount.rows[0]?.count <= 0) {
    throw new Error(`CURRENT_CHUNK_ORDINAL_MAP_WORKSPACE_BINDING_EMPTY:${workspaceRevision}`);
  }

  const result = await pool.query<ChunkRow>(`
    WITH lineage_one AS (
      SELECT
        chunk_row_id,
        min(canonical_chunk_id::text) AS canonical_chunk_id,
        min(packet_key::text) AS packet_key,
        min(source_ref::text) AS source_ref,
        min(source_revision::text) AS source_revision
      FROM public.atlas_packet_chunk_lineage
      WHERE revision_status = 'PROVEN'
        AND canonical_chunk_id IS NOT NULL
        AND packet_key IS NOT NULL
        AND source_ref IS NOT NULL
        AND source_revision IS NOT NULL
      GROUP BY chunk_row_id
      HAVING count(*) = 1
         AND count(DISTINCT canonical_chunk_id::text) = 1
         AND count(DISTINCT packet_key::text) = 1
         AND count(DISTINCT source_ref::text) = 1
         AND count(DISTINCT source_revision::text) = 1
    ), bound AS (
      SELECT DISTINCT
        canonical_source_ref::text AS source_ref,
        source_revision::text AS source_revision,
        workspace_revision::text AS workspace_revision
      FROM public.atlas_workspace_source_bindings
      WHERE workspace_revision::text = $1
    )
    SELECT
      c.id::text AS chunk_row_id,
      l.canonical_chunk_id,
      l.packet_key,
      l.source_ref,
      l.source_revision,
      b.workspace_revision
    FROM lineage_one l
    JOIN public.codebase_chunk_index c
      ON c.id = l.chunk_row_id
     AND c.source_ref = l.source_ref
    JOIN bound b
      ON b.source_ref = l.source_ref
     AND b.source_revision = l.source_revision
    ORDER BY l.source_ref, l.canonical_chunk_id, c.id
    LIMIT $2
  `, [workspaceRevision, limit]);

  if (result.rows.length === 0) {
    throw new Error(`CURRENT_CHUNK_ORDINAL_MAP_EMPTY:${workspaceRevision}`);
  }

  const duplicateCanonicalIds = result.rows.length - new Set(result.rows.map((row) => row.canonical_chunk_id)).size;
  const duplicateChunkRows = result.rows.length - new Set(result.rows.map((row) => row.chunk_row_id)).size;
  if (duplicateCanonicalIds !== 0) throw new Error(`CURRENT_CHUNK_ORDINAL_MAP_DUPLICATE_CANONICAL_IDS:${duplicateCanonicalIds}`);
  if (duplicateChunkRows !== 0) throw new Error(`CURRENT_CHUNK_ORDINAL_MAP_DUPLICATE_CHUNK_ROWS:${duplicateChunkRows}`);
  if (result.rows.some((row) => row.workspace_revision !== workspaceRevision)) {
    throw new Error('CURRENT_CHUNK_ORDINAL_MAP_MIXED_WORKSPACE_RESULT');
  }
  if (result.rows.some((row) => !/^sha256:[0-9a-f]{64}$/i.test(row.source_revision))) {
    throw new Error('CURRENT_CHUNK_ORDINAL_MAP_UNQUALIFIED_SOURCE_REVISION');
  }

  const orderedIdentityRows = [...result.rows]
    .sort((a, b) => compareUtf8(a.canonical_chunk_id, b.canonical_chunk_id))
    .map((row) => ({
      canonicalChunkId: row.canonical_chunk_id,
      chunkRowId: row.chunk_row_id,
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
    }));
  const sourceRevisionSetChecksum = sha256(
    [...new Set(result.rows.map((row) => row.source_revision))].sort(compareUtf8).join('\n'),
  );
  const identitySetChecksum = sha256(JSON.stringify(orderedIdentityRows));
  const candidateSnapshotRevision = `current-chunk-lineage:${workspaceRevision}:${sourceRevisionSetChecksum}:v2`;

  const candidates: CanonicalCandidateIdentityInput[] = result.rows.map((row) => ({
    canonicalId: row.canonical_chunk_id,
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: row.workspace_revision,
    sourceRevision: row.source_revision,
    graphRevision: null,
    semanticRevision: null,
    degradedIdentity: false,
    evidenceRefs: [
      `postgres:atlas_packet_chunk_lineage:${row.chunk_row_id}:${row.canonical_chunk_id}`,
      `postgres:atlas_workspace_source_bindings:${row.source_ref}:${row.source_revision}:${row.workspace_revision}`,
      `postgres:codebase_chunk_index:${row.chunk_row_id}`,
    ],
    representationBindings: [],
  }));

  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision,
    workspaceRevision,
    producerRevision: 'current-chunk-ordinal-map:v2',
    candidates,
  });

  const report = {
    schema: 'atlas.current-chunk-ordinal-map.v2',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_CURRENT_CHUNK_IDENTITY',
    status: 'CURRENT_CHUNK_ORDINAL_MAP_READY',
    writes: {
      postgres: false,
      qdrant: false,
      neo4j: false,
      valkey: false,
    },
    workspaceRevision,
    candidateSnapshotRevision,
    sourceRevisionSetChecksum,
    identitySetChecksum,
    candidateCount: result.rows.length,
    canonicalChunkCount: new Set(result.rows.map((row) => row.canonical_chunk_id)).size,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    identityGrain: 'CANONICAL_CHUNK',
    identityOwner: 'atlas_packet_chunk_lineage',
    workspaceBindingOwner: 'atlas_workspace_source_bindings',
    checks: {
      exactWorkspaceBinding: true,
      provenPacketChunkLineage: true,
      duplicateCanonicalIds: 0,
      duplicateChunkRows: 0,
      sourceRevisionsQualified: true,
      semanticRevisionFabricated: false,
      graphRevisionFabricated: false,
    },
    sample: orderedIdentityRows.slice(0, 10),
    output: path.relative(ROOT, output).replaceAll('\\', '/'),
    nextGate: 'PROMOTION-RECEIPT-COHORT-01',
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(ordinalMap, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: report.status,
    workspaceRevision,
    candidateSnapshotRevision,
    candidateCount: report.candidateCount,
    sourceRevisionSetChecksum,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    output: report.output,
    reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/'),
    writesPerformed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}).finally(() => pool.end().catch(() => {}));
