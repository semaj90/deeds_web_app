import { pgRows } from '$lib/server/db/client';
/**
 * ACE Context Assembler — Central Orchestration Module
 *
 * Assembles a complete ACEContext from all data sources in parallel:
 *   1. User profile (analytics + DB)
 *   2. Case context (PostgreSQL)
 *   3. RAG chunks (Qdrant vector search)
 *   4. KAG graph neighbors (Neo4j → PostgreSQL fallback)
 *   5. Chat history (PostgreSQL/Redis)
 *   6. Entity extraction (regex + optional LLM)
 *   7. Practice area template selection
 *
 * Token budget allocation per source is defined in types.ts.
 */
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { ACEContext, ACEPrompt, ACEUserProfile } from './types.js';
import { TOKEN_BUDGET } from './types.js';
import { selectPracticeTemplate } from './practice-templates.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { getTopQueryPatterns, getWeeklySummary } from '$lib/server/analytics/event-logger.js';
import { applyStyle, type LegalPersona } from './style-adapter.js';
import { webSearch, formatWebResultsAsContext } from '$lib/server/retrieval/web-search.js';
import { searchWikipedia, formatWikipediaAsContext } from '$lib/server/retrieval/wikipedia-search.js';
import { fetchUserAnalyticsContext, fetchTopQueryTags } from './user-analytics-context.js';
import {
  getCaseGraphNeighborIds,
  buildGraphShouldFilter,
  applyGraphAuthorityScoring,
  type GraphNeighbor,
} from '$lib/server/retrieval/graph-context.js';
import { authorityChainExpansion, type EmbedFn } from '$lib/server/retrieval/authority-chain.js';
import { sortByBestScore, assignRanks } from '$lib/server/types/retrieval.js';
import {
  traceGraph,
  traceCache,
  tracePolicy,
  traceVectorSearch,
  traceEmbedding,
} from '$lib/server/observability/langfuse.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { determineACEPolicy } from './policy.js';
import { recordChunkHits, type ChunkHit } from '$lib/server/analytics/search-analytics.js';

/**
 * Assemble a complete ACE context from all data sources.
 * All fetches run in parallel with graceful fallbacks.
 */
export async function assembleACEContext(opts: {
  query: string;
  userId?: string;
  caseId?: string;
  conversationId?: string;
  maxTokens?: number;
  persona?: LegalPersona;
  enableWebSearch?: boolean;
  enableWikipedia?: boolean;
  enableCodebaseContext?: boolean;
  sectionTypes?: string[];
}): Promise<ACEContext> {
  return traceGraph(
    'ace-assembly',
    { query: opts.query.slice(0, 100), caseId: opts.caseId, userId: opts.userId },
    async () => {
      const policyStartedAt = Date.now();
      const { query, userId, caseId, conversationId } = opts;

      // Extract entities immediately (regex, no async)
      const legalTags = extractLegalTags(query);
      const entities = {
        statutes: legalTags.statutes,
        cases: legalTags.cases,
        persons: [] as string[],
        organizations: [] as string[],
        dates: [] as string[],
      };

      // Run all data fetches in parallel (includes optional web search)
      // Tiered retrieval: KB (corpus) + Case (evidence) run as one call, split internally
      const [
        userProfile,
        caseContext,
        glossaryMatches,
        ragResult,
        kagNeighbors,
        chatHistory,
        webResults,
        wikiResults,
        userAnalyticsContext,
        codebaseContext,
        topQueryTags,
      ] = await Promise.all([
        userId ? fetchUserProfile(userId) : Promise.resolve(null),
        caseId ? fetchCaseContext(caseId) : Promise.resolve(null),
        fetchGlossaryMatches(query),
        fetchRAGChunks(query, opts.sectionTypes, caseId),
        caseId ? fetchKAGNeighbors(caseId) : Promise.resolve([]),
        conversationId ? fetchChatHistory(conversationId) : Promise.resolve([]),
        opts.enableWebSearch ? webSearch(query, 3).catch(() => null) : Promise.resolve(null),
        (opts.enableWikipedia ?? true)
          ? searchWikipedia(query, 3).catch(() => null)
          : Promise.resolve(null),
        userId
          ? fetchUserAnalyticsContext(userId, query, caseId).catch(() => null)
          : Promise.resolve(null),
        opts.enableCodebaseContext
          ? fetchCodebaseContext(query, userId ?? undefined).catch(() => null)
          : Promise.resolve(null),
        fetchTopQueryTags(5).catch(() => [] as string[]),
      ]);

      const { ragChunks, kbChunks, caseChunks } = ragResult;

      // Fetch evidence metadata and connections separately (avoids hoisting issues)
      const [evidenceMetadata, evidenceConnections] = await Promise.all([
        caseId ? fetchEvidenceMetadataForCase(caseId) : Promise.resolve(null),
        caseId ? fetchEvidenceConnections(caseId) : Promise.resolve(null),
      ]);

      // Determine practice area from case or user profile
      const practiceArea = extractPracticeArea(caseContext, userProfile);
      const practiceTemplate = selectPracticeTemplate(practiceArea);

      // Generate query tags from entities + practice area + Redis hot-query leaderboard
      const queryTags: string[] = [
        ...legalTags.statutes.slice(0, 3),
        ...legalTags.cases.slice(0, 3),
        ...(practiceArea ? [practiceArea] : []),
        ...(topQueryTags ?? []).slice(0, 3),
      ];

      const toUnified = (c: RAGChunk): import('$lib/server/types/retrieval.js').UnifiedRetrievalResult => ({
        id: c.source,
        kind: 'legal_doc' as const,
        source: 'qdrant' as const,
        content: c.content,
        score: c.score,
        tags: [],
        sourceId: c.source,
      });
      const baseContext: ACEContext = {
        userProfile,
        caseContext,
        glossaryMatches,
        ragChunks: assignRanks(sortByBestScore(ragChunks.map(toUnified))),
        kbChunks: assignRanks(sortByBestScore(kbChunks.map(toUnified))),
        caseChunks: assignRanks(sortByBestScore(caseChunks.map(toUnified))),
        kagNeighbors,
        chatHistory,
        entities,
        practiceTemplate,
        queryTags,
        webSearchContext:
          [
            webResults ? formatWebResultsAsContext(webResults) : '',
            wikiResults ? formatWikipediaAsContext(wikiResults) : '',
          ]
            .filter(Boolean)
            .join('\n') || null,
        persona: opts.persona ?? 'neutral',
        evidenceMetadata,
        evidenceConnections,
        userAnalyticsContext,
        codebaseContext,
        policyDecision: null,
      };

      const policyDecision = await tracePolicy(
        'ace-context',
        { query: query.slice(0, 120), caseId, userId },
        async () => determineACEPolicy(query, baseContext)
      );

      logInference({
        type: 'policy',
        backend: 'ace-policy',
        latencyMs: Date.now() - policyStartedAt,
        cacheHit: false,
        metadata: {
          action: policyDecision.action,
          confidence: policyDecision.confidence,
          retrievalConfidence: policyDecision.retrievalConfidence,
          budgetTier: policyDecision.budget.tier,
          allowWebSearch: policyDecision.allowWebSearch,
          missingParameters: policyDecision.missingParameters,
          reasons: policyDecision.reasons,
        },
      });

      const finalContext = {
        ...baseContext,
        policyDecision,
      };

      // Fire-and-forget: persist top chunks to ace_chunks for future cache hits
      if (caseId) {
        persistACEChunks(caseId, finalContext.ragChunks, finalContext.kbChunks, finalContext.caseChunks)
          .catch((err) => console.warn('[ACE persist] failed:', (err as Error)?.message ?? err));
      }

      // Fire-and-forget: record chunk hits for analytics (Step 17)
      const hitOpts = { userId: userId ?? undefined, caseId: caseId ?? undefined };
      const aceHits: ChunkHit[] = [
        ...finalContext.kbChunks.map((c) => ({ id: c.id, score: c.score })),
        ...finalContext.caseChunks.map((c) => ({ id: c.id, score: c.score })),
      ];
      if (aceHits.length) recordChunkHits(aceHits, query, 'ace', hitOpts);
      else if (finalContext.ragChunks.length) {
        recordChunkHits(
          finalContext.ragChunks.map((c) => ({ id: c.id, score: c.score })),
          query, 'rag', hitOpts
        );
      }
      if (codebaseContext?.length) {
        recordChunkHits(
          codebaseContext.map((c) => ({
            id:         c.filePath,
            relativePath: c.filePath,
            gpuCluster: c.gpuCluster ?? null,
            score:      c.score,
          })),
          query, 'codebase', hitOpts
        );
      }

      return finalContext;
    }
  ); // end traceGraph ace-assembly
}

