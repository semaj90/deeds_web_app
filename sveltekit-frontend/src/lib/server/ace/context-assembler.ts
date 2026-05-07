import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgRows, db } from '$lib/server/db/client';
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
import { aceRetrievalRuns } from '$lib/server/db/schema/metadata-spine.js';
import type { ACEContext, ACEPrompt, ACEUserProfile, RerankBreakdown, ClusterContextPacket, TileEngineTrace } from './types.js';
import { TOKEN_BUDGET } from './types.js';
import { selectPracticeTemplate } from './practice-templates.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { getTopQueryPatterns, getWeeklySummary } from '$lib/server/analytics/event-logger.js';
import { applyStyle, type LegalPersona } from './style-adapter.js';
import {
  webSearch,
  formatWebResultsAsContext,
  webSearchToUnified,
} from '$lib/server/retrieval/web-search.js';
import {
  searchWikipedia,
  formatWikipediaAsContext,
} from '$lib/server/retrieval/wikipedia-search.js';
import { fetchUserAnalyticsContext, fetchTopQueryTags } from './user-analytics-context.js';
import {
  getCaseGraphNeighborIds,
  buildGraphShouldFilter,
  applyGraphAuthorityScoring,
  type GraphNeighbor,
} from '$lib/server/retrieval/graph-context.js';
import { authorityChainExpansion, type EmbedFn } from '$lib/server/retrieval/authority-chain.js';
import { SYSTEM_YORHA_LEGAL } from '$lib/ai/prompts.js';
import { sortByBestScore, assignRanks } from '$lib/server/types/retrieval.js';
import {
  traceGraph,
  traceCache,
  tracePolicy,
  traceVectorSearch,
  traceEmbedding,
} from '$lib/server/observability/langfuse.js';
import { searchByError } from '$lib/server/indexer/dual-embedder.js';
import { rerankWithGemma4 } from '../retrieval/cross-encoder-reranker.js';
import { applyTopologicalBoostAsync } from '../retrieval/topological-search.js';
import { queryBmuCached } from '$lib/server/gpu/libtorch-bridge.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { determineACEPolicy } from './policy.js';
import {
  recordChunkHits,
  recordQueryLog,
  queryHash,
  type ChunkHit,
} from '$lib/server/analytics/search-analytics.js';
import { applyQloraBoost } from '$lib/server/retrieval/qlora-boost.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { rerankChunksGRPO } from '$lib/server/retrieval/langextract-reranker.js';
import { recallPastChats } from './chat-memory.js';
import {
  getLlmOutputHitsBulk,
  recordLlmOutputHit,
} from '$lib/server/cache/code-llm-index.js';
import { getRedis } from '$lib/server/redis.js';
import { aceTopkKey } from './cache-keys.js';
import { getCommunityContext, getDirectoryKAGContext } from '$lib/server/graph/community-graph.js';
import { getGraphIntelContext } from '$lib/server/graph/graph-intel.js';
import type { ACPKnowledgeSearchResult } from '$lib/services/knowledge-search/ACPToolRegistry.js';
import { applyClusterCoherenceBoost, extractDominantCluster } from '$lib/server/retrieval/cluster-aware-reranker.js';
import { getSomCellSummary } from '$lib/server/indexer/som-summary.js';
import { getClusterBowTexture, getSomBowTexture } from '$lib/server/langextract/bag-cache.js';
import { classifyQuerySection, analyzeACEFlow } from '$lib/server/analysis/hmm-ace-analyzer.js';
import { buildAdaptivePrefetch } from '$lib/server/ace/adaptive-prefetch.js';
import { nearestCluster } from '$lib/server/retrieval/centroid-cache.js';
import {
  computeManifold4Centroid,
  searchManifold4,
  blendManifoldScore,
} from '$lib/server/retrieval/manifold4-search.js';
import type { Manifold4Point } from '$lib/server/retrieval/manifold4-search.js';
import { classifyQuery, TOPO_CLASS, TOPO_CLASS_LABEL } from '$lib/server/tensor/topology-byte-mapper.js';
import {
  quaternionSimilarity,
  toUnitQuaternion,
  manifold4ToQuaternion,
} from '$lib/server/search/quaternion-manifold.js';
import {
  getTopoCandidates,
  setTopoCandidates,
  buildTopoPrefilterStats,
  queryHash as topoQueryHash,
} from '$lib/server/cache/topo-candidate-cache.js';
import type { TopoPrefilterStats } from '$lib/server/cache/topo-candidate-cache.js';
import { aceCodeKey, TTL } from '$lib/server/cache-keys.js';
import { fetchDeepImportGraphExpansion } from './graph-expander.js';
import { runRetrievalLanes, type MultiLaneOutput } from './retrieval-lanes.js';
import { buildRetrievalEdge, insertHyperedge } from '$lib/server/hypergraph/hypergraph-builder.js';
import { recordLastQuery, recordEngramTransition } from '$lib/server/search/engram-bigram.js';
import { tokenizeBowQuery, weightedBowOverlapScore, boundedBowBoost } from '$lib/server/search/bow-utils.js';

// ── Cluster tags artifact reader (shared with multi-lane-retrieval) ──────────
import {
  readLatestQdrantClusterTags,
  readLatestRelationSynthesis,
  type ClusterTagsEntry,
} from './cluster-tags-cache.js';

/**
 * Derives per-cluster Qdrant tag context from already-retrieved codebase chunks.
 * Only clusters that appeared in this retrieval pass are included (gap_rel_004).
 */
function buildClusterContext(
  codebaseCtx: ACEContext['codebaseContext']
): ClusterContextPacket[] | null {
  if (!codebaseCtx?.length) return null;

  const byCluster = new Map<number, { tags: Map<string, number>; count: number; files: Set<string> }>();
  for (const c of codebaseCtx) {
    const cid = c.gpuCluster;
    if (cid == null) continue;
    let entry = byCluster.get(cid);
    if (!entry) { entry = { tags: new Map(), count: 0, files: new Set() }; byCluster.set(cid, entry); }
    entry.count++;
    if (c.filePath) entry.files.add(c.filePath);
    for (const tag of c.tags ?? []) {
      entry.tags.set(tag, (entry.tags.get(tag) ?? 0) + 1);
    }
  }

  if (byCluster.size === 0) return null;

  const TOPO_HINT: Record<string, string> = {
    cache: 'Redis/cache layer', vector: 'vector store / embeddings', graph: 'Neo4j graph layer',
    db: 'database / Drizzle ORM', inference: 'LLM inference', frontend: 'SvelteKit frontend',
    ace: 'ACE retrieval spine', server: 'server-side logic', routes: 'API routes',
  };

  // Build index from cluster tags artifact for enrichment
  const artifactEntries = readLatestQdrantClusterTags();
  const artifactByKey = new Map<string, ClusterTagsEntry>();
  for (const e of artifactEntries) artifactByKey.set(e.clusterKey, e);

  return [...byCluster.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)  // max 3 clusters per user spec
    .map(([clusterId, { tags, count, files }]) => {
      const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
      const topoClass = topTags.find((t) => t in TOPO_HINT) ?? 'general';
      const hint = TOPO_HINT[topoClass] ?? topoClass;
      const clusterKey = `cluster:gpu:${clusterId}`;
      const artifact = artifactByKey.get(clusterKey);
      // Enrich from artifact: prefer artifact's richer tag list and topo classes
      const enrichedTags = artifact
        ? artifact.topTags.map((t) => t.tag).slice(0, 8)
        : topTags;
      const topFiles = [...files]
        .slice(0, 5)
        .map((f) => f.split('/').pop() ?? f);
      const artifactTopFiles = (artifact?.topFiles ?? [])
        .filter((f): f is string => typeof f === 'string')
        .map((f) => f.split('/').pop() ?? f)
        .slice(0, 5);
      const topoClasses = artifact?.topoClasses ?? [topoClass];
      const suggestion = artifact
        ? `Cluster ${clusterKey} (${artifact.fileCount} files). Domains: ${topoClasses.slice(0, 3).join(', ')}. Tags: ${enrichedTags.slice(0, 4).join(', ')}.`
        : `Cluster ${clusterId} (${hint}): focus on ${topTags.slice(0, 3).join(', ')} patterns.`;
      return {
        clusterId,
        clusterKey,
        topoClass,
        topoClasses,
        topTags: enrichedTags,
        chunkCount: count,
        topFiles: topFiles.length ? topFiles : artifactTopFiles,
        synthesisSuggestion: suggestion,
        communityId: null,
        graphAuthorityScore: null,
      };
    });
}

/**
 * Enrich ClusterContextPackets with GDS data from Redis ace:authority:top.
 * Fire-and-forget safe — on any error returns packets unchanged.
 */
async function enrichClusterContextWithGds(
  packets: ClusterContextPacket[] | null
): Promise<ClusterContextPacket[] | null> {
  if (!packets?.length) return packets;
  try {
    const redis = getRedis();
    // Read representative file for each cluster from the cluster top-files list
    const enriched = await Promise.all(
      packets.map(async (pkt) => {
        const repFile = pkt.topFiles?.[0];
        if (!repFile) return pkt;
        // ace:authority:top is a HASH: field = stable_key or file_path, value = JSON
        const raw = await redis.hget('ace:authority:top', repFile).catch(() => null);
        if (!raw) return pkt;
        const entry = JSON.parse(raw) as { graphAuthorityScore?: number; communityId?: string | number };
        return {
          ...pkt,
          communityId: entry.communityId != null ? String(entry.communityId) : pkt.communityId,
          graphAuthorityScore: entry.graphAuthorityScore ?? pkt.graphAuthorityScore,
        };
      })
    );
    return enriched;
  } catch {
    return packets;
  }
}

/** Vector-search web_search_index for semantically relevant pre-indexed pages. */
async function fetchWebResearchRows(
  query: string,
  limit = 4
): Promise<import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[]> {
  try {
    const vec = await generateSingleEmbedding(query);
    if (!vec || vec.length !== 768) return [];
    const rows = await db.execute(sql`
      SELECT url, title, snippet, relevance_score,
             1 - (embedding <=> ${JSON.stringify(Array.from(vec))}::vector) AS score
      FROM web_search_index
      ORDER BY embedding <=> ${JSON.stringify(Array.from(vec))}::vector
      LIMIT ${limit}
    `);
    const data = Array.isArray((rows as unknown as { rows?: unknown[] }).rows)
      ? (
          rows as unknown as {
            rows: Array<{
              url: string;
              title: string | null;
              snippet: string | null;
              score: number;
            }>;
          }
        ).rows
      : (rows as unknown as Array<{
          url: string;
          title: string | null;
          snippet: string | null;
          score: number;
        }>);
    return (data ?? []).map((r) => ({
      id: r.url,
      kind: 'web_result' as const,
      source: 'pgvector' as const,
      content: r.snippet ?? r.title ?? '',
      score: Math.max(0, Math.min(1, Number(r.score) || 0)),
      tags: ['web_research'],
      sourceId: r.url,
    }));
  } catch {
    return [];
  }
}

const ACP_MAX_RESULTS = 8;
const ACP_MAX_SCORE = 0.08; // ACP boosts capped — must not dominate Qdrant/graph/SOM ranking

