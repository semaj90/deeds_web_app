#!/usr/bin/env tsx

/**
 * ANN-03 read-only current-corpus exporter.
 *
 * This is intentionally separate from the historical 4,951-row ordinal
 * materializer. It requires the current lineage funnel to admit a population,
 * then joins packet -> proven chunk lineage -> canonical Postgres semantic_768
 * vectors. It never falls back to packet order, Qdrant order, fuzzy identity,
 * legacy vector columns, or an unqualified historical map.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildSemanticCandidateSnapshotV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-candidate-snapshot-v1.js';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv(process.env);
const lineagePath = path.resolve(process.env.ATLAS_CURRENT_LINEAGE_REPORT ?? path.join(root, 'docs/reports/current-lineage-closure-v1.json'));
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(root, 'docs/reports/candidate-ordinal-corpus-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_SEMANTIC_SNAPSHOT_REPORT ?? path.join(root, 'docs/reports/current-semantic-candidate-snapshot-v1.json'));
const snapshotPath = path.resolve(process.env.ATLAS_SEMANTIC_SNAPSHOT_OUTPUT ?? path.join(root, '.tmp/atlas/current-semantic-candidate-snapshot-v1.json'));
const sha256 = (value: string) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  const text = String(value ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
  return text ? text.split(',').map(Number) : [];
}

async function writeReport(report: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const lineage = JSON.parse(await fs.readFile(lineagePath, 'utf8')) as {
  scope?: { workspaceRevision?: string };
  funnel?: { candidateOrdinalEligibleRows?: number };
  firstFailureBoundary?: string;
  status?: string;
};
const map = JSON.parse(await fs.readFile(mapPath, 'utf8')) as {
  workspaceRevision?: string;
  candidateSnapshotRevision?: string;
  ordinalMapChecksum?: string;
  candidates?: Array<{ candidateOrdinal: number; canonicalId: string; packetKey: string | null; sourceRef: string | null; sourceRevision: string }>;
};
const candidates = Array.isArray(map.candidates) ? map.candidates : [];
const workspaceRevision = lineage.scope?.workspaceRevision ?? null;
const eligibleRows = Number(lineage.funnel?.candidateOrdinalEligibleRows ?? 0);

if (eligibleRows <= 0) {
  const report = {
    schema: 'atlas.current-semantic-candidate-snapshot.v1',
    status: 'BLOCKED_CURRENT_LINEAGE',
    firstFailureBoundary: lineage.firstFailureBoundary ?? lineage.status ?? 'CURRENT_LINEAGE_UNAVAILABLE',
    workspaceRevision,
    candidateMapPath: path.relative(root, mapPath).replaceAll('\\', '/'),
    candidateMapWorkspaceRevision: map.workspaceRevision ?? null,
    candidateMapRowCount: candidates.length,
    candidateOrdinalEligibleRows: eligibleRows,
    snapshotPath: null,
    canonicalAuthority: false,
    writesPerformed: false,
    databaseWrites: false,
    qdrantWrites: false,
    nextGate: 'CURRENT_PACKET_CHUNK_AST_LINEAGE_ADMISSION',
  };
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (!workspaceRevision || !map.workspaceRevision || map.workspaceRevision !== workspaceRevision) {
  const report = {
    schema: 'atlas.current-semantic-candidate-snapshot.v1',
    status: 'BLOCKED_WORKSPACE_REVISION_MISMATCH',
    workspaceRevision,
    candidateMapWorkspaceRevision: map.workspaceRevision ?? null,
    candidateOrdinalEligibleRows: eligibleRows,
    canonicalAuthority: false,
    writesPerformed: false,
    databaseWrites: false,
    qdrantWrites: false,
    nextGate: 'REBUILD_CANDIDATE_ORDINAL_MAP_FROM_CURRENT_LINEAGE',
  };
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (!map.candidateSnapshotRevision || !map.ordinalMapChecksum || candidates.some((candidate) => !candidate.packetKey || !candidate.sourceRef || !candidate.sourceRevision)) {
  throw new Error('CURRENT_CANDIDATE_MAP_IDENTITY_INCOMPLETE');
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, statement_timeout: 60_000, application_name: 'atlas-current-semantic-snapshot-read-only' });
try {
  const columnCheck = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index' AND column_name = 'content_embedding'
  `);
  if (columnCheck.rowCount !== 1) throw new Error('CANONICAL_SEMANTIC_768_COLUMN_MISSING');

  const packetKeys = candidates.map((candidate) => candidate.packetKey as string);
  const result = await pool.query(`
    SELECT p.packet_key,
           p.source_ref AS packet_source_ref,
           p.canonical_source_ref,
           p.source_revision AS packet_source_revision,
           p.workspace_revision::text AS packet_workspace_revision,
           l.source_ref AS lineage_source_ref,
           l.source_revision AS lineage_source_revision,
           l.chunk_row_id::text AS chunk_row_id,
           c.content_hash::text AS content_hash,
           c.content_embedding::text AS embedding
      FROM public.atlas_packets p
      JOIN public.atlas_packet_chunk_lineage l
        ON l.packet_key = p.packet_key
       AND l.source_ref = COALESCE(p.canonical_source_ref, p.source_ref)
       AND l.source_revision = p.source_revision
       AND l.revision_status = 'PROVEN'
      JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
     WHERE p.packet_key = ANY($1::text[])
       AND c.content_embedding IS NOT NULL
  `, [packetKeys]);
  const byPacket = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const list = byPacket.get(String(row.packet_key)) ?? [];
    list.push(row);
    byPacket.set(String(row.packet_key), list);
  }

  const rows = [];
  for (const candidate of candidates) {
    const matches = (byPacket.get(candidate.packetKey as string) ?? []).filter((row) =>
      String(row.packet_source_revision) === candidate.sourceRevision
      && String(row.lineage_source_revision) === candidate.sourceRevision
      && String(row.packet_workspace_revision) === workspaceRevision
      && String(row.lineage_source_ref) === candidate.sourceRef
      && String(row.canonical_source_ref ?? row.packet_source_ref) === candidate.sourceRef,
    );
    if (matches.length !== 1) throw new Error(`CURRENT_SEMANTIC_CANDIDATE_NOT_EXACT:${candidate.candidateOrdinal}:${matches.length}`);
    const row = matches[0];
    const vector = parseVector(row.embedding);
    rows.push({
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey as string,
      sourceRef: candidate.sourceRef as string,
      sourceRevision: candidate.sourceRevision,
      chunkRowId: String(row.chunk_row_id),
      embeddingDigest: sha256(JSON.stringify(vector)),
      vector,
    });
  }

  const snapshot = buildSemanticCandidateSnapshotV1({
    ordinalMap: map as never,
    representationRevision: 'semantic_768:v1',
    rows,
  });
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  const report = {
    schema: 'atlas.current-semantic-candidate-snapshot.v1',
    status: 'CURRENT_SEMANTIC_CANDIDATE_SNAPSHOT_EXPORTED',
    workspaceRevision,
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    candidateOrdinalMapChecksum: snapshot.candidateOrdinalMapChecksum,
    rowCount: snapshot.rowCount,
    tensorChecksum: snapshot.tensorChecksum,
    identityManifestChecksum: snapshot.identityManifestChecksum,
    snapshotPath: path.relative(root, snapshotPath).replaceAll('\\', '/'),
    canonicalAuthority: false,
    writesPerformed: false,
    databaseWrites: false,
    qdrantWrites: false,
    nextGate: 'ANN_03_QDRANT_CUVS_EXACT_PARITY',
  };
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
