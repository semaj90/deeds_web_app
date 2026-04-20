/**
 * mirror-qdrant-to-postgres.ts
 *
 * Batch worker: scrolls Qdrant `codebase_chunks_768`, upserts rows into
 * Postgres `codebase_chunk_index`, tracks progress in `enrichment_jobs`.
 *
 * Adapted for the existing schema:
 *   - PK column is `id` (UUID), conflict target is `qdrant_id` (unique)
 *   - relative_path maps from payload.file_path (fallback '__unknown__')
 *   - tags stored in `semantic_tags text[]` (separate from legacy `tags jsonb`)
 *   - summary_embedding NOT mirrored here (requires separate embedding pass)
 *
 * Usage:
 *   DATABASE_URL=postgres://... REPO_ID=<uuid> npx tsx scripts/mirror-qdrant-to-postgres.ts
 *
 * Optional env:
 *   QDRANT_URL          default: http://localhost:6333
 *   QDRANT_COLLECTION   default: codebase_chunks_768
 *   BATCH_SIZE          default: 200
 *   REPO_ID             required — UUID of the code_repos row for this run
 */

import { Client as PgClient } from 'pg';
import crypto from 'node:crypto';

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DATABASE_URL      = process.env.DATABASE_URL!;
const REPO_ID           = process.env.REPO_ID!;
const BATCH_SIZE        = Math.min(500, Math.max(1, Number(process.env.BATCH_SIZE ?? 200)));

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!REPO_ID)      throw new Error('REPO_ID is required');
if (!/^[0-9a-f-]{36}$/i.test(REPO_ID)) throw new Error('REPO_ID must be a valid UUID');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type QdrantPoint = {
  id: string | number;
  payload?: Record<string, unknown>;
};