async function fetchACPKnowledgeResults(
  query: string,
  limit = ACP_MAX_RESULTS,
  collection = 'codebase_chunks_768'
): Promise<ACPKnowledgeSearchResult | null> {
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
    const startedAt = Date.now();

    const emb = await generateSingleEmbedding(query);
    if (!Array.isArray(emb) || emb.length !== 768) return null;

    let filters: any = undefined;
    let topoPrefilter: TopoPrefilterStats | undefined;

    // Stage A: Directory Summary Search + topo_class prefilter (codebase chunks only)
    if (collection === 'codebase_chunks_768') {
      // Stage A0: topo_class prefilter — Redis quick-hit cache, then Qdrant topo_class filter
      const queryClass = classifyQuery(query);
      const qHash = topoQueryHash(query);

      if (queryClass !== TOPO_CLASS.UNCLASSIFIED) {
        const cached = await getTopoCandidates(queryClass, query);
        if (cached && cached.length > 0) {
          // Cache hit — return early, skip Qdrant entirely
          topoPrefilter = buildTopoPrefilterStats({
            used: true, topoClass: queryClass, cacheHit: true,
            candidateCountAfter: cached.length, qdrantCollectionEstimate: null, queryHash: qHash,
          });
          return {
            ok: true, query,
            results: cached.map((c) => ({
              id: c.stableKey, source: 'qdrant' as const, title: c.path,
              content: '', score: c.score,
              path: c.path, metadata: undefined,
            })),
            metadata: {
              embeddingModel: 'embeddinggemma:latest', collection,
              latencyMs: Date.now() - startedAt,
              topoPrefilter,
            },
          };
        }
        filters = { topo_class: queryClass };
      }

      try {
        const dirHits = await qdrant.hybridSearch({
          collection: 'directory_summaries_768',
          query,
          queryEmbedding: Array.from(emb),
          limit: 5,
        });
        const dirs = dirHits.results
          .map((h) => h.payload?.['directory_path'])
          .filter(Boolean) as string[];

        if (dirs.length > 0) {
          filters = { ...(filters ?? {}), directory_path: dirs };
        }
      } catch (e) {
        console.warn('Stage A directory search failed or skipped:', e);
      }
    }

    // Stage B: File/Chunk Search Scoped by Directory Filters
    const hits = await qdrant.hybridSearch({
      collection,
      query,
      queryEmbedding: Array.from(emb),
      limit: Math.min(limit, ACP_MAX_RESULTS),
      filters,
    });

    // Persist candidates into Redis for next call (fire-and-forget)
    const queryClass = classifyQuery(query);
    const qHash = topoQueryHash(query);
    if (collection === 'codebase_chunks_768' && queryClass !== TOPO_CLASS.UNCLASSIFIED) {
      const entries = hits.results.map((h) => ({
        stableKey: String(h.id),
        score: h.score,
        path: (h.payload?.['path'] ?? h.payload?.['relative_path'] ?? undefined) as string | undefined,
      }));
      setTopoCandidates(queryClass, query, entries).catch(() => {});
      topoPrefilter = buildTopoPrefilterStats({
        used: true, topoClass: queryClass, cacheHit: false,
        candidateCountAfter: hits.results.length,
        qdrantCollectionEstimate: null, // unknown without collection scan
        queryHash: qHash,
      });
    }

    return {
      ok: true,
      query,
      results: hits.results.map((h) => ({
        id: String(h.id),
        source: 'qdrant' as const,
        title: (h.payload?.['title'] ?? h.payload?.['path'] ?? undefined) as string | undefined,
        content: (h.payload?.['content'] ??
          h.payload?.['summary'] ??
          h.payload?.['text'] ??
          '') as string,
        score: h.score,
        path: (h.payload?.['path'] ?? h.payload?.['relative_path'] ?? undefined) as
          | string
          | undefined,
        metadata: h.payload as Record<string, unknown> | undefined,
      })),
      metadata: {
        embeddingModel: 'embeddinggemma:latest',
        collection,
        latencyMs: Date.now() - startedAt,
        topoPrefilter,
      },
    };
  } catch {
    return null;
  }
}

