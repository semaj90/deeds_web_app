/**
 * LDR → ACE Bridge
 *
 * Fetches deep research results from the local-deep-research (LDR) service
 * and returns them as UnifiedRetrievalResult[] for ACE context injection.
 *
 * Export pipeline (fire-and-forget, non-blocking):
 *   LDR result → Gemma4 summary → 768-dim embed → Qdrant (chunks_web_search)
 *               → Redis ZSET (ldr:idx:deep_research) → Postgres research_summaries
 *               → TurboQuant prefix warm → Bifrost cache seed
 *
 * Browser UI surface:
 *   GET /api/research/ldr-status     → active task status
 *   GET /api/analytics/web-research  → includes LDR results
 *   /analytics#deep-research         → shows LDR cards
 */

import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';
import { searchLdrHistory, startLdrResearch, ldrQuickSummary } from './ldr-client.js';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const QDRANT_COLLECTION = 'chunks_web_search';
const PIPELINE          = 'deep_research';
const ACE_TTL           = 3600; // 1h for ACE-layer cache
const IDX_TTL           = 7200; // 2h for ZSET

function fnv1a8(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Export pipeline ───────────────────────────────────────────────────────────

/**
 * Export an LDR result to:
 *   - Qdrant chunks_web_search (768-dim embeddinggemma vectors)
 *   - Postgres research_summaries
 *   - Redis ZSET ldr:idx:deep_research
 *   - TurboQuant KV prefix warm
 *
 * Fire-and-forget — all errors swallowed.
 */
async function exportLdrResultToStorage(
  query:   string,
  summary: string,
  sources: Array<{ title: string; url: string; snippet?: string }>,
  tags:    string[],
): Promise<void> {
  const qHash = fnv1a8(query);

  try {
    // 1. Embed summary via embeddinggemma
    const { generateEmbeddingsWithTags } = await import('$lib/server/grpc/embedding-client.js');
    const texts = [summary, ...sources.slice(0, 3).map(s => `${s.title}: ${s.snippet ?? ''}`)];
    const { result: embResult, qdrantTags } = await generateEmbeddingsWithTags(texts, PIPELINE);
    const summaryVec = embResult.vectors[0];
    const allTags    = [...new Set([...tags, ...qdrantTags, 'ldr', 'deep_research', 'searxng'])];

    const redis = getRedis();

    // 2. Upsert to Qdrant chunks_web_search
    if (summaryVec && summaryVec.length > 0) {
      const pointId = parseInt(qHash, 16) % 2_147_483_647; // Qdrant uint point id
      await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          points: [{
            id:     pointId,
            vector: summaryVec,
            payload: {
              query,
              query_hash:    qHash,
              content:       summary.slice(0, 2000),
              summary:       summary.slice(0, 600),
              source:        'ldr',
              pipeline:      PIPELINE,
              entity_tags:   allTags,
              url:           sources[0]?.url ?? '',
              title:         sources[0]?.title ?? query,
              sources:       sources.slice(0, 5).map(s => s.url),
              created_at:    new Date().toISOString(),
            },
          }],
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => {});

      // 3. Redis ZSET index
      await redis.zadd('ldr:idx:deep_research', Date.now() / 1000, qHash).catch(() => {});
      await redis.expire('ldr:idx:deep_research', IDX_TTL).catch(() => {});

      // 4. Redis summary cache for ACE retrieval
      await redis.set(
        `ldr:sum:${qHash}`,
        JSON.stringify({ query, summary, sources, tags: allTags, indexedAt: new Date().toISOString() }),
        'EX', IDX_TTL,
      ).catch(() => {});
    }

    // 5. Postgres research_summaries (non-blocking)
    import('$lib/server/analytics/research-summaries-db.js').then(({ persistResearchSummaryBatch }) => {
      persistResearchSummaryBatch([{
        source:         'ldr',
        pipeline:       PIPELINE,
        entityType:     'web',
        query,
        queryHash:      qHash,
        title:          sources[0]?.title ?? null,
        url:            sources[0]?.url   ?? null,
        collection:     QDRANT_COLLECTION,
        citationLabel:  null,
        sectionPath:    null,
        jurisdiction:   null,
        summary,
        entityTags:     allTags,
        relevanceScore: 0.85,
        userId:         null,
      }]).catch(() => {});
    }).catch(() => {});

    // 6. TurboQuant KV prefix warm
    import('$lib/server/inference/turbo-prefix-cache.js').then(({ buildAndWarmPrefix }) => {
      buildAndWarmPrefix(query).catch(() => {});
    }).catch(() => {});

    // 7. Minified glyph cache
    import('$lib/server/analytics/minified-research-cache.js').then(({ backfillWebGlyphs }) => {
      backfillWebGlyphs([{
        id:             qHash,
        summary:        summary.slice(0, 300),
        entityTags:     allTags,
        pipeline:       PIPELINE,
        relevanceScore: 0.85,
      }]).catch(() => {});
    }).catch(() => {});

  } catch (err) {
    // Fully non-fatal
    console.warn('[ldr-ace-bridge] export failed:', (err as Error).message);
  }
}