// ── ACE Chunks Configuration ────────────────────────────────────────────

/** Bump this when retrieval logic changes to invalidate stale cached chunks. */
const ACE_PIPELINE_VERSION = '1.0.0';
const ACE_EMBEDDING_MODEL = 'embeddinggemma:latest';
const ACE_CHUNK_TTL_HOURS = 1;
const ACE_MIN_QUALITY_SCORE = 0.5;
const ACE_MAX_CACHED_CHUNKS = 8;

// ── ACE Chunks Persistence (Write Path) ─────────────────────────────────

/**
 * Persist top-scoring retrieval chunks to ace_chunks table.
 *
 * Upsert key: ON CONFLICT (case_id, content_hash, chunk_type).
 * SHA-256 full-content hash (not MD5 of first 500 chars).
 * Generates embeddings via Ollama (fail-tolerant — stores NULL on failure).
 * Updates quality_score via GREATEST (only ever improves).
 * Preserves existing embedding via COALESCE (never overwrites with NULL).
 */
export async function persistACEChunks(
  caseId: string,
  ragChunks: RAGChunk[],
  kbChunks: RAGChunk[],
  caseChunks: RAGChunk[]
): Promise<void> {
  const startMs = Date.now();
  const { pool } = await import('$lib/server/db/client');
  const { createHash } = await import('crypto');

  // Map chunks to ace_chunks rows with type tagging
  const rows: Array<{ content: string; chunkType: string; source: string; score: number }> = [];

  for (const c of kbChunks.slice(0, 5)) {
    if (c.score >= 0.4) rows.push({ content: c.content, chunkType: 'legal', source: c.source, score: c.score });
  }
  for (const c of caseChunks.slice(0, 5)) {
    if (c.score >= 0.4) rows.push({ content: c.content, chunkType: 'evidence', source: c.source, score: c.score });
  }
  // Only store merged ragChunks if tiered chunks are empty (backward compat)
  if (!kbChunks.length && !caseChunks.length) {
    for (const c of ragChunks.slice(0, 5)) {
      if (c.score >= 0.4) rows.push({ content: c.content, chunkType: 'analysis', source: c.source, score: c.score });
    }
  }

  if (rows.length === 0) return;

  // Generate embeddings in parallel (fail-tolerant: NULL on failure)
  const embeddings = await Promise.all(
    rows.map((r) =>
      traceEmbedding(r.content, ACE_EMBEDDING_MODEL, () => getQueryEmbedding(r.content)).catch(() => null)
    )
  );
  const embeddedCount = embeddings.filter(Boolean).length;

  // Build parameterized ON CONFLICT upsert
  const values: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const contentHash = createHash('sha256').update(row.content).digest('hex');
    const emb = embeddings[i];

    // $1=case_id, $2=content, $3=chunk_type, $4=content_hash, $5=embedding_model,
    // $6=pipeline_version, $7=metadata, $8=quality_score, $9=embedding
    values.push(
      `($${pi++}::uuid, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}::jsonb, $${pi++}::real, $${pi++}::vector)`
    );
    params.push(
      caseId,
      row.content,
      row.chunkType,
      contentHash,
      ACE_EMBEDDING_MODEL,
      ACE_PIPELINE_VERSION,
      JSON.stringify({
        source: row.source,
        stored_at: new Date().toISOString(),
      }),
      row.score,
      emb ? `[${emb.join(',')}]` : null
    );
  }

  const result = await pool.query(
    `INSERT INTO ace_chunks (case_id, content, chunk_type, content_hash, embedding_model, pipeline_version, metadata, quality_score, embedding)
     VALUES ${values.join(', ')}
     ON CONFLICT (case_id, content_hash, chunk_type) DO UPDATE SET
       quality_score = GREATEST(ace_chunks.quality_score, EXCLUDED.quality_score),
       embedding = COALESCE(EXCLUDED.embedding, ace_chunks.embedding),
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     WHERE ace_chunks.quality_score < EXCLUDED.quality_score
        OR ace_chunks.embedding IS NULL`,
    params
  );

  const elapsedMs = Date.now() - startMs;
  const rowCount = result.rowCount ?? 0;
  console.log(
    `[ACE persist] case=${caseId.slice(0, 8)} candidates=${rows.length} upserted=${rowCount} embedded=${embeddedCount} elapsed=${elapsedMs}ms pipeline=${ACE_PIPELINE_VERSION}`
  );
  logInference({
    type: 'vector_search',
    backend: 'pgvector',
    collection: 'ace_chunks',
    latencyMs: elapsedMs,
    cacheHit: false,
    resultCount: rowCount,
    metadata: { op: 'persist', candidates: rows.length, embedded: embeddedCount },
  });
}

/**
 * Invalidate stale ace_chunks when pipeline version changes.
 * Called lazily on read — deletes chunks with outdated pipeline_version column.
 */
async function invalidateStaleACEChunks(
  pool: import('pg').Pool,
  caseId: string
): Promise<number> {
  const startMs = Date.now();
  try {
    const result = await pool.query(
      `DELETE FROM ace_chunks
       WHERE case_id = $1
         AND (pipeline_version IS NULL OR pipeline_version != $2)`,
      [caseId, ACE_PIPELINE_VERSION]
    );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      console.log(`[ACE invalidate] purged ${deleted} stale chunks for case ${caseId.slice(0, 8)} (pipeline != ${ACE_PIPELINE_VERSION})`);
      logInference({
        type: 'vector_search',
        backend: 'pgvector',
        collection: 'ace_chunks',
        latencyMs: Date.now() - startMs,
        cacheHit: false,
        resultCount: deleted,
        metadata: { op: 'invalidate', caseId: caseId.slice(0, 8) },
      });
    }
    return deleted;
  } catch {
    return 0;
  }
}

