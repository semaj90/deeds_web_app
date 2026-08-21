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
const reportPath = path.join(reportDir, 'emb3a-upstream-revision-owner-audit.json');
const markdownPath = path.join(reportDir, 'emb3a-upstream-revision-owner-audit.md');
const databaseUrl = process.env.DATABASE_URL;

const targets = [
  { table: 'atlas_packets', fields: ['packet_key', 'source_ref', 'sha256', 'workspace_revision', 'source_revision', 'representation_id', 'representation_revision'] },
  { table: 'atlas_ast_nodes', fields: ['source_ref_key', 'source_revision', 'workspace_id'] },
  { table: 'atlas_source_revisions', fields: ['source_revision_id', 'packet_key', 'source_ref', 'final_url', 'content_digest', 'received_at'] },
  { table: 'atlas_representation_records', fields: ['packet_key', 'representation_id', 'representation_revision'] },
];

const report = {
  schema: 'atlas.emb3a.upstream.revision.owner.audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  tables: [],
  writer: {
    representationOwnerCandidate: 'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts',
    qdrantProjectionOwner: 'sveltekit-frontend/src/lib/server/workers/qdrant-sync-worker.ts -> retrieval/qdrant-sync-payload.ts',
    upstreamRevisionOwner: 'NOT_PROVEN',
    fallbackDefaults: { workspace_revision: 0, representation_revision: 0, source_revision: null },
  },
  status: 'BLOCKED',
  canonicalWrites: false,
};