function mergeACPKnowledgeChunks(
  existing: import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[],
  acpResult: ACPKnowledgeSearchResult | null
): import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[] {
  if (!acpResult?.results?.length) return existing;

  const seen = new Set(existing.map((r) => `${r.sourceId ?? r.id}|${r.content.slice(0, 120)}`));

  const merged = [...existing];
  for (const hit of acpResult.results.slice(0, ACP_MAX_RESULTS)) {
    const title = hit.title?.trim() ?? '';
    const content = title ? `${title}\n${hit.content}`.trim() : hit.content.trim();
    const key = `${hit.id}|${content.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      id: `acp:${hit.id}`,
      kind: 'kb_doc' as const,
      source: 'qdrant' as const,
      content,
      score: Math.min(hit.score, ACP_MAX_SCORE),
      tags: ['acp_cross_feed'],
      sourceId: hit.path ?? hit.id,
      metadata: {
        ...hit.metadata,
        acpCrossFeed: true,
        acpCollection: acpResult.metadata.collection,
        acpBoost: Math.min(hit.score * 0.08, ACP_MAX_SCORE),
      },
    });
  }

  return assignRanks(sortByBestScore(merged));
}

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
  /** Include Lane 3 deep-research chunks from chunks_web_search (Qdrant). */
  includeResearch?: boolean;
  sectionTypes?: string[];
  /**
   * nes-arch path-first preflight (agents.md spec). When provided, the
   * assembler does a sub-5ms Redis lookup for the nearest AGENTS.md
   * (walks up the dir tree) and prepends the rendered markdown to the
   * context. Useful for code-editing agents that already know which file
   * they're touching — gives them directory conventions + audit warnings
   * BEFORE expensive semantic retrieval. Pass a file or directory path
   * relative to the repo root (e.g. `src/lib/server/ace/agent.ts`).
   */
  filePath?: string;
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

      // Mutable ref: fetchCodebaseContext writes topoPrefilter/graphAuthority/manifold4 here
      const codebaseFetchStats: CodebaseFetchStats = {};

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
        webResearchRows,
        lane3Research,
        communityContext,
        directoryKagContext,
        acpKnowledgeResults,
        graphIntelContext,
        multiLaneResult,
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
          ? fetchCodebaseContext(query, userId ?? undefined, opts.filePath, codebaseFetchStats).catch(() => null)
          : Promise.resolve(null),
        fetchTopQueryTags(5).catch(() => [] as string[]),
        fetchWebResearchRows(query).catch(
          () => [] as import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[]
        ),
        opts.includeResearch
          ? import('$lib/server/ace/codeintel-datastore.js').then((m) =>
              m.getWebResearchForAce(query, 8).catch(() => ({ research: [] }))
            )
          : Promise.resolve({ research: [] }),
        // GraphRAG community context: cosine-ranked community summary for this query
        getCommunityContext(query, 2).catch(
          () => [] as Awaited<ReturnType<typeof getCommunityContext>>
        ),
        getDirectoryKAGContext(query, 3).catch(
          () => [] as Awaited<ReturnType<typeof getDirectoryKAGContext>>
        ),
        fetchACPKnowledgeResults(query, ACP_MAX_RESULTS, 'codebase_chunks_768').catch(() => null),
        // Fast-AST graph intel: top relevant files + audit hotspots from codebase-graph.json
        getGraphIntelContext(query).catch(() => null),
        // P1-A: Error-aware multi-lane search (hash exact + n-gram + graph + ace-cache).
        // skipVectorLane=true because Qdrant already runs in fetchRAGChunks above.
        opts.enableCodebaseContext
          ? import('./multi-lane-retrieval.js').then(({ multiLaneSearch }) =>
              import('$lib/server/db/client').then(({ pool: pgPool }) =>
                multiLaneSearch(getRedis(), pgPool, {
                  text: query,
                  isError: /error|exception|failed|cannot|undefined is not|typeerror/i.test(query),
                  topK: 8,
                  skipVectorLane: true,
                })
              )
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      const { ragChunks, kbChunks, caseChunks } = ragResult;

      // Fetch evidence metadata, connections, semantic chat recall, and Phase A
      // deep-import-graph expansion in parallel.
      // Chat recall searches Qdrant chat_messages for past turns similar to the
      // current query (across ALL prior sessions, not just the active conversation).
      // Graph expansion enriches codebase context hits with typed import-graph data.
      const importGraphFilePaths = [
        ...(codebaseContext ?? []).map((c) => c.filePath),
        ...(opts.filePath ? [opts.filePath] : []),
      ];
      const [evidenceMetadata, evidenceConnections, chatMemory, importGraphContext] =
        await Promise.all([
          caseId ? fetchEvidenceMetadataForCase(caseId) : Promise.resolve(null),
          caseId ? fetchEvidenceConnections(caseId) : Promise.resolve(null),
          fetchChatMemory(query, conversationId).catch(() => []),
          fetchDeepImportGraphExpansion(importGraphFilePaths).catch(() => ''),
        ]);

      // Determine practice area from case or user profile
      const practiceArea = extractPracticeArea(caseContext, userProfile);
      const practiceTemplate = selectPracticeTemplate(practiceArea);

      // HMM section classification — labels the query as PARTIES / JURISDICTION /
      // FACTS / LEGAL_AUTHORITY / CLAIMS / PRAYER_HOLDING / UNKNOWN with a
      // confidence score. Adds `section:<NAME>` to queryTags so downstream
      // retrieval and reranking can section-bias against the glyph atlas.
      const querySection = classifyQuerySection(query);

      // Generate query tags from entities + practice area + Redis hot-query leaderboard
      const queryTags: string[] = [
        ...legalTags.statutes.slice(0, 3),
        ...legalTags.cases.slice(0, 3),
        ...(practiceArea ? [practiceArea] : []),
        ...(topQueryTags ?? []).slice(0, 3),
        ...(querySection.confidence > 0.3 ? [`section:${querySection.section}`] : []),
      ];

      const toUnified = (
        c: RAGChunk
      ): import('$lib/server/types/retrieval.js').UnifiedRetrievalResult => ({
        id: c.source,
        kind: 'legal_doc' as const,
        source: 'qdrant' as const,
        content: c.content,
        score: c.score,
        tags: [],
        sourceId: c.source,
      });
      // P5-B: Apply QLoRA quality boost to RAG chunks (proven high-quality chunks get +0.05)
      const allRag = ragChunks.map(toUnified);
      await applyQloraBoost(allRag).catch(() => {});

      // ── Multi-lane parallel retrieval (allSettled — degradation-safe) ──────
      const { pool: pgPool } = await import('$lib/server/db/client');
      const multiLaneOutput: MultiLaneOutput | null = await runRetrievalLanes({
        query,
        pool: pgPool,
        redis: getRedis(),
        caseId,
        filePath: opts.filePath,
      }).catch(() => null);

      const baseContext: ACEContext = {
        userProfile,
        caseContext,
        glossaryMatches,
        ragChunks: assignRanks(sortByBestScore(allRag)),
        kbChunks: mergeACPKnowledgeChunks(
          assignRanks(sortByBestScore(kbChunks.map(toUnified))),
          acpKnowledgeResults ?? null
        ),
        caseChunks: assignRanks(sortByBestScore(caseChunks.map(toUnified))),
        kagNeighbors,
        chatHistory,
        chatMemory,
        entities,
        practiceTemplate,
        queryTags,
        webSearchContext:
          [
            // Fast-AST graph intel: relevant files + audit hotspots from codebase-graph.json
            graphIntelContext ?? '',
            // GraphRAG community context — coarse "what team/layer does this query touch?"
            communityContext?.length
              ? `\n## Codebase Community Context (GraphRAG)\n` +
                communityContext
                  .map(
                    (c) =>
                      `**${c.purpose}** (similarity=${c.similarity.toFixed(2)})\n${c.summary}\nTags: ${c.tags.join(', ')}`
                  )
                  .join('\n\n')
              : '',
            directoryKagContext?.length
              ? `\n## KAG Directory Audit Notes\n` +
                directoryKagContext
                  .map(
                    (entry) => {
                      const topo =
                        entry.somBmuRow != null && entry.somBmuCol != null
                          ? `, SOM(${entry.somBmuRow},${entry.somBmuCol})`
                          : '';
                      const method =
                        entry.scoringMethod === 'gpu-cosine' ? ' 🔵gpu' : ' ⬜kw';
                      return (
                        `**${entry.dir}** (score=${entry.score.toFixed(2)}${method}${typeof entry.auditScore === 'number' ? `, audit=${entry.auditScore}` : ''}${topo})\n` +
                        `${entry.summary}\n` +
                        (entry.tags.length ? `Tags: ${entry.tags.join(', ')}` : '')
                      );
                    }
                  )
                  .join('\n\n')
              : '',
            webResults ? formatWebResultsAsContext(webResults) : '',
            wikiResults ? formatWikipediaAsContext(wikiResults) : '',
            lane3Research?.research?.length
              ? `\n## Deep Research (Grounding: Docs > GitHub > Reddit)\n` +
                lane3Research.research
                  .slice(0, 5)
                  .map((r, i) => `[${i + 1}] [${r.source}] ${r.url}\n${r.body.slice(0, 600)}`)
                  .join('\n\n')
              : '',
            // P1-A: Multi-lane synthesis block (hash exact-match + n-gram + graph recall)
            multiLaneResult?.synthesisBlock ?? '',
            // gap_rel_004: Compact cluster-aware context for llm_synthesis (max 3 clusters × 5 files × 8 tags)
            (() => {
              const pkts = buildClusterContext(codebaseContext ?? null);
              if (!pkts?.length) return '';
              const sections = pkts.slice(0, 3).map((p) => {
                const key = p.clusterKey ?? `cluster:gpu:${p.clusterId}`;
                const domains = p.topoClasses?.slice(0, 3).join(', ') || p.topoClass;
                const tags = p.topTags.slice(0, 8).join(', ');
                const files = (p.topFiles ?? []).slice(0, 5).join(', ');
                return `Cluster: ${key} [${domains}] (${p.chunkCount} chunks)\nTags: ${tags}${files ? `\nFiles: ${files}` : ''}\nHint: ${p.synthesisSuggestion}`;
              });
              return `\n## Qdrant Cluster Tag Context\n${sections.join('\n\n')}`;
            })(),
            // gap_rel_004b: Relationship-aware ACE synthesis block (pre-computed by graphify:map)
            (() => {
              const block = readLatestRelationSynthesis();
              return block ? `\n${block}` : '';
            })(),
            // Phase A: typed import-graph expansion for codebase context hits
            importGraphContext ?? '',
            acpKnowledgeResults?.results?.length
              ? `\n## ACP Knowledge Cross-Feed (${acpKnowledgeResults.metadata.collection})\n` +
                acpKnowledgeResults.results
                  .slice(0, 3)
                  .map((r, i) => {
                    const title = r.title?.trim() || r.path || `ACP Result ${i + 1}`;
                    const snippet = r.content.slice(0, 300);
                    return `[ACP ${i + 1}] ${title} (score: ${r.score.toFixed(2)})${snippet ? `\n${snippet}` : ''}`;
                  })
                  .join('\n\n')
              : '',
          ]
            .filter(Boolean)
            .join('\n') || null,
        persona: opts.persona ?? 'neutral',
        evidenceMetadata,
        evidenceConnections,
        userAnalyticsContext: userAnalyticsContext ?? null,
        codebaseContext: codebaseContext ?? null,
        policyDecision: null,
        retrievalTrace: (() => {
          const { section: hmmSection, confidence: hmmConf } = classifyQuerySection(query);
          const topChunk = codebaseContext?.[0];
          const neighborIds = (kagNeighbors ?? []).map((n) => n.nodeId);
          const adaptiveRecs = buildAdaptivePrefetch({
            query,
            hmmSection,
            hmmConf,
            topChunkIds: (codebaseContext ?? []).map((c) => c.stableKey ?? c.filePath).filter(Boolean) as string[],
            topSomRow:   topChunk?.somBmuRow  ?? null,
            topSomCol:   topChunk?.somBmuCol  ?? null,
            graphNeighborIds: neighborIds,
          });

          const tileEngine: TileEngineTrace = {
            hmmState:      hmmSection,
            hmmConfidence: hmmConf,
            queryHash:     adaptiveRecs.prefetchKeys.find(k => k.startsWith('ace:engram:dym:'))
                             ?.replace('ace:engram:dym:', '') ?? query.slice(0, 32),
            tileMap: {
              somRow: topChunk?.somBmuRow ?? null,
              somCol: topChunk?.somBmuCol ?? null,
              // SOM neighbour cells enumerated by adaptive-prefetch
              neighboringTilesLoaded: adaptiveRecs.prefetchKeys.filter(k => k.startsWith('som:bow:')).length,
            },
            texture: {
              // BoW cluster bias is applied upstream in applyKarpathyBoost — if top chunk has a
              // gpuCluster we know the texture was loaded
              bowClusterBiasUsed: topChunk?.gpuCluster != null,
              matchedTerms:       [],   // populated by bow-utils if available
            },
            quaternion: {
              // Quaternion rerank fires when manifold4 is present on the top chunk
              used:        topChunk != null && (topChunk as { manifold4?: unknown }).manifold4 != null,
              score:       0,           // per-chunk score; 0 here is the global sentinel
              axisWeights: adaptiveRecs.axisWeights,
            },
            graphSort: {
              used:          neighborIds.length > 0,
              pagerankUsed:  codebaseContext?.some(c => c.pageRankScore != null) ?? false,
              hyperedgeUsed: false,    // populated by fetch-rerank when it runs
            },
            prefetch: {
              used:      adaptiveRecs.recommendedChunks.length > 0 || adaptiveRecs.recommendedTools.length > 0,
              chunks:    adaptiveRecs.recommendedChunks.length,
              summaries: 0,
              tools:     adaptiveRecs.recommendedTools.length,
            },
          };

          const base = acpKnowledgeResults?.metadata?.topoPrefilter
            ? { topoPrefilter: acpKnowledgeResults.metadata.topoPrefilter }
            : ({} as NonNullable<ACEContext['retrievalTrace']>);
          return { ...base, adaptiveRecommendations: adaptiveRecs, tileEngine };
        })(),
        clusterContext: await enrichClusterContextWithGds(buildClusterContext(codebaseContext ?? null)),
        multiLaneOutput: multiLaneOutput ?? null,
        multiLane: (() => {
          if (!multiLaneResult) return null;
          // Build community-grouping addendum when GDS data is available on codebase hits.
          // Uses codebaseContext (already Qdrant-enriched) — avoids an extra Redis call.
          const communityAddendum = (() => {
            if (!codebaseContext?.length) return '';
            const byComm = new Map<string, { files: string[]; maxAuth: number }>();
            for (const c of codebaseContext) {
              const cid = c.communityId;
              if (!cid) continue;
              let entry = byComm.get(cid);
              if (!entry) { entry = { files: [], maxAuth: 0 }; byComm.set(cid, entry); }
              if (c.filePath && entry.files.length < 4) entry.files.push(c.filePath.split('/').pop() ?? c.filePath);
              if ((c.graphAuthorityScore ?? 0) > entry.maxAuth) entry.maxAuth = c.graphAuthorityScore ?? 0;
            }
            if (byComm.size === 0) return '';
            const lines = [...byComm.entries()]
              .sort((a, b) => b[1].maxAuth - a[1].maxAuth)
              .slice(0, 4)
              .map(([cid, { files, maxAuth }]) =>
                `- Community ${cid} (authority=${maxAuth.toFixed(3)}): ${files.join(', ')}`
              );
            return `\n### GDS Community Groups\n${lines.join('\n')}`;
          })();
          return {
            knownError: multiLaneResult.knownError,
            priorFix: multiLaneResult.priorFix,
            topFiles: multiLaneResult.topFiles,
            topSymbols: multiLaneResult.topSymbols,
            lanesHit: multiLaneResult.lanes
              .filter((l) => l.hits.length > 0)
              .map((l) => l.lane),
            synthesisBlock: multiLaneResult.synthesisBlock + communityAddendum,
            durationMs: multiLaneResult.durationMs,
          };
        })(),
      };

      // ── HMM Wiki Logger — 4D topology note (fire-and-forget) ──────────
      // Builds minimal GlyphRecord proxies from the top assembled chunks and
      // logs an HMM flow analysis note to Redis wiki:note:hmm:{hash}.
      // Non-blocking — errors are swallowed so assembly is never delayed.
      (async () => {
        try {
          const { logHMMAnalysis } = await import('./hmm-wiki-logger.js');
          const topChunks = [...baseContext.kbChunks.slice(0, 6), ...baseContext.ragChunks.slice(0, 4)];
          if (topChunks.length === 0) return;
          type GR = import('$lib/server/types/glyph.js').GlyphRecord;
          type GS = import('$lib/server/types/glyph.js').GlyphSection;
          const proxiedGlyphs: GR[] = topChunks.map((c, i) => ({
            glyphId: c.sourceId ?? c.id ?? `chunk-${i}`,
            sourceId: c.sourceId ?? c.id ?? `chunk-${i}`,
            kind: 'chunk' as const,
            schemaVersion: 1,
            semantic: {
              summary: (c.content ?? '').slice(0, 200),
              tags: c.tags ?? [],
              entities: [],
              section: (querySection.section ?? 'UNKNOWN') as GS,
              kagNeighbors: [],
              dagPrev: [],
              dagNext: [],
            },
            vector: { embedding768: new Float32Array(0), embeddingModel: '' },
            topology: {},
            render: {},
          }));
          const hmmAnalysis = await analyzeACEFlow(proxiedGlyphs);
          await logHMMAnalysis(hmmAnalysis, proxiedGlyphs, { userId, caseId });
        } catch { /* non-fatal */ }
      })().catch(() => {});

      // ── P4-A: Log multiLane context event to context_timeline ─────────
      if (multiLaneResult && pgPool) {
        const mlLanesHit = multiLaneResult.lanes
          .filter((l) => l.hits.length > 0 && !l.skipped)
          .map((l) => l.lane);
        const mlLanesSkipped = multiLaneResult.lanes
          .filter((l) => l.skipped)
          .map((l) => l.lane);
        pgPool
          .query(
            `INSERT INTO context_timeline (event_type, pipeline, payload)
             VALUES ('ace_multilane_context_built', 'ace', $1::jsonb)`,
            [
              JSON.stringify({
                queryHash:        multiLaneResult.queryHash,
                knownError:       multiLaneResult.knownError,
                priorFixPresent:  Boolean(multiLaneResult.priorFix),
                lanesHit:         mlLanesHit,
                lanesSkipped:     mlLanesSkipped,
                totalHits:        multiLaneResult.totalHits,
                topFiles:         multiLaneResult.topFiles.slice(0, 5),
                topSymbols:       multiLaneResult.topSymbols.slice(0, 5),
                durationMs:       multiLaneResult.durationMs,
                userId:           userId ?? null,
                caseId:           caseId ?? null,
              }),
            ]
          )
          .catch(() => {});
      }

      // ── Autonomous Research Ingestion (Phase 6) ─────────────────────
      // Persist all external research (Web + Wikipedia) to knowledge_base
      const researchToIngest = [
        ...(webResults?.results ?? []).map((r) => ({
          url: r.url,
          title: r.title,
          content: r.snippet,
          source: r.source,
        })),
        ...(wikiResults
          ? [
              {
                url: wikiResults.url,
                title: wikiResults.title,
                content: wikiResults.summary,
                source: 'wikipedia',
              },
            ]
          : []),
      ];

      if (researchToIngest.length > 0) {
        Promise.all([
          import('$lib/server/queue/rabbitmq-manager-fixed.js'),
          import('$lib/server/queue/dispatch-inline.js'),
        ])
          .then(([{ rabbitmq }, { dispatchOrExecuteInline }]) => {
            if (rabbitmq) {
              dispatchOrExecuteInline('kb.ingest', {
                docs: researchToIngest,
                collection: 'knowledge_base',
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      // P3-A: cross-source reranking — web results + pre-indexed research compete with KB/case chunks
      const webUnified = webResults ? webSearchToUnified(webResults) : [];
      const allExternal = [...webUnified, ...(webResearchRows ?? [])];
      if (allExternal.length) {
        baseContext.ragChunks = assignRanks(
          sortByBestScore([...baseContext.kbChunks, ...baseContext.caseChunks, ...allExternal])
        );
      }

      // Fast-AST graph cache fallback (source priority 4 — lower than Qdrant/ACP/graph)
      // Only injected when codebase context is sparse (< 3 chunks) to avoid diluting ranked results
      const FAST_AST_SCORE_CAP = 0.07;
      if (opts.enableCodebaseContext && (codebaseContext?.length ?? 0) < 3) {
        try {
          const redis = getRedis();
          const manifestRaw = await redis.get('code:index:manifest');
          if (manifestRaw) {
            const manifest = JSON.parse(manifestRaw) as {
              mode: string;
              fileCount: number;
              createdAt: string;
            };
            if (manifest.mode === 'fast-ast') {
              // Pull tag-matched file records for the query
              const queryWords = query
                .toLowerCase()
                .split(/\W+/)
                .filter((w) => w.length > 3)
                .slice(0, 6);
              const fastChunks: import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[] =
                [];
              for (const word of queryWords) {
                const raw = await redis.get(`code:index:tag:${word}`);
                if (!raw) continue;
                const filePaths: string[] = JSON.parse(raw);
                for (const fp of filePaths.slice(0, 4)) {
                  fastChunks.push({
                    id: `fast-ast:${fp}`,
                    kind: 'code_chunk' as const,
                    source: 'redis' as const,
                    content: fp,
                    summary: `[fast-ast] ${fp}`,
                    score: Math.min(
                      0.05 + queryWords.filter((w) => fp.includes(w)).length * 0.01,
                      FAST_AST_SCORE_CAP
                    ),
                    tags: ['fast-ast', word],
                    filePath: fp,
                    metadata: { indexMode: 'fast-ast', manifestCreatedAt: manifest.createdAt },
                  });
                }
              }
              if (fastChunks.length > 0) {
                const dedupedFast = fastChunks.filter(
                  (c) => !baseContext.ragChunks?.some((r) => r.filePath === c.filePath)
                );
                if (dedupedFast.length > 0) {
                  baseContext.ragChunks = assignRanks(
                    sortByBestScore([...(baseContext.ragChunks ?? []), ...dedupedFast])
                  );
                }
              }
            }
          }
        } catch {
          /* non-fatal — fast-ast cache is best-effort */
        }
      }

      // P3-B: boost ragChunks whose filePath appears in multiLane.topFiles
      // Files confirmed by ngram+symbol or ace_cache+symbol get +0.05 on top of existing score.
      if (multiLaneResult && multiLaneResult.topFiles.length > 0 && baseContext.ragChunks?.length) {
        const boostedFiles = new Set(multiLaneResult.topFiles);
        const MULTILANE_BOOST = 0.05;
        baseContext.ragChunks = baseContext.ragChunks.map((chunk) =>
          chunk.filePath && boostedFiles.has(chunk.filePath)
            ? { ...chunk, score: Math.min((chunk.score ?? 0) + MULTILANE_BOOST, 1.0) }
            : chunk
        );
        baseContext.ragChunks = assignRanks(sortByBestScore(baseContext.ragChunks));
      }

      // Step 6: fetch VLM cluster narrative for the top matched cluster
      let activeClusterSummary: ACEContext['activeClusterSummary'] = null;
      if (opts.enableCodebaseContext && codebaseContext?.length) {
        const topCluster = codebaseContext[0]?.gpuCluster;
        if (topCluster != null) {
          try {
            const { generateClusterSummary } = await import(
              '$lib/server/indexer/cluster-summary.js'
            );
            const csResult = await generateClusterSummary(topCluster, false);
            if (csResult.ok) activeClusterSummary = csResult.summary;
          } catch {
            /* non-fatal */
          }
        }
      }
      if (activeClusterSummary) {
        (baseContext as ACEContext).activeClusterSummary = activeClusterSummary;
      }

      // Step 6b: SOM cell neighbourhood summary — topological context for the top cluster
      if (opts.enableCodebaseContext && codebaseContext?.length) {
        const topChunk = codebaseContext[0];
        const somRow = (topChunk as Record<string, unknown>)?.somBmuRow as number | undefined;
        const somCol = (topChunk as Record<string, unknown>)?.somBmuCol as number | undefined;
        if (somRow != null && somCol != null) {
          const somSummary = await getSomCellSummary(somCol, somRow).catch(() => null);
          if (somSummary?.summary) {
            baseContext.webSearchContext = (baseContext.webSearchContext ?? '') +
              `\n## SOM Neighbourhood (cell ${somCol},${somRow})\n${somSummary.summary}\nTags: ${somSummary.tags.join(', ')}`;
          }
        }
      }

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
          model_role: 'ace-policy',
          cache_tier: 'L4',
          action: policyDecision.action,
          confidence: policyDecision.confidence,
          retrievalConfidence: policyDecision.retrievalConfidence,
          budgetTier: policyDecision.budget.tier,
          allowWebSearch: policyDecision.allowWebSearch,
          missingParameters: policyDecision.missingParameters,
          reasons: policyDecision.reasons,
        },
      });

      // ─── nes-arch path-first preflight ────────────────────────────────────
      // Sub-5ms Redis hit for the nearest AGENTS.md (agents.md spec). Walks UP
      // the dir tree from opts.filePath. Only runs when caller passed a path —
      // pure overhead otherwise. The rendered markdown is injected at the TOP
      // of the prompt by the prompt-builder so the model sees directory
      // conventions before raw chunks.
      let agentsMd: ACEContext['agentsMd'] = null;
      if (opts.filePath) {
        try {
          const { getAgentsMdQuickHit } = await import('$lib/server/graph/community-graph.js');
          const md = await getAgentsMdQuickHit(opts.filePath);
          if (md) {
            // Resolve which key actually matched by replicating the walk-up rule
            let dir = opts.filePath.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
            if (/\.[a-z]{1,5}$/i.test(dir)) dir = dir.split('/').slice(0, -1).join('/');
            const requestedDir = dir;
            try {
              const { getRedis } = await import('$lib/server/redis.js');
              const redis = getRedis();
              let resolvedKey = 'agents:root';
              let resolvedDir = '';
              let ttl: number | null = null;
              while (dir && dir !== '.' && dir !== '/') {
                const key = `agents:dir:${dir}`;
                if (await redis.exists(key)) {
                  resolvedKey = key;
                  resolvedDir = dir;
                  ttl = await redis.ttl(key).catch(() => null);
                  break;
                }
                const parent = dir.split('/').slice(0, -1).join('/');
                if (parent === dir) break;
                dir = parent;
              }
              if (resolvedKey === 'agents:root') ttl = await redis.ttl('agents:root').catch(() => null);
              agentsMd = {
                resolvedKey,
                requestedPath: opts.filePath,
                resolvedDir,
                markdown: md,
                ttlSeconds: ttl,
                fallbackToRoot: resolvedKey === 'agents:root',
              };
            } catch {
              // Couldn't introspect the key, but we still have the markdown
              agentsMd = {
                resolvedKey: 'agents:dir:?',
                requestedPath: opts.filePath,
                resolvedDir: requestedDir,
                markdown: md,
                ttlSeconds: null,
                fallbackToRoot: false,
              };
            }
          }
        } catch (err) {
          console.warn('[ACE nes-arch preflight] skipped:', (err as Error)?.message ?? err);
        }
      }

      // ─── prior-answer 3-tier cascade (Redis L1 → Postgres L2 → Qdrant L3) ─
      // L1 Redis (~5ms) — exact-path match, hot cache
      // L2 Postgres (~30ms) — durable mirror, survives Redis flush
      // L3 Qdrant (~50-200ms) — semantic similarity by query, no path required
      // Returns the lowest-latency hit. ACE injects the compressed outputMeta
      // envelope (summary + citations + confidence) above raw chunks.
      let codeLlmHit: ACEContext['codeLlmHit'] = null;
      if (opts.filePath || query) {
        try {
          const { lookupPriorAnswerMemory } = await import('$lib/server/cache/code-llm-index.js');
          const hit = await lookupPriorAnswerMemory({
            path:              opts.filePath,
            query:             opts.filePath ? undefined : query, // L3 only when no path
            includeFullOutput: true,
          });
          if (hit) {
            codeLlmHit = {
              path:           hit.path,
              source:         hit.source,
              llmOutput:      hit.llmOutput ?? hit.meta.summary ?? '',
              priorHits:      0, // cascade hit doesn't track per-layer hit count
              glyphClusterId: hit.glyphClusterId,
              generatedAt:    new Date().toISOString(),
              tokenCount:     hit.meta.tokensUsed,
            };
          }
        } catch (err) {
          console.warn('[ACE code-llm preflight] skipped:', (err as Error)?.message ?? err);
        }
      }

      const finalContext = {
        ...baseContext,
        policyDecision,
        agentsMd,
        codeLlmHit,
      };

      // Fire-and-forget: persist top chunks to ace_chunks for future cache hits
      if (caseId) {
        persistACEChunks(
          caseId,
          finalContext.ragChunks,
          finalContext.kbChunks,
          finalContext.caseChunks
        ).catch((err) => console.warn('[ACE persist] failed:', (err as Error)?.message ?? err));
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
          query,
          'rag',
          hitOpts
        );
      }
      if (codebaseContext?.length) {
        recordChunkHits(
          codebaseContext.map((c) => ({
            id: c.filePath,
            relativePath: c.filePath,
            gpuCluster: c.gpuCluster ?? null,
            somCluster: c.somCluster ?? null,
            score: c.score,
            rerankScore: c.rerankBreakdown?.final,
            rerankBreakdown: c.rerankBreakdown ?? null,
          })),
          query,
          'codebase',
          hitOpts
        );
      }

      recordQueryLog({
        query,
        queryHash: queryHash(query),
        userId: userId ?? undefined,
        caseId: caseId ?? undefined,
        totalFound: aceHits.length + (codebaseContext?.length ?? 0),
        searchTimeMs: Date.now() - policyStartedAt,
        dagEnabled: true,
        hybridSearch: false,
      });

      // Fire-and-forget: log to metadata_spine ace_retrieval_runs for caching
      db.insert(aceRetrievalRuns).values({
        query,
        intent: querySection.section,
        metadata: {
          action: policyDecision.action,
          budgetTier: policyDecision.budget.tier,
          latencyMs: Date.now() - policyStartedAt,
          ...(codebaseFetchStats.topoPrefilter  && { topoPrefilter:  codebaseFetchStats.topoPrefilter }),
          ...(codebaseFetchStats.graphAuthority && { graphAuthority: codebaseFetchStats.graphAuthority }),
          ...(codebaseFetchStats.manifold4      && { manifold4:      codebaseFetchStats.manifold4 }),
          ...(codebaseFetchStats.aceCodeCache   && { aceCodeCache:   codebaseFetchStats.aceCodeCache }),
        }
      }).catch((err) => console.warn('[ACE Run Log] failed:', (err as Error)?.message ?? err));

      // Fire-and-forget: record retrieval event as a HyperGraphRAG hyperedge
      {
        const chunkIds  = finalContext.ragChunks.slice(0, 20).map(c => c.id).filter(Boolean) as string[];
        const agentsMdKeys = agentsMd?.resolvedKey ? [agentsMd.resolvedKey] : [];
        const clusterIds: string[] = [];
        if (codebaseContext?.length) {
          const seen = new Set<string>();
          for (const c of codebaseContext) {
            const k = c.gpuCluster != null ? `gpu:${c.gpuCluster}` : c.somCluster != null ? `som:${c.somCluster}` : null;
            if (k && !seen.has(k)) { seen.add(k); clusterIds.push(k); }
          }
        }
        insertHyperedge(buildRetrievalEdge(query, chunkIds, agentsMdKeys, clusterIds))
          .catch(() => {});
      }

      // Fire-and-forget: record query bigram for engram DYM suggestions
      if (userId) {
        recordLastQuery(userId, query)
          .then(prev => { if (prev) recordEngramTransition(prev, query).catch(() => {}); })
          .catch(() => {});
      }

      return finalContext;
    }
  ); // end traceGraph ace-assembly
}

