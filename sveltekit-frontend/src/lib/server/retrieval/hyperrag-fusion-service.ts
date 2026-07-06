import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { nearestCluster } from '$lib/server/retrieval/centroid-cache.js';
import { applyClusterCoherenceBoost } from '$lib/server/retrieval/cluster-aware-reranker.js';
import { getTopAuthorityNodes, getImpactNeighborhood, runDijkstraContext } from '$lib/server/graph/neo4j-gds.js';
import { MultiQueryGenerator } from '$lib/server/ai/multi-query-generator.js';
import { buildAceContextPlannerState, loadAceContextPlannerHit } from '$lib/server/ace/context-cache-planner.js';
import { SummaryLensesService, type SummaryLensHit } from '$lib/server/retrieval/summary-lenses.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { VECTOR_CONFIG, buildVectorPayload } from '$lib/server/config/vector-config.js';
import { db } from '$lib/server/db/client.js';
import { uploadedFiles } from '$lib/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { LibTorchReranker } from '$lib/server/ai/libtorch-reranker.js';
import { getReasoningModelId } from '$lib/server/models/model-registry.js';
import { HypergraphRoutingService } from '$lib/server/retrieval/hypergraph-routing-service.js';
import { QueryProfileRouter, getClusterAlias } from '$lib/server/retrieval/query-profile-router.js';
import { RoutingExplanationBuilder, type RoutingExplanation } from '$lib/server/retrieval/routing-explanation.js';
import { getRouteClusterPriors } from '$lib/server/atlas/route-feature-map.js';
import { buildSubgraphV1SeedNeighborhood } from '$lib/server/retrieval/subgraph-seed-neighborhood.js';
import { ContextPacketBudgeter, DEFAULT_BUDGET, type ContextBudget } from '$lib/server/ace/context-packet-budgeter.js';
import { logAceRun } from '$lib/server/retrieval/ace-retrieval-logger.js';
import { ColdStorageRetrievalService } from '$lib/server/retrieval/cold-storage-retrieval-service.js';
import { execFileSync } from 'node:child_process';
import { engramAdapter } from '$lib/server/memory/local-engram-memory-adapter.js';
import { computeRRFScore, RRF_LANE_WEIGHTS, RRF_CONSTANT_K, type RRFScoreResult } from '$lib/server/retrieval/compute-rrf-score.js';
import { partitionHitsByLane } from '$lib/server/retrieval/signal-grouping.js';
import { computeVectorScore } from '$lib/server/retrieval/vector-scorer.js';
import { computeGraphScore, blendGraphSignals } from '$lib/server/retrieval/graph-scorer.js';
import { blendTelemetrySignals } from '$lib/server/retrieval/telemetry-scorer.js';

export type LexicalClusterHit = {
  clusterId: number;
  score: number;
  source: 'header' | 'symbol' | 'path' | 'tag' | 'detail';
  text: string;
};

export type HyperRagMode = 'codebase' | 'evidence' | 'legal' | 'docs' | 'programming_docs';

export type HyperRagQuery = {
  query: string;
  mode: HyperRagMode;
  topK?: number;
  includeReasons?: boolean;
  synthesize?: boolean;
  useTopologyRouting?: boolean;
  topologyTopK?: number;
  clusterField?: 'gpu_cluster' | 'som_cluster';
  useTaskDistillates?: boolean;
  useTurboVec?: boolean;
  useGraph?: boolean;
  useAceCache?: boolean;
  tokenBudget?: number;
  userId?: string;
  compareScoring?: boolean;
};

export type HyperRagHit = {
  id: string;
  sourcePath?: string;
  title?: string;
  text?: string;
  score: number;
  scoreWeightedSum?: number;
  signals: {
    dense?: number;
    graphAuthority?: number;
    clusterMatch?: number;
    pagerank?: number;
    aceBoost?: number;
    turbovec?: number;
    topoClass?: string;
    lexicalBoost?: number;
    taskBoost?: number;
    activity_w?: number;
    cluster_alias?: string;
    recencyOrHitRate?: number;
    engramBoost?: number;
  };
  rrfBreakdown?: Array<{
    lane: string;
    contribution: number;
  }>;
  manifold4?: [number, number, number, number];
  manifold4Meta?: {
    som_x: number;
    som_y: number;
    semantic_z: number;
    activity_w: number;
    cluster_id?: string;
    gpu_cluster?: string;
    som_cluster?: string;
    pagerank?: number;
    hit_rate?: number;
    last_used_at?: string;
    cluster_alias?: string | null;
  };
  reasons: string[];
  payload?: Record<string, unknown>;
  vector?: number[];
};

export type HyperRagResult = {
  query: string;
  variants: string[];
  hits: HyperRagHit[];
  graphPaths: unknown[];
  contextPack?: unknown;
  summaryLenses?: SummaryLensHit[];
  taskDistillate?: any;
  synthesis?: string | null;
  provenance: {
    qdrant: boolean;
    turbovec: boolean;
    redis: boolean;
    neo4j: boolean;
    ace: boolean;
    taskDistillates: boolean;
  };
  routingExplanation?: RoutingExplanation;
};

/**
 * HyperRAG Fusion Service
 * Consolidates Qdrant, Neo4j, Redis, TurboVec, and ACE into a single high-performance retrieval service.
 */
