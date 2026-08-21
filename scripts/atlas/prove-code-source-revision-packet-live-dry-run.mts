import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { loadRuntimeEnv } from '../../sveltekit-frontend/src/lib/server/config/load-runtime-env.js';
import { dryRunCodeSourceRevisionPacket } from '../../sveltekit-frontend/src/lib/server/atlas/identity/code-source-revision-packet-dry-run.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });
loadRuntimeEnv({ cwd: process.cwd(), mode: 'development' });

const reportPath = path.join(process.cwd(), 'docs', 'reports', 'code-source-revision-packet-live-dry-run.json');
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});

const report: Record<string, unknown> = {
  schema: 'atlas.code-source-revision.packet-live-dry-run.v1',
  generatedAt: new Date().toISOString(),
  status: 'BLOCKED',
  canonicalWrites: false,
  qdrantWrites: false,
  sampleLimit: 25,
  rowsSeen: 0,
  sourceContentRows: 0,
  readyRows: 0,
  blockedRows: 0,
  diagnostics: [],
  graphifySourceTableAvailable: false,
};

const repoRoot = path.resolve(process.cwd());

function normalizeSourceRef(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

async function readVerifiedWorkspaceSource(sourceRef: string, expectedDigest: string | null) {
  const normalized = normalizeSourceRef(sourceRef);
  if (!normalized || path.isAbsolute(normalized)) {
    return { content: null, error: 'SOURCE_REF_NOT_SAFE_FOR_WORKSPACE_READ' };
  }
  const candidate = path.resolve(repoRoot, normalized);
  try {
    const real = await realpath(candidate);
    const root = await realpath(repoRoot);
    if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
      return { content: null, error: 'SOURCE_REF_OUTSIDE_WORKSPACE_ROOT' };
    }
    const content = await readFile(real, 'utf8');
    const digest = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
    if (!expectedDigest || digest !== expectedDigest.replace(/^sha256:/, '')) {
      return { content: null, error: 'WORKSPACE_BYTES_DO_NOT_MATCH_GRAPHIFY_CONTENT_HASH' };
    }
    return { content, error: null };
  } catch {
    return { content: null, error: 'SOURCE_REF_NOT_AVAILABLE_IN_WORKSPACE' };
  }
}

try {
  const result = await pool.query(`
    SELECT
      packet_key,
      source_ref,
      sha256,
      workspace_revision,
      representation_revision,
      source_representation_id,
      payload->>'content' AS payload_content
    FROM public.atlas_packets
    WHERE packet_key IS NOT NULL
    ORDER BY packet_key
    LIMIT 25
  `);
  report.rowsSeen = result.rows.length;
  const sourceRefs = result.rows.map((row) => normalizeSourceRef(row.source_ref)).filter(Boolean);
  const graphifyAvailable = await pool.query(`SELECT to_regclass('public.graphify_files') IS NOT NULL AS available`);
  report.graphifySourceTableAvailable = Boolean(graphifyAvailable.rows[0]?.available);
  const graphifyRows = graphifyAvailable.rows[0]?.available
    ? await pool.query(`
        SELECT DISTINCT ON (gf.source_ref)
          gf.source_ref,
          gf.source_revision,
          gf.content_hash,
          gr.repository_revision
        FROM public.graphify_files gf
        LEFT JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE gf.source_ref = ANY($1::text[])
        ORDER BY gf.source_ref, gr.completed_at DESC NULLS LAST, gf.file_id DESC
      `, [sourceRefs])
    : { rows: [] };
  const graphifyBySourceRef = new Map(graphifyRows.rows.map((row) => [normalizeSourceRef(row.source_ref), row]));
  report.graphifySourceRows = graphifyRows.rows.length;
  const rows = await Promise.all(result.rows.map(async (row) => {
    const sourceRef = normalizeSourceRef(row.source_ref);
    const graphify = graphifyBySourceRef.get(sourceRef);
    const workspaceSource = graphify
      ? await readVerifiedWorkspaceSource(sourceRef, graphify.content_hash ? String(graphify.content_hash) : null)
      : { content: null, error: 'GRAPHIFY_SOURCE_LINEAGE_NOT_FOUND' };
    const sourceContent = workspaceSource.content;
    if (sourceContent) report.sourceContentRows = Number(report.sourceContentRows) + 1;
    const dryRun = sourceContent
      ? dryRunCodeSourceRevisionPacket({
        packetKey: String(row.packet_key),
        sourceRef: String(row.source_ref ?? ''),
        sourceContent,
        workspaceRevision: String(graphify?.repository_revision ?? row.workspace_revision ?? ''),
        representationId: 'semantic_768',
        representationRevision: Number(row.representation_revision ?? 0),
        existingPacketSha256: row.sha256 ? String(row.sha256) : null,
      })
      : {
        status: 'BLOCKED' as const,
        canonicalWrites: false as const,
        packetKey: String(row.packet_key),
        sourceRef: String(row.source_ref ?? ''),
        revision: null,
        existingDigestMatch: null,
        errors: [workspaceSource.error ?? 'SOURCE_CONTENT_UNAVAILABLE'],
      };
    return {
      packetKey: dryRun.packetKey,
      sourceRef: dryRun.sourceRef,
      status: dryRun.status,
      errors: dryRun.errors,
      existingDigestMatch: dryRun.existingDigestMatch,
      sourceContentPresent: Boolean(sourceContent),
    };
  }));
  report.readyRows = rows.filter((row) => row.status === 'READY_FOR_PERSISTENCE_REVIEW').length;
  report.blockedRows = rows.length - Number(report.readyRows);
  report.rows = rows;
  report.status = Number(report.readyRows) > 0
    ? 'PARTIAL_LIVE_INPUT_PROVEN_BINDING_INCOMPLETE'
    : 'LIVE_INPUT_BLOCKED_SOURCE_CONTENT_UNAVAILABLE';
} catch (error) {
  report.status = 'READBACK_BLOCKED';
  report.diagnostics = [error instanceof Error ? error.message : String(error)];
} finally {
  await pool.end();
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath), canonicalWrites: false }, null, 2));
