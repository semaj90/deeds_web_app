import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from '../../sveltekit-frontend/scripts/atlas/load-atlas-env.mjs';
import {
  createExactPromotionPostgresExecutor,
  createWorkspaceExactPromotionSourceReader,
  exactPromotionRevisionAuthoritySchema,
  type ExactPromotionCandidateV1,
} from '../../packages/parent-atlas/src/index.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const REVISION_PROOF_PATH = process.env.ATLAS_REVISION_OWNER_PROOF
  ? path.resolve(REPO_ROOT, process.env.ATLAS_REVISION_OWNER_PROOF)
  : path.resolve(REPO_ROOT, 'docs/reports/revision-owner-proof.json');
const OUT = process.env.ATLAS_EXACT_PROMOTION_PROOF_OUT
  ? path.resolve(REPO_ROOT, process.env.ATLAS_EXACT_PROMOTION_PROOF_OUT)
  : path.resolve(REPO_ROOT, 'docs/reports/exact-promotion-live-dry-run.json');
const DATABASE_URL = process.env.DATABASE_URL;
const PRODUCER_REVISION = 'atlas.exact-promotion-live-dry-run.v1';

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

function digest(value: unknown): string | null {
  const normalized = String(value ?? '').trim().replace(/^sha256:/, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function text(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

async function loadRevisionAuthority() {
  const raw = JSON.parse(await readFile(REVISION_PROOF_PATH, 'utf8')) as Record<string, unknown>;
  return exactPromotionRevisionAuthoritySchema.parse({
    proof_schema: raw.schema,
    proof_checksum: raw.outputChecksum,
    status: raw.status,
    workspace_revision_proven: raw.workspaceRevisionProven,
    source_revision_proven: raw.sourceRevisionProven,
  });
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
const report: Record<string, unknown> = {
  schema: 'atlas.exact-promotion-live-dry-run.v1',
  generatedAt: new Date().toISOString(),
  status: 'BLOCKED',
  canonicalWrites: false,
  qdrantWrites: false,
  valkeyWrites: false,
  mutationAuthorized: false,
  producerRevision: PRODUCER_REVISION,
};

try {
  const revisionAuthority = await loadRevisionAuthority();
  report.revisionAuthority = revisionAuthority;

  const client = await pool.connect();
  let rows: Array<Record<string, unknown>> = [];
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const graphify = await client.query<{ available: boolean }>(
      `SELECT to_regclass('public.graphify_files') IS NOT NULL
           AND to_regclass('public.graphify_runs') IS NOT NULL AS available`,
    );
    if (!graphify.rows[0]?.available) {
      report.status = 'BLOCKED_GRAPHIFY_SOURCE_UNAVAILABLE';
    } else {
      const candidates = await client.query(`
        SELECT p.packet_key, p.source_ref, p.representation_revision,
               p.qdrant_point_id, p.sha256, p.byte_start, p.byte_end,
               gf.source_revision, gf.content_hash AS graphify_content_hash,
               gr.repository_revision
        FROM atlas_packets p
        JOIN LATERAL (
          SELECT source_ref, source_revision, content_hash, last_seen_run_id, file_id
          FROM graphify_files
          WHERE source_ref = p.source_ref
          ORDER BY file_id DESC
          LIMIT 1
        ) gf ON true
        LEFT JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE p.packet_key IS NOT NULL
          AND p.source_ref IS NOT NULL
          AND p.byte_start IS NOT NULL
          AND p.byte_end IS NOT NULL
          AND p.representation_revision > 0
          AND gf.source_revision IS NOT NULL
          AND gr.repository_revision IS NOT NULL
        ORDER BY p.updated_at DESC NULLS LAST, p.packet_key
        LIMIT 25
      `);
      rows = candidates.rows;
    }
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (rows.length > 0) {
    const selected = rows.find((row) => digest(row.graphify_content_hash) && digest(row.sha256));
    if (!selected) {
      report.status = 'BLOCKED_NO_HASH_QUALIFIED_CANDIDATE';
    } else {
      const packetKey = text(selected.packet_key)!;
      const candidate: ExactPromotionCandidateV1 = {
        candidate_id: `candidate:${packetKey}`,
        candidate_ordinal: null,
        canonical_id: packetKey,
        packet_key: packetKey,
        stable_symbol_id: null,
        symbol_version_id: null,
        tree_node_id: null,
        source_ref: text(selected.source_ref)!,
        workspace_revision: text(selected.repository_revision)!,
        source_revision: text(selected.source_revision)!,
        representation_revision: text(selected.representation_revision)!,
        expected_file_content_hash: digest(selected.graphify_content_hash),
        expected_span_content_hash: digest(selected.sha256),
        evidence_refs: ['live-dry-run:auto-selected-packet'],
        qdrant_point_id: text(selected.qdrant_point_id),
      };

      const executor = createExactPromotionPostgresExecutor({
        pool,
        sourceReader: createWorkspaceExactPromotionSourceReader(REPO_ROOT),
      });
      const result = await executor.execute({
        request_id: `exact-promotion-live:${packetKey}`,
        candidate,
        revision_authority: revisionAuthority,
        producer_revision: PRODUCER_REVISION,
      });
      report.status = result.receipt.status;
      report.candidate = candidate;
      report.receipt = result.receipt;
      report.transaction = result.transaction;
      report.mutationAuthorized = result.receipt.mutation_authorized;
    }
  } else if (report.status === 'BLOCKED') {
    report.status = 'BLOCKED_NO_REVISION_QUALIFIED_PACKET_CANDIDATE';
  }
} catch (error) {
  report.status = 'BLOCKED_EXECUTION_ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  mutationAuthorized: report.mutationAuthorized,
  canonicalWrites: false,
  report: path.relative(REPO_ROOT, OUT),
}, null, 2));

if (report.status !== 'PROVEN' && report.status !== 'BLOCKED_REVISION_AUTHORITY') {
  process.exitCode = 3;
}