async function inspect() {
  if (!databaseUrl) {
    report.status = 'DATABASE_URL_MISSING';
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    for (const target of targets) {
      const columns = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position
      `, [target.table]);
      const present = new Set(columns.rows.map((row) => row.column_name));
      const available = target.fields.filter((field) => present.has(field));
      const missing = target.fields.filter((field) => !present.has(field));
      const entry = { table: target.table, available, missing, status: 'NOT_FOUND_OR_INCOMPLETE' };
      if (available.length) {
        const expressions = available.map((field) => `COUNT(${field})::int AS "${field}_present"`).join(', ');
        const result = await pool.query(`SELECT COUNT(*)::int AS total_rows, ${expressions} FROM public."${target.table}"`);
        const meaningfulFields = available
          .filter((field) => ['workspace_revision', 'representation_revision'].includes(field))
          .map((field) => `COUNT(*) FILTER (WHERE ${field} IS NOT NULL AND ${field} <> 0)::int AS "${field}_nonzero"`);
        const meaningfulResult = meaningfulFields.length
          ? await pool.query(`SELECT ${meaningfulFields.join(', ')} FROM public."${target.table}"`)
          : { rows: [{}] };
        entry.coverage = { ...result.rows[0], ...meaningfulResult.rows[0] };
        entry.status = missing.length ? 'PARTIAL_SCHEMA' : 'SCHEMA_PRESENT';
      }
      report.tables.push(entry);
    }
  } finally {
    await pool.end();
  }
  const packets = report.tables.find((table) => table.table === 'atlas_packets');
  const ast = report.tables.find((table) => table.table === 'atlas_ast_nodes');
  const representation = report.tables.find((table) => table.table === 'atlas_representation_records');
  const packetCoverage = packets?.coverage ?? {};
  const hasRevisionSource = Number(packetCoverage.workspace_revision_nonzero ?? 0) > 0
    || Number(packetCoverage.source_revision_present ?? 0) > 0
    // A lone non-zero default/outlier is not evidence of a revision owner.
    || Number(packetCoverage.representation_revision_nonzero ?? 0) > 1
    || Number(ast?.coverage?.source_revision_present ?? 0) > 0;
  report.status = hasRevisionSource
    ? 'REVISION_OWNER_PARTIAL_OR_CANDIDATE'
    : 'REVISION_OWNER_NOT_PROVEN';
  const sourceRevisions = report.tables.find((table) => table.table === 'atlas_source_revisions');
  if (sourceRevisions?.available?.includes('content_digest')) {
    report.writer.sourceRevisionAdjacentOwner = 'atlas_source_revisions';
    report.writer.sourceRevisionBinding = 'NOT_PROVEN_FOR_ATLAS_PACKETS';

    const packetFields = new Set(packets?.available ?? []);
    const sourceFields = new Set(sourceRevisions.available ?? []);
    report.sourceRevisionBindingAudit = {
      explicitPacketKeyField: sourceFields.has('packet_key'),
      explicitSourceRefField: sourceFields.has('source_ref'),
      digestJoinCandidate: packetFields.has('sha256') && sourceFields.has('content_digest'),
      status: sourceFields.has('packet_key') || sourceFields.has('source_ref')
        ? 'EXPLICIT_KEY_JOIN_AVAILABLE_BUT_NOT_PROVEN'
        : packetFields.has('sha256') && sourceFields.has('content_digest')
          ? 'DIGEST_JOIN_CANDIDATE_ONLY'
          : 'NO_JOIN_KEY_AVAILABLE',
    };

    if (packetFields.has('sha256') && sourceFields.has('content_digest')) {
      const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
      try {
        const overlap = await pool.query(`
          SELECT COUNT(DISTINCT ap.packet_key)::int AS packet_digest_overlap
          FROM public.atlas_packets ap
          INNER JOIN public.atlas_source_revisions asr
            ON lower(trim(ap.sha256)) = lower(trim(asr.content_digest))
          WHERE ap.sha256 IS NOT NULL AND asr.content_digest IS NOT NULL
        `);
        report.sourceRevisionBindingAudit.packetDigestOverlap = overlap.rows[0]?.packet_digest_overlap ?? 0;
        if (report.sourceRevisionBindingAudit.packetDigestOverlap > 0) {
          const samples = await pool.query(`
            SELECT
              ap.packet_key,
              ap.source_ref,
              ap.sha256,
              asr.source_revision_id,
              asr.final_url,
              asr.content_digest
            FROM public.atlas_packets ap
            INNER JOIN public.atlas_source_revisions asr
              ON lower(trim(ap.sha256)) = lower(trim(asr.content_digest))
            WHERE ap.sha256 IS NOT NULL AND asr.content_digest IS NOT NULL
            ORDER BY ap.packet_key
            LIMIT 5
          `);
          report.sourceRevisionBindingAudit.samples = samples.rows;
          const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
          const hasUntrustedDigest = samples.rows.some((row) =>
            String(row.sha256 ?? '').toLowerCase() === emptySha256
            || String(row.content_digest ?? '').toLowerCase() === emptySha256
            || String(row.final_url ?? '').toLowerCase() === 'https://example.com',
          );
          if (hasUntrustedDigest) {
            report.sourceRevisionBindingAudit.status = 'REJECTED_UNTRUSTED_DIGEST_COLLISION';
          }
        }
      } finally {
        await pool.end();
      }
    }
  }
}

try {
  await inspect();
} catch (error) {
  report.status = 'READBACK_BLOCKED';
  report.error = error instanceof Error ? error.message : String(error);
}

await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(markdownPath, [
  '# EMB3A upstream revision owner audit', '',
  `- Status: **${report.status}**`,
  '- Read-only: **true**',
  `- Representation writer candidate: \`${report.writer.representationOwnerCandidate}\``,
  `- Qdrant projection writer: \`${report.writer.qdrantProjectionOwner}\``,
  `- Source-revision adjacent owner: \`${report.writer.sourceRevisionAdjacentOwner ?? 'NOT_FOUND'}\``,
  `- Packet binding: **${report.writer.sourceRevisionBinding ?? 'NOT_PROVEN'}**`,
  '',
  ...report.tables.map((table) => `- \`${table.table}\`: **${table.status}**; fields=${table.available.join(', ') || 'none'}; missing=${table.missing.join(', ') || 'none'}`),
  '',
  'No Postgres, Qdrant, Valkey, or canonical data was modified.',
].join('\n') + '\n', 'utf8');

console.log(JSON.stringify({ status: report.status, tables: report.tables, reportPath: path.relative(root, reportPath), canonicalWrites: false }, null, 2));
