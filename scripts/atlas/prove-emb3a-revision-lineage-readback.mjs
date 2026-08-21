#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'sveltekit-frontend', '.env'), override: false });

const { Pool } = pg;
const root = process.cwd();
const reportDir = path.join(root, 'docs', 'reports');
const reportPath = path.join(reportDir, 'emb3a-revision-lineage-readback.json');
const markdownPath = path.join(reportDir, 'emb3a-revision-lineage-readback.md');
const databaseUrl = process.env.DATABASE_URL;
const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const collection = 'codebase_chunks_768';

const report = {
  schema: 'atlas.emb3a.revision.lineage.readback.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  collection,
  canonicalWrites: false,
  postgres: { status: 'NOT_RUN' },
  qdrant: { status: 'NOT_RUN' },
  join: { status: 'NOT_RUN' },
  status: 'BLOCKED',
};

async function readPostgres() {
  if (!databaseUrl) {
    report.postgres = { status: 'DATABASE_URL_MISSING' };
    return [];
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_packets'
      ORDER BY ordinal_position
    `);
    const names = new Set(columns.rows.map((row) => row.column_name));
    const required = ['packet_key', 'source_ref', 'workspace_revision', 'representation_revision'];
    const missing = required.filter((name) => !names.has(name));
    if (missing.length) {
      report.postgres = { status: 'REQUIRED_COLUMNS_MISSING', missing, columns: [...names] };
      return [];
    }
    const sourceRevision = names.has('source_revision') ? 'source_revision' : 'NULL::text AS source_revision';
    const result = await pool.query(`
      SELECT packet_key, source_ref, workspace_revision, ${sourceRevision}, representation_revision
      FROM public.atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY packet_key
      LIMIT 50
    `);
    const rows = result.rows;
    report.postgres = {
      status: 'READ_ONLY_SAMPLE_PROVEN',
      rows: rows.length,
      nonZeroWorkspaceRevision: rows.filter((row) => row.workspace_revision !== null && Number(row.workspace_revision) !== 0).length,
      nonZeroRepresentationRevision: rows.filter((row) => row.representation_revision !== null && Number(row.representation_revision) !== 0).length,
      sourceRevisionPresent: rows.filter((row) => row.source_revision !== null && row.source_revision !== '').length,
    };
    return rows;
  } finally {
    await pool.end();
  }
}

async function readQdrant() {
  const response = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 50, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Qdrant HTTP ${response.status}`);
  const body = await response.json();
  const points = body?.result?.points ?? [];
  report.qdrant = {
    status: 'READ_ONLY_SAMPLE_PROVEN',
    rows: points.length,
    revisionFields: {
      workspace_revision: points.filter((point) => point.payload?.workspace_revision !== null && point.payload?.workspace_revision !== undefined).length,
      source_revision: points.filter((point) => point.payload?.source_revision !== null && point.payload?.source_revision !== undefined).length,
      representation_revision: points.filter((point) => point.payload?.representation_revision !== null && point.payload?.representation_revision !== undefined).length,
    },
  };
  return points;
}

try {
  const [packets, points] = await Promise.all([readPostgres(), readQdrant()]);
  const byPacket = new Map(packets.map((row) => [String(row.packet_key), row]));
  const bySource = new Map(packets.map((row) => [String(row.source_ref), row]));
  const matches = [];
  for (const point of points) {
    const payload = point.payload ?? {};
    const row = byPacket.get(String(payload.packet_key)) ?? bySource.get(String(payload.source_ref));
    if (!row) continue;
    matches.push({
      pointId: point.id,
      packetKey: payload.packet_key ?? null,
      sourceRef: payload.source_ref ?? null,
      postgres: {
        workspaceRevision: row.workspace_revision,
        sourceRevision: row.source_revision,
        representationRevision: row.representation_revision,
      },
      qdrant: {
        workspaceRevision: payload.workspace_revision ?? null,
        sourceRevision: payload.source_revision ?? null,
        representationRevision: payload.representation_revision ?? null,
      },
    });
  }
  const comparable = matches.filter((match) => match.qdrant.workspaceRevision !== null || match.qdrant.sourceRevision !== null || match.qdrant.representationRevision !== null);
  const aligned = comparable.filter((match) => String(match.postgres.workspaceRevision ?? '') === String(match.qdrant.workspaceRevision ?? '') && String(match.postgres.representationRevision ?? '') === String(match.qdrant.representationRevision ?? '')).length;
  report.join = { status: 'READ_ONLY_JOIN_COMPLETE', matches: matches.length, comparable, aligned };
  report.status = comparable.length > 0 && aligned === comparable.length ? 'LINEAGE_READBACK_PARTIAL_PROVEN' : 'LINEAGE_POPULATION_NOT_PROVEN';
} catch (error) {
  report.status = 'READBACK_BLOCKED';
  report.error = error instanceof Error ? error.message : String(error);
}

await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(markdownPath, [
  '# EMB3A revision lineage readback', '',
  `- Status: **${report.status}**`,
  '- Read-only: **true**',
  `- PostgreSQL: **${report.postgres.status}**`,
  `- Qdrant: **${report.qdrant.status}**`,
  `- Join: **${report.join.status}**`,
  '',
  report.error ? `Blocker: ${report.error}` : 'No canonical or projection writes occurred.',
].join('\n') + '\n', 'utf8');

console.log(JSON.stringify({ status: report.status, postgres: report.postgres.status, qdrant: report.qdrant.status, join: report.join.status, reportPath: path.relative(root, reportPath), canonicalWrites: false }, null, 2));