type ScrollResponse = {
  result?: {
    points?: QdrantPoint[];
    next_page_offset?: string | number | null;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeJsonParse(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return {};
}

function textOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Qdrant scroll
// ─────────────────────────────────────────────────────────────────────────────

async function qdrantScroll(
  offset?: string | number | null,
  limit = BATCH_SIZE
): Promise<ScrollResponse> {
  const body: Record<string, unknown> = { limit, with_payload: true, with_vector: false };
  if (offset != null) body.offset = offset;

  const res = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Qdrant scroll failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ScrollResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// enrichment_jobs helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureJob(pg: PgClient, jobId: string): Promise<void> {
  await pg.query(
    `INSERT INTO enrichment_jobs (job_id, repo_id, job_type, status, started_at, metadata)
     VALUES ($1, $2, 'qdrant_mirror', 'running', now(), '{}'::jsonb)
     ON CONFLICT (job_id) DO NOTHING`,
    [jobId, REPO_ID]
  );
}

async function updateJob(
  pg: PgClient,
  jobId: string,
  fields: {
    cursor?:    string | null;
    processed?: number;
    upserted?:  number;
    failed?:    number;
    status?:    string;
    error?:     string;
  }
): Promise<void> {
  await pg.query(
    `UPDATE enrichment_jobs SET
       cursor          = COALESCE($2, cursor),
       total_processed = COALESCE($3, total_processed),
       total_upserted  = COALESCE($4, total_upserted),
       total_failed    = COALESCE($5, total_failed),
       status          = COALESCE($6, status),
       error           = CASE WHEN $7::text IS NOT NULL
                              THEN jsonb_build_object('message', $7::text)
                              ELSE error END,
       updated_at      = now(),
       finished_at     = CASE WHEN $6 IN ('completed', 'failed')
                              THEN now()
                              ELSE finished_at END
     WHERE job_id = $1`,
    [
      jobId,
      fields.cursor    ?? null,
      fields.processed ?? null,
      fields.upserted  ?? null,
      fields.failed    ?? null,
      fields.status    ?? null,
      fields.error     ?? null,
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert one chunk
// ─────────────────────────────────────────────────────────────────────────────

async function upsertChunk(pg: PgClient, point: QdrantPoint): Promise<void> {
  const payload      = point.payload ?? {};
  const qdrantId     = String(point.id);
  const filePath     = textOrNull(payload.file_path) ?? '__unknown__';
  const semanticTags = stringArray(payload.tags);

  const metadata = {
    tensor_stats:   safeJsonParse(payload.tensor_stats),
    provenance:     safeJsonParse(payload.provenance),
    karpathy_debug: safeJsonParse(payload.karpathy_debug),
  };

  await pg.query(
    `INSERT INTO codebase_chunk_index (
       qdrant_id,
       repo_id,
       relative_path,
       symbol,
       kind,
       domain,
       language,
       extension,
       content,
       content_hash,
       gpu_cluster,
       som_cluster,
       neo4j_gpu_cluster,
       semantic_tags,
       token_count,
       line_start,
       line_end,
       embedding_model,
       summary_model,
       summary,
       metadata,
       indexed_at,
       updated_at
     )
     VALUES (
       $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,
       $10, $11, $12, $13, $14, $15, $16, $17, $18,
       $19, $20, $21, now(), now()
     )
     ON CONFLICT (qdrant_id) DO UPDATE SET
       repo_id           = EXCLUDED.repo_id,
       relative_path     = EXCLUDED.relative_path,
       symbol            = EXCLUDED.symbol,
       kind              = EXCLUDED.kind,
       domain            = EXCLUDED.domain,
       language          = EXCLUDED.language,
       extension         = EXCLUDED.extension,
       content           = EXCLUDED.content,
       content_hash      = EXCLUDED.content_hash,
       gpu_cluster       = EXCLUDED.gpu_cluster,
       som_cluster       = EXCLUDED.som_cluster,
       neo4j_gpu_cluster = EXCLUDED.neo4j_gpu_cluster,
       semantic_tags     = EXCLUDED.semantic_tags,
       token_count       = EXCLUDED.token_count,
       line_start        = EXCLUDED.line_start,
       line_end          = EXCLUDED.line_end,
       embedding_model   = EXCLUDED.embedding_model,
       summary_model     = EXCLUDED.summary_model,
       summary           = EXCLUDED.summary,
       metadata          = EXCLUDED.metadata,
       updated_at        = now()`,
    [
      qdrantId,
      REPO_ID,
      filePath,
      textOrNull(payload.symbol),
      textOrNull(payload.kind),
      textOrNull(payload.domain),
      textOrNull(payload.language),
      textOrNull(payload.extension),
      textOrNull(payload.content),
      textOrNull(payload.content_hash),
      intOrNull(payload.gpu_cluster),
      intOrNull(payload.som_cluster),
      intOrNull(payload.neo4j_gpuCluster),       // note: camelCase in Qdrant payload
      semanticTags,
      intOrNull(payload.token_count),
      intOrNull(payload.line_start),
      intOrNull(payload.line_end),
      textOrNull(payload.embedding_model),
      textOrNull(payload.summary_model),
      textOrNull(payload.summary),
      JSON.stringify(metadata),
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure code_repos row exists
// ─────────────────────────────────────────────────────────────────────────────

async function ensureRepo(pg: PgClient): Promise<void> {
  const name   = process.env.REPO_NAME   ?? REPO_ID;
  const branch = process.env.REPO_BRANCH ?? 'main';
  await pg.query(
    `INSERT INTO code_repos (repo_id, name, branch)
     VALUES ($1, $2, $3)
     ON CONFLICT (repo_id) DO NOTHING`,
    [REPO_ID, name, branch]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log('[mirror] Connected to Postgres');

  await ensureRepo(pg);

  const jobId = crypto.randomUUID();
  await ensureJob(pg, jobId);
  console.log(`[mirror] Job ${jobId} started — repo ${REPO_ID}`);

  let offset:    string | number | null | undefined = null;
  let processed = 0;
  let upserted  = 0;
  let failed    = 0;

  try {
    while (true) {
      const page   = await qdrantScroll(offset, BATCH_SIZE);
      const points = page.result?.points ?? [];
      if (points.length === 0) break;

      for (const point of points) {
        processed += 1;
        try {
          await upsertChunk(pg, point);
          upserted += 1;
        } catch (err) {
          failed += 1;
          console.error('[mirror] upsertChunk failed', {
            pointId: point.id,
            error:   err instanceof Error ? err.message : String(err),
          });
        }
      }

      offset = page.result?.next_page_offset ?? null;
      await updateJob(pg, jobId, {
        cursor:    offset == null ? null : String(offset),
        processed,
        upserted,
        failed,
        status:    'running',
      });

      console.log(
        `[mirror] batch done — processed=${processed} upserted=${upserted} failed=${failed}` +
        (offset != null ? ` cursor=${offset}` : ' (last page)')
      );

      if (offset == null) break;
    }

    await updateJob(pg, jobId, { processed, upserted, failed, status: 'completed' });
    console.log(JSON.stringify({ ok: true, jobId, processed, upserted, failed }, null, 2));

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(pg, jobId, { processed, upserted, failed, status: 'failed', error: msg });
    console.error(JSON.stringify({ ok: false, jobId, processed, upserted, failed, error: msg }, null, 2));
    process.exitCode = 1;

  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