export class HyperRagFusionService {
  private static instance: HyperRagFusionService;

  private constructor() {}

  public static getInstance(): HyperRagFusionService {
    if (!HyperRagFusionService.instance) {
      HyperRagFusionService.instance = new HyperRagFusionService();
    }
    return HyperRagFusionService.instance;
  }

  /**
   * Execute a fused HyperRAG search.
   */
  public async search(params: HyperRagQuery): Promise<HyperRagResult> {
    const {
      query,
      mode = 'codebase',
      topK = 15,
      useTurboVec = true,
      useGraph = true,
      useAceCache = true,
      includeReasons = true,
      synthesize = false,
      useTopologyRouting = true,
      topologyTopK = 3,
      clusterField = 'gpu_cluster',
      useTaskDistillates = true,
      tokenBudget,
      userId,
    } = params;

    const effectiveTopK = tokenBudget
      ? Math.max(2, Math.min(topK, Math.floor(tokenBudget / 450)))
      : topK;
    const effectiveTopologyTopK = tokenBudget
      ? Math.max(1, Math.min(topologyTopK, Math.floor(tokenBudget / 800)))
      : topologyTopK;

    const contextBudget: ContextBudget = tokenBudget
      ? {
          maxTokens: tokenBudget,
          maxTaskDistillates: tokenBudget < 1800 ? 1 : 2,
          maxClusterCards: tokenBudget < 1800 ? 1 : 3,
          maxGraphPaths: tokenBudget < 1800 ? 3 : 8,
          maxRawChunks: Math.max(2, Math.min(DEFAULT_BUDGET.maxRawChunks, Math.floor(tokenBudget / 350))),
          maxCitations: tokenBudget < 2000 ? 10 : 20,
        }
      : DEFAULT_BUDGET;

    const redis = typeof getRedis === 'function' ? getRedis() : null;
    const qdrantUrl = ENV.QDRANT_URL;
    const turbovecUrl = ENV.TURBOVEC_SIDECAR;
    const hgLookupUrl = ENV.HG_LOOKUP_URL ?? ENV.TOPOLOGY_SEARCH_URL;
    const hgLookupSource = ENV.HG_LOOKUP_URL ? 'HG_LOOKUP_URL' : 'TOPOLOGY_SEARCH_URL';

    const provenance = {
      qdrant: false,
      turbovec: false,
      redis: false,
      neo4j: false,
      ace: false,
      topology: false,
      topologyRouting: false,
      taskDistillates: false,
    };

    const explanation = new RoutingExplanationBuilder();

    // 1. Multi-query expansion & Profile Routing
    const profile = QueryProfileRouter.route(query);
    explanation.setProfile(profile);

    const seedEnvelope = await buildSubgraphV1SeedNeighborhood({
      query,
      maxSeeds: 6,
      maxNeighbors: Math.max(8, Math.min(24, effectiveTopK * 2)),
      maxHops: 1,
    }).catch(() => null);
    if (seedEnvelope) {
      explanation.setSubgraphSeedEnvelope(seedEnvelope);
    }

    // Lane -1: Engram Query Memory (Local Redis Bigram/SOM hints)
    const engramHint = await engramAdapter.getRoutingHints(query).catch(() => null);
    if (engramHint) {
      explanation.setEngram({
        enabled: true,
        didYouMean: engramHint.didYouMean,
        bmuHints: engramHint.bmuHints,
        clusterHints: engramHint.clusterHints,
        trust: 'low_hint',
      });
    }

    // Merge Profile Priors with Route Priors (if path is in query or passed in params)
    const profilePriors = QueryProfileRouter.getPriors(profile);
    const routePriors = getRouteClusterPriors(query); // Heuristic: check if query is a route
    const consolidatedPriors = [...new Set([...profilePriors, ...routePriors])];

    explanation.setProfileClusters(consolidatedPriors);
    explanation.setProfileClusterAliases(consolidatedPriors);

    const variants = useAceCache
      ? await MultiQueryGenerator.generate(query, 3).catch(() => [query])
      : [query];

    const embedding = await generateSingleEmbedding(query).catch(() => null);
    if (!embedding) {
      throw new Error('Failed to generate query embedding');
    }

    const clusterMatch = useAceCache ? await nearestCluster(embedding, 20).catch(() => null) : null;
    if (clusterMatch?.clusterId) explanation.addRedisCard(clusterMatch.clusterId);

    const routingService = HypergraphRoutingService.getInstance();

    // 2. Multi-Lane Discovery (Lane 0: Lexical, Lane 1: Topology, Lane 3: Task)
    const [lexicalHits, routing, taskDistillate] = await Promise.all([
      this.discoverLexicalClusters(query).catch(() => []),
      useTopologyRouting
        ? routingService.route(embedding, query, topologyTopK)
        : Promise.resolve(null),
      useTaskDistillates
        ? this.searchTaskDistillates(embedding, 1).catch(() => null)
        : Promise.resolve(null),
      // Lane 4: Cold Storage (Postgres fallback)
      ColdStorageRetrievalService.search(embedding, topK).catch(() => []),
    ]);

    const lexicalClusterIds = lexicalHits.map((h) => h.clusterId);
    if (lexicalClusterIds.length > 0) explanation.setLexicalClusters(lexicalClusterIds);
    if (routing?.clusterIds.length) {
      provenance.topologyRouting = true;
      explanation.setTopologyClusters(routing.clusterIds);
      if (routing.hotClusterIds?.length) {
        explanation.setHotClusters(routing.hotClusterIds);
      }
    }
    if (taskDistillate) {
      explanation.addTaskDistillate(taskDistillate.task_key);
      if (taskDistillate.clusters) {
        explanation.setTaskClusters(taskDistillate.clusters.map((c: string) => parseInt(c, 10)));
      }
    }

    // 2.1 Consolidate Clusters for Filtering
    const allClusterIds = new Set<number>([
      ...(lexicalClusterIds || []),
      ...(routing?.clusterIds || []),
      ...(routing?.hotClusterIds || []),
      ...(consolidatedPriors || []),
      ...(taskDistillate?.clusters?.map((c: string) => parseInt(c, 10)) || []),
    ]);

    explanation.setFinalClusters(Array.from(allClusterIds));
    const hgFilter =
      allClusterIds.size > 0
        ? { must: [{ key: clusterField, match: { any: Array.from(allClusterIds) } }] }
        : null;

    const targetCollection = this.getCollectionForMode(mode);

    // 2.2 Parallel lane retrieval with Fallback Ladder
    const minHits = Math.min(3, effectiveTopK);
    const filterLadder = [
      { name: 'strict_cluster', filter: hgFilter },
      {
        name: 'topology_only',
        filter: routing ? routingService.buildFilter(routing, clusterField) : null,
      },
      { name: 'unfiltered', filter: null },
    ];

    let qdrantSemantic: HyperRagHit[] = [];
    let qdrantKag: HyperRagHit[] = [];
    let turbovecIds: string[] = [];
    let graphAuthority: any[] = [];
    let aceCacheHit: any = null;
    let aceSummaryLenses: any[] = [];

    // Execute non-Qdrant lanes once
    [turbovecIds, graphAuthority, aceCacheHit, aceSummaryLenses] = await Promise.all([
      useTurboVec
        ? this.searchTurboVec(turbovecUrl, embedding, effectiveTopK * 5).catch(() => [])
        : Promise.resolve([]),
      useGraph ? getTopAuthorityNodes(100).catch(() => []) : Promise.resolve([]),
      useAceCache
        ? loadAceContextPlannerHit(buildAceContextPlannerState({ query })).catch(() => null)
        : Promise.resolve(null),
      useAceCache
        ? SummaryLensesService.searchByCluster(clusterMatch?.clusterId ?? -1, 5).catch(() => [])
        : Promise.resolve([]),
    ]);

    // Qdrant Fallback Ladder Execution
    for (const step of filterLadder) {
      if (step.name !== 'unfiltered' && !step.filter) continue;

      console.log(`[HyperRagFusionService] Attempting Qdrant search: ${step.name}`);
      const [semantic, kag, externalDocs] = await Promise.all([
        this.searchQdrantMulti(
          qdrantUrl,
          targetCollection,
          variants,
          effectiveTopK,
          'semantic',
          { [query]: embedding },
          step.filter
        ).catch(() => []),
        this.searchQdrant(
          qdrantUrl,
          VECTOR_CONFIG.COLLECTIONS.summary_lenses,
          embedding,
          Math.ceil(effectiveTopK / 2),
          'kag'
        ).catch(() => []),
        mode === 'codebase'
          ? this.searchQdrant(
              qdrantUrl,
              VECTOR_CONFIG.COLLECTIONS.programming_docs,
              embedding,
              5,
              'external_docs'
            ).catch(() => [])
          : Promise.resolve([]),
      ]);

      if (semantic.length >= minHits || step.name === 'unfiltered') {
        qdrantSemantic = [...semantic, ...externalDocs];
        qdrantKag = kag;
        if (step.name !== 'strict_cluster')
          explanation.addFallback(`Fell back to ${step.name} due to low hit count`);
        break;
      }
    }

    provenance.qdrant = qdrantSemantic.length > 0 || qdrantKag.length > 0;
    provenance.turbovec = turbovecIds.length > 0;
    provenance.redis = clusterMatch !== null;
    provenance.neo4j = graphAuthority.length > 0;
    provenance.ace = aceCacheHit !== null || (aceSummaryLenses && aceSummaryLenses.length > 0);
    provenance.taskDistillates = taskDistillate !== null;

    // 2.2 Hyper Dense Lexical Discovery (Dynamic Env Mapping)
    const clusterDirsSet = new Set(this.getClusterDirs(Array.from(allClusterIds)));
    const serverSideContext =
      profile === 'ace_cache' ||
      profile === 'agent_workflow' ||
      profile === 'db_schema' ||
      profile === 'auth' ||
      String(clusterMatch?.topoClass ?? '')
        .toLowerCase()
        .includes('server');
    if (serverSideContext) clusterDirsSet.add('src/lib/server');
    const clusterDirs = Array.from(clusterDirsSet);
    let rgHits: any[] = [];
    if (clusterDirs.length > 0) {
      console.log(
        `[HyperRagFusionService] Dynamic env mapping to ${clusterDirs.length} dense directories...`
      );
      rgHits = await this.searchRgDynamic(query, clusterDirs).catch(() => []);
    }

    // 3. RRF Fusion + Boosting
    const allResults = [...qdrantSemantic, ...qdrantKag, ...rgHits];
    const turbovecSet = new Set(turbovecIds.map(String));
    const authorityMap = new Map(graphAuthority.map((n) => [n.stableKey, n]));

    const scoreMap = new Map<string, HyperRagHit>();

    for (const pt of allResults) {
      const id = String(pt.id);
      const payload = (pt.payload as Record<string, unknown>) ?? {};
      const stableKey = String(payload.stable_key ?? id);

      const authNode = authorityMap.get(stableKey);
      const pageRank = authNode?.graphPageRank ?? (payload.pageRank as number) ?? 0;
      const authorityScore =
        authNode?.graphAuthorityScore ?? (payload.graph_authority_score as number) ?? 0;

      const existing = scoreMap.get(id);
      const reasons: string[] = [];

      const hasClusterMatch =
        clusterMatch?.clusterId != null && payload.gpuCluster === clusterMatch.clusterId;
      const isRgHit = pt.lane === 'rg_dynamic';
      const clusterId = Number(
        payload[clusterField] ?? payload.gpuCluster ?? payload.somCluster ?? NaN
      );
      const clusterAlias = getClusterAlias(clusterId);
      const hitRate = Number(payload.hit_rate ?? payload.hitRate ?? 0) || 0;
      const lastUsedAt =
        typeof payload.last_used_at === 'string'
          ? payload.last_used_at
          : typeof payload.lastUsedAt === 'string'
            ? payload.lastUsedAt
            : undefined;
      const recencyBoost = lastUsedAt
        ? Math.max(
            0,
            1 - Math.min(1, (Date.now() - Date.parse(lastUsedAt)) / (1000 * 60 * 60 * 24 * 30))
          )
        : 0;

      // Scoring logic (v1.0)
      const lexicalScore =
        lexicalHits.find((h) => h.clusterId === (payload[clusterField] as number))?.score ?? 0;

      const signals = {
        dense: pt.score,
        graphAuthority: authorityScore,
        clusterMatch: hasClusterMatch ? 0.1 : 0,
        pagerank: pageRank,
        aceBoost: aceCacheHit ? 0.1 : 0,
        turbovec: turbovecSet.has(id) ? 0.15 : 0,
        topoClass: (payload.topoClass ?? payload.topo_class) as string,
        topologyRouted: routing?.clusterIds.includes((payload[clusterField] as number) ?? -1)
          ? 0.15
          : 0,
        lexicalBoost: lexicalScore,
        taskBoost: taskDistillate?.clusters?.includes(String(payload[clusterField])) ? 0.1 : 0,
        activity_w: (payload.activity_w ?? payload.pagerank ?? 0) as number,
        cluster_alias: clusterAlias ?? undefined,
        recencyOrHitRate: Math.max(hitRate, recencyBoost),
        engramBoost: 0,
        trustTier: (payload.trustTier ??
          (pt.lane === 'external_docs' ? 'official_docs' : 'canonical')) as string,
        isExternal: pt.lane === 'external_docs',
      };

      // Engram Boost (v1.1)
      // Restricted to validated workflow memory hits for specific profiles
      const memoryProfiles = ['agent_workflow', 'code_debug', 'retrieval_debug'];
      if (memoryProfiles.includes(profile ?? '') && engramHint?.workflowMemories) {
        const hitCluster = String(payload[clusterField]);
        const hitFeature = (payload.featureKey ?? payload.feature_key) as string;

        const hasMatch = engramHint.workflowMemories.some(
          (m) =>
            m.accepted &&
            m.testsPassed &&
            (m.clusters.includes(hitCluster) || m.featureKeys.includes(hitFeature))
        );

        if (hasMatch) {
          signals.engramBoost = 0.05;
        }
      }

      let finalScore =
        signals.dense * 0.35 +
        signals.topologyRouted * 0.15 +
        signals.graphAuthority * 0.15 +
        signals.lexicalBoost * 0.1 +
        signals.taskBoost * 0.1 +
        signals.aceBoost * 0.1 +
        (pt.lane === 'kag' ? 0.05 : 0);

      // Engram Boost (v1.1)
      finalScore += signals.engramBoost;

      // Topological Class Consistency Boost (0.08)
      if (clusterMatch?.topoClass && signals.topoClass === clusterMatch.topoClass) {
        finalScore += 0.08;
        if (includeReasons)
          reasons.push(`Matches query topological class (${clusterMatch.topoClass})`);
      }

      if (existing) {
        finalScore = Math.max(existing.score, finalScore) + 0.05;
      }

      if (includeReasons) {
        if (pt.lane === 'semantic') reasons.push('Semantic match in codebase');
        if (pt.lane === 'kag') reasons.push('Topological match in directory atlas');
        if (pt.lane === 'external_docs')
          reasons.push(`Official documentation match (${payload.sourceId || 'external'})`);
        if (hasClusterMatch)
          reasons.push(`Inferred same manifold cluster (${clusterMatch!.clusterId})`);
        if (signals.topologyRouted > 0)
          reasons.push(`Routed via topological centroid lookup (${clusterField})`);
        if (signals.turbovec > 0) reasons.push('TurboVec ANN prefilter hit');
        if (signals.graphAuthority > 0.5) reasons.push('High graph authority (PageRank)');
        if (signals.aceBoost > 0) reasons.push('ACE Context cache hit');
        if (signals.lexicalBoost > 0)
          reasons.push('Direct lexical match in dense semantic cluster');
        if (signals.taskBoost > 0) reasons.push('Matched task distillate operational playbook');
        if (signals.recencyOrHitRate > 0.25) reasons.push('Recent/high-hit-rate payload');
      }

      // Manifold4 extraction
      const somX = Number(payload.somRow ?? payload.som_x ?? 0) || 0;
      const somY = Number(payload.somCol ?? payload.som_y ?? 0) || 0;
      const semanticZ = signals.dense ?? 0;
      const activityW = Number(payload.pagerank ?? payload.activity_w ?? 0) || 0;
      const manifold4: [number, number, number, number] = [somX, somY, semanticZ, activityW];
      const manifold4Meta = {
        som_x: somX,
        som_y: somY,
        semantic_z: semanticZ,
        activity_w: activityW,
        cluster_id: Number.isFinite(clusterId) ? String(clusterId) : undefined,
        gpu_cluster: payload.gpuCluster != null ? String(payload.gpuCluster) : undefined,
        som_cluster: payload.somCluster != null ? String(payload.somCluster) : undefined,
        pagerank: pageRank,
        hit_rate: hitRate,
        last_used_at: lastUsedAt,
        cluster_alias: clusterAlias,
      };

      scoreMap.set(id, {
        id,
        sourcePath: (payload.path ?? payload.relativePath ?? '') as string,
        title: (payload.title ?? payload.path ?? '') as string,
        text: (payload.content ?? payload.summary ?? '') as string,
        score: finalScore,
        signals,
        manifold4,
        manifold4Meta,
        reasons,
        payload,
        vector: pt.vector,
      });
    }

    // 4. Sort and Trim
    let ranked = [...scoreMap.values()].sort((a, b) => b.score - a.score).slice(0, effectiveTopK);

    // 4.5 Meta-Join for Evidence Mode
    if (mode === 'evidence' && ranked.length > 0) {
      const objectKeys = ranked.map((r) => String(r.payload?.object_key ?? '')).filter(Boolean);
      if (objectKeys.length > 0) {
        const files = await db
          .select()
          .from(uploadedFiles)
          .where(inArray(uploadedFiles.objectKey, objectKeys));
        const fileMap = new Map(files.map((f) => [f.objectKey, f]));
        ranked = ranked.map((r) => {
          const file = fileMap.get(String(r.payload?.object_key ?? ''));
          if (file) {
            return {
              ...r,
              payload: { ...r.payload, ...file },
              signals: { ...r.signals, status: file.status },
            };
          }
          return r;
        });
      }
    }

    // 5. GPU-Accelerated Attention Rerank
    const rerankCandidates = ranked.filter((r) => r.vector && Array.isArray(r.vector));
    if (rerankCandidates.length > 1) {
      const queryArr = new Float32Array(embedding);
      const candArr = new Float32Array(rerankCandidates.length * 768);
      for (let i = 0; i < rerankCandidates.length; i++) {
        candArr.set(rerankCandidates[i].vector, i * 768);
      }

      try {
        const attentionScores = await LibTorchReranker.rerank(
          queryArr,
          candArr,
          rerankCandidates.length,
          768
        );
        for (let i = 0; i < rerankCandidates.length; i++) {
          const r = rerankCandidates[i];
          // Fuse original score with attention weight (weighted towards attention)
          r.score = r.score * 0.3 + attentionScores[i] * 0.7;
        }
        // Re-sort after attention pass
        ranked = ranked.sort((a, b) => b.score - a.score);
      } catch (err) {
        console.warn(
          '[HyperRagFusionService] LibTorch rerank failed, falling back to original scores:',
          err
        );
      }
    }

    // 5. Cluster-Aware Rerank
    const reranked = await applyClusterCoherenceBoost(
      ranked.map((r) => ({
        content: r.text ?? '',
        score: r.score,
        source: r.id,
        gpuCluster: r.payload?.gpuCluster as number,
      })),
      { clusterBoost: 1.1 }
    );

    ranked = ranked
      .map((r) => {
        const match = reranked.find((rr) => rr.source === r.id);
        if (match) {
          return { ...r, score: match.score };
        }
        return r;
      })
      .sort((a, b) => b.score - a.score);

    // 6. Graph Path Expansion (Impact Analysis + Dijkstra Contextual Routing)
    const graphPaths: unknown[] = [];
    if (useGraph && ranked.length > 0) {
      // 6a. APOC impact neighborhood from top hit
      const topHit = ranked[0];
      const stableKey = String(topHit.payload?.stable_key ?? topHit.id);
      const impact = await getImpactNeighborhood(stableKey, 2, 20).catch(() => null);
      if (impact) {
        graphPaths.push(impact);
      }

      // 6b. Dijkstra: source = top Qdrant hit, targets = next 7 hits
      // Single GDS call: point-to-point when 1 target, SSSP-with-filter otherwise.
      // finalScore = 0.7 * qdrantScore + 0.3 * (1 / (1 + pathCost))
      const topSeeds = ranked
        .slice(0, 8)
        .map(h => h.sourcePath ?? String(h.payload?.source_ref ?? h.payload?.stable_key ?? ''))
        .filter(Boolean);

      if (topSeeds.length > 0) {
        const dijkstraPaths = await runDijkstraContext({
          sourceRef:  topSeeds[0],
          targetRefs: topSeeds.slice(1),
          limit:      25,
        }).catch(() => null);

        if (dijkstraPaths && dijkstraPaths.hits.length > 0) {
          graphPaths.push(dijkstraPaths);

          // Build path-cost lookup
          const pathCostMap = new Map<string, number>();
          for (const dHit of dijkstraPaths.hits) {
            const cost = dHit.totalCost;
            if (dHit.stableKey) pathCostMap.set(dHit.stableKey, cost);
            if (dHit.sourceRef)  pathCostMap.set(dHit.sourceRef,  cost);
            if (dHit.path)       pathCostMap.set(dHit.path,        cost);
          }

          // Re-score existing Qdrant hits with fusion formula
          for (const hit of ranked) {
            const sk = String(hit.payload?.stable_key ?? '');
            const sr = hit.sourcePath ?? String(hit.payload?.source_ref ?? '');
            const pathCost = pathCostMap.get(sk) ?? pathCostMap.get(sr);
            if (pathCost !== undefined) {
              const pathBoost = 1 / (1 + pathCost);
              const fusedScore = 0.7 * hit.signals.dense + 0.3 * pathBoost;
              hit.score = Math.min(1, fusedScore);
              hit.signals.graphAuthority = (hit.signals.graphAuthority ?? 0) + 0.3 * pathBoost;
              hit.reasons.push(`dijkstra_fused(cost=${pathCost.toFixed(3)})`);
            }
          }

          // Inject new path nodes not already in ranked
          const existingRefs = new Set<string>(
            ranked.flatMap(h => [
              String(h.payload?.stable_key ?? ''),
              h.sourcePath ?? '',
              String(h.payload?.source_ref ?? ''),
            ]).filter(Boolean)
          );
          for (const dHit of dijkstraPaths.hits) {
            const ref = dHit.sourceRef ?? dHit.stableKey ?? dHit.path ?? '';
            if (!ref || existingRefs.has(ref)) continue;
            const pathBoost = 1 / (1 + dHit.totalCost);
            const pathScore = 0.3 * pathBoost;
            ranked.push({
              id:         dHit.stableKey,
              score:      pathScore,
              sourcePath: dHit.sourceRef ?? dHit.path,
              payload:    { stable_key: dHit.stableKey, source_ref: dHit.sourceRef, ...(dHit.hopPath.length ? { hop_path: dHit.hopPath } : {}) },
              vector:     [],
              signals:    { dense: 0, topologyRouted: 0, graphAuthority: pathScore, lexicalBoost: 0, taskBoost: 0, aceBoost: 0, engramBoost: 0, turbovec: 0, topoClass: '' },
              reasons:    [`dijkstra_path_node(cost=${dHit.totalCost.toFixed(3)})`],
              lane:       'kag',
            } as typeof ranked[number]);
            existingRefs.add(ref);
          }

          ranked.sort((a, b) => b.score - a.score);
        }
      }
    }

    const result: HyperRagResult = {
      query,
      variants,
      hits: ranked.map(({ vector: _vector, ...hit }) => hit),
      graphPaths,
      contextPack: aceCacheHit?.packet,
      summaryLenses: aceSummaryLenses,
      taskDistillate,
      synthesis: synthesize
        ? await this.synthesize(
            query,
            ranked.slice(0, 5),
            aceSummaryLenses || [],
            routing?.cards || [],
            taskDistillate
          ).catch(() => null)
        : null,
      provenance,
      routingExplanation: explanation.build(),
    };

    // 7. Context Budgeting & Persistence
    const budgeted = ContextPacketBudgeter.budget(result, contextBudget);

    // Log trace asynchronously
    logAceRun(
      {
        query,
        mode,
        intent: profile,
        model: ENV.GEMMA4_MODEL,
        metadata: {
          routing: budgeted.routingExplanation,
          fallbackCount: budgeted.routingExplanation?.fallbacks.length || 0,
        },
      },
      ranked.map((r) => ({
        ...r,
        relativePath: r.sourcePath || 'unknown',
        lineStart: 0, // Placeholder
        qdrantId: r.id,
        authorityScore: r.signals.graphAuthority || 0,
        pageRankScore: r.signals.pagerank || 0,
      })) as any
    ).catch((err) => console.error('[HyperRagFusionService] Persistence failed:', err));

    return budgeted;
  }