// ── ACE Chunks Configuration ────────────────────────────────────────────

/** Bump this when retrieval logic changes to invalidate stale cached chunks. */
const ACE_PIPELINE_VERSION = '2.0.0';
const ACE_EMBEDDING_MODEL = ENV.OLLAMA_EMBED_MODEL;
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
    if (c.score >= 0.4)
      rows.push({ content: c.content, chunkType: 'legal', source: c.source, score: c.score });
  }
  for (const c of caseChunks.slice(0, 5)) {
    if (c.score >= 0.4)
      rows.push({ content: c.content, chunkType: 'evidence', source: c.source, score: c.score });
  }
  // Only store merged ragChunks if tiered chunks are empty (backward compat)
  if (!kbChunks.length && !caseChunks.length) {
    for (const c of ragChunks.slice(0, 5)) {
      if (c.score >= 0.4)
        rows.push({ content: c.content, chunkType: 'analysis', source: c.source, score: c.score });
    }
  }

  if (rows.length === 0) return;

  // Generate embeddings in parallel (fail-tolerant: NULL on failure)
  const embeddings = await Promise.all(
    rows.map((r) =>
      traceEmbedding(r.content, ACE_EMBEDDING_MODEL, () => getQueryEmbedding(r.content)).catch(
        () => null
      )
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
async function invalidateStaleACEChunks(pool: import('pg').Pool, caseId: string): Promise<number> {
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
      console.log(
        `[ACE invalidate] purged ${deleted} stale chunks for case ${caseId.slice(0, 8)} (pipeline != ${ACE_PIPELINE_VERSION})`
      );
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
      metadata: {
        op: 'read',
        model_role: 'ace-retrieval',
        cache_tier: isHit ? 'L3' : 'L4',
        caseId: caseId.slice(0, 8),
      },
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
  // P1-C: Fast pre-check using ace:query:{hash} written by multiLaneSearch.
  // Prepends file/symbol hints derived from prior queries with the same hash
  // so the model receives context faster — does NOT short-circuit full assembly.
  try {
    const { createHash } = await import('crypto');
    const qHash = createHash('sha256').update(query.slice(0, 512)).digest('hex').slice(0, 12);
    const fastHit = await getRedis().get(`ace:query:${qHash}`).catch(() => null);
    if (fastHit) {
      const { topFiles, knownError } = JSON.parse(fastHit) as { topFiles?: string[]; knownError?: boolean };
      if (topFiles?.length || knownError) {
        const hint = knownError
          ? `\n> ⚡ **Known error pattern** — top files: ${(topFiles ?? []).slice(0, 3).join(', ')}\n`
          : `\n> ⚡ **File hints (cache)**: ${(topFiles ?? []).slice(0, 3).join(', ')}\n`;
        // Inject into context so buildACEPrompt can see it via multiLane block
        if (!context.multiLane && topFiles?.length) {
          (context as unknown as Record<string, unknown>).__fastHint = hint;
        }
      }
    }
  } catch {
    // non-fatal
  }

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
  lines.push(SYSTEM_YORHA_LEGAL);

  // 1b. nes-arch path-first AGENTS.md (renders FIRST so the model sees
  // directory conventions, audit warnings, and dominant tags before chunks).
  // Only present when the caller passed `filePath` to assembleACEContext.
  if (context.agentsMd?.markdown) {
    const a = context.agentsMd;
    const ttlNote = a.ttlSeconds != null
      ? `TTL: ${Math.floor(a.ttlSeconds / 3600)}h ${Math.floor((a.ttlSeconds % 3600) / 60)}m`
      : 'TTL: unknown';
    const fallbackNote = a.fallbackToRoot ? ' _(fallback to repo-root AGENTS.md)_' : '';
    lines.push(
      `\n## Directory Context — AGENTS.md\nResolved: \`${a.resolvedKey}\`${fallbackNote} · ${ttlNote}\n\n${a.markdown}`
    );
    confidenceFactors.agentsMd = a.fallbackToRoot ? 0.4 : 0.85;
  }

  // 1c. code-llm-index PRIOR ANSWER — sub-5ms file-level Redis hit. Injected
  // BEFORE raw chunks so the model can refine vs. re-derive when the same
  // file is queried twice within the 6h TTL. More targeted than agentsMd
  // (per-file vs per-dir). Confidence weighted by hit count and source.
  if (context.codeLlmHit?.llmOutput) {
    const h = context.codeLlmHit;
    const ageMs   = Date.now() - new Date(h.generatedAt).getTime();
    const ageHrs  = Math.max(0, ageMs / 3_600_000);
    const ageNote = ageHrs < 1 ? `${Math.round(ageMs / 60_000)}m ago` : `${ageHrs.toFixed(1)}h ago`;
    const clusterTag = h.glyphClusterId != null ? ` · cluster #${h.glyphClusterId}` : '';
    const hitsNote   = h.priorHits > 0 ? ` · ${h.priorHits} prior hit${h.priorHits === 1 ? '' : 's'}` : '';
    lines.push(
      `\n## Prior Answer (cached for \`${h.path}\`)\n_Source: ${h.source} · generated ${ageNote}${clusterTag}${hitsNote}_\n\n${h.llmOutput}\n\n_Refine or correct the above using the chunks below if needed; do not contradict it without evidence._`
    );
    // Confidence: gemma4 summaries from atlas are most authoritative for code intel; agent/ace synthesis weighted by hit reuse
    const baseConf = h.source === 'gemma4-summary' ? 0.75 : h.source === 'kag' ? 0.7 : 0.6;
    const reuseBoost = Math.min(0.15, h.priorHits * 0.02); // up to +0.15 for hot paths
    confidenceFactors.codeLlmHit = Math.min(0.95, baseConf + reuseBoost);
  }

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

  // 8b. Semantic recall from past sessions (Qdrant chat_messages)
  if (context.chatMemory && context.chatMemory.length > 0) {
    const memoryText = context.chatMemory
      .slice(0, limits.chatMemoryCount)
      .map(
        (m) => `[${m.score.toFixed(2)}] ${m.role}: ${truncate(m.content, limits.chatMessageChars)}`
      )
      .join('\n');
    lines.push(`\n## Recalled From Prior Sessions\n${memoryText}`);
    confidenceFactors.chatMemory = 0.5;
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
        const meta = [
          c.routeType ? `type:${c.routeType}` : '',
          c.gpuCluster != null ? `cluster:${c.gpuCluster}` : '',
          c.pageRankScore != null ? `rank:${c.pageRankScore.toFixed(2)}` : '',
          c.hasAuthGuard ? 'auth-guarded' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const header = `[${c.filePath}${loc}]${meta ? ` (${meta})` : ''} score:${c.score.toFixed(2)}`;
        return `${header}\n${truncate(c.content, limits.chunkChars)}`;
      })
      .join('\n\n');

    // Step 6: prepend VLM cluster narrative when available
    let clusterPrefix = '';
    const acs = (
      context as ACEContext & { activeClusterSummary?: ACEContext['activeClusterSummary'] }
    ).activeClusterSummary;
    if (acs?.summary) {
      clusterPrefix =
        `// CLUSTER ${acs.clusterId}: ${acs.purpose}\n` +
        `// ${acs.summary}\n` +
        (acs.patterns.length ? `// Patterns: ${acs.patterns.join(', ')}\n` : '') +
        (acs.warnings.length ? `// Warnings: ${acs.warnings.join('; ')}\n` : '') +
        '\n';
    }

    lines.push(`\n## Codebase Context\n${clusterPrefix}${codeLines}`);
    confidenceFactors.codebaseContext = Math.max(...context.codebaseContext.map((c) => c.score));
  }

  // 14b. NES cluster context — GPU cluster summary lenses for top retrieved files
  if (context.clusterContext && context.clusterContext.length > 0) {
    const clusterLines = context.clusterContext
      .slice(0, 3)
      .map((c) => {
        const tags = c.topTags?.length ? `Tags: ${c.topTags.slice(0, 6).join(', ')}` : '';
        const files = c.topFiles?.length ? `Files: ${c.topFiles.slice(0, 3).join(', ')}` : '';
        return `**${c.clusterKey}** (${c.topoClass ?? c.topoLabel ?? 'unknown'}): ${c.summaryLens ?? ''}${tags ? '\n  ' + tags : ''}${files ? '\n  ' + files : ''}`;
      })
      .join('\n');
    lines.push(`\n## Codebase Clusters\n${clusterLines}`);
    confidenceFactors.clusterContext = 0.7;
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

const KB_SOURCE_SCORE_WEIGHTS = {
  contextualDocument: 0.9,
  canon: 1.05,
  knowledge: 1.0,
} as const;

function weightKbScore(score: number, sourceType: keyof typeof KB_SOURCE_SCORE_WEIGHTS): number {
  return Number((score * KB_SOURCE_SCORE_WEIGHTS[sourceType]).toFixed(6));
}

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
 * Searches: legal_canon_chunks (primary authority), legal_documents (contextual), knowledge_base
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

    const [docResults, canonResults, kbResults] = await Promise.all([
      qdrantMgr.client.search('legal_documents', searchOpts(4, 0.45)).catch(() => []),
      qdrantMgr.client.search('legal_canon_chunks', searchOpts(6, 0.4)).catch(() => []),
      // knowledge_base uses unnamed vectors (raw array, not named)
      qdrantMgr.client
        .search('knowledge_base', {
          vector: embedding,
          limit: 4,
          score_threshold: 0.4,
          with_payload: true,
          ...(graphFilter ? { filter: graphFilter } : {}),
        })
        .catch(() => []),
    ]);

    const chunks: RAGChunk[] = [
      ...docResults.map((r: any) => ({
        content: String(r.payload?.content_preview ?? r.payload?.full_text ?? ''),
        score: weightKbScore(Number(r.score ?? 0), 'contextualDocument'),
        source: String(r.payload?.source_url ?? r.payload?.document_type ?? 'kb:document'),
      })),
      ...canonResults.map((r: any) => ({
        content: String(r.payload?.content ?? r.payload?.text ?? ''),
        score: weightKbScore(Number(r.score ?? 0), 'canon'),
        source: String(r.payload?.source ?? 'kb:canon'),
      })),
      ...kbResults.map((r: any) => ({
        content: String(r.payload?.content ?? r.payload?.text ?? ''),
        score: weightKbScore(Number(r.score ?? 0), 'knowledge'),
        source: String(r.payload?.source ?? r.payload?.url ?? 'kb:knowledge'),
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

/**
 * Research Summaries Tier — SOM-prefiltered retrieval from research_summaries.
 * When a SOM cluster is detected via probe, filters to that cluster before ANN,
 * shrinking the candidate space from 60K+ → ~5-10K. Falls back to full sweep
 * when the prefiltered result count is too low.
 */
async function fetchResearchSummaryChunks(
  embedding: number[],
  queryHashStr: string,
  somCluster: number | null
): Promise<RAGChunk[]> {
  const clusterSuffix = somCluster != null ? `:c${somCluster}` : ':all';
  const cacheKey = `research_bundle:${queryHashStr}${clusterSuffix}`;
  const cached = await getCachedBundle(cacheKey);
  if (cached) {
    console.log(
      `[ACE Research] bundle HIT cluster=${somCluster ?? 'all'} (${cached.length} chunks)`
    );
    return cached;
  }

  try {
    const { qdrant: qdrantMgr } = await import('$lib/server/vector/qdrant-manager.js');
    const baseOpts = {
      vector: embedding, // research_summaries uses unnamed single vector
      limit: 6,
      score_threshold: 0.38,
      with_payload: true,
    };

    // Prefiltered ANN: narrow to detected SOM cluster first
    let results: any[] =
      somCluster != null
        ? await qdrantMgr.client
            .search('research_summaries', {
              ...baseOpts,
              filter: { must: [{ key: 'som_cluster', match: { value: somCluster } }] },
            })
            .catch(() => [])
        : [];

    // Fallback: full sweep when cluster filter is empty or cluster unknown
    if (results.length < 2) {
      results = await qdrantMgr.client.search('research_summaries', baseOpts).catch(() => []);
      if (results.length && somCluster != null) {
        console.log(
          `[ACE Research] cluster=${somCluster} prefilter sparse, fell back to full sweep`
        );
      }
    }

    const chunks: RAGChunk[] = results
      .map((r: any) => ({
        content: String(r.payload?.summary ?? r.payload?.content ?? r.payload?.text ?? ''),
        score: r.score,
        source: String(
          r.payload?.url ?? r.payload?.source ?? r.payload?.topic ?? 'research:summary'
        ),
      }))
      .filter((c: RAGChunk) => c.content.length > 30);

    // 5-min TTL — research summaries are less volatile than live evidence
    setCachedBundle(cacheKey, chunks, 300).catch(() => {});
    return chunks;
  } catch (err) {
    console.warn('[ACE Research] retrieval failed:', (err as Error)?.message ?? err);
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
  const embedding = await traceEmbedding(query, 'embeddinggemma:latest', () =>
    getQueryEmbedding(query)
  );
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

  // SOM topology probe: quick 5-point scan to detect query's probable cluster.
  // Reduces research_summaries candidate space from 60K+ → ~5-10K before full ANN.
  let somCluster: number | null = null;
  try {
    const { qdrant: qdrantMgr } = await import('$lib/server/vector/qdrant-manager.js');
    const probe = await qdrantMgr.client
      .search('research_summaries', {
        vector: embedding,
        limit: 5,
        with_payload: true,
        score_threshold: 0.3,
      })
      .catch(() => [] as any[]);
    if (probe.length >= 2) {
      const counts = new Map<number, number>();
      for (const pt of probe) {
        const c = pt.payload?.som_cluster;
        if (c != null && typeof c === 'number') counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let best = 0;
      for (const [cluster, count] of counts) {
        if (count > best) {
          best = count;
          somCluster = cluster;
        }
      }
      if (somCluster != null) {
        console.log(
          `[ACE RAG] SOM probe → cluster=${somCluster} (${best}/${probe.length} pts agree)`
        );
      }
    }
  } catch {
    /* non-fatal — continue without prefilter */
  }

  // Fetch ace_chunks cache + Qdrant tiers + research summaries in parallel
  const [kbChunks, caseChunks, aceChunks, researchChunks] = await Promise.all([
    fetchKBChunks(embedding, queryHash, graphFilter),
    fetchCaseChunks(embedding, queryHash, caseId, sectionTypes, graphFilter),
    caseId ? fetchCachedACEChunks(caseId) : Promise.resolve([]),
    fetchResearchSummaryChunks(embedding, queryHash, somCluster),
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

  let ragChunks = dedup([...kbChunks, ...caseChunks, ...aceChunks, ...researchChunks])
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

  // LangExtract + GRPO reranking: entity overlap + section relevance + retrieval fusion
  // Non-fatal — falls back to retrieval-only scoring if LangExtract is unavailable
  if (ragChunks.length > 0) {
    try {
      ragChunks = await rerankChunksGRPO(query, ragChunks, {
        sectionTypes: sectionTypes,
      });
    } catch {
      /* LangExtract unavailable — continue with existing scores */
    }
  }

  // Cluster-coherence boost: chunks from the dominant GPU cluster get 1.08× score boost.
  // BoW tile top-terms are appended to in-cluster chunks for richer cross-encoder context.
  if (ragChunks.length > 1) {
    try {
      const domCluster = extractDominantCluster(
        ragChunks.map((c) => ({ content: c.content, score: c.score, source: c.source, gpuCluster: (c as Record<string, unknown>).gpuCluster as number | undefined })),
        5
      );
      const bowTile = domCluster != null
        ? await getClusterBowTexture(domCluster).catch(() => null)
        : null;
      const boosted = await applyClusterCoherenceBoost(
        ragChunks.map((c) => ({ content: c.content, score: c.score, source: c.source, gpuCluster: (c as Record<string, unknown>).gpuCluster as number | undefined })),
        { bowTile }
      );
      ragChunks = boosted.map((c) => ({ content: c.content, score: c.score, source: c.source }));
    } catch {
      /* cluster reranker unavailable — non-fatal */
    }
  }

  // P0-B: Write top-K chunk metadata to Redis so the ACE cache lane in multi-lane-retrieval.ts
  // can serve repeated queries at <2ms instead of re-running Qdrant (~200ms).
  try {
    const redis = getRedis();
    const topkKey = aceTopkKey(queryHash);
    const topkPayload = kbChunks.slice(0, 20).map((c) => ({
      id: c.source,
      text: c.content.slice(0, 200),
      score: c.score,
    }));
    redis.setex(topkKey, 600, JSON.stringify(topkPayload)).catch(() => {});
  } catch {
    /* non-fatal — ACE cache lane will miss on this query, Qdrant is the fallback */
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
    return pgRows(rows)
      .reverse()
      .map((r: any) => ({
        role: r.role as 'user' | 'assistant' | 'system',
        content: String(r.content ?? ''),
      }));
  } catch (err) {
    console.warn('[ACE context] chat history fetch failed:', (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * Semantic recall across ALL past chat sessions via Qdrant chat_messages.
 * Excludes the active conversation (covered by fetchChatHistory above).
 * Budget: 500ms hard cap so it can never block request path.
 */
async function fetchChatMemory(
  query: string,
  excludeSessionId?: string
): Promise<NonNullable<ACEContext['chatMemory']>> {
  try {
    const queryEmb = await Promise.race([
      getQueryEmbedding(query),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
    if (!queryEmb) return [];
    // Don't pass scoreThreshold — let recallPastChats read it from the Redis
    // settings so the admin toggle + threshold slider take effect immediately.
    // When the toggle is disabled, this returns [] without hitting Qdrant.
    const hits = await recallPastChats(queryEmb, {
      excludeSessionId,
      // Over-fetch a bit (6) to give the renderer room; it will slice to
      // limits.chatMemoryCount (2-6 depending on tier) when assembling the prompt.
      limit: 6,
    });
    return hits.map((h) => ({
      sessionId: h.sessionId,
      role: h.role,
      content: h.content.slice(0, 400),
      timestamp: h.timestamp,
      score: h.score,
    }));
  } catch {
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

/** Fire-and-forget write of boosted chunks to the ACE code cache. */
function writeAceCodeCache(
  query:       string,
  topoClass:   number,
  resolvedDir: string | undefined,
  chunks:      NonNullable<ACEContext['codebaseContext']>,
  opts:        { fromCache?: boolean } = {},
): void {
  if (!chunks.length) return;
  import('$lib/server/redis.js').then(({ getRedis }) => {
    const redis   = getRedis();
    const key     = aceCodeKey.forQuery(query, topoClass, resolvedDir);
    const payload = JSON.stringify(chunks.slice(0, 20));
    redis.setex(key, TTL.ACE_CODE, payload).catch(() => {});

    // Fire-and-forget: update rolling token density stats for this (topoClass, cluster)
    writeTokenDensityBudget(redis, topoClass, chunks).catch(() => {});
  }).catch(() => {});

  // Fire-and-forget: tag chunks in Qdrant + Redis hit counters
  import('$lib/server/ace/ace-hit-tagger.js')
    .then(({ tagAceHits }) => tagAceHits(chunks, opts))
    .catch(() => {});
}

/**
 * Update the rolling token budget stats for a (topoClass, clusterId) pair.
 * Uses an exponential moving average (α=0.2) so recent queries dominate.
 * Key: ace:token:budget:{topoClass}:{clusterId}  TTL: 2 h
 */
async function writeTokenDensityBudget(
  redis:     import('ioredis').Redis,
  topoClass: number,
  chunks:    NonNullable<ACEContext['codebaseContext']>,
): Promise<void> {
  if (!chunks.length) return;

  // Estimate tokens per chunk: chars / 4 is a standard approximation
  const tokenCounts = chunks.map((c) =>
    Math.ceil(((c.content ?? '') as string).length / 4),
  );
  const total     = tokenCounts.reduce((s, t) => s + t, 0);
  const sorted    = [...tokenCounts].sort((a, b) => a - b);
  const p50New    = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p90New    = sorted[Math.floor(sorted.length * 0.9)] ?? 0;

  // Derive clusterId from first chunk's gpuCluster payload field (may be absent)
  const clusterId: number | null =
    (chunks[0] as Record<string, unknown>).gpuCluster != null
      ? Number((chunks[0] as Record<string, unknown>).gpuCluster)
      : null;

  const { aceTokenBudgetKey, TTL: KEY_TTL } = await import('$lib/server/cache-keys.js');
  const key = clusterId != null
    ? aceTokenBudgetKey.forCluster(topoClass, clusterId)
    : aceTokenBudgetKey.forClass(topoClass);

  // Load existing stats and blend with EMA (α=0.2)
  const raw     = await redis.get(key).catch(() => null);
  const prev    = raw ? (JSON.parse(raw) as import('$lib/server/retrieval/centroid-cache.js').TokenBudgetStats) : null;
  const α       = 0.2;
  const updated = {
    p50Tokens:         prev ? Math.round(prev.p50Tokens * (1 - α) + p50New * α) : p50New,
    p90Tokens:         prev ? Math.round(prev.p90Tokens * (1 - α) + p90New * α) : p90New,
    avgChunksPerQuery: prev
      ? Math.round(prev.avgChunksPerQuery * (1 - α) + chunks.length * α)
      : chunks.length,
    sampleCount: (prev?.sampleCount ?? 0) + 1,
    updatedAt:   Date.now(),
    totalTokens: total,
  };

  await redis.setex(key, KEY_TTL.ACE_TOKEN_BUDGET, JSON.stringify(updated)).catch(() => {});
}

/** Stats collected during a codebase context fetch — surfaced in retrieval run logs. */
export interface CodebaseFetchStats {
  topoPrefilter?: TopoPrefilterStats;
  graphAuthority?: {
    used: boolean;
    source: 'qdrant_payload';
    score: number;
    zeroRtt: true;
  };
  manifold4?: {
    used: boolean;
    boost: number;
    center?: Manifold4Point;
    radius?: number;
    expanded?: number;
    newChunks?: number;
  };
  didYouMean?: {
    reconstructionError: number;
    isNovel: boolean;
    errorSource: string;
    neighborCount: number;
  };
  aceCodeCache?: {
    used: boolean;
    hit: boolean;
    key?: string;
    chunks?: number;
  };
  karpathy?: {
    bowClusterBiasUsed: boolean;
    bowClusterScores: Array<{ clusterId: number; score: number }>;
  };
}

// ── BoW cluster pre-scorer ────────────────────────────────────────────────────
// Fetches all cluster BoW tiles in one Promise.all, scores each by weighted
// dot-product against query terms, returns clusters sorted by score descending.
// O(K × T): K = clusters scanned (≤24), T = terms per tile (≤128).
export type BowClusterScore = { clusterId: number; score: number };



const MAX_CLUSTERS_TO_SCAN = 24;

async function scoreClustersForQuery(
  queryTerms: Set<string>,
  maxClusters = MAX_CLUSTERS_TO_SCAN,
): Promise<BowClusterScore[]> {
  const tiles = await Promise.all(
    Array.from({ length: maxClusters }, (_, i) =>
      getClusterBowTexture(i).catch(() => null),
    ),
  );
  const scores: Array<{ clusterId: number; score: number }> = [];
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile || tile.terms.length === 0) continue;
    const tileRecord: Record<string, number> = {};
        for (let j = 0; j < tile.terms.length; j++) tileRecord[tile.terms[j]] = tile.weights[j];
        const { score } = weightedBowOverlapScore(queryTerms, tileRecord);
        if (score > 0) scores.push({ clusterId: i, score });
  }
  return scores.sort((a, b) => b.score - a.score);
}

export async function fetchCodebaseContext(
  query: string,
  userId?: string,
  filePath?: string,
  statsOut?: CodebaseFetchStats,
): Promise<ACEContext['codebaseContext']> {
  try {
    // Resolve nearest AGENTS.md directory from filePath via a Redis walk-up.
    // Used by applyKarpathyBoost to add a ≤0.05 same-dir boost (architecture
    // review item 3). Done inline here so the rerank doesn't need to wait for
    // the parallel agentsMd preflight in assembleACEContext.
    let agentsMdResolvedDir: string | undefined;
    if (filePath) {
      try {
        const { getRedis } = await import('$lib/server/redis.js');
        const redis = getRedis();
        let dir = filePath.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
        if (/\.[a-z]{1,5}$/i.test(dir)) dir = dir.split('/').slice(0, -1).join('/');
        while (dir && dir !== '.' && dir !== '/') {
          if (await redis.exists(`agents:dir:${dir}`)) {
            agentsMdResolvedDir = dir;
            break;
          }
          const parent = dir.split('/').slice(0, -1).join('/');
          if (parent === dir) break;
          dir = parent;
        }
      } catch { /* non-fatal — boost just won't apply */ }
    }

    // ── Stage 0: ACE codebase hit cache (ace:code:{qHash}:{topo}:{dirHash}) ──
    // Check Redis for a cached boosted chunk array from a recent identical query.
    // Keyed by query + topo class + agentsMd directory scope.
    // TTL 15 min — short enough to reflect new graph indexing runs.
    let aceCodeCacheHit = false;
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const topoClassForKey = classifyQuery(query);
      const cacheKey        = aceCodeKey.forQuery(query, topoClassForKey, agentsMdResolvedDir);
      const rawCached       = await getRedis().get(cacheKey);
      if (rawCached) {
        const parsed = JSON.parse(rawCached) as NonNullable<ACEContext['codebaseContext']>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          aceCodeCacheHit = true;
          if (statsOut) {
            statsOut.aceCodeCache = { used: true, hit: true, key: cacheKey, chunks: parsed.length };
            statsOut.topoPrefilter = {
              used: true, queryClass: TOPO_CLASS_LABEL[topoClassForKey] ?? 'unclassified',
              topoClass: topoClassForKey, cacheHit: true,
              candidateCount: parsed.length, candidateReduction: null,
              queryHash: topoQueryHash(query),
            };
          }
          // Fire-and-forget: tag cache-hit chunks in Qdrant + Redis counters
          import('$lib/server/ace/ace-hit-tagger.js')
            .then(({ tagAceHits }) => tagAceHits(parsed, { fromCache: true }))
            .catch(() => {});
          return parsed;
        }
      }
    } catch { /* non-fatal — proceed to live fetch */ }
    if (!aceCodeCacheHit && statsOut) {
      statsOut.aceCodeCache = { used: true, hit: false };
    }

    // ── Stage 1: topo-byte candidate cache (ace:topo:{class}:{hash}) ──────────
    // classifyQuery assigns one of 8 topology classes from the query terms.
    // Cache hit → use stored stableKeys + topo_class Qdrant filter, skip ANN.
    // Cache miss → Qdrant topo_class-filtered ANN, then store results (5-min TTL).
    let topoFilter: Record<string, unknown> | undefined;
    let topoPrefilterStats: TopoPrefilterStats | undefined;
    try {
      const queryClass  = classifyQuery(query);
      const qHash       = topoQueryHash(query);
      if (queryClass !== TOPO_CLASS.UNCLASSIFIED) {
        const cached = await getTopoCandidates(queryClass, query);
        if (cached && cached.length > 0) {
          topoPrefilterStats = buildTopoPrefilterStats({
            used: true, topoClass: queryClass, cacheHit: true,
            candidateCountAfter: cached.length,
            qdrantCollectionEstimate: null, queryHash: qHash,
          });
          // Filter Qdrant to the class label stored in payload (e.g. "graph-gpu-topology")
          topoFilter = { must: [{ key: 'topo_class', match: { value: TOPO_CLASS_LABEL[queryClass] } }] };
        } else {
          // Cache miss — apply topo_class filter to Qdrant; results will seed cache below
          topoFilter = { must: [{ key: 'topo_class', match: { value: TOPO_CLASS_LABEL[queryClass] } }] };
          topoPrefilterStats = buildTopoPrefilterStats({
            used: true, topoClass: queryClass, cacheHit: false,
            candidateCountAfter: 0, qdrantCollectionEstimate: null, queryHash: qHash,
          });
        }
      }
    } catch { /* non-fatal — proceed without topo prefilter */ }

    // ── Stage 2: centroid-based GPU-cluster pre-filter (embedding-space) ──────
    // Resolves query embedding once → Redis MGET nearest centroid (O(k)).
    // Falls back gracefully when centroids aren't seeded.
    let clusterFilter: Record<string, unknown> | undefined;
    try {
      const emb = await generateSingleEmbedding(query);
      if (emb && emb.length === 768) {
        const hit = await nearestCluster(new Float32Array(emb), 50);
        if (hit && hit.similarity > 0.35) {
          clusterFilter = { must: [{ key: 'neo4j_gpuCluster', match: { value: hit.clusterId } }] };
        }
      }
    } catch { /* non-fatal — continue without cluster pre-filter */ }

    // ── Stage 2B: BoW cluster pre-scoring (term-space, no embedding needed) ────
    // Scores all cluster BoW tiles against query terms in a single Promise.all.
    // Top-2 clusters are added as Qdrant `should` conditions: when `must` clauses
    // are also present (topo or centroid), `should` acts as a scoring boost only
    // (Qdrant semantics) — does not restrict the ANN sweep.
    // Threshold 0.05 filters noise (tile has no term overlap with query).
    let bowClusterShould: Array<{ key: string; match: { value: number } }> = [];
    try {
      const bowQueryTerms = tokenizeBowQuery(query);
      if (bowQueryTerms.size > 0) {
        const ranked = await scoreClustersForQuery(bowQueryTerms);
        if (statsOut) {
          statsOut.karpathy = {
            bowClusterBiasUsed: ranked.length > 0,
            bowClusterScores: ranked.slice(0, 5),
          };
        }
        bowClusterShould = ranked
          .slice(0, 2)
          .filter(c => c.score >= 0.05)
          .map(c => ({ key: 'neo4j_gpuCluster', match: { value: c.clusterId } }));
      }
    } catch { /* non-fatal */ }

    // Merge: topo (must) + centroid cluster (must) + BoW clusters (should).
    // Qdrant: `should` boosts scores of matching docs without restricting the set.
    const mustClauses: unknown[] = [
      ...(topoFilter   ? (topoFilter.must   as unknown[]) : []),
      ...(clusterFilter ? (clusterFilter.must as unknown[]) : []),
    ];
    const combinedFilter: Record<string, unknown> | undefined =
      mustClauses.length > 0 || bowClusterShould.length > 0
        ? {
            ...(mustClauses.length > 0       ? { must:   mustClauses       } : {}),
            ...(bowClusterShould.length > 0   ? { should: bowClusterShould  } : {}),
          }
        : undefined;

    // Fetch broader initial set so the reranker has candidates to work with
    const { searchCodebase } = await import('$lib/server/indexer/dual-embedder.js');
    const results = await searchCodebase(query, {
      limit: 20,
      contentWeight: 0.6,
      signatureWeight: 0.4,
      ...(combinedFilter ? { filter: combinedFilter } : {}),
    });

    // ── Tier-2 fallback: Postgres FTS when Qdrant returns nothing ───────────
    // searchCodeLexical hits code_retrieval_chunks (GIN tsvector) — no ANN needed.
    // Results are weighted at 0.3× relative to Qdrant cosine scores to keep them
    // ranked below any future Qdrant hits in merged result sets.
    if (!results.length) {
      try {
        const { searchCodeLexical } = await import('$lib/server/search/postgres-fts.js');
        const ftsRows = await searchCodeLexical(query, { limit: 10 });
        if (ftsRows.length > 0) {
          const ftsChunks = ftsRows.map((row) => ({
            filePath:            row.file_path,
            content:             row.content,
            score:               (row.lexical_score ?? 0) * 0.3,
            tags:                row.tags ? row.tags.split(',').filter(Boolean) : undefined,
            gpuCluster:          null,
            pageRankScore:       null,
            routeType:           null,
            hasAuthGuard:        null,
            somCluster:          null,
            somBmuRow:           null,
            somBmuCol:           null,
            graphAuthorityScore: row.graph_authority_score ?? null,
          } as NonNullable<ACEContext['codebaseContext']>[number]));
          writeAceCodeCache(query, classifyQuery(query), agentsMdResolvedDir, ftsChunks);
          return ftsChunks;
        }
      } catch { /* FTS unavailable — fall through to null */ }
      return null;
    }

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
      gpuCluster: r.chunk.neo4j_gpuCluster != null ? Number(r.chunk.neo4j_gpuCluster) : null,
      pageRankScore:
        r.chunk.neo4j_pageRankScore != null ? Number(r.chunk.neo4j_pageRankScore) : null,
      routeType: r.chunk.neo4j_routeType != null ? String(r.chunk.neo4j_routeType) : null,
      hasAuthGuard: r.chunk.neo4j_hasAuthGuard != null ? Boolean(r.chunk.neo4j_hasAuthGuard) : null,
      somCluster: r.chunk.som_cluster != null ? Number(r.chunk.som_cluster) : null,
      somBmuRow: r.chunk.som_bmu_row != null ? Number(r.chunk.som_bmu_row) : null,
      somBmuCol: r.chunk.som_bmu_col != null ? Number(r.chunk.som_bmu_col) : null,
      // Pre-computed by nightly GDS job; avoids Neo4j RTT per ACE call
      graphAuthorityScore: r.chunk.graph_authority_score != null ? Number(r.chunk.graph_authority_score) : null,
      communityId: r.chunk.communityId != null ? String(r.chunk.communityId) : null,
    });

    // Seed topo cache on miss (fire-and-forget) — stableKey + score from Qdrant results
    if (topoPrefilterStats && !topoPrefilterStats.cacheHit && results.length > 0) {
      try {
        const entries = results.map((r) => ({
          stableKey: String(r.chunk.stableKey ?? r.chunk.path ?? ''),
          score:     r.score,
          path:      (r.chunk.path ?? r.chunk.relativePath ?? undefined) as string | undefined,
        }));
        const qc = classifyQuery(query);
        setTopoCandidates(qc, query, entries).catch(() => {});
        topoPrefilterStats = buildTopoPrefilterStats({
          used: true,
          cacheHit: false,
          topoClass: topoPrefilterStats.topoClass,
          queryHash: topoPrefilterStats.queryHash,
          candidateCountAfter: entries.length,
          qdrantCollectionEstimate: null,
        });
      } catch { /* non-fatal */ }
    }
    if (statsOut && topoPrefilterStats) statsOut.topoPrefilter = topoPrefilterStats;

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
          const unsorted = results.map((r) => {
            const docId = String(r.chunk.path ?? r.chunk.relativePath ?? '');
            return toCtx(r, scoreMap.get(docId) ?? r.score);
          });

          // Phase 8: Apply 4D topological boost (PageRank + SOM + hyperedge grade + query BMU + manifold4)
          // queryBmuCached: Redis-cached CUDA SOM forward pass — maps query to grid position
          // so chunks near the query's own SOM neuron get an extra affinity signal.
          const queryBmu = await queryBmuCached(
            await generateSingleEmbedding(query).catch(() => [])
          ).catch(() => undefined);

          // Phase 8a: Compute manifold4 centroid of the reranked hit-set.
          // Used both for neighborhood expansion (below) and the per-chunk boost.
          const manifold4Points = unsorted
            .map((r) => (r as unknown as Record<string, unknown>).manifold4 as number[] | null | undefined)
            .map((m): Manifold4Point | null => (m?.length === 4 ? (m as Manifold4Point) : null));
          const manifold4Center = computeManifold4Centroid(manifold4Points) ?? undefined;

          // Phase 8b: Manifold4 neighborhood expansion — search Postgres for chunks
          // topologically close to the centroid that Qdrant cosine search may have missed.
          // Fire-and-forget pattern: failure is non-fatal, results are merged deduped.
          let manifold4Expanded = 0;
          let manifold4NewChunks = 0;
          const MANIFOLD4_RADIUS = 0.3;
          if (manifold4Center) {
            try {
              const existingPaths = new Set(unsorted.map((r) => (r as { filePath?: string }).filePath ?? ''));
              const neighbors = await searchManifold4({
                center: manifold4Center,
                radius: MANIFOLD4_RADIUS,
                limit: 8,
              });
              manifold4Expanded = neighbors.hits.length;
              for (const hit of neighbors.hits) {
                if (existingPaths.has(hit.relativePath)) continue;
                const blended = blendManifoldScore(0, hit.manifoldDistance);
                unsorted.push({
                  filePath: hit.relativePath,
                  content: hit.content,
                  score: blended,
                  lineStart: hit.chunkIndex ?? undefined,
                  lineEnd: undefined,
                  tags: hit.semanticTags ?? undefined,
                  gpuCluster: hit.gpuCluster ?? null,
                  pageRankScore: hit.pageRankScore ?? null,
                  routeType: null,
                  hasAuthGuard: null,
                  somCluster: hit.somCluster ?? null,
                  somBmuRow: hit.somBmuRow ?? null,
                  somBmuCol: hit.somBmuCol ?? null,
                  graphAuthorityScore: null,
                } as (typeof unsorted)[number]);
                existingPaths.add(hit.relativePath);
                manifold4NewChunks++;
              }
            } catch {
              // Postgres manifold4 search unavailable — expansion skipped, boost still applies
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const boosted = await applyTopologicalBoostAsync(unsorted as any, { queryBmu, manifold4Center });

          // Collect graphAuthority + manifold4 stats for retrieval run log
          if (statsOut) {
            const authScores = boosted
              .map((c) => (c as unknown as { graphAuthorityScore?: number | null }).graphAuthorityScore)
              .filter((s): s is number => s != null);
            if (authScores.length > 0) {
              statsOut.graphAuthority = {
                used: true,
                source: 'qdrant_payload',
                score: Math.max(...authScores),
                zeroRtt: true,
              };
            }
            statsOut.manifold4 = {
              used: manifold4Center != null,
              boost: 0.16,
              center: manifold4Center,
              radius: MANIFOLD4_RADIUS,
              expanded: manifold4Expanded,
              newChunks: manifold4NewChunks,
            };

            // Phase 8c: "Did you mean" — fire-and-forget, non-fatal.
            // Uses true autoencoder reconstruction error when decoder weights are in Redis
            // (written by tensor:topology after graphify:full), otherwise falls back to
            // 1 − cosine(query, BMU centroid).
            if (queryBmu) {
              import('$lib/server/retrieval/centroid-cache.js')
                .then(async ({ didYouMeanClusters }) => {
                  const qEmb = new Float32Array(await generateSingleEmbedding(query).catch(() => []));
                  if (!qEmb.length) return;
                  const dym = await didYouMeanClusters(qEmb, queryBmu.row, queryBmu.col, {
                    manifold4Coords: manifold4Center as [number, number, number, number] | undefined,
                  });
                  statsOut!.didYouMean = {
                    reconstructionError: dym.reconstructionError,
                    isNovel:             dym.isNovel,
                    errorSource:         dym.errorSource,
                    neighborCount:       dym.neighbors.length,
                  };
                })
                .catch(() => {});
            }
          }

          const finalChunks = await applyKarpathyBoost(boosted.slice(0, 10) as any, query, agentsMdResolvedDir);
          writeAceCodeCache(query, classifyQuery(query), agentsMdResolvedDir, finalChunks ?? []);
          return finalChunks;
        }
      } catch {
        // Reranker unavailable — fall through to cosine-only results below
      }
    }

    // Fallback: cosine-score filtering only + Karpathy boost
    const fallbackChunks = await applyKarpathyBoost(
      results
        .filter((r) => r.score >= 0.5)
        .slice(0, 10)
        .map((r) => toCtx(r)),
      query,
      agentsMdResolvedDir,
    );
    writeAceCodeCache(query, classifyQuery(query), agentsMdResolvedDir, fallbackChunks ?? []);
    return fallbackChunks;
  } catch (err) {
    console.warn('[ACE context] codebase context fetch failed:', (err as Error)?.message ?? err);
    return null;
  }
}

// ── Karpathy tag-aware boost for codebase context ─────────────────────────

/** Maps query keywords to Karpathy semantic tags for relevance boosting */
const QUERY_TAG_MAP: Record<string, string[]> = {
  api: ['api-route', 'sse'],
  route: ['api-route', 'page-component'],
  endpoint: ['api-route'],
  page: ['page-component', 'ui-component'],
  component: ['ui-component', 'page-component'],
  database: ['database'],
  schema: ['database', 'types'],
  drizzle: ['database'],
  query: ['database', 'vector-search'],
  qdrant: ['vector-search', 'embedding'],
  vector: ['vector-search', 'embedding'],
  search: ['vector-search', 'rag-pipeline'],
  rag: ['rag-pipeline', 'vector-search'],
  cache: ['cache'],
  redis: ['cache'],
  auth: ['auth'],
  login: ['auth'],
  state: ['state-machine'],
  xstate: ['state-machine'],
  machine: ['state-machine'],
  worker: ['worker'],
  queue: ['worker'],
  rabbitmq: ['worker'],
  stream: ['sse'],
  sse: ['sse'],
  embed: ['embedding'],
  test: ['test'],
  config: ['config'],
  neo4j: ['graph-db'],
  graph: ['graph-db'],
  graphify: ['graph-db', 'ml-inference'],
  hyperedge: ['graph-db', 'ml-inference'],
  hypergraph: ['graph-db', 'ml-inference'],
  som: ['ml-inference', 'vector-search'],
  topology: ['graph-db', 'vector-search'],
  cluster: ['ml-inference', 'vector-search'],
  pagerank: ['graph-db'],
  gpu: ['ml-inference'],
  cuda: ['ml-inference'],
  inference: ['ml-inference'],
  onnx: ['ml-inference'],
  analytics: ['analytics'],
  metric: ['analytics'],
};

/**
 * Apply Karpathy semantic tag boost + GPU cluster coherence scoring + BoW overlap.
 *
 * 1. Infer query's probable semantic tags from keywords
 * 2. Boost chunks whose Karpathy tags overlap with inferred tags (+0.08 per match, max +0.24)
 * 3. Boost chunks from same GPU cluster as top-ranked result (+0.04)
 * 4. Fetch cluster BoW texture tile and boost chunks with term overlap (+0.03 per hit, max +0.12)
 * 5. Boost chunks from same SOM cell as top result (+0.03)
 * 6. Attach RerankBreakdown per chunk for RL feedback
 * 7. Re-sort, return top 5 above 0.45
 */
async function applyKarpathyBoost(
  candidates: NonNullable<ACEContext['codebaseContext']>,
  query: string,
  agentsMdResolvedDir?: string,
): Promise<NonNullable<ACEContext['codebaseContext']>> {
  if (!candidates || candidates.length === 0) return candidates;

  // Normalise the AGENTS.md resolved dir for fast prefix-match checks.
  // Empty string means "repo root fallback" — no useful prefix to match.
  const agentsDir = agentsMdResolvedDir
    ? agentsMdResolvedDir.replace(/\\/g, '/').replace(/\/+$/, '')
    : '';

  // Step 1: infer query semantic tags from keywords
  const queryLower = query.toLowerCase();
  const inferredTags = new Set<string>();
  for (const [keyword, tags] of Object.entries(QUERY_TAG_MAP)) {
    if (queryLower.includes(keyword)) {
      for (const t of tags) inferredTags.add(t);
    }
  }

  // Step 2: identify top result's GPU cluster + SOM cell for coherence boosts
  const topCluster  = candidates[0]?.gpuCluster ?? null;
  const topSomRow   = candidates[0]?.somBmuRow ?? null;
  const topSomCol   = candidates[0]?.somBmuCol ?? null;
  const topManifold4 = (candidates[0] as Record<string, unknown>)?.manifold4 as number[] | null | undefined;

  // HMM prediction: classify the query into a legal document section,
  // then derive per-axis scale multipliers for the quaternion bias.
  // At confidence=0 (unknown), the multiplier is neutral [1,1,1,1].
  const { section: hmmSection, confidence: hmmConf } = classifyQuerySection(query);

  const topQuat = topManifold4?.length === 4
    ? manifold4ToQuaternion(topManifold4 as [number, number, number, number], hmmSection, hmmConf)
    : null;

  // Step 4 pre-fetch: load cluster BoW tile + SOM tile (non-blocking, best-effort).
  // graphAuthorityScore is pre-computed nightly by writeAuthorityScoresToQdrant() and
  // already present in the Qdrant search payload — no Neo4j RTT needed here.
  const payloadAuthorityAvailable = candidates.some(c => (c as Record<string, unknown>).graphAuthorityScore != null);

  const [clusterTile, somTile, authorityNodes] = await Promise.all([
    topCluster != null ? getClusterBowTexture(topCluster).catch(() => null) : Promise.resolve(null),
    topSomRow != null && topSomCol != null
      ? getSomBowTexture(topSomRow, topSomCol).catch(() => null)
      : Promise.resolve(null),
    // Only call Neo4j when payload scores aren't available (pre-nightly-job state)
    payloadAuthorityAvailable
      ? Promise.resolve([] as import('$lib/server/graph/neo4j-gds.js').AuthorityNode[])
      : import('$lib/server/graph/neo4j-gds.js')
          .then(m => m.getTopAuthorityNodes(50))
          .catch(() => [] as import('$lib/server/graph/neo4j-gds.js').AuthorityNode[]),
  ]);

  // Build stableKey/path → normalised PageRank score (0–1) for fast lookup (fallback path)
  const maxPR = authorityNodes.reduce((m, n) => Math.max(m, n.graphPageRank), 1e-9);
  const authorityMap = new Map(
    authorityNodes.map(n => [
      (n.path ?? n.stableKey).replace(/\\/g, '/').replace(/^sveltekit-frontend\//, ''),
      n.graphPageRank / maxPR,
    ])
  );

  // Build query BoW from query terms for overlap scoring
  const queryTerms = tokenizeBowQuery(query);

    // Step 3–6: apply boosts and build breakdown
  const boosted = candidates.map((c) => {
    const semantic = c.score;
    let qdrantTagBoost = 0;
    let clusterBoost = 0;
    let somBoost = 0;
    let bowBoost = 0;
    // graphAuthorityScore boost (+0–0.08): prefers Qdrant payload (no Neo4j RTT);
    // falls back to authorityMap from Neo4j when payload score not yet populated.
    const payloadScore = (c as Record<string, unknown>).graphAuthorityScore as number | null | undefined;
    const fileLookup = c.filePath
      ? c.filePath.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '')
      : '';
    const pagerankBoost = payloadScore != null
      ? Math.min(payloadScore * 0.08, 0.08)
      : fileLookup ? Math.min((authorityMap.get(fileLookup) ?? 0) * 0.08, 0.08) : 0;
    const pairedTestBoost = 0; // populated downstream by paired test check

    // Tag overlap boost: +0.08 per matching Karpathy tag (max +0.24)
    if (inferredTags.size > 0 && c.tags?.length) {
      let tagMatches = 0;
      for (const tag of c.tags) {
        if (inferredTags.has(tag)) tagMatches++;
      }
      qdrantTagBoost = Math.min(tagMatches * 0.08, 0.24);
    }

    // GPU cluster coherence: +0.04 if same cluster as top result
    if (topCluster != null && c.gpuCluster === topCluster && c !== candidates[0]) {
      clusterBoost = 0.04;
    }

    // SOM cell proximity: +0.03 if same SOM cell as top result
    if (
      topSomRow != null && topSomCol != null &&
      c.somBmuRow === topSomRow && c.somBmuCol === topSomCol &&
      c !== candidates[0]
    ) {
      somBoost = 0.03;
    }

    // BoW term overlap: weighted dot-product against cluster texture tile.
    // tile.weights are IDF-normalized (sum ≈ 1.0), so high-frequency terms for the
    // cluster contribute more. Scale factor 0.24 means a weighted overlap of 0.5
    // (half the cluster vocabulary matching) yields the full +0.12 cap.
    if (clusterTile && clusterTile.terms.length > 0) {
      const chunkTerms = new Set(
        c.content.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3)
      );
      const clusterRecord: Record<string, number> = {};
            for (let j = 0; j < clusterTile.terms.length; j++) {
              if (chunkTerms.has(clusterTile.terms[j])) clusterRecord[clusterTile.terms[j]] = clusterTile.weights[j];
            }
            const { score: bowScore } = weightedBowOverlapScore(queryTerms, clusterRecord);
            bowBoost = boundedBowBoost(bowScore);
    } else if (somTile && somTile.terms.length > 0) {
      // Fall back to SOM tile if cluster tile absent
      const chunkTerms = new Set(
        c.content.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3)
      );
      const somRecord: Record<string, number> = {};
            for (let j = 0; j < somTile.terms.length; j++) {
              if (chunkTerms.has(somTile.terms[j])) somRecord[somTile.terms[j]] = somTile.weights[j];
            }
            const { score: bowScore } = weightedBowOverlapScore(queryTerms, somRecord);
            bowBoost = boundedBowBoost(bowScore);
    }

    // Same-AGENTS.md-dir boost (architecture review item 3).
    // Chunks under the resolved AGENTS.md directory get a small uplift so the
    // model prefers local-context evidence when it has a directory map.
    // Hard-capped at 0.05 per the architectural recommendation — must not
    // override stronger semantic signals.
    let sameAgentsDirBoost = 0;
    if (agentsDir && c.filePath) {
      const fp = c.filePath.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
      if (fp === agentsDir || fp.startsWith(agentsDir + '/')) {
        sameAgentsDirBoost = 0.05;
      }
    }

    // Quaternion manifold boost: HMM-biased angular similarity on S³.
    // Both query (topQuat) and chunk quaternions are normalised in the same
    // axis-scaled space so the dot product is more sensitive to the axes that
    // matter for the current HMM section.
    // Neutral at score ≤ 0.5; max +0.06 at perfect match (score = 1.0).
    let quaternionBoost = 0;
    if (topQuat && c !== candidates[0]) {
      const chunkM4 = (c as Record<string, unknown>).manifold4 as number[] | null | undefined;
      if (chunkM4?.length === 4) {
        const chunkQuat = manifold4ToQuaternion(chunkM4 as [number, number, number, number], hmmSection, hmmConf);
        const qScore = quaternionSimilarity(topQuat, chunkQuat);
        quaternionBoost = Math.max(0, qScore - 0.5) * 0.12;
      }
    }

    const final = semantic + qdrantTagBoost + clusterBoost + somBoost + bowBoost + pagerankBoost + pairedTestBoost + sameAgentsDirBoost + quaternionBoost;
    const breakdown: RerankBreakdown = {
      semantic,
      qdrantTag: qdrantTagBoost,
      cluster: clusterBoost,
      som: somBoost,
      pagerank: pagerankBoost,
      bow: bowBoost,
      pairedTest: pairedTestBoost,
      sameAgentsDir: sameAgentsDirBoost,
      quaternion: quaternionBoost,
      final,
    };

    return { ...c, score: final, rerankBreakdown: breakdown };
  });

  const top = boosted
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .filter((r) => r.score >= 0.45);

  // Step 7: attach cached LLM outputs from code-llm-index (single MGET, <5ms)
  // Path-keyed cache lets two queries that touch the same file share a synthesis
  // without going back to the LLM.
  if (top.length > 0) {
    try {
      const hits = await getLlmOutputHitsBulk(top.map((c) => c.filePath));
      for (let i = 0; i < top.length; i++) {
        const hit = hits[i];
        if (hit) {
          top[i].cachedLlmOutput = hit.llmOutput;
          top[i].cachedLlmSource = hit.source;
        }
      }
    } catch {/* best-effort — cache miss is fine */}
  }

  return top;
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