// ── ACE fetch function ────────────────────────────────────────────────────────

/**
 * Fetch LDR deep research results for ACE context assembly.
 *
 * Strategy:
 *   1. Check Redis ACE cache (1h TTL) — instant return
 *   2. Check LDR history for matching completed research
 *   3. Try quick LDR summary (one-shot, ~5s)
 *   4. Fire background LDR task for future requests
 *   5. Export any found result to Qdrant/Postgres/Redis (fire-and-forget)
 *
 * @param query  The user query
 * @param limit  Max results to return (default 3)
 */
export async function fetchLdrResearchForAce(
  query:  string,
  limit = 3,
): Promise<UnifiedRetrievalResult[]> {
  const qHash = fnv1a8(query);
  const redis  = getRedis();

  // 1. ACE cache hit
  try {
    const cached = await redis.get(`ldr:ace:${qHash}`);
    if (cached) {
      const parsed = JSON.parse(cached) as UnifiedRetrievalResult[];
      return parsed.slice(0, limit);
    }
  } catch { /* cache miss */ }

  // 2. LDR history lookup
  const ldrResult = await searchLdrHistory(query).catch(() => null);

  if (ldrResult?.summary && ldrResult.summary.length > 50) {
    const results = buildAceResults(ldrResult.query, ldrResult.summary, ldrResult.sources ?? [], qHash, limit);

    // Cache ACE results
    await redis.set(`ldr:ace:${qHash}`, JSON.stringify(results), 'EX', ACE_TTL).catch(() => {});

    // Export to Qdrant/Postgres (fire-and-forget)
    const tags = extractLegalTags(`${ldrResult.query} ${ldrResult.summary}`);
    exportLdrResultToStorage(ldrResult.query, ldrResult.summary, ldrResult.sources ?? [], tags).catch(() => {});

    return results;
  }

  // 3. Quick summary (blocking, ~5s timeout)
  try {
    const quickSummary = await ldrQuickSummary(query);
    if (quickSummary && quickSummary.length > 80) {
      const results = buildAceResults(query, quickSummary, [], qHash, limit);
      await redis.set(`ldr:ace:${qHash}`, JSON.stringify(results), 'EX', ACE_TTL).catch(() => {});
      exportLdrResultToStorage(query, quickSummary, [], extractLegalTags(quickSummary)).catch(() => {});
      return results;
    }
  } catch { /* quick summary failed */ }

  // 4. Fire background task for future requests (fire-and-forget)
  startLdrResearch(query, { maxIterations: 3, searchEngines: ['searxng', 'wikipedia'] }).catch(() => {});

  return [];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildAceResults(
  query:   string,
  summary: string,
  sources: Array<{ title: string; url: string; snippet?: string }>,
  qHash:   string,
  limit:   number,
): UnifiedRetrievalResult[] {
  const results: UnifiedRetrievalResult[] = [];

  // Primary: full LDR synthesis
  results.push({
    id:      `ldr:${qHash}`,
    kind:    'kb_doc',
    source:  'qdrant',
    content: `[LDR Deep Research: ${query}]\n\n${summary}`,
    score:   0.88,
    tags:    ['ldr', 'deep_research', 'searxng', ...extractLegalTags(summary).slice(0, 4)],
    sourceId: `ldr:${qHash}`,
    metadata: {
      query,
      pipeline:   PIPELINE,
      source:     'ldr',
      sourceUrl:  sources[0]?.url ?? null,
      ldrResult:  true,
    },
  });

  // Secondary: individual sources
  for (const src of sources.slice(0, limit - 1)) {
    const srcHash = fnv1a8(src.url);
    results.push({
      id:      `ldr:src:${srcHash}`,
      kind:    'kb_doc',
      source:  'qdrant',
      content: `[Source: ${src.title}]\n${src.snippet ?? src.url}`,
      score:   0.75,
      tags:    ['ldr', 'web_source', ...extractLegalTags(src.title).slice(0, 2)],
      sourceId: src.url,
      metadata: {
        query,
        pipeline: PIPELINE,
        source:   'ldr_source',
        url:      src.url,
        title:    src.title,
      },
    });
  }

  return results.slice(0, limit);
}

const LEGAL_TAG_RE = /\b(?:statute|section\s*\d+|§\s*\d+|hearsay|negligence|tort|contract|discovery|injunction|habeas|certiorari|mandamus|res judicata|stare decisis|mens rea|actus reus|brady|voir dire|subpoena|affidavit|deposition|motion|plaintiff|defendant|appellant|appellee|precedent|jurisdiction|evidence|testimony|verdict|due process|fourth amendment|fifth amendment|sixth amendment)\b/gi;

function extractLegalTags(text: string): string[] {
  const matches = new Set<string>();
  for (const m of text.matchAll(LEGAL_TAG_RE)) {
    matches.add(m[0].toLowerCase().replace(/\s+/g, '-'));
  }
  return [...matches].slice(0, 6);
}
