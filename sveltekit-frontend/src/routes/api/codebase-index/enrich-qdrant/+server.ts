/**
 * POST /api/codebase-index/enrich-qdrant
 *
 * Bridge: Neo4j CodebaseFile → Qdrant codebase_chunks_768 payload enrichment.
 *
 * Reads all CodebaseFile nodes from Neo4j (which have scanner-v2 + GPU graph
 * fields: gpuCluster, pageRankScore, communityId, complexity, hasAuthGuard …)
 * and writes those fields back to every Qdrant point whose `relativePath`
 * payload matches the Neo4j node's relative path.
 *
 * This closes the gap where Qdrant payloads only had scanner-v1 metadata
 * (path, kind, symbol, tags, lineStart/End) and were missing the 25 audit
 * metrics that scanner-v2 / GPU analysis writes exclusively to Neo4j.
 *
 * Returns immediately with { jobId } — poll GET ?jobId=<id> for status.
 *
 * Auth: requires locals.user
 * Body (optional): { dryRun?: boolean, batchSize?: number }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { ENV } from '$lib/server/env.server.js';
import { pool } from '$lib/server/db/client';

const COLLECTION = 'codebase_chunks_768';
const QDRANT_URL  = ENV.QDRANT_URL;

const bodySchema = z.object({
  dryRun:    z.boolean().optional().default(false),
  batchSize: z.number().int().min(10).max(500).optional().default(100),
});

// ── Job tracker (in-process) ──────────────────────────────────────────────────

interface EnrichJob {
  jobId: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  // progress
  pathGroupsQueried?: number;
  pathGroupsUpdated?: number;
  pathGroupsSkipped?: number;
  pathPointsUpdated?: number;
  chunkRowsQueried?: number;
  chunkRowsUpdated?: number;
  chunkRowsSkipped?: number;
  nodesQueried: number;
  qdrantUpdated: number;
  qdrantSkipped: number;
  durationMs?: number;
  error?: string;
  // enrichment coverage (set after Neo4j query)
  nodesWithPageRankColab?: number; // f.pagerank_score (Colab GPU PageRank)
  nodesWithSomCluster?: number; // f.som_cluster (Colab SOM BMU index)
}

const jobs = new Map<string, EnrichJob>();

interface ChunkRestoreRow {
  qdrant_id: string;
  relative_path: string;
  symbol: string | null;
  kind: string | null;
  domain: string | null;
  language: string | null;
  extension: string | null;
  line_start: number | null;
  line_end: number | null;
  content: string | null;
  gpu_cluster: number | null;
  som_cluster: number | null;
  som_bmu_row: number | null;
  som_bmu_col: number | null;
  tags: unknown;
  semantic_tags: string[] | null;
}

// ── POST — fire and forget ────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw    = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  const { dryRun, batchSize } = parsed.success ? parsed.data : { dryRun: false, batchSize: 100 };

  const jobId = randomUUID();
  const job: EnrichJob = {
    jobId,
    status:       'running',
    startedAt:    new Date().toISOString(),
    dryRun:       dryRun ?? false,
    nodesQueried: 0,
    qdrantUpdated: 0,
    qdrantSkipped: 0,
  };
  jobs.set(jobId, job);

  // Fire-and-forget
  _runEnrichment(job, batchSize ?? 100).catch((err) => {
    job.status     = 'error';
    job.finishedAt = new Date().toISOString();
    job.error      = String(err?.message ?? err);
    console.error('[enrich-qdrant] Fatal error:', err);
  });

  return json({ jobId, status: 'started', dryRun, message: 'Enrichment job started. Poll GET ?jobId=' + jobId });
};

// ── GET — poll job status ─────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return json({ jobs: [...jobs.values()].slice(-20) });
  }
  const job = jobs.get(jobId);
  if (!job) return json({ error: 'Job not found' }, { status: 404 });
  return json(job);
};

// ── Core enrichment pipeline ──────────────────────────────────────────────────

async function _runEnrichment(job: EnrichJob, batchSize: number): Promise<void> {
  const t0     = Date.now();
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: 'READ' });

  try {
    const columnResult = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'codebase_chunk_index'`
    );
    const availableColumns = new Set(columnResult.rows.map((row) => row.column_name));
    const somBmuRowSelect = availableColumns.has('som_bmu_row')
      ? 'som_bmu_row'
      : 'NULL::integer AS som_bmu_row';
    const somBmuColSelect = availableColumns.has('som_bmu_col')
      ? 'som_bmu_col'
      : 'NULL::integer AS som_bmu_col';

    // 1. Restore chunk payloads from the Postgres mirror using merge semantics.
    //    This repairs missing file_path metadata and can safely repopulate chunk-
    //    level fields without clobbering the rest of each payload.
    const chunkResult = await pool.query<ChunkRestoreRow>(
      `SELECT qdrant_id,
              relative_path,
              symbol,
              kind,
              domain,
              language,
              extension,
              line_start,
              line_end,
              content,
              gpu_cluster,
              som_cluster,
              ${somBmuRowSelect},
              ${somBmuColSelect},
              tags,
              semantic_tags
       FROM codebase_chunk_index
       WHERE qdrant_id IS NOT NULL
         AND relative_path IS NOT NULL
         AND relative_path <> ''
         AND relative_path <> '__unknown__'`
    );

    const restoredAt = new Date().toISOString();
    const updatedPaths = new Set<string>();
    job.pathGroupsQueried = new Set(chunkResult.rows.map((row) => row.relative_path)).size;
    job.pathGroupsUpdated = 0;
    job.pathGroupsSkipped = 0;
    job.pathPointsUpdated = 0;
    job.chunkRowsQueried = chunkResult.rows.length;
    job.chunkRowsUpdated = 0;
    job.chunkRowsSkipped = 0;

    if (job.dryRun) {
      job.pathGroupsSkipped = job.pathGroupsQueried;
      job.chunkRowsSkipped = job.chunkRowsQueried;
    } else {
      for (let i = 0; i < chunkResult.rows.length; i += batchSize) {
        const batch = chunkResult.rows.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (row) => {
            try {
              const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  points: [row.qdrant_id],
                  payload: buildChunkRestorePayload(row, restoredAt),
                }),
                signal: AbortSignal.timeout(15_000),
              });

              if (res.ok) {
                updatedPaths.add(row.relative_path);
                job.chunkRowsUpdated = (job.chunkRowsUpdated ?? 0) + 1;
                job.pathPointsUpdated = (job.pathPointsUpdated ?? 0) + 1;
              } else {
                job.chunkRowsSkipped = (job.chunkRowsSkipped ?? 0) + 1;
                console.warn(
                  `[enrich-qdrant] Chunk restore failed (${res.status}) for ${row.qdrant_id}`
                );
              }
            } catch (err) {
              job.chunkRowsSkipped = (job.chunkRowsSkipped ?? 0) + 1;
              console.warn(`[enrich-qdrant] Chunk restore error for ${row.qdrant_id}:`, err);
            }
          })
        );

        console.log(
          `[enrich-qdrant] Chunk restore progress: ` +
            `${Math.min(i + batchSize, chunkResult.rows.length)}/${chunkResult.rows.length} rows processed`
        );
      }
    }

    job.pathGroupsUpdated = updatedPaths.size;
    job.pathGroupsSkipped = Math.max(0, (job.pathGroupsQueried ?? 0) - updatedPaths.size);

    const preIndexDefs = [
      { field_name: 'file_path', field_schema: { type: 'keyword', lookup: true } },
      { field_name: 'relativePath', field_schema: { type: 'keyword', lookup: true } },
      { field_name: 'extension', field_schema: { type: 'keyword', lookup: true } },
      { field_name: 'kind', field_schema: { type: 'keyword', lookup: true } },
      { field_name: 'domain', field_schema: { type: 'keyword', lookup: true } },
      { field_name: 'som_bmu_row', field_schema: { type: 'integer', lookup: true, range: true } },
      { field_name: 'som_bmu_col', field_schema: { type: 'integer', lookup: true, range: true } },
    ];
    for (const def of preIndexDefs) {
      fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(def),
      }).catch(() => {});
    }

    // 2. Pull all CodebaseFile nodes with enrichable fields.
    const result = await session.run(
      `MATCH (f:CodebaseFile)
       WHERE f.filePath IS NOT NULL
       RETURN
         f.filePath           AS filePath,
         f.complexity         AS complexity,
         f.hasAuthGuard       AS hasAuthGuard,
         f.hasZodValidation   AS hasZodValidation,
         f.hasCachePattern    AS hasCachePattern,
         f.isSseEndpoint      AS isSseEndpoint,
         f.isWorkerBoundary   AS isWorkerBoundary,
         f.hasErrorHandling   AS hasErrorHandling,
         f.isRouteFile        AS isRouteFile,
         f.routeType          AS routeType,
         f.symbolCount        AS symbolCount,
         f.maxCallDepth       AS maxCallDepth,
         f.dynamicImportTargets AS dynamicImportTargets,
         f.callees            AS callees,
         f.gpuCluster         AS gpuCluster,
         f.pageRankScore      AS pageRankScore,
         f.pagerank_score     AS pageRankScoreColab,
         f.som_cluster        AS somCluster,
         f.communityId        AS communityId,
         f.isSvelteComponent  AS isSvelteComponent,
         f.hasSvelte4Props    AS hasSvelte4Props,
         f.hasSvelte4Reactive AS hasSvelte4Reactive,
         f.hasSvelte4Events   AS hasSvelte4Events,
         f.hasRunesInPlainTs  AS hasRunesInPlainTs`
    );

    job.nodesQueried = result.records.length;
    job.nodesWithPageRankColab = result.records.filter(
      (r) => r.get('pageRankScoreColab') != null
    ).length;
    job.nodesWithSomCluster = result.records.filter((r) => r.get('somCluster') != null).length;
    console.log(
      `[enrich-qdrant] Queried ${job.nodesQueried} Neo4j nodes — ` +
        `pagerank_score=${job.nodesWithPageRankColab} som_cluster=${job.nodesWithSomCluster} ` +
        `(run Colab notebook if 0)`
    );

    // 3. Derive relative path from absolute file path.
    //    Keep the leading src/ segment because the live codebase collection stores
    //    file_path values like src/routes/... and the Postgres mirror follows that shape.
    const srcRoot = 'sveltekit-frontend/';
    const fallbackRoot = 'src/';

    const nodes = result.records.map((r) => {
      const fp: string = r.get('filePath') ?? '';
      // Normalise to forward slashes
      const norm = fp.replace(/\\/g, '/');
      const idx = norm.indexOf(srcRoot);
      const relativePath =
        idx >= 0
          ? norm.slice(idx + srcRoot.length)
          : norm.includes(fallbackRoot)
            ? norm.slice(norm.indexOf(fallbackRoot))
            : fp;

      return {
        relativePath,
        payload: {
          neo4j_complexity: _num(r.get('complexity')),
          neo4j_hasAuthGuard: _bool(r.get('hasAuthGuard')),
          neo4j_hasZodValidation: _bool(r.get('hasZodValidation')),
          neo4j_hasCachePattern: _bool(r.get('hasCachePattern')),
          neo4j_isSseEndpoint: _bool(r.get('isSseEndpoint')),
          neo4j_isWorkerBoundary: _bool(r.get('isWorkerBoundary')),
          neo4j_hasErrorHandling: _bool(r.get('hasErrorHandling')),
          neo4j_isRouteFile: _bool(r.get('isRouteFile')),
          neo4j_routeType: _str(r.get('routeType')),
          neo4j_symbolCount: _num(r.get('symbolCount')),
          neo4j_maxCallDepth: _num(r.get('maxCallDepth')),
          neo4j_dynamicImportTargets: _strArr(r.get('dynamicImportTargets')),
          neo4j_callees: _strArr(r.get('callees')),
          neo4j_gpuCluster: _num(r.get('gpuCluster')),
          neo4j_pageRankScore: _num(r.get('pageRankScore')),
          neo4j_communityId: _num(r.get('communityId')),
          // Bare keys (no neo4j_ prefix) — read directly by contextual-tools.ts
          // codebase_som fallback: p.gpuCluster, p.som_cluster
          // codebase_pagerank: sorts by neo4j_pageRankScore already, but Colab version is authoritative
          gpuCluster: _num(r.get('gpuCluster')),
          som_cluster: _num(r.get('somCluster')), // Colab Cell 10 BMU index
          pagerank_score: _num(r.get('pageRankScoreColab')), // Colab GPU PageRank
          neo4j_isSvelteComponent: _bool(r.get('isSvelteComponent')),
          neo4j_hasSvelte4Props: _bool(r.get('hasSvelte4Props')),
          neo4j_hasSvelte4Reactive: _bool(r.get('hasSvelte4Reactive')),
          neo4j_hasSvelte4Events: _bool(r.get('hasSvelte4Events')),
          neo4j_hasRunesInPlainTs: _bool(r.get('hasRunesInPlainTs')),
          neo4j_enrichedAt: new Date().toISOString(),
        },
      };
    });

    if (job.dryRun) {
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
      job.durationMs = Date.now() - t0;
      job.qdrantUpdated = 0;
      job.qdrantSkipped = nodes.length;
      console.log(`[enrich-qdrant] Dry run — would update ${nodes.length} paths`);
      return;
    }

    // 4. Batch-update Qdrant payloads via file_path.
    //    Stage 1 restores file_path for most points, so matching here avoids the
    //    old src/ prefix mismatch from relativePath-only updates.
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ({ relativePath, payload }) => {
          if (!relativePath) {
            job.qdrantSkipped++;
            return;
          }
          try {
            const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                payload,
                filter: {
                  must: [{ key: 'file_path', match: { value: relativePath } }],
                },
              }),
              signal: AbortSignal.timeout(15_000),
            });
            if (res.ok) {
              job.qdrantUpdated++;
            } else {
              job.qdrantSkipped++;
              console.warn(
                `[enrich-qdrant] Qdrant update failed (${res.status}) for ${relativePath}`
              );
            }
          } catch (err) {
            job.qdrantSkipped++;
            console.warn(`[enrich-qdrant] Qdrant request error for ${relativePath}:`, err);
          }
        })
      );

      console.log(
        `[enrich-qdrant] Progress: ${Math.min(i + batchSize, nodes.length)}/${nodes.length} nodes processed`
      );
    }

    // Ensure payload indexes for the fields we just wrote — enables O(1) prefiltering.
    // Qdrant PUT /index is idempotent; fire-and-forget after the main update loop.
    const indexDefs = [
      {
        field_name: 'neo4j_gpuCluster',
        field_schema: { type: 'integer', lookup: true, range: false },
      },
      { field_name: 'som_cluster', field_schema: { type: 'integer', lookup: true, range: false } },
      { field_name: 'neo4j_routeType', field_schema: { type: 'keyword', lookup: true } },
      {
        field_name: 'neo4j_communityId',
        field_schema: { type: 'integer', lookup: true, range: false },
      },
    ];
    for (const def of indexDefs) {
      fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(def),
      }).catch(() => {});
    }

    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    job.durationMs = Date.now() - t0;
    console.log(
      `[enrich-qdrant] Done — ${job.qdrantUpdated} updated, ${job.qdrantSkipped} skipped in ${job.durationMs}ms`
    );
  } finally {
    await session.close();
  }
}

// ── Type coercers (Neo4j returns int/null/java-style objects) ─────────────────

function _num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function _bool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function _str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function _strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String);
}

function inferExtension(relativePath: string): string | null {
  const extension = extname(relativePath).trim();
  return extension || null;
}

function buildChunkRestorePayload(
  row: ChunkRestoreRow,
  restoredAt: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    file_path: row.relative_path,
    relativePath: row.relative_path,
    extension: row.extension ?? inferExtension(row.relative_path),
    pg_payload_restored_at: restoredAt,
  };

  if (row.symbol) payload.symbol = row.symbol;
  if (row.kind) payload.kind = row.kind;
  if (row.domain) payload.domain = row.domain;
  if (row.language) payload.language = row.language;
  if (typeof row.line_start === 'number') payload.lineStart = row.line_start;
  if (typeof row.line_end === 'number') payload.lineEnd = row.line_end;
  if (typeof row.content === 'string' && row.content.length > 0) payload.content = row.content;
  if (typeof row.gpu_cluster === 'number') payload.gpu_cluster = row.gpu_cluster;
  if (typeof row.som_cluster === 'number') payload.som_cluster = row.som_cluster;
  if (typeof row.som_bmu_row === 'number') payload.som_bmu_row = row.som_bmu_row;
  if (typeof row.som_bmu_col === 'number') payload.som_bmu_col = row.som_bmu_col;

  const tags = normalizeTags(row.tags, row.semantic_tags);
  if (tags.length > 0) payload.tags = tags;

  return payload;
}

function normalizeTags(tagsValue: unknown, semanticTags: string[] | null): string[] {
  const merged = new Set<string>();

  const addTag = (value: unknown) => {
    const text = String(value ?? '').trim();
    if (text) merged.add(text);
  };

  if (Array.isArray(tagsValue)) {
    tagsValue.forEach(addTag);
  } else if (typeof tagsValue === 'string' && tagsValue.trim()) {
    try {
      const parsed = JSON.parse(tagsValue) as unknown;
      if (Array.isArray(parsed)) parsed.forEach(addTag);
    } catch {
      addTag(tagsValue);
    }
  } else if (tagsValue && typeof tagsValue === 'object') {
    const maybeArray = (tagsValue as { tags?: unknown }).tags;
    if (Array.isArray(maybeArray)) maybeArray.forEach(addTag);
  }

  if (Array.isArray(semanticTags)) semanticTags.forEach(addTag);

  return [...merged];
}