// ── ACE Chunks Read Path ────────────────────────────────────────────────

/**
 * Fetch cached ACE chunks from PostgreSQL for a case.
 * Returns recent, high-quality chunks that supplement Qdrant results.
 * Used as a fast read-through cache before hitting vector search.
 *
 * Invalidation: chunks with stale pipeline_version are purged on read.
 * TTL: only chunks created within ACE_CHUNK_TTL_HOURS are returned.
 * All query values are parameterized — no string interpolation.
 */
export async function fetchCachedACEChunks(
  caseId: string,
  chunkTypes?: string[]
): Promise<RAGChunk[]> {
  const startMs = Date.now();
  try {
    const { pool } = await import('$lib/server/db/client');

    // Lazy invalidation: purge stale chunks from old pipeline versions
    await invalidateStaleACEChunks(pool, caseId);

    // Build parameterized query — no template literal injection
    // $1=caseId, $2=minScore, $3=ttlInterval, $4=pipelineVersion, $5=limit, $6?=chunkTypes
    const hasTypeFilter = chunkTypes && chunkTypes.length > 0;
    const typeClause = hasTypeFilter ? `AND chunk_type = ANY($6::text[])` : '';
    const params: unknown[] = [
      caseId,
      ACE_MIN_QUALITY_SCORE,
      `${ACE_CHUNK_TTL_HOURS} hour`,
      ACE_PIPELINE_VERSION,
      ACE_MAX_CACHED_CHUNKS,
    ];
    if (hasTypeFilter) params.push(chunkTypes);

    const result = await pool.query(
      `SELECT content, chunk_type, quality_score, metadata
       FROM ace_chunks
       WHERE case_id = $1
         AND quality_score >= $2
         AND created_at > NOW() - $3::interval
         AND pipeline_version = $4
         ${typeClause}
       ORDER BY quality_score DESC
       LIMIT $5`,
      params
    );

    const elapsedMs = Date.now() - startMs;
    const isHit = result.rows.length > 0;
    if (!isHit) {
      console.log(`[ACE cache] MISS case=${caseId.slice(0, 8)} elapsed=${elapsedMs}ms`);
    } else {
      console.log(
        `[ACE cache] HIT case=${caseId.slice(0, 8)} chunks=${result.rows.length} elapsed=${elapsedMs}ms pipeline=${ACE_PIPELINE_VERSION}`
      );
    }
    logInference({
      type: 'vector_search',
      backend: 'pgvector',
      collection: 'ace_chunks',
      latencyMs: elapsedMs,
      cacheHit: isHit,
      resultCount: result.rows.length,
      metadata: { op: 'read', caseId: caseId.slice(0, 8) },
    });

    return result.rows.map((r: any) => ({
      content: String(r.content ?? ''),
      score: Number(r.quality_score ?? 0),
      source: String(r.metadata?.source ?? `ace:${r.chunk_type}`),
    }));
  } catch (err) {
    console.warn('[ACE cache] read failed:', (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * Compute a stable fingerprint of the ACE context for cache keying.
 * Changes when any meaningful input changes (new chunks, neighbors, history, etc.).
 */
function computeContextFingerprint(context: ACEContext, query: string): string {
  const parts = [
    query.slice(0, 80),
    context.caseContext?.slice(0, 40) ?? '',
    String(context.ragChunks.length),
    context.ragChunks[0]?.score.toFixed(3) ?? '0',
    String(context.kbChunks?.length ?? 0),
    String(context.caseChunks?.length ?? 0),
    String(context.kagNeighbors.length),
    String(context.chatHistory.length),
    context.chatHistory.at(-1)?.content.slice(0, 30) ?? '',
    String(context.evidenceMetadata?.length ?? 0),
    String(context.evidenceConnections?.length ?? 0),
    String(context.glossaryMatches?.length ?? 0),
    context.persona ?? 'neutral',
  ];
  // Fast non-crypto hash (FNV-1a 32-bit)
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Try Redis for a cached ACE prompt bundle. */
async function getCachedACEBundle(key: string): Promise<ACEPrompt | null> {
  return traceCache('ace-prompt-get', { key }, async () => {
    try {
      const { redis } = await import('$lib/server/redis.js');
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

/** Store ACE prompt bundle in Redis. */
async function setCachedACEBundle(
  key: string,
  prompt: ACEPrompt,
  ttlSeconds: number
): Promise<void> {
  try {
    const { redis } = await import('$lib/server/redis.js');
    await redis.set(key, JSON.stringify(prompt), 'EX', ttlSeconds);
  } catch {}
}

/**
 * Build ACE prompt with Redis caching (Stage 4 — ace_context_bundle).
 * Returns cached prompt if context fingerprint hasn't changed (2min TTL).
 * Falls through to sync buildACEPrompt() on cache miss.
 */
export async function buildACEPromptCached(context: ACEContext, query: string): Promise<ACEPrompt> {
  const fingerprint = computeContextFingerprint(context, query);
  const cacheKey = bundleCacheKey('ace', fingerprint);

  const cached = await getCachedACEBundle(cacheKey);
  if (cached) {
    console.log(`[ACE Prompt] bundle cache HIT (key: ${fingerprint})`);
    return cached;
  }

  const prompt = buildACEPrompt(context, query);

  // Cache assembled prompt (2 min — invalidated when any input tier changes)
  setCachedACEBundle(cacheKey, prompt, 120).catch(() => {});
  return prompt;
}

/**
 * Build the final ACE prompt from assembled context.
 */
export function buildACEPrompt(context: ACEContext, query: string): ACEPrompt {
  const lines: string[] = [];
  const confidenceFactors: Record<string, number> = {};
  const policyDecision = context.policyDecision ?? determineACEPolicy(query, context);
  const budgetProfile = policyDecision.budget;
  const budget = budgetProfile.allocations;
  const limits = budgetProfile.limits;

  // 1. System instructions
  lines.push('You are YorHA, a legal AI assistant. Provide accurate, well-cited legal analysis.');

  // 2. Practice template
  if (context.practiceTemplate) {
    lines.push(`\n## Practice Area Guidelines\n${context.practiceTemplate}`);
    confidenceFactors.practiceTemplate = 0.9;
  }

  // 3. User profile personalization
  if (context.userProfile) {
    const p = context.userProfile;
    const profileLines: string[] = [];
    if (p.jurisdiction) profileLines.push(`Jurisdiction: ${p.jurisdiction}`);
    if (p.practiceAreas.length) profileLines.push(`Practice areas: ${p.practiceAreas.join(', ')}`);
    if (p.preferredTone !== 'formal') profileLines.push(`Tone: ${p.preferredTone}`);
    if (p.experienceLevel) profileLines.push(`Experience: ${p.experienceLevel}`);
    if (profileLines.length) {
      lines.push(`\n## User Profile\n${profileLines.join('. ')}.`);
      confidenceFactors.userProfile = 0.7;
    }
  }

  // 4. Case context
  if (context.caseContext) {
    lines.push(
      `\n## Active Case Context\n${truncate(context.caseContext, budget.caseContext * 4)}`
    );
    confidenceFactors.caseContext = 0.95;
  }

  // 5. Glossary definitions relevant to the current query
  if (context.glossaryMatches && context.glossaryMatches.length > 0) {
    const glossaryText = context.glossaryMatches
      .slice(0, limits.glossaryEntries)
      .map((entry) => {
        const meta = [entry.category, entry.jurisdiction, entry.citation]
          .filter(Boolean)
          .join(' | ');
        const suffix = meta ? ` (${meta})` : '';
        return `- ${entry.term}: ${truncate(entry.definition, 220)}${suffix}`;
      })
      .join('\n');
    lines.push(`\n## Legal Definitions\n${glossaryText}`);
    confidenceFactors.glossary = 0.8;
  }

  // 6. Retrieved context — tiered (KB corpus first, then case evidence)
  let sourceIndex = 0;
  if (context.kbChunks?.length) {
    const kbText = context.kbChunks
      .slice(0, limits.kbChunkCount)
      .map((c) => {
        sourceIndex++;
        return `[Source ${sourceIndex} (score: ${c.score.toFixed(2)}, corpus)] ${truncate(c.content, limits.chunkChars)}`;
      })
      .join('\n');
    lines.push(`\n## Legal Corpus Context\n${kbText}`);
    confidenceFactors.kbChunks = Math.max(...context.kbChunks.map((c) => c.score));
  }
  if (context.caseChunks?.length) {
    const caseText = context.caseChunks
      .slice(0, limits.caseChunkCount)
      .map((c) => {
        sourceIndex++;
        return `[Source ${sourceIndex} (score: ${c.score.toFixed(2)}, evidence)] ${truncate(c.content, limits.chunkChars)}`;
      })
      .join('\n');
    lines.push(`\n## Case Evidence Context\n${caseText}`);
    confidenceFactors.caseChunks = Math.max(...context.caseChunks.map((c) => c.score));
  }
  // Fallback: if tiered chunks not populated, use merged ragChunks
  if (!context.kbChunks?.length && !context.caseChunks?.length && context.ragChunks.length > 0) {
    const chunksText = context.ragChunks
      .slice(0, limits.mergedChunkCount)
      .map(
        (c, i) =>
          `[Source ${i + 1} (score: ${c.score.toFixed(2)})] ${truncate(c.content, limits.chunkChars)}`
      )
      .join('\n');
    lines.push(`\n## Retrieved Context\n${chunksText}`);
    confidenceFactors.ragChunks = Math.max(...context.ragChunks.map((c) => c.score));
  }

  // 7. KAG graph neighbors
  if (context.kagNeighbors.length > 0) {
    const neighborsText = context.kagNeighbors
      .slice(0, limits.kagNeighborCount)
      .map((n) => `- ${n.title} (${n.relationship})`)
      .join('\n');
    lines.push(`\n## Related Entities\n${neighborsText}`);
    confidenceFactors.kagNeighbors = 0.8;
  }

  // 8. Chat history (last N turns)
  if (context.chatHistory.length > 0) {
    const historyText = context.chatHistory
      .slice(-limits.chatHistoryMessages)
      .map((m) => `${m.role}: ${truncate(m.content, limits.chatMessageChars)}`)
      .join('\n');
    lines.push(`\n## Conversation History\n${historyText}`);
    confidenceFactors.chatHistory = 0.6;
  }

  // 9. Entity context
  const allEntities = [
    ...context.entities.statutes.map((s) => `Statute: ${s}`),
    ...context.entities.cases.map((c) => `Case: ${c}`),
    ...context.entities.persons.map((p) => `Person: ${p}`),
  ];
  if (allEntities.length > 0) {
    lines.push(`\n## Detected Entities\n${allEntities.slice(0, 10).join(', ')}`);
    confidenceFactors.entities = 0.85;
  }

  // 10. Evidence metadata (types, forensics, entities)
  if (context.evidenceMetadata && context.evidenceMetadata.length > 0) {
    const evidenceLines = context.evidenceMetadata
      .slice(0, limits.evidenceMetadataCount)
      .map((e) => {
        const type = e.evidenceType?.toUpperCase() || 'UNKNOWN';
        const flags = e.forensicFlags?.length
          ? e.forensicFlags.some((f) => f.severity === 'high')
            ? 'Forensic: HIGH'
            : `Forensic: ${e.forensicFlags.length} flags`
          : 'No forensic flags';
        const entityCount = e.entities?.length || 0;
        const summary = e.summary ? truncate(e.summary, 80) : '';
        return `- [${type}] "${truncate(e.title, 50)}" (${e.fileType || 'unknown'}) | Entities: ${entityCount} | ${flags}${summary ? '\n  ' + summary : ''}`;
      })
      .join('\n');
    lines.push(
      `\n## Evidence on File (${context.evidenceMetadata.length} items)\n${evidenceLines}`
    );
    confidenceFactors.evidenceMetadata = 0.9;
  }

  // 11. Evidence connections/relationships
  if (context.evidenceConnections && context.evidenceConnections.length > 0) {
    const connLines = context.evidenceConnections
      .slice(0, limits.evidenceConnectionCount)
      .map((c) => {
        const strengthLabel =
          c.strength >= 0.8 ? 'STRONG' : c.strength >= 0.5 ? 'MODERATE' : 'WEAK';
        const desc = c.label || c.connectionType;
        const notes = c.notes ? ` — ${truncate(c.notes, 80)}` : '';
        return `- "${truncate(c.fromTitle, 40)}" → "${truncate(c.toTitle, 40)}" [${desc.toUpperCase()}] (${strengthLabel})${notes}`;
      })
      .join('\n');
    lines.push(
      `\n## Evidence Relationships (${context.evidenceConnections.length} connections)\n${connLines}`
    );
    confidenceFactors.evidenceConnections = 0.85;
  }

  // 12. Web search results (if available)
  if (context.webSearchContext) {
    lines.push(`\n${context.webSearchContext}`);
    confidenceFactors.webSearch = 0.6;
  }

  // 13. User analytics context (search patterns, graph neighbors, similar queries)
  if (context.userAnalyticsContext) {
    lines.push(`\n${context.userAnalyticsContext}`);
    confidenceFactors.userAnalytics = 0.5;
  }

  // 14. Codebase/AST context (dual-vector code search results)
  if (context.codebaseContext && context.codebaseContext.length > 0) {
    const codeLines = context.codebaseContext
      .slice(0, limits.codebaseContextCount)
      .map((c) => {
        const loc = c.lineStart ? `:${c.lineStart}${c.lineEnd ? `-${c.lineEnd}` : ''}` : '';
        return `[${c.filePath}${loc}] (score: ${c.score.toFixed(2)})\n${truncate(c.content, limits.chunkChars)}`;
      })
      .join('\n\n');
    lines.push(`\n## Codebase Context\n${codeLines}`);
    confidenceFactors.codebaseContext = Math.max(...context.codebaseContext.map((c) => c.score));
  }

  confidenceFactors.policy = policyDecision.confidence;

  // 15. Self-prompting instructions
  const selfPrompt =
    'After answering, briefly assess: Did you cite specific statutes/precedents? ' +
    'Is the answer jurisdiction-appropriate? Flag any uncertainty.';

  // Apply persona style to the assembled prompt
  const persona = (context as ACEContext & { persona?: LegalPersona }).persona ?? 'neutral';
  const rawPrompt = lines.join('\n');
  const styledPrompt = persona !== 'neutral' ? applyStyle(rawPrompt, persona) : rawPrompt;

  return {
    systemPrompt: styledPrompt,
    contextWindow: lines.slice(1).join('\n'), // everything after system instruction
    maxTokenBudget: budget.total,
    confidenceFactors,
    selfPromptInstructions: selfPrompt,
    preferredBackend: 'auto',
    budgetProfile,
    policyDecision,
  };
}

// ── Data Fetchers (all graceful) ────────────────────────────────────────

async function fetchUserProfile(userId: string): Promise<ACEUserProfile | null> {
  try {
    const [patterns, summary] = await Promise.all([
      getTopQueryPatterns(userId, 5),
      getWeeklySummary(userId),
    ]);

    return {
      userId,
      topIntents: summary.topIntents,
      preferredTone: 'formal',
      avgLatencyMs: summary.avgLatencyMs,
      cacheHitRate: summary.cacheHitRate,
      recentQueries: patterns.map((p) => ({
        hash: p.query_hash,
        preview: '', // privacy: hash only
      })),
      practiceAreas: [],
      jurisdiction: null,
      experienceLevel: null,
    };
  } catch (err) {
    console.warn('[ACE context] user profile fetch failed:', (err as Error)?.message ?? err);
    return null;
  }
}

async function fetchCaseContext(caseId: string): Promise<string | null> {
  try {
    const { db } = await import('$lib/server/db/client');
    const rows = await db.execute(
      sql`SELECT title, description, jurisdiction, court, status, practice_area
				FROM cases WHERE id = ${caseId} LIMIT 1`
    );
    const c = pgRows(rows)[0] as Record<string, unknown> | undefined;
    if (!c) return null;

    const parts: string[] = [];
    if (c.title) parts.push(`Title: ${c.title}`);
    if (c.jurisdiction) parts.push(`Jurisdiction: ${c.jurisdiction}`);
    if (c.court) parts.push(`Court: ${c.court}`);
    if (c.status) parts.push(`Status: ${c.status}`);
    if (c.description) parts.push(`Description: ${String(c.description).slice(0, 1200)}`);

    const glossaryRows = await db.execute(
      sql`SELECT citation_text, notes
				FROM case_library_links
				WHERE case_id = ${caseId} AND category = 'glossary_concept'
				ORDER BY created_at DESC
				LIMIT 5`
    );
    const glossaryLines = pgRows(glossaryRows)
      .map((row: any) => {
        const term = String(row.citation_text ?? '').trim();
        const definition = String(row.notes ?? '').trim();
        if (!term) return null;
        return definition ? `- ${term}: ${definition.slice(0, 160)}` : `- ${term}`;
      })
      .filter((line): line is string => Boolean(line));
    if (glossaryLines.length > 0) {
      parts.push(`Saved concepts:\n${glossaryLines.join('\n')}`);
    }
    return parts.join('\n');
  } catch (err) {
    console.warn('[ACE context] case context fetch failed:', (err as Error)?.message ?? err);
    return null;
  }
}

export async function fetchGlossaryMatches(query: string): Promise<ACEContext['glossaryMatches']> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return null;

  const candidateTerms = extractGlossaryCandidateTerms(normalizedQuery);

  try {
    const { pool } = await import('$lib/server/db/client');
    const seen = new Set<string>();
    const matches: NonNullable<ACEContext['glossaryMatches']> = [];

    try {
      const glossaryRes = await pool.query(
        `SELECT
					lg.id,
					lg.term,
					lg.definition,
					lg.category,
					lg.jurisdiction,
					NULL::text AS citation,
					CASE
						WHEN lower(lg.term) = ANY($2::text[]) THEN 1.0
						ELSE ts_rank(
							to_tsvector('english', coalesce(lg.term, '') || ' ' || coalesce(lg.definition, '')),
							websearch_to_tsquery('english', $1)
						)
					END AS confidence
				 FROM legal_glossary lg
				 WHERE (
					to_tsvector('english', coalesce(lg.term, '') || ' ' || coalesce(lg.definition, '')) @@ websearch_to_tsquery('english', $1)
					OR lower(lg.term) = ANY($2::text[])
					OR lg.term ILIKE ANY($3::text[])
				 )
				 ORDER BY confidence DESC, lg.term ASC
				 LIMIT 4`,
        [normalizedQuery, candidateTerms.exact, candidateTerms.prefix]
      );

      for (const row of glossaryRes.rows as Record<string, unknown>[]) {
        const dedupeKey = `glossary:${String(row.term ?? '').toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        matches.push({
          id: row.id ? String(row.id) : null,
          term: String(row.term ?? ''),
          definition: String(row.definition ?? ''),
          source: 'legal_glossary',
          category: row.category ? String(row.category) : null,
          jurisdiction: row.jurisdiction ? String(row.jurisdiction) : null,
          citation: null,
          confidence: row.confidence == null ? null : Number(row.confidence),
          sourceNodeId: null,
        });
      }
    } catch (err) {
      // legal_glossary not available or query failed — continue to definitions fallback
      console.warn('[ACE context] glossary text search failed:', (err as Error)?.message ?? err);
    }

    // Semantic vector search fallback — uses 768-dim embeddings on legal_glossary
    if (matches.length < 4) {
      try {
        const ollamaUrl = ENV.OLLAMA_BASE_URL;
        const embedRes = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: normalizedQuery }),
          signal: AbortSignal.timeout(5000),
        });
        if (embedRes.ok) {
          const embedData = await embedRes.json();
          const embedding = embedData.embedding as number[];
          if (embedding?.length === 768) {
            const vecStr = '[' + embedding.join(',') + ']';
            const semanticRes = await pool.query(
              `SELECT id, term, definition, category, jurisdiction,
                      1 - (embedding <=> $1::vector) AS confidence
               FROM legal_glossary
               WHERE embedding IS NOT NULL
                 AND 1 - (embedding <=> $1::vector) > 0.4
               ORDER BY embedding <=> $1::vector
               LIMIT 4`,
              [vecStr]
            );
            for (const row of semanticRes.rows as Record<string, unknown>[]) {
              const dedupeKey = `glossary:${String(row.term ?? '').toLowerCase()}`;
              if (seen.has(dedupeKey)) continue;
              seen.add(dedupeKey);
              matches.push({
                id: row.id ? String(row.id) : null,
                term: String(row.term ?? ''),
                definition: String(row.definition ?? ''),
                source: 'legal_glossary',
                category: row.category ? String(row.category) : null,
                jurisdiction: row.jurisdiction ? String(row.jurisdiction) : null,
                citation: null,
                confidence: row.confidence == null ? null : Number(row.confidence),
                sourceNodeId: null,
              });
              if (matches.length >= 4) break;
            }
          }
        }
      } catch (err) {
        // Semantic search unavailable — continue to definitions fallback
        console.warn(
          '[ACE context] glossary vector search failed:',
          (err as Error)?.message ?? err
        );
      }
    }

    if (matches.length < 4) {
      try {
        const definitionRes = await pool.query(
          `SELECT
						ld.id,
						ld.term,
						ld.defined_in_node_id,
						ld.definition_text AS definition,
						NULL::text AS category,
						NULL::text AS jurisdiction,
						ln.citation_label AS citation,
						CASE
							WHEN lower(ld.term) = ANY($2::text[]) THEN 1.0
							ELSE ts_rank(
								to_tsvector('english', coalesce(ld.term, '') || ' ' || coalesce(ld.definition_text, '')),
								websearch_to_tsquery('english', $1)
							)
						END AS confidence
					 FROM legal_definitions ld
					 LEFT JOIN legal_nodes ln ON ln.id = ld.defined_in_node_id
					 WHERE (
						to_tsvector('english', coalesce(ld.term, '') || ' ' || coalesce(ld.definition_text, '')) @@ websearch_to_tsquery('english', $1)
						OR lower(ld.term) = ANY($2::text[])
						OR ld.term ILIKE ANY($3::text[])
					 )
					 ORDER BY confidence DESC, ld.term ASC
					 LIMIT 4`,
          [normalizedQuery, candidateTerms.exact, candidateTerms.prefix]
        );

        for (const row of definitionRes.rows as Record<string, unknown>[]) {
          const dedupeKey = `definition:${String(row.term ?? '').toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          matches.push({
            id: row.id ? String(row.id) : null,
            term: String(row.term ?? ''),
            definition: String(row.definition ?? ''),
            source: 'legal_definitions',
            category: null,
            jurisdiction: null,
            citation: row.citation ? String(row.citation) : null,
            confidence: row.confidence == null ? null : Number(row.confidence),
            sourceNodeId: row.defined_in_node_id ? String(row.defined_in_node_id) : null,
          });
          if (matches.length >= 4) break;
        }
      } catch (err) {
        // legal_definitions unavailable or query failed
        console.warn('[ACE context] definitions search failed:', (err as Error)?.message ?? err);
      }
    }

    return matches.length > 0 ? matches.slice(0, 4) : null;
  } catch (err) {
    console.warn('[ACE context] glossary match assembly failed:', (err as Error)?.message ?? err);
    return null;
  }
}

// ── Tiered Retrieval: KB (stable corpus) + Case (user evidence) ──

type RAGChunk = { content: string; score: number; source: string };

/** Generate query embedding (shared by both tiers). */
async function getQueryEmbedding(query: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const embedding = data.embedding as number[];
    return embedding?.length ? embedding : null;
  } catch {
    return null;
  }
}

/** Bundle cache key for retrieval tier results. */
function bundleCacheKey(tier: 'kb' | 'case' | 'ace', queryHash: string, caseId?: string): string {
  return `${tier}_bundle:${queryHash}${caseId ? ':' + caseId.slice(0, 8) : ''}`;
}

/** Try Redis bundle cache for a retrieval tier. */
async function getCachedBundle(key: string): Promise<RAGChunk[] | null> {
  return traceCache('rag-bundle-get', { key: key.slice(0, 40) }, async () => {
    try {
      const { redis } = await import('$lib/server/redis.js');
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

/** Store retrieval bundle in Redis with tier-appropriate TTL. */
async function setCachedBundle(key: string, chunks: RAGChunk[], ttlSeconds: number): Promise<void> {
  try {
    const { redis } = await import('$lib/server/redis.js');
    await redis.set(key, JSON.stringify(chunks), 'EX', ttlSeconds);
  } catch {}
}

/**
 * KB Tier — Knowledge Base / Legal Corpus retrieval.
 * Searches: legal_documents, legal_canon_chunks
 * Stable, heavily cached (10min TTL).
 */
async function fetchKBChunks(
  embedding: number[],
  queryHash: string,
  graphFilter?: Record<string, unknown>
): Promise<RAGChunk[]> {
  // Check KB bundle cache (stable corpus → long TTL)
  const cacheKey = bundleCacheKey('kb', queryHash);
  const cached = await getCachedBundle(cacheKey);
  if (cached) {
    console.log(`[ACE KB] bundle cache HIT (${cached.length} chunks)`);
    return cached;
  }

  try {
    const { qdrant: qdrantMgr } = await import('$lib/server/vector/qdrant-manager.js');

    const searchOpts = (limit: number, threshold: number) => ({
      vector: { name: 'content', vector: embedding },
      limit,
      score_threshold: threshold,
      with_payload: true,
      ...(graphFilter ? { filter: graphFilter } : {}),
    });

    const [docResults, canonResults] = await Promise.all([
      qdrantMgr.client.search('legal_documents', searchOpts(6, 0.45)).catch(() => []),
      qdrantMgr.client.search('legal_canon_chunks', searchOpts(4, 0.4)).catch(() => []),
    ]);

    const chunks: RAGChunk[] = [
      ...docResults.map((r: any) => ({
        content: String(r.payload?.content_preview ?? r.payload?.full_text ?? ''),
        score: r.score,
        source: String(r.payload?.source_url ?? r.payload?.document_type ?? 'kb:document'),
      })),
      ...canonResults.map((r: any) => ({
        content: String(r.payload?.content ?? r.payload?.text ?? ''),
        score: r.score,
        source: String(r.payload?.source ?? 'kb:canon'),
      })),
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    // Cache KB bundle (10 min — corpus is stable)
    setCachedBundle(cacheKey, chunks, 600).catch(() => {});
    return chunks;
  } catch (err) {
    console.warn('[ACE KB] retrieval failed:', (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * Case Tier — User Evidence / Case-Specific RAG retrieval.
 * Searches: evidence_items (with optional section filtering)
 * Case-scoped, shorter cache (2min TTL, invalidated on evidence upload).
 */
async function fetchCaseChunks(
  embedding: number[],
  queryHash: string,
  caseId?: string,
  sectionTypes?: string[],
  graphFilter?: Record<string, unknown>
): Promise<RAGChunk[]> {
  // Check case bundle cache (case-scoped → short TTL)
  const cacheKey = bundleCacheKey('case', queryHash, caseId);
  const cached = await getCachedBundle(cacheKey);
  if (cached) {
    console.log(`[ACE Case] bundle cache HIT (${cached.length} chunks)`);
    return cached;
  }

  try {
    const { qdrant: qdrantMgr } = await import('$lib/server/vector/qdrant-manager.js');

    const results = sectionTypes?.length
      ? await qdrantMgr
          .sectionFilteredSearch({
            query: '', // unused when embedding provided
            queryEmbedding: embedding,
            sectionTypes,
            limit: 10,
            scoreThreshold: 0.45,
          })
          .then((r) => r.results)
          .catch(() => [])
      : await qdrantMgr.client
          .search('evidence_items', {
            vector: { name: 'content', vector: embedding },
            limit: 10,
            score_threshold: 0.45,
            with_payload: true,
            ...(graphFilter ? { filter: graphFilter } : {}),
          })
          .catch(() => []);

    const chunks: RAGChunk[] = results
      .map((r: any) => ({
        content: String(r.payload?.content ?? r.payload?.content_preview ?? ''),
        score: r.score,
        source: String(r.payload?.source ?? 'case:evidence'),
      }))
      .sort((a: RAGChunk, b: RAGChunk) => b.score - a.score)
      .slice(0, 10);

    // Cache case bundle (2 min — invalidates on new evidence upload)
    setCachedBundle(cacheKey, chunks, 120).catch(() => {});
    return chunks;
  } catch (err) {
    console.warn('[ACE Case] retrieval failed:', (err as Error)?.message ?? err);
    return [];
  }
}

/** Merged RAG retrieval (backward compat) — calls both tiers in parallel.
 *  When a caseId is provided, fetches graph neighbors BEFORE retrieval
 *  and passes them as Qdrant `should` filters + post-retrieval authority scoring.
 */
async function fetchRAGChunks(
  query: string,
  sectionTypes?: string[],
  caseId?: string
): Promise<{ ragChunks: RAGChunk[]; kbChunks: RAGChunk[]; caseChunks: RAGChunk[] }> {
  const embedding = await traceEmbedding(query, 'embeddinggemma:latest', () => getQueryEmbedding(query));
  if (!embedding) return { ragChunks: [], kbChunks: [], caseChunks: [] };

  const { createHash } = await import('crypto');
  const queryHash = createHash('md5').update(query).digest('hex').slice(0, 12);

  // Pre-retrieval KAG: fetch graph neighbors for the case to build Qdrant filters
  let graphNeighbors: GraphNeighbor[] = [];
  let graphFilter: Record<string, unknown> | undefined;
  if (caseId) {
    graphNeighbors = await getCaseGraphNeighborIds(caseId).catch(() => []);
    if (graphNeighbors.length > 0) {
      graphFilter = buildGraphShouldFilter(graphNeighbors) ?? undefined;
    }
  }

  // Fetch ace_chunks cache + Qdrant tiers in parallel
  const [kbChunks, caseChunks, aceChunks] = await Promise.all([
    fetchKBChunks(embedding, queryHash, graphFilter),
    fetchCaseChunks(embedding, queryHash, caseId, sectionTypes, graphFilter),
    caseId ? fetchCachedACEChunks(caseId) : Promise.resolve([]),
  ]);

  // Merge all sources: Qdrant tiers + ace_chunks cache, deduplicate by content prefix
  const seen = new Set<string>();
  const dedup = (chunks: RAGChunk[]) =>
    chunks.filter((c) => {
      const key = c.content.slice(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  let ragChunks = dedup([...kbChunks, ...caseChunks, ...aceChunks])
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  // Authority chain drill-down: when top results cite statutes/cases,
  // embed those citations and search for their full text (max 2 hops).
  if (embedding && ragChunks.length > 0) {
    try {
      const embedAuth: EmbedFn = (text) => getQueryEmbedding(text);
      const contextDocs = ragChunks.map((c) => ({
        content: c.content,
        similarity: c.score,
        documentId: c.source,
      }));
      const authResult = await authorityChainExpansion(embedding, contextDocs, embedAuth, {
        qdrantUrl: ENV.QDRANT_URL,
      });
      if (authResult.expanded > 0) {
        ragChunks = authResult.docs.map((d) => ({
          content: d.content,
          score: d.score,
          source: d.sourceId ?? d.id,
        }));
      }
    } catch {
      // Authority chain failed — non-fatal, continue with existing chunks
    }
  }

  // Post-retrieval KAG: apply authority-weighted scoring from graph connections
  if (graphNeighbors.length > 0 && ragChunks.length > 0) {
    const scored = applyGraphAuthorityScoring(
      ragChunks.map((c) => ({ content: c.content, similarity: c.score, documentId: c.source })),
      graphNeighbors
    );
    ragChunks = scored.map((s) => ({
      content: s.content,
      score: s.similarity,
      source: s.documentId,
    }));
  }

  return { ragChunks, kbChunks, caseChunks };
}

async function fetchKAGNeighbors(
  caseId: string
): Promise<Array<{ nodeId: string; title: string; relationship: string; score?: number }>> {
  return traceGraph('ace-kag-neighbors', { caseId }, async () => {
    // Try Neo4j first, fallback to PostgreSQL
    try {
      const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
      const driver = getNeo4jDriver();
      const session = driver.session({ database: 'neo4j' });
      try {
        const result = await session.run(
          `MATCH (c:Case {id: $caseId})-[r]-(n)
           RETURN n.id AS nodeId, n.title AS title, type(r) AS relationship
           LIMIT 10
           UNION ALL
           MATCH (c2:Case {id: $caseId})-[]-(m)-[:SIMILAR_TOPOLOGY]-(n2)
           WHERE n2.id IS NOT NULL
           RETURN n2.id AS nodeId, n2.title AS title, 'SIMILAR_TOPOLOGY' AS relationship
           LIMIT 5`,
          { caseId }
        );
        return result.records.map((rec) => ({
          nodeId: String(rec.get('nodeId') ?? ''),
          title: String(rec.get('title') ?? ''),
          relationship: String(rec.get('relationship') ?? ''),
        }));
      } finally {
        await session.close();
      }
    } catch (neo4jErr: any) {
      // Neo4j unavailable (connection refused or bolt error) — falling back to PostgreSQL graph tables.
      // To enable graph traversal, ensure NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD are set and Neo4j is running.
      if (neo4jErr?.code !== 'ServiceUnavailable' || process.env.NODE_ENV !== 'production') {
        console.warn(
          '[KAG] Neo4j unavailable, using PostgreSQL fallback:',
          neo4jErr?.message ?? neo4jErr
        );
      }
      try {
        const { db } = await import('$lib/server/db/client');
        const rows = await db.execute(
          sql`SELECT
          c.target_node_id AS node_id,
          n.title AS title,
          c.connection_type AS relationship,
          c.strength AS score
        FROM yorha_evidence_connections c
        JOIN yorha_evidence_nodes n ON n.id = c.target_node_id
        WHERE c.source_node_id IN (
          SELECT id FROM yorha_evidence_nodes WHERE case_id = ${caseId} AND status = 'active'
        )
        ORDER BY c.strength DESC, c.confidence_score DESC
        LIMIT 10`
        );
        return pgRows(rows).map((r: any) => ({
          nodeId: String(r.node_id ?? ''),
          title: String(r.title ?? ''),
          relationship: String(r.relationship ?? ''),
          score: r.score != null ? Number(r.score) : undefined,
        }));
      } catch (err) {
        console.warn(
          '[ACE context] KAG PostgreSQL fallback failed:',
          (err as Error)?.message ?? err
        );
        return [];
      }
    }
  }); // end traceGraph ace-kag-neighbors
}

async function fetchChatHistory(
  conversationId: string
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  try {
    const { db } = await import('$lib/server/db/client');
    const rows = await db.execute(
      sql`SELECT role, content FROM chat_messages
				WHERE chat_id = ${conversationId}
				ORDER BY created_at DESC
				LIMIT 20`
    );
    return pgRows(rows).reverse().map((r: any) => ({
      role: r.role as 'user' | 'assistant' | 'system',
      content: String(r.content ?? ''),
    }));
  } catch (err) {
    console.warn('[ACE context] chat history fetch failed:', (err as Error)?.message ?? err);
    return [];
  }
}

async function fetchEvidenceMetadataForCase(
  caseId: string
): Promise<ACEContext['evidenceMetadata']> {
  try {
    const { db } = await import('$lib/server/db/client');
    const rows = await db.execute(
      sql`SELECT id, title, evidence_type, file_type, metadata
				FROM evidence WHERE case_id = ${caseId}
				ORDER BY created_at DESC LIMIT 15`
    );
    return pgRows(rows).map((r: any) => {
      const meta = (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) || {};
      return {
        id: String(r.id ?? ''),
        title: String(r.title ?? ''),
        evidenceType: String(r.evidence_type ?? 'document'),
        fileType: String(r.file_type ?? ''),
        forensicFlags: Array.isArray(meta.forensicFlags) ? meta.forensicFlags : [],
        entities: Array.isArray(meta.entities) ? meta.entities.slice(0, 20) : [],
        summary: meta.summary ? String(meta.summary).slice(0, 200) : undefined,
      };
    });
  } catch (err) {
    console.warn('[ACE context] evidence metadata fetch failed:', (err as Error)?.message ?? err);
    return null;
  }
}

async function fetchEvidenceConnections(
  caseId: string
): Promise<ACEContext['evidenceConnections']> {
  try {
    const { db } = await import('$lib/server/db/client');
    const rows = await db.execute(
      sql`SELECT
				ebc.connection_type, ebc.label, ebc.notes, ebc.strength,
				ef.title AS from_title, et.title AS to_title
			FROM evidence_board_connections ebc
			JOIN evidence ef ON ef.id = ebc.from_evidence_id
			JOIN evidence et ON et.id = ebc.to_evidence_id
			WHERE ebc.case_id = ${caseId} AND ebc.is_visible = true
			ORDER BY ebc.strength DESC
			LIMIT 25`
    );
    return pgRows(rows).map((r: any) => ({
      fromTitle: String(r.from_title ?? 'Unknown'),
      toTitle: String(r.to_title ?? 'Unknown'),
      connectionType: String(r.connection_type ?? 'related'),
      label: r.label ? String(r.label) : null,
      notes: r.notes ? String(r.notes) : null,
      strength: Number(r.strength ?? 1.0),
    }));
  } catch (err) {
    console.warn(
      '[ACE context] evidence connections fetch failed:',
      (err as Error)?.message ?? err
    );
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
}

function extractGlossaryCandidateTerms(query: string): { exact: string[]; prefix: string[] } {
  const stopWords = new Set([
    'the',
    'this',
    'that',
    'with',
    'from',
    'into',
    'while',
    'about',
    'would',
    'could',
    'should',
    'where',
    'which',
    'what',
    'when',
    'your',
    'have',
    'has',
    'been',
    'were',
    'they',
    'them',
    'their',
    'there',
    'here',
    'than',
    'then',
    'also',
    'just',
    'need',
    'want',
    'case',
    'cases',
    'user',
    'report',
    'reports',
    'attached',
    'saved',
    'citation',
    'citations',
    'legal',
  ]);

  const quotedTerms = Array.from(query.matchAll(/"([^"]{3,60})"/g)).map((match) => match[1]);
  const wordTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));

  const exact = Array.from(
    new Set([...quotedTerms.map((term) => term.toLowerCase()), ...wordTerms])
  ).slice(0, 8);
  const prefix = exact.map((term) => `${term}%`);

  return { exact, prefix };
}

async function fetchCodebaseContext(
  query: string,
  userId?: string
): Promise<ACEContext['codebaseContext']> {
  try {
    // Fetch broader initial set so the reranker has candidates to work with
    const { searchCodebase } = await import('$lib/server/indexer/dual-embedder.js');
    const results = await searchCodebase(query, {
      limit: 20,
      contentWeight: 0.6,
      signatureWeight: 0.4,
    });

    if (!results.length) return null;

    // Helper to map a result (with optional rerank score override) to the context shape
    const toCtx = (
      r: (typeof results)[number],
      scoreOverride?: number
    ): NonNullable<ACEContext['codebaseContext']>[number] => ({
      filePath: String(r.chunk.path ?? r.chunk.relativePath ?? 'unknown'),
      content: String(r.chunk.content ?? ''),
      score: scoreOverride ?? r.score,
      lineStart: typeof r.chunk.lineStart === 'number' ? r.chunk.lineStart : undefined,
      lineEnd: typeof r.chunk.lineEnd === 'number' ? r.chunk.lineEnd : undefined,
      tags: Array.isArray(r.chunk.tags) ? (r.chunk.tags as string[]) : undefined,
      gpuCluster:
        r.chunk.neo4j_gpuCluster != null ? Number(r.chunk.neo4j_gpuCluster) : null,
      pageRankScore:
        r.chunk.neo4j_pageRankScore != null ? Number(r.chunk.neo4j_pageRankScore) : null,
      routeType:
        r.chunk.neo4j_routeType != null ? String(r.chunk.neo4j_routeType) : null,
      hasAuthGuard:
        r.chunk.neo4j_hasAuthGuard != null ? Boolean(r.chunk.neo4j_hasAuthGuard) : null,
    });

    // Step 3 — cross-encoder reranker pass (noFallback prevents web search on code queries)
    if (results.length > 1) {
      try {
        const { rerankWithGemma4 } = await import(
          '$lib/server/retrieval/cross-encoder-reranker.js'
        );
        const candidates = results.map((r, i) => ({
          documentId: String(r.chunk.path ?? r.chunk.relativePath ?? `code-${i}`),
          content: String(r.chunk.content ?? ''),
          retrievalScore: r.score,
          // spread neo4j payload so reranker can use metadata
          ...(r.chunk as Record<string, unknown>),
        }));
        const { results: reranked } = await rerankWithGemma4(query, candidates, {
          topN: 20,
          returnTopK: 5,
          noFallback: true,
          userId,
        });
        if (reranked.length > 0) {
          const scoreMap = new Map(reranked.map((r) => [r.doc.documentId, r.rerankScore]));
          return results
            .map((r) => {
              const docId = String(r.chunk.path ?? r.chunk.relativePath ?? '');
              return toCtx(r, scoreMap.get(docId) ?? r.score);
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .filter((r) => r.score >= 0.45);
        }
      } catch {
        // Reranker unavailable — fall through to cosine-only results below
      }
    }

    // Fallback: cosine-score filtering only
    return results
      .filter((r) => r.score >= 0.5)
      .slice(0, 5)
      .map((r) => toCtx(r));
  } catch (err) {
    console.warn('[ACE context] codebase context fetch failed:', (err as Error)?.message ?? err);
    return null;
  }
}

function extractPracticeArea(
	caseContext: string | null,
	userProfile: ACEUserProfile | null
): string | null {
	// Try case context first (look for practice_area field)
	if (caseContext) {
		const match = caseContext.match(/practice_area[:\s]+(\w[\w-]*)/i);
		if (match) return match[1].toLowerCase();
	}
	// Fall back to user profile
	if (userProfile?.practiceAreas.length) {
		return userProfile.practiceAreas[0];
	}
	return null;
}
