import { json } from '@sveltejs/kit';
import { getOllamaUrl, getQdrantUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';
import type {
	RetrieveCandidatesRequest,
	RetrieveCandidatesResponse,
	RetrievedChunk,
	ConfidenceLevel
} from '$lib/types/rag-source-validation';
import { productionLogger } from '$lib/server/production-logger.js';
import { apiResponses } from '$lib/server/api/response-helper.js';
import { chatRateLimiter } from '$lib/server/middleware/rate-limiter.js';
import { computeTFIDF } from '$lib/server/retrieval/tfidf-scorer.js';
import { getVectorCache, setVectorCache, getEmbeddingCache, setEmbeddingCache } from '$lib/server/vector-cache.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { retrievalKey, getCaseVersion, TTL } from '$lib/server/cache-keys.js';
import { setCache, getFromMemoryCache, getFromRedisCache } from '$lib/server/cache.js';
import { getRedis } from '$lib/server/redis.js';

// ── BM42 hybrid search collections (must have sparse 'bm25' vector configured) ──
const BM42_COLLECTIONS = ['legal_documents', 'evidence_items'];

// ── Corrective RAG: query reformulation on low-confidence retrieval ──────
const CORRECTIVE_RAG_THRESHOLD = 0.5;

async function reformulateQuery(query: string, topScore: number): Promise<string | null> {
  try {
    const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest',
        prompt: `Rephrase this legal search query to improve retrieval. Return ONLY the rephrased query, nothing else.\n\nOriginal: ${query.slice(0, 500)}`,
        stream: false,
        keep_alive: '24h',
        options: { temperature: 0.3, num_predict: 128 },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const reformulated = String(data.response ?? '').trim();
    if (reformulated.length < 3 || reformulated.length > 1000) return null;
    console.log(
      `[rag/search] Corrective RAG: top_score=${topScore.toFixed(3)}, reformulated="${reformulated.slice(0, 80)}"`
    );
    return reformulated;
  } catch {
    return null;
  }
}

const SCORING_METHODS = ['hybrid', 'vector_only', 'tfidf_only'] as const;

const ragSearchSchema = z.object({
  query: z.string().min(1, 'query is required').max(5000),
  top_k: z.number().int().min(1).max(100).optional().default(10),
  min_score: z.number().min(0).max(1).optional().default(0.3),
  use_hybrid: z.boolean().optional().default(false),
  use_rerank: z.boolean().optional().default(false),
  scoring_method: z.enum(SCORING_METHODS).optional().default('hybrid'),
  userId: z.string().max(200).optional(),
  caseId: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  conversationId: z.string().max(200).optional(),
  enableACE: z.boolean().optional().default(false),
  precomputedEmbedding: z.array(z.number()).length(768).optional(),
  sectionTypes: z
    .array(
      z.enum([
        'facts',
        'issues',
        'reasoning',
        'holding',
        'citations',
        'parties',
        'motions',
        'bibliography',
        'procedural_history',
        'sentencing',
        'judgment',
      ])
    )
    .max(11)
    .optional(),
});

const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = getOllamaUrl();

type PhaseStatus = 'success' | 'warning' | 'skipped';

type SearchPhaseDiagnostics = {
  cache: { hit: boolean; source: string };
  embedding: { status: PhaseStatus; source: string; transport: string; duration_ms?: number };
  retrieval: {
    status: PhaseStatus;
    collections: string[];
    sectionFilterUsed: boolean;
    hybridUsed: boolean;
    totalCandidates: number;
  };
  ace: { status: PhaseStatus; enabled: boolean; metadata?: Record<string, unknown> };
  corrective_rag: {
    status: PhaseStatus;
    attempted: boolean;
    reformulatedQuery?: string;
    originalTopScore?: number;
  };
  dag: { status: PhaseStatus; enabled: boolean };
};

function toConfidence(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'high';
  if (score >= 0.7) return 'medium';
  if (score >= 0.5) return 'low';
  return 'marginal';
}

/**
 * Extract simple keyword tags from a query string.
 * Used for tag-based score boosting (ported from Python rag_search.py).
 */
function extractQueryTags(query: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'about',
    'between',
    'through',
    'after',
    'before',
    'above',
    'below',
    'and',
    'or',
    'not',
    'but',
    'if',
    'then',
    'than',
    'so',
    'no',
    'nor',
    'too',
    'very',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'how',
    'when',
    'where',
    'why',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'only',
    'own',
    'same',
    'just',
    'also',
    'any',
    'me',
    'my',
    'i',
    'you',
    'your',
    'he',
    'she',
    'it',
    'we',
    'they',
    'them',
    'his',
    'her',
    'its',
    'our',
  ]);
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Apply tag-based score boosting to search results.
 * Ported from Python rag_search.py — chunks whose payload tags/entities
 * overlap with query keywords get a multiplicative score boost.
 *
 * @param chunks - Search results with score and payload
 * @param queryTags - Extracted query keywords
 * @param boostFactor - Multiplier per matched tag (default 1.15 = 15% boost)
 * @param maxBoost - Cap on total boost multiplier (default 1.5 = 50% max)
 */