  /**
   * Synthesize a reasoning summary prioritizing topological clusters and task playbooks.
   */
  private async synthesize(
    query: string,
    hits: HyperRagHit[],
    lenses: SummaryLensHit[],
    clusterCards: any[],
    taskDistillate: any | null
  ): Promise<string | null> {
    if (hits.length === 0) return null;

    const clusters = new Set<string>();
    hits.forEach((h) => {
      if (h.signals.topoClass) clusters.add(h.signals.topoClass);
    });
    lenses.forEach((l) => {
      if (l.topoClass) clusters.add(l.topoClass);
    });

    const clusterContext = [...clusters].map((c) => `[Cluster: ${c}]`).join(' ');
    const cardsContext = clusterCards.map((c) => `[Card ${c.clusterId}: ${c.summary}]`).join('\n');
    const taskContext = taskDistillate
      ? `[OPERATIONAL PLAYBOOK: ${taskDistillate.task_key}]\nSummary: ${taskDistillate.summary}\nRecommended Actions:\n${taskDistillate.recommended_actions.map((a: string) => `- ${a}`).join('\n')}`
      : '';

    const prompt = `
[HYPER-RAG SYNTHESIS]
You are a legal reasoning agent. Synthesize a concise answer to the query based on the retrieved hits and topological context.
Prioritize information from the dominant topological clusters: ${clusterContext}

QUERY: "${query}"

RELEVANT HITS:
${hits.map((h) => `- ${h.title}: ${h.text?.slice(0, 200)}... (Cluster: ${h.signals.topoClass ?? 'unclassified'})`).join('\n')}

SUMMARY LENSES (Thematic context):
${lenses.map((l) => `- ${l.title}: ${l.summary.slice(0, 200)}...`).join('\n')}

${taskContext}

INSTRUCTIONS:
1. Ground your reasoning in the supplied clusters. Focus on ${clusterContext}.
2. If multiple clusters are present, explain their relationship in terms of the global manifold.
3. If this is a legal query, prioritize constitutional or statutory grounding.
4. Be concise, authoritative, and mention the provenance of the information (e.g., "From the directory atlas...", "In the case chunks...").
`.trim();

    try {
      const reasoningModel = getReasoningModelId('legal');
      const response = await bifrostChat(
        [
          { role: 'system', content: 'You are an expert legal retrieval synthesizer.' },
          { role: 'user', content: prompt },
        ],
        ENV.GEMMA4_MODEL ?? reasoningModel,
        { temperature: 0.1, maxTokens: 384 }
      );

      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'content' in response)
        return (response as any).content;
      return null;
    } catch (err) {
      console.error('[HyperRagFusionService] Synthesis failed:', err);
      return null;
    }
  }

  private async searchQdrantMulti(
    url: string,
    collection: string,
    queries: string[],
    limit: number,
    lane: string,
    cache: Record<string, number[]> = {},
    filter?: any
  ) {
    const results = await Promise.all(
      queries.map(async (q) => {
        const emb = cache[q] || (await generateSingleEmbedding(q).catch(() => null));
        if (!emb) return [];
        return this.searchQdrant(url, collection, emb, limit, lane, filter);
      })
    );

    const map = new Map<string, any>();
    for (const res of results.flat()) {
      const id = String(res.id);
      if (!map.has(id) || map.get(id).score < res.score) {
        map.set(id, res);
      }
    }
    return [...map.values()];
  }

  private async searchQdrant(
    url: string,
    collection: string,
    vector: number[],
    limit: number,
    lane: string,
    filter?: any
  ) {
    try {
      const body = {
        vector: buildVectorPayload(collection, vector),
        limit,
        filter,
        with_payload: true,
        with_vector: true,
      };
      const res = await fetch(`${url}/collections/${collection}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.result ?? []).map((pt: any) => ({ ...pt, lane }));
    } catch {
      return [];
    }
  }

  private getCollectionForMode(mode: HyperRagMode): string {
    switch (mode) {
      case 'evidence':
        return VECTOR_CONFIG.COLLECTIONS.evidence;
      case 'legal':
        return VECTOR_CONFIG.COLLECTIONS.legal_canon_chunks;
      case 'docs':
        return VECTOR_CONFIG.COLLECTIONS.knowledge;
      case 'programming_docs':
        return VECTOR_CONFIG.COLLECTIONS.programming_docs;
      case 'codebase':
      default:
        return VECTOR_CONFIG.COLLECTIONS.codebase_chunks;
    }
  }

  private async searchTurboVec(url: string, vector: number[], k: number): Promise<number[]> {
    try {
      const res = await fetch(`${url}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector: vector.slice(0, 64), k }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.ids ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Performs a focused ripgrep search on specific directories mapped from semantic clusters.
   * This is the "Dynamic Env Mapping" optimization.
   */
  private async searchRgDynamic(query: string, dirs: string[]): Promise<HyperRagHit[]> {
    if (dirs.length === 0) return [];

    // Deduplicate and filter dirs.
    const uniqueDirs = [...new Set(dirs)].filter((d) => d && d !== '.');
    const searchPaths = uniqueDirs
      .map((d) => resolve(process.cwd(), d))
      .filter((p) => existsSync(p));

    if (searchPaths.length === 0) return [];

    try {
      // Use ripgrep with JSON output for structured parsing.
      // --mmap: use memory mapping (faster for large files)
      // --threads 4: parallelize search
      const stdout = execFileSync(
        'rg',
        ['-F', '-i', '--json', '--mmap', '--threads', '4', '--', query, ...searchPaths],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );

      const hits: HyperRagHit[] = [];
      const lines = stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'match') {
            const path = msg.data.path.text;
            const snippet = msg.data.lines.text;
            const lineNum = msg.data.line_number;

            hits.push({
              id: `rg_${path}_${lineNum}`,
              sourcePath: path,
              title: `${path}:${lineNum}`,
              text: snippet,
              score: 0.8, // High base score for direct lexical match
              lane: 'rg_dynamic',
              payload: { path, line_number: lineNum, content: snippet },
              reasons: [],
              signals: { dense: 0.8 },
            } as any);
          }
        } catch (e) {
          /* ignore parse errors */
        }
      }

      return hits;
    } catch (err: any) {
      if (err.status === 1) return [];
      console.error('[HyperRagFusionService] rgDynamic error:', err.message);
      return [];
    }
  }

  /**
   * Search for task distillates in Qdrant and hydrate from Redis.
   */
  private async searchTaskDistillates(embedding: number[], topK: number = 1): Promise<any | null> {
    const qdrantUrl = ENV.QDRANT_URL;
    const collection = 'task_distillates';

    try {
      const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: embedding,
          limit: topK,
          with_payload: true,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const hits = data.result || [];

      if (hits.length === 0) return null;

      const topHit = hits[0];
      const taskKey = topHit.payload.task_key;

      // Attempt to hydrate from Redis for the latest operational data
      const redis = typeof getRedis === 'function' ? getRedis() : null;
      if (redis) {
        const cached = await redis.get(`ace:task:${taskKey}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      return topHit.payload;
    } catch (err) {
      console.warn('[HyperRagFusionService] taskDistillate search failed:', err);
      return null;
    }
  }

  /**
   * Mappings from Cluster IDs to their representative directories.
   */
  private getClusterDirs(clusterIds: number[]): string[] {
    const jsonPath = resolve(process.cwd(), 'docs/graph/hypergraph-clusters.json');
    if (!existsSync(jsonPath)) return [];

    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const dirs = new Set<string>();

      for (const id of clusterIds) {
        const cluster = data.clusters.find((c: any) => c.id === id);
        if (cluster && cluster.topDirs) {
          cluster.topDirs.forEach((d: any) => dirs.add(d.dir));
        }
      }

      return Array.from(dirs);
    } catch (err) {
      return [];
    }
  }

  /**
   * Helper to extract cluster IDs from ripgrep hits.
   */
  private async getClusterIdsFromRg(hits: HyperRagHit[]): Promise<number[]> {
    const ids = new Set<number>();
    const clusterJson = resolve(process.cwd(), 'docs/graph/hypergraph-clusters.json');
    if (!existsSync(clusterJson)) return [];

    try {
      const data = JSON.parse(readFileSync(clusterJson, 'utf-8'));
      const clusters = data.clusters || [];

      for (const hit of hits) {
        const path = hit.sourcePath;
        if (!path) continue;

        // Find clusters that mention this path
        for (const c of clusters) {
          if (c.topPaths?.some((p: any) => p.path === path)) {
            ids.add(c.id);
          }
        }
      }
    } catch {
      /* ignore */
    }

    return Array.from(ids);
  }

  /**
   * Lane 0 Lexical Cluster Discovery (Safe version).
   * Scans cluster digest for structured candidates with weighted scoring.
   */
  private async discoverLexicalClusters(query: string): Promise<LexicalClusterHit[]> {
    const digestPath = resolve(process.cwd(), 'docs/graph/hypergraph-clusters.md');
    if (!existsSync(digestPath)) return [];

    try {
      // execFileSync is safer (no shell interpolation)
      const output = execFileSync(
        'rg',
        ['-F', '-i', '--no-heading', '--line-number', '--context', '3', '--', query, digestPath],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
      );

      const hits: LexicalClusterHit[] = [];
      const lines = output.split('\n');
      let currentClusterId: number | null = null;

      for (const line of lines) {
        // 1. Identify Cluster Header
        const headerMatch = line.match(/### Cluster (\d+)/);
        if (headerMatch) {
          currentClusterId = parseInt(headerMatch[1], 10);
          hits.push({
            clusterId: currentClusterId,
            score: 0.4, // Header match bonus
            source: 'header',
            text: line,
          });
          continue;
        }

        if (!currentClusterId) continue;

        // 2. Score based on context within cluster section
        if (line.includes('Top symbols:')) {
          hits.push({ clusterId: currentClusterId, score: 0.3, source: 'symbol', text: line });
        } else if (line.includes('Top paths:') || line.includes('Top directories:')) {
          hits.push({ clusterId: currentClusterId, score: 0.25, source: 'path', text: line });
        } else if (line.includes('(tag:')) {
          hits.push({ clusterId: currentClusterId, score: 0.2, source: 'tag', text: line });
        } else if (line.trim().length > 0) {
          hits.push({ clusterId: currentClusterId, score: 0.05, source: 'detail', text: line });
        }
      }

      // Aggregate scores per cluster
      const aggMap = new Map<number, LexicalClusterHit>();
      for (const h of hits) {
        const existing = aggMap.get(h.clusterId);
        if (!existing || h.score > existing.score) {
          aggMap.set(h.clusterId, h);
        }
      }

      return Array.from(aggMap.values()).sort((a, b) => b.score - a.score);
    } catch (err: any) {
      if (err.status === 1) return []; // rg no match
      console.warn('[HyperRagFusionService] Lexical discovery failed:', err.message);
      return [];
    }
  }
}
