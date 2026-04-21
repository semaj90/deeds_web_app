/**
 * GET /api/library/health
 *
 * Vector truth checklist for the legal corpus.
 * Two corpora tracked separately:
 *
 *   A) Canon corpus   — Postgres canonical_chunks ↔ Qdrant legal_canon_chunks
 *   B) Main corpus    — Postgres legal_chunks      ↔ Qdrant legal_documents
 *
 * Fast by default (counts only, no embed round-trip).
 * Returns a structured parity report + recommended action.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CorpusParity {
  pgCount: number;
  pgEmbedded: number;
  qdrantPoints: number;
  qdrantIndexed: number;
  parityRatio: number;          // qdrantPoints / pgEmbedded (1.0 = perfect)
  status: 'healthy' | 'partial' | 'empty' | 'unknown';
  actionNeeded: string | null;
}

export interface LibraryHealthResponse {
  ok: boolean;
  searchPath: 'qdrant' | 'postgres' | 'go_service';
  canon: CorpusParity;
  main: CorpusParity;
  checkedAt: string;
  latencyMs: number;
}

// ── Qdrant collection stats helper ─────────────────────────────────────────

async function qdrantCollectionStats(
  name: string,
): Promise<{ points: number; indexed: number }> {
  try {
    const res = await fetch(`${ENV.QDRANT_URL}/collections/${name}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return { points: 0, indexed: 0 };
    const body = (await res.json()) as {
      result?: {
        points_count?: number;
        indexed_vectors_count?: number;
        vectors_count?: number;
      };
    };
    const r = body.result ?? {};
    return {
      points: r.points_count ?? 0,
      indexed: r.indexed_vectors_count ?? r.vectors_count ?? 0,
    };
  } catch {
    return { points: -1, indexed: -1 };
  }
}

// ── Parity evaluation ───────────────────────────────────────────────────────

function evalParity(pg: number, pgEmbed: number, qdrant: number): CorpusParity {
  const ratio = pgEmbed > 0 ? qdrant / pgEmbed : 0;

  let status: CorpusParity['status'];
  let actionNeeded: string | null = null;

  if (qdrant < 0) {
    status = 'unknown';
    actionNeeded = 'Qdrant unreachable — check QDRANT_URL and container health';
  } else if (pgEmbed === 0) {
    status = 'empty';
    actionNeeded = 'No embeddings in Postgres yet — run the indexer to embed chunks';
  } else if (qdrant === 0) {
    status = 'empty';
    actionNeeded = 'Qdrant collection is empty — run backfill-qdrant-legal.mjs to sync';
  } else if (ratio < 0.9) {
    status = 'partial';
    actionNeeded = `Gap: ${pgEmbed - qdrant} embedded chunks not yet in Qdrant — run backfill-qdrant-legal.mjs`;
  } else {
    status = 'healthy';
  }

  return {
    pgCount: pg,
    pgEmbedded: pgEmbed,
    qdrantPoints: qdrant,
    qdrantIndexed: 0,
    parityRatio: Math.round(ratio * 1000) / 1000,
    status,
    actionNeeded,
  };
}

// ── GET handler ─────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const startMs = performance.now();

  // Run Postgres counts + Qdrant stats in parallel
  const [
    mainPg,
    canonPg,
    mainQdrant,
    canonQdrant,
  ] = await Promise.allSettled([
    // Main corpus: total + embedded legal_chunks
    pool.query<{ total: string; embedded: string }>(
      `SELECT
         COUNT(*)                                    AS total,
         COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
       FROM legal_chunks`,
    ),
    // Canon corpus: total + embedded canonical_chunks
    pool.query<{ total: string; embedded: string }>(
      `SELECT
         COUNT(*)                                    AS total,
         COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
       FROM canonical_chunks`,
    ).catch(() => null),           // table may not exist on all deployments
    qdrantCollectionStats('legal_documents'),
    qdrantCollectionStats('legal_canon_chunks'),
  ]);

  // ── Main corpus ──────────────────────────────────────────────────────────
  const mainPgRow =
    mainPg.status === 'fulfilled' ? mainPg.value.rows[0] : null;
  const mainPgCount = Number(mainPgRow?.total ?? 0);
  const mainPgEmbed = Number(mainPgRow?.embedded ?? 0);
  const mainQStats =
    mainQdrant.status === 'fulfilled' ? mainQdrant.value : { points: -1, indexed: -1 };

  const main = evalParity(mainPgCount, mainPgEmbed, mainQStats.points);
  main.qdrantIndexed = mainQStats.indexed;

  // ── Canon corpus ─────────────────────────────────────────────────────────
  const canonPgRow =
    canonPg.status === 'fulfilled' && canonPg.value
      ? (canonPg.value as { rows: Array<{ total: string; embedded: string }> }).rows[0]
      : null;
  const canonPgCount = Number(canonPgRow?.total ?? 0);
  const canonPgEmbed = Number(canonPgRow?.embedded ?? 0);
  const canonQStats =
    canonQdrant.status === 'fulfilled' ? canonQdrant.value : { points: -1, indexed: -1 };

  const canon = evalParity(canonPgCount, canonPgEmbed, canonQStats.points);
  canon.qdrantIndexed = canonQStats.indexed;

  // ── Determine current search path ────────────────────────────────────────
  let searchPath: LibraryHealthResponse['searchPath'] = 'postgres';
  if (ENV.GO_SEARCH_URL) {
    searchPath = 'go_service';
  } else if (main.status === 'healthy') {
    searchPath = 'qdrant';
  }

  const ok = main.status !== 'unknown' && canon.status !== 'unknown';

  const response: LibraryHealthResponse = {
    ok,
    searchPath,
    canon,
    main,
    checkedAt: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startMs),
  };

  return json(response, { status: ok ? 200 : 503 });
};