function applyTagBoost(
  chunks: RetrievedChunk[],
  queryTags: string[],
  boostFactor = 1.15,
  maxBoost = 1.5
): void {
  if (queryTags.length === 0) return;

  const tagSet = new Set(queryTags);

  for (const chunk of chunks) {
    // Collect tags from payload fields that might contain relevant keywords
    const chunkTags: string[] = [
      ...(chunk.related_entities ?? []),
      ...(chunk.section ? [chunk.section] : []),
      ...(chunk.source_title ? chunk.source_title.toLowerCase().split(/\s+/) : []),
    ].map((t) => String(t).toLowerCase());

    // Count overlapping tags
    let matchCount = 0;
    for (const ct of chunkTags) {
      if (tagSet.has(ct)) matchCount++;
    }

    if (matchCount > 0) {
      const boost = Math.min(Math.pow(boostFactor, matchCount), maxBoost);
      chunk.score = Math.min(chunk.score * boost, 1.0);
      chunk.confidence = toConfidence(chunk.score);
    }
  }
}

/**
 * POST /api/rag/search
 * Step 1: Search knowledge base for relevant chunks via Qdrant + Ollama embeddings
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  // Rate limit: 30 requests/min per client
  const rateCheck = chatRateLimiter.check(request);
  if (!rateCheck.allowed) {
    return apiResponses.serviceUnavailable(
      `Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)}s`
    );
  }

  const startTime = performance.now();

  try {
    const raw = await request.json();
    const parsed = ragSearchSchema.safeParse(raw);
    if (!parsed.success) {
      return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const body = parsed.data;
    const {
      query,
      top_k,
      min_score,
      use_hybrid,
      use_rerank,
      scoring_method,
      userId,
      caseId,
      conversationId,
      enableACE,
      precomputedEmbedding,
      sectionTypes,
    } = body;

    const diagnostics: SearchPhaseDiagnostics = {
      cache: { hit: false, source: 'vector-cache' },
      embedding: { status: 'skipped', source: 'unknown', transport: 'unknown' },
      retrieval: {
        status: 'skipped',
        collections: [],
        sectionFilterUsed: Boolean(sectionTypes?.length),
        hybridUsed: false,
        totalCandidates: 0,
      },
      ace: { status: enableACE ? 'skipped' : 'skipped', enabled: enableACE },
      corrective_rag: { status: 'skipped', attempted: false },
      dag: { status: 'skipped', enabled: url.searchParams.get('dag') === 'true' },
    };

    // 0a. Versioned retrieval cache check (case-scoped, version-stamped)
    const effectiveCaseId = caseId || body.case_id;
    let caseVersion = 0;
    if (effectiveCaseId) {
      caseVersion = await getCaseVersion(effectiveCaseId);
      const rKey = retrievalKey.forQuery(effectiveCaseId, query, caseVersion);
      const memHit = getFromMemoryCache(rKey);
      if (memHit.found) {
        diagnostics.cache = { hit: true, source: 'retrieval-cache-memory' };
        return json({
          ...(memHit.value as Record<string, unknown>),
          diagnostics,
          cache: { hit: true, source: 'retrieval-cache-memory', caseVersion },
        });
      }
      try {
        const redisHit = await getFromRedisCache<Record<string, unknown>>(rKey);
        if (redisHit) {
          diagnostics.cache = { hit: true, source: 'retrieval-cache-redis' };
          return json({
            ...redisHit,
            diagnostics,
            cache: { hit: true, source: 'retrieval-cache-redis', caseVersion },
          });
        }
      } catch {
        /* miss — continue */
      }
    }

    // 0b. Fallback: legacy vector result cache (Memory → Redis) for identical query+options
    const cacheOptions = { limit: top_k, threshold: min_score, documentType: caseId };
    const { entry: cachedResult } = await getVectorCache(query, cacheOptions);
    if (cachedResult) {
      const cached = cachedResult.results[0] as Record<string, unknown>;
      diagnostics.cache = { hit: true, source: 'vector-cache' };
      return json({
        ...cached,
        diagnostics: cached.diagnostics ?? diagnostics,
        cache: { hit: true, source: 'vector-cache', age_ms: Date.now() - cachedResult.ts },
      });
    }

    // 1. Generate embedding (use precomputed from client if provided, else server-side 4-tier chain)
    const embedStart = performance.now();
    let embedding: number[];
    let embeddingSource = 'server';
    let embeddingTransport: string = 'http-ollama';

    if (
      precomputedEmbedding &&
      Array.isArray(precomputedEmbedding) &&
      precomputedEmbedding.length === 768
    ) {
      embedding = precomputedEmbedding;
      embeddingSource = 'client-precomputed';
      embeddingTransport = 'client-onnx';
      diagnostics.embedding = {
        status: 'success',
        source: embeddingSource,
        transport: embeddingTransport,
      };
    } else {
      try {
        // Use 4-tier fallback chain: gRPC → QUIC → HTTP batch → HTTP sequential
        const result = await traceEmbedding(query, 'embeddinggemma:latest', async () => {
          const embResult = await generateEmbeddings([query]);
          embeddingTransport = embResult.source; // 'grpc' | 'quic' | 'http-ollama'
          return embResult.vectors[0] as unknown as Float32Array;
        });
        embedding = Array.from(result);
        diagnostics.embedding = {
          status: 'success',
          source: 'server-generated',
          transport: embeddingTransport,
        };

        // Also cache in vector-cache for backward compatibility
        setEmbeddingCache(query, embedding, 'embeddinggemma:latest').catch(() => {});
      } catch {
        // Fallback to direct embedText if 4-tier chain fails entirely
        try {
          const embeddingArray = await embedText(query);
          embedding = Array.from(embeddingArray);
          embeddingTransport = 'http-ollama-fallback';
          diagnostics.embedding = {
            status: 'warning',
            source: 'server-fallback',
            transport: embeddingTransport,
          };
          setEmbeddingCache(query, embedding, 'embeddinggemma:latest').catch(() => {});
        } catch (err2) {
          return apiResponses.badGateway('Embedding generation failed');
        }
      }
    }

    const embeddingTime = performance.now() - embedStart;
    diagnostics.embedding.duration_ms = Math.round(embeddingTime);

    // 2. Search across Qdrant collections
    const collections = ['legal_documents', 'evidence_items'];
    const allChunks: RetrievedChunk[] = [];
    let hybridSearchUsed = false;

    // 2a. BM42 hybrid search (dense + sparse RRF fusion) for supported collections
    if (use_hybrid) {
      for (const collection of BM42_COLLECTIONS) {
        try {
          const hybridResult = await qdrant.sparseHybridSearch({
            query,
            queryEmbedding: embedding,
            collection,
            limit: top_k,
            scoreThreshold: min_score,
          });
          for (const r of hybridResult.results) {
            const payload = (r as Record<string, any>).payload ?? {};
            allChunks.push({
              chunk_id: `${collection}:${r.id}`,
              text: payload.content ?? payload.text ?? payload.snippet ?? payload.summary ?? '',
              snippet: (payload.content ?? payload.text ?? payload.snippet ?? '').slice(0, 300),
              score: r.score,
              dense_score: r.score,
              confidence: toConfidence(r.score),
              source_type: payload.source_type ?? payload.source ?? 'document',
              source_id: String(payload.chunk_id ?? r.id),
              source_title:
                payload.title ??
                payload.doc_title ??
                payload.heading ??
                payload.file_path ??
                payload.name ??
                'Unknown',
              source_url: payload.url ?? undefined,
              page_num: payload.page_num ?? payload.page_start ?? undefined,
              section: payload.section ?? payload.heading ?? undefined,
              has_image: !!payload.has_image,
              has_table: !!payload.has_table,
              related_entities: payload.entities ?? [],
              graph_neighbors: [],
            });
          }
          if (hybridResult.metadata.searchType === 'hybrid-rrf') hybridSearchUsed = true;
          diagnostics.retrieval.collections.push(collection);
        } catch {
          // BM42 unavailable for this collection — will fall through to dense-only below
        }
      }
    }

    // 2b. Dense-only search for remaining collections (skip BM42 collections if already searched)
    const bm42Set = use_hybrid ? new Set(BM42_COLLECTIONS) : new Set<string>();
    for (const collection of collections) {
      if (bm42Set.has(collection)) continue;
      try {
        const searchResp = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: { name: 'content', vector: embedding },
            limit: top_k,
            with_payload: true,
            score_threshold: min_score,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!searchResp.ok) continue;

        const searchData = await searchResp.json();
        const results = searchData?.result ?? [];

        for (const r of results) {
          const payload = r.payload ?? {};
          allChunks.push({
            chunk_id: `${collection}:${r.id}`,
            text: payload.content ?? payload.text ?? payload.snippet ?? payload.summary ?? '',
            snippet: (payload.content ?? payload.text ?? payload.snippet ?? '').slice(0, 300),
            score: r.score,
            dense_score: r.score,
            confidence: toConfidence(r.score),
            source_type: payload.source_type ?? payload.source ?? 'document',
            source_id: String(payload.chunk_id ?? r.id),
            source_title:
              payload.title ??
              payload.doc_title ??
              payload.heading ??
              payload.file_path ??
              payload.name ??
              'Unknown',
            source_url: payload.url ?? undefined,
            page_num: payload.page_num ?? payload.page_start ?? undefined,
            section: payload.section ?? payload.heading ?? undefined,
            has_image: !!payload.has_image,
            has_table: !!payload.has_table,
            related_entities: payload.entities ?? [],
            graph_neighbors: [],
          });
        }
        diagnostics.retrieval.collections.push(collection);
      } catch {
        // Skip unavailable collections
      }
    }

    // 2b. Section-filtered evidence search (when sectionTypes provided)
    if (sectionTypes?.length) {
      try {
        const sectionResults = await qdrant.sectionFilteredSearch({
          query,
          queryEmbedding: embedding,
          sectionTypes,
          caseId: caseId || body.case_id,
          limit: top_k,
          scoreThreshold: min_score,
        });
        for (const r of sectionResults.results) {
          const payload = (r as Record<string, any>).payload ?? {};
          allChunks.push({
            chunk_id: `evidence_items:${r.id}`,
            text: payload.content_preview ?? payload.content ?? payload.text ?? '',
            snippet: (payload.content_preview ?? payload.content ?? '').slice(0, 300),
            score: r.score,
            dense_score: r.score,
            confidence: toConfidence(r.score),
            source_type: 'evidence',
            source_id: String(r.id),
            source_title: payload.title ?? payload.file_name ?? 'Evidence',
            section: payload.section_type ?? undefined,
            has_image: false,
            has_table: false,
            related_entities: [],
            graph_neighbors: [],
          });
        }
      } catch {
        // Section-filtered search unavailable — non-fatal
      }
    }
    diagnostics.retrieval.hybridUsed = hybridSearchUsed;

    // Apply tag-based score boosting before final sort
    const queryTags = extractQueryTags(query);
    applyTagBoost(allChunks, queryTags);
    const tfidfMap = new Map();
    if (scoring_method !== 'vector_only') {
      const tR = computeTFIDF(
        query,
        allChunks.map((ch) => ({ id: ch.chunk_id, text: ch.text }))
      );
      for (const t of tR) {
        tfidfMap.set(t.id, t.tfidfScore);
      }
    }

    // Sort by boosted score descending and limit
    // 4. Combine scores: hybrid = 0.7*vector + 0.3*tfidf
    for (const chunk of allChunks) {
      const vs = chunk.score;
      const ts = tfidfMap.get(chunk.chunk_id) || 0;
      chunk.vector_score = vs;
      chunk.tfidf_score = ts;
      if (scoring_method === 'tfidf_only') {
        chunk.score = ts;
      } else if (scoring_method === 'hybrid') {
        chunk.score = 0.7 * vs + 0.3 * ts;
      }
      chunk.confidence = toConfidence(chunk.score);
    }
    // ACE context enrichment (opt-in: boosts chunks matching legal entities)
    let aceMetadata: Record<string, unknown> | null = null;
    if (enableACE && query) {
      try {
        const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
        const aceContext = await assembleACEContext({
          query,
          userId: userId || undefined,
          caseId: caseId || undefined,
          conversationId: conversationId || undefined,
        });
        const aceEntityTags = [
          ...(aceContext.entities?.statutes ?? []),
          ...(aceContext.entities?.cases ?? []),
          ...(aceContext.entities?.persons ?? []),
        ].map((e: string) => e.toLowerCase());
        if (aceEntityTags.length > 0) {
          applyTagBoost(allChunks, aceEntityTags, 1.1, 1.3);
        }
        aceMetadata = {
          entityCount: aceEntityTags.length,
          kagNeighborCount: aceContext.kagNeighbors?.length ?? 0,
        };
        diagnostics.ace = { status: 'success', enabled: true, metadata: aceMetadata };
      } catch (err) {
        console.warn('[rag/search] ACE enrichment failed (non-fatal):', err);
        diagnostics.ace = { status: 'warning', enabled: true };
      }
    } else {
      diagnostics.ace = { status: 'skipped', enabled: enableACE };
    }

    allChunks.sort((a, b) => b.score - a.score);

    // ── Corrective RAG: reformulate + retry when top score is low ──────
    let correctiveMetadata: { reformulatedQuery?: string; originalTopScore?: number } | null = null;
    const topScore = allChunks[0]?.score ?? 0;
    if (topScore < CORRECTIVE_RAG_THRESHOLD && allChunks.length > 0) {
      diagnostics.corrective_rag = {
        status: 'warning',
        attempted: true,
        originalTopScore: topScore,
      };
      const reformulated = await reformulateQuery(query, topScore);
      if (reformulated && reformulated !== query) {
        try {
          const retryEmbedding = await embedText(reformulated);
          const retryVec = Array.from(retryEmbedding);
          const seenIds = new Set(allChunks.map((c) => c.chunk_id));
          for (const collection of collections) {
            try {
              const retryResp = await fetch(
                `${QDRANT_URL}/collections/${collection}/points/search`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    vector: retryVec,
                    limit: top_k,
                    with_payload: true,
                    score_threshold: min_score,
                  }),
                  signal: AbortSignal.timeout(5000),
                }
              );
              if (!retryResp.ok) continue;
              const retryData = await retryResp.json();
              for (const r of retryData?.result ?? []) {
                const chunkId = `${collection}:${r.id}`;
                if (seenIds.has(chunkId)) continue;
                seenIds.add(chunkId);
                const payload = r.payload ?? {};
                allChunks.push({
                  chunk_id: chunkId,
                  text: payload.content ?? payload.text ?? payload.summary ?? '',
                  snippet: (payload.content ?? payload.text ?? '').slice(0, 300),
                  score: r.score,
                  dense_score: r.score,
                  confidence: toConfidence(r.score),
                  source_type: payload.source_type ?? 'document',
                  source_id: String(r.id),
                  source_title: payload.title ?? payload.file_path ?? payload.name ?? 'Unknown',
                  source_url: payload.url ?? undefined,
                  page_num: payload.page_num ?? undefined,
                  section: payload.section ?? undefined,
                  has_image: !!payload.has_image,
                  has_table: !!payload.has_table,
                  related_entities: payload.entities ?? [],
                  graph_neighbors: [],
                });
              }
            } catch {
              /* retry collection unavailable */
            }
          }
          allChunks.sort((a, b) => b.score - a.score);
          correctiveMetadata = { reformulatedQuery: reformulated, originalTopScore: topScore };
          diagnostics.corrective_rag = {
            status: 'success',
            attempted: true,
            reformulatedQuery: reformulated,
            originalTopScore: topScore,
          };
        } catch {
          // Corrective retry failed — non-fatal, proceed with original results
          diagnostics.corrective_rag = {
            status: 'warning',
            attempted: true,
            originalTopScore: topScore,
          };
        }
      } else {
        diagnostics.corrective_rag = {
          status: 'skipped',
          attempted: true,
          originalTopScore: topScore,
        };
      }
    } else {
      diagnostics.corrective_rag = {
        status: 'skipped',
        attempted: false,
        originalTopScore: topScore,
      };
    }

    let topChunks = allChunks.slice(0, top_k);

    // DAG reordering: cited documents appear before citing documents (default: on)
    const enableDAG = url.searchParams.get('dag') !== 'false';
    if (enableDAG && topChunks.length > 1) {
      try {
        const { orderByDependency, extractCitationRefs } = await import(
          '$lib/server/retrieval/document-dag.js'
        );
        const knownIds = new Set(topChunks.map((c) => c.source_id));
        const dagDocs = topChunks.map((c) => ({
          id: c.source_id,
          title: c.source_title ?? '',
          score: c.score,
          citations: extractCitationRefs(c.text, knownIds),
        }));
        const dagResult = orderByDependency(dagDocs);
        const idOrder = dagResult.ordered.map((d) => d.id);
        topChunks = topChunks.sort(
          (a, b) => idOrder.indexOf(a.source_id) - idOrder.indexOf(b.source_id)
        );
        diagnostics.dag = { status: 'success', enabled: true };
      } catch (err) {
        console.warn('[rag/search] DAG reordering failed (non-fatal):', err);
        diagnostics.dag = { status: 'warning', enabled: true };
      }
    } else {
      diagnostics.dag = { status: 'skipped', enabled: enableDAG };
    }

    diagnostics.retrieval.status = allChunks.length > 0 ? 'success' : 'warning';
    diagnostics.retrieval.totalCandidates = allChunks.length;

    const response: RetrieveCandidatesResponse & {
      corrective_rag?: unknown;
      hybrid_search?: string;
      embedding_transport?: string;
      diagnostics?: SearchPhaseDiagnostics;
    } = {
      query_id: crypto.randomUUID(),
      query,
      case_id: body.case_id,
      chunks: topChunks,
      total_found: allChunks.length,
      search_time_ms: Math.round(performance.now() - startTime),
      embedding_time_ms: Math.round(embeddingTime),
      rerank_time_ms: use_rerank ? 0 : undefined,
      embedding_model:
        embeddingSource === 'client-precomputed'
          ? 'embeddinggemma-onnx-client'
          : 'embeddinggemma:latest',
      rerank_model: use_rerank ? 'none' : undefined,
      scoring_method: scoring_method,
      hybrid_search: hybridSearchUsed ? 'bm42-rrf' : undefined,
      ace: aceMetadata ?? undefined,
      corrective_rag: correctiveMetadata ?? undefined,
      embedding_transport: embeddingTransport,
      diagnostics,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget: persist search query to DB for analytics/audit
    import('$lib/server/db/client')
      .then(async ({ db: pgDb }) => {
        const { ragMessages } = await import('$lib/server/db/schema-postgres.js');
        await pgDb.insert(ragMessages).values({
          content: query,
          role: 'user',
          sessionId: response.query_id,
        });
      })
      .catch(() => {});

    // Cache retrieval bundle separately (versioned, case-scoped)
    if (effectiveCaseId) {
      const rKey = retrievalKey.forQuery(effectiveCaseId, query, caseVersion);
      setCache(rKey, response, TTL.RETRIEVAL * 1000).catch(() => {});
    } else {
      const rKey = retrievalKey.global(query);
      setCache(rKey, response, TTL.RETRIEVAL * 1000).catch(() => {});
    }

    // Legacy vector-cache (backward compat, 30min TTL)
    setVectorCache(
      query,
      [response],
      {
        searchTime: response.search_time_ms,
        totalResults: response.total_found,
        model: 'embeddinggemma:latest',
        distanceMetric: 'cosine',
      },
      cacheOptions
    ).catch(() => {});

    return json(response);
  } catch (err) {
    console.error('[rag/search] Error:', err);
    return apiResponses.serverError('Search failed');
  }
};
