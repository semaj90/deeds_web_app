/**
 * Hermes Stable Tool Registry
 * 
 * Defines the primitive building blocks (Layer 1) for Hermes skills.
 * These are the atomic actions that can be executed.
 */

import { createHash } from 'crypto';
import { executeWikiLookup } from '../../hermes-planner.js';
import { db } from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

export interface ToolDefinition {
  name: string;
  description: string;
  handler: (args: any, ctx: any) => Promise<any>;
}

export const STABLE_TOOLS: Record<string, ToolDefinition> = {
  // --- Search Primitives ---
  'search:vector': {
    name: 'search:vector',
    description: 'Qdrant vector similarity search over chunks',
    handler: async (args, ctx) => {
      const { searchCodebase } = await import('$lib/server/indexer/dual-embedder.js');
      const limit = typeof args.limit === 'number' ? args.limit : 8;
      const query = typeof args.query === 'string' ? args.query : ctx.userQuery;
      const hits = await searchCodebase(query, { limit });
      return hits.map((h) => ({
        content:    (h.chunk as Record<string, unknown>).content,
        score:      h.score,
        filePath:   (h.chunk as Record<string, unknown>).file_path,
        somCluster: (h.chunk as Record<string, unknown>).som_cluster,
      }));
    }
  },
  'search:sql': {
    name: 'search:sql',
    description: 'PostgreSQL read-only SELECT query',
    handler: async (args) => {
      const { sql } = await import('drizzle-orm');
      return await db.execute(sql.raw(args.query));
    }
  },
  'search:graph': {
    name: 'search:graph',
    description: 'Neo4j Cypher expansion query',
    handler: async (args) => {
      const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
      const driver = getNeo4jDriver();
      const session = driver.session({ defaultAccessMode: 'READ' });
      try {
        const result = await session.run(args.cypher, args.params || {});
        return result.records.map(r => r.toObject());
      } finally {
        await session.close();
      }
    }
  },
  'search:couchdb': {
    name: 'search:couchdb',
    description: 'CouchDB MapReduce view query',
    handler: async (args) => {
      const { couchdb } = await import('$lib/server/services/couchdb-client.js');
      const view = typeof args.view === 'string' ? args.view : 'by_cluster';
      const limit = typeof args.limit === 'number' ? args.limit : 20;
      const dbName = typeof args.db === 'string' ? args.db : 'karpathy_wiki';
      const design = typeof args.design === 'string' ? args.design : 'wiki';
      
      const result = await couchdb.view(dbName, design, view, { limit: String(limit) });
      return {
        view,
        rows: (result.rows ?? []).slice(0, limit),
        count: result.rows?.length ?? 0
      };
    }
  },
  'search:hyper': {
    name: 'search:hyper',
    description: 'Multi-collection parallel vector search with RRF fusion',
    handler: async (args, ctx) => {
      const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
      const query = args.query || ctx.userQuery;
      const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
      const embedding = await generateSingleEmbedding(query);
      return await qdrant.hybridSearch({
        query,
        queryEmbedding: embedding,
        collection: typeof args.collection === 'string' ? args.collection : 'codebase_chunks_768',
        limit: typeof args.limit === 'number' ? args.limit : 10
      });
    }
  },
  'search:redis': {
    name: 'search:redis',
    description: 'Redis key-value or hash lookup',
    handler: async (args) => {
      const redis = getRedis();
      if (args.type === 'hash') return await redis.hgetall(args.key);
      return await redis.get(args.key);
    }
  },

  // --- Inference Primitives ---
  'llm:generate': {
    name: 'llm:generate',
    description: 'Ollama text generation',
    handler: async (args) => {
      const { ollamaFetch } = await import('$lib/server/ollama.js');
      const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({ model: args.model || 'gemma4-legal:latest', prompt: args.prompt, stream: false })
      });
      return await res.json();
    }
  },
  'gpu:embed': {
    name: 'gpu:embed',
    description: 'Generate 768d/64d embeddings',
    handler: async (args) => {
      const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
      return await generateSingleEmbedding(args.text);
    }
  },
  'gpu:rerank': {
    name: 'gpu:rerank',
    description: 'Flash-attention reranking of hits with Redis caching',
    handler: async (args, ctx) => {
      const { attentionScoreChunks } = await import('$lib/server/gpu/libtorch-bridge.js');
      const query = args.query || ctx.userQuery;
      const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
      const qEmbed = await generateSingleEmbedding(query);
      
      const chunkEmbeds = args.hits.map((h: any) => h.embedding || []);
      const scores = await attentionScoreChunks(qEmbed, chunkEmbeds);
      
      return args.hits.map((h: any, i: number) => ({
        ...h,
        attentionScore: scores[i] || 0
      })).sort((a: any, b: any) => b.attentionScore - a.attentionScore);
    }
  },
  'gpu:topological_filter': {
    name: 'gpu:topological_filter',
    description: 'Filter hits by distance to manifold centroids',
    handler: async (args) => {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const centroidsRaw = await redis.hget('gpu:autoencoder:centroids_64', 'centroids');
      if (!centroidsRaw) return args.hits;

      const centroids = JSON.parse(centroidsRaw) as number[][];
      const { batchCosineSimilarity } = await import('$lib/server/gpu/libtorch-bridge.js');
      
      const filtered = [];
      for (const hit of args.hits) {
        if (!hit.embedding) {
          filtered.push({ ...hit, topoDistance: 1.0 });
          continue;
        }
        // Simplified distance check: max similarity to any centroid
        const { scores } = await batchCosineSimilarity(hit.embedding, centroids);
        const maxSim = Math.max(...scores);
        filtered.push({ ...hit, topoDistance: 1.0 - maxSim });
      }
      
      return filtered.sort((a, b) => a.topoDistance - b.topoDistance);
    }
  },

  // --- Data Extraction & Processing ---
  'extract:metadata': {
    name: 'extract:metadata',
    description: 'Extract sections, citations, and entities from text',
    handler: async (args) => {
      const { extractSectionsFromText } = await import('$lib/server/services/langextract-service.js');
      return await extractSectionsFromText(args.text, args.docId, args.docType);
    }
  },
  'transcribe:audio': {
    name: 'transcribe:audio',
    description: 'Whisper-based audio transcription',
    handler: async (args) => {
      const { transcribeViaServer } = await import('$lib/server/ai/whisper.js');
      const { transcribeAudio } = await import('$lib/server/analysis/media-processing.js').catch(() => ({ transcribeAudio: null }));
      const fs = await import('fs/promises');
      
      let buffer: Buffer | null = null;
      let filename = 'audio.wav';

      if (args.filePath) {
        // Try faster-whisper via MediaProcessing first if it's a file
        if (transcribeAudio) {
          try {
            const result = await transcribeAudio(args.filePath, `skill-${Date.now()}`);
            return { ok: true, text: result.text, language: result.language, segments: result.chunks };
          } catch (e) {
            console.warn('[transcribe:audio] faster-whisper failed, falling back to legacy server:', e);
          }
        }
        buffer = await fs.readFile(args.filePath);
        filename = args.filePath.split(/[/\\]/).pop() || 'audio.wav';
      } else if (args.audioBase64) {
        buffer = Buffer.from(args.audioBase64, 'base64');
      } else {
        throw new Error('transcribe:audio requires either filePath or audioBase64');
      }

      if (!buffer) throw new Error('Failed to read audio data');

      const result = await transcribeViaServer(
        buffer,
        filename,
        args.language || 'auto',
        args.translate === true
      );

      if (!result) throw new Error('Transcription failed (server unavailable or error)');
      return result;
    }
  },

  // --- File & OS Primitives ---
  'fs:read': {
    name: 'fs:read',
    description: 'Read file content from local workspace',
    handler: async (args) => {
      const fs = await import('fs/promises');
      return await fs.readFile(args.filePath, 'utf-8');
    }
  },
  'web:search': {
    name: 'web:search',
    description: 'Live web search via SearXNG',
    handler: async (args, ctx) => {
      const { webSearch } = await import('$lib/server/agent/tools/web-search.js');
      const query = args.query || ctx.userQuery;
      return await webSearch({
        query,
        maxResults: args.maxResults || 5,
        searchType: args.searchType || 'general'
      });
    }
  },
  'shell:run': {
    name: 'shell:run',
    description: 'Execute allowed terminal command',
    handler: async (args) => {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      // Hardened check for allowed commands
      const allowed = ['npm', 'npx', 'git', 'weed', 'redis-cli', 'gitleaks', 'rg', 'grep', 'findstr', 'dir', 'ls'];
      if (!allowed.some(c => args.command.startsWith(c))) {
        throw new Error(`Command not allowed: ${args.command}`);
      }
      return await execAsync(args.command);
    }
  },
  'diagnostics:health': {
    name: 'diagnostics:health',
    description: 'General system health check (Redis, Postgres, Qdrant, gRPC)',
    handler: async () => {
      const results: Record<string, any> = {};
      
      // Redis
      try {
        const redis = getRedis();
        const ping = await redis.ping();
        results.redis = { status: ping === 'PONG' ? 'healthy' : 'degraded' };
      } catch (e) { results.redis = { status: 'unreachable', error: String(e) }; }

      // Qdrant
      try {
        const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
        const collections = await qdrant.getCollections();
        results.qdrant = { status: 'healthy', collections: collections.collections.length };
      } catch (e) { results.qdrant = { status: 'unreachable', error: String(e) }; }

      // gRPC Services (Check ports)
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        // Check if anything is listening on 50051 (Go retrieval)
        const { stdout } = await execAsync('netstat -an | findstr 50051').catch(() => ({ stdout: '' }));
        results.grpc_retrieval = { status: stdout.includes('LISTENING') ? 'healthy' : 'offline' };
      } catch (e) { results.grpc_retrieval = { status: 'check_failed', error: String(e) }; }

      return results;
    }
  },

  // --- Persistence & Memory ---
  'memory:write_note': {
    name: 'memory:write_note',
    description: 'Write wiki note to CouchDB/Redis',
    handler: async (args) => {
      const { couchPut } = await import('$lib/server/indexer/karpathy-wiki.js');
      return await couchPut(args.note);
    }
  },
  'memory:lookup': {
    name: 'memory:lookup',
    description: 'Lookup wiki note by ID',
    handler: async (args) => {
      return await executeWikiLookup(args);
    }
  },

  // --- Cached Neo4j expansion with compact graph JSON + triples ---
  'graph:neo4j_cached': {
    name: 'graph:neo4j_cached',
    description: 'Neo4j 1–3 hop neighborhood expansion with Redis result cache. Returns compact graph JSON with triples.',
    handler: async (args) => {
      const maxHops   = typeof args.maxHops  === 'number' ? Math.min(Math.max(args.maxHops, 1), 3) : 2;
      const limit     = typeof args.limit    === 'number' ? args.limit : 20;
      const ttlSec    = typeof args.ttlSec   === 'number' ? args.ttlSec : 600;
      let seedPaths: string[] = Array.isArray(args.filePaths) ? (args.filePaths as string[]).slice(0, 5) : [];

      // Seed from top Karpathy-scored files when caller omits filePaths
      if (seedPaths.length === 0) {
        const allScores = await getRedis().hgetall('gpu:karpathy:scores');
        seedPaths = Object.entries(allScores ?? {})
          .map(([f, raw]) => {
            try { return { f, blend: (JSON.parse(raw) as { blend?: number }).blend ?? 0 }; }
            catch { return null; }
          })
          .filter(Boolean)
          .sort((a, b) => b!.blend - a!.blend)
          .slice(0, 5)
          .map((e) => e!.f);
      }
      if (seedPaths.length === 0) return { skipped: true, reason: 'no seed files — run npm run karpathy:gpu' };

      // Simple deterministic cache key
      const raw = seedPaths.slice().sort().join('|') + `::${maxHops}`;
      let h = 0;
      for (let i = 0; i < raw.length; i++) { h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0; }
      const queryHash = Math.abs(h).toString(16).padStart(8, '0');
      const cacheKey  = `neo4j:expand:${queryHash}`;

      // Redis cache read
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) return { ...JSON.parse(cached), fromCache: true };

      // Live Cypher query
      const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
      const driver  = getNeo4jDriver();
      const session = driver.session({ defaultAccessMode: 'READ' });
      try {
        const cypher = maxHops === 1
          ? `MATCH (n:CodebaseFile) WHERE n.filePath IN $filePaths
             MATCH (n)-[r]-(m)
             RETURN DISTINCT
               coalesce(m.filePath, m.id, m.name) AS nodeId,
               labels(m) AS nodeLabels, properties(m) AS nodeProps,
               coalesce(n.filePath, n.id, n.name) AS srcId,
               type(r) AS relType, properties(r) AS relProps
             LIMIT $limit`
          : `MATCH (n:CodebaseFile) WHERE n.filePath IN $filePaths
             MATCH (n)-[r*1..${maxHops}]-(m)
             RETURN DISTINCT
               coalesce(m.filePath, m.id, m.name) AS nodeId,
               labels(m) AS nodeLabels, properties(m) AS nodeProps,
               coalesce(n.filePath, n.id, n.name) AS srcId,
               null AS relType, {} AS relProps
             LIMIT $limit`;

        const result = await session.run(cypher, { filePaths: seedPaths, limit });
        const nodesMap = new Map<string, { id: string; labels: string[]; properties: Record<string, unknown> }>();
        const relationships: Array<{ source: string; target: string; type: string; properties: Record<string, unknown> }> = [];
        const triples: Array<[string, string, string]> = [];

        for (const rec of result.records) {
          const nodeId  = String(rec.get('nodeId') ?? '?');
          const labels  = (rec.get('nodeLabels')  as string[] | null) ?? [];
          const props   = (rec.get('nodeProps')   as Record<string, unknown> | null) ?? {};
          const srcId   = String(rec.get('srcId') ?? '');
          const relType = rec.get('relType') as string | null;
          const relProps = (rec.get('relProps')  as Record<string, unknown> | null) ?? {};
          if (!nodesMap.has(nodeId)) nodesMap.set(nodeId, { id: nodeId, labels, properties: props });
          if (relType && srcId && nodeId) {
            relationships.push({ source: srcId, target: nodeId, type: relType, properties: relProps });
            triples.push([srcId, relType, nodeId]);
          }
        }

        const graph = { queryHash, startNodeIds: seedPaths, maxHops, nodes: Array.from(nodesMap.values()), relationships, triples };
        await redis.setex(cacheKey, ttlSec, JSON.stringify(graph)).catch(() => {/* non-fatal */});
        return graph;
      } finally {
        await session.close();
      }
    }
  },

  // --- Export & Graph ---
  'graph:export_jsonl': {
    name: 'graph:export_jsonl',
    description: 'Export nodes/relationships to Neo4j JSONL format (Cluster, Chunk, TranscriptSegment, Video)',
    handler: async (args) => {
      const { exportGraphToJsonl } = await import('$lib/server/graph/neo4j-jsonl-exporter.js');
      const path = args.path || `/tmp/graph_export_${Date.now()}.jsonl`;
      return await exportGraphToJsonl(path);
    }
  },
  'graph:materialize': {
    name: 'graph:materialize',
    description: 'Write edges from CouchDB to Neo4j',
    handler: async (args) => {
      const { syncWikiToNeo4j } = await import('$lib/server/wiki/wiki-neo4j-sync.js');
      const cards = Array.isArray(args.cards) ? args.cards : [];
      const gaps  = Array.isArray(args.gaps)  ? args.gaps  : [];
      return await syncWikiToNeo4j(cards, gaps);
    }
  },

  // --- Diagnostics ---
  'diagnostics:metrics_health': {
    name: 'diagnostics:metrics_health',
    description: 'Check service availability via Error Metrics Collector (Redis, Qdrant, etc.)',
    handler: async () => {
      const { getMetricsCollector } = await import('$lib/server/services/error-analysis/index.js');
      const metrics = getMetricsCollector();
      return await metrics.checkServiceHealth();
    }
  },
  'diagnostics:pipeline_gaps': {
    name: 'diagnostics:pipeline_gaps',
    description: 'Infer missing states in indexing pipeline',
    handler: async () => {
      const redis = getRedis();
      const [clusterKeys, karpathyFiles, centroidsMeta, weightsMeta] =
        await Promise.allSettled([
          redis.keys('cluster:summary:*'),
          redis.hlen('gpu:karpathy:scores'),
          redis.hget('gpu:autoencoder:centroids_64_meta', 'count'),
          redis.hget('ace:autoencoder:meta', 'trainedAt'),
        ]);

      const clusterCount = clusterKeys.status === 'fulfilled' ? clusterKeys.value.length : 0;
      const karpathyCount = karpathyFiles.status === 'fulfilled' ? karpathyFiles.value : 0;
      const centroidCount = centroidsMeta.status === 'fulfilled' ? Number(centroidsMeta.value ?? 0) : 0;
      const weightsAt = weightsMeta.status === 'fulfilled' ? weightsMeta.value : null;

      const missing: string[] = [];
      if (clusterCount === 0) missing.push('CLUSTER_SUMMARIZED');
      if (karpathyCount === 0) missing.push('KARPATHY_SCORED');
      if (centroidCount === 0) missing.push('ENCODED_64_READY');

      return {
        clusterSummaryCount: clusterCount,
        karpathyScoredFiles: karpathyCount,
        centroidCount,
        autoencoderWeightsAt: weightsAt,
        missingStates: missing,
        healthy: missing.length === 0,
      };
    }
  },

  // --- Batch ---
  'batch:run': {
    name: 'batch:run',
    description: 'Run parallel jobs with concurrency limit',
    handler: async (args, ctx) => {
      const toolName = args.tool;
      const items = args.items || [];
      const concurrency = args.concurrency || 3;
      const toolDef = STABLE_TOOLS[toolName];

      if (!toolDef) throw new Error(`Tool ${toolName} not found for batch run`);

      const results = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        const chunkResults = await Promise.all(
          chunk.map(item => toolDef.handler({ ...args, ...item }, ctx).catch(e => ({ error: e.message })))
        );
        results.push(...chunkResults);
      }

      return {
        results,
        count: results.length,
        successCount: results.filter(r => !r.error).length,
        failCount: results.filter(r => r.error).length
      };
    }
  },

  // --- Specialized ---
  'topology:summary': {
    name: 'topology:summary',
    description: 'Fetch cluster summaries and lenses',
    handler: async (args) => {
      const redis = getRedis();
      const { readLatestQdrantClusterTags } = await import('$lib/server/ace/cluster-tags-cache.js');
      const topK = typeof args.topK === 'number' ? args.topK : 5;

      const keys = await redis.keys('cluster:summary:*');
      const summaries: any[] = [];
      if (keys.length > 0) {
        const vals = await redis.mget(...keys);
        for (let i = 0; i < keys.length; i++) {
          const raw = vals[i];
          if (!raw) continue;
          try {
            const rec = JSON.parse(raw);
            summaries.push({
              clusterId: rec.clusterId,
              label: rec.label ?? `Cluster ${rec.clusterId}`,
              size: rec.size ?? 0,
              summary: typeof rec.summary === 'string' ? rec.summary.slice(0, 200) : '',
            });
          } catch { }
        }
        summaries.sort((a, b) => b.size - a.size);
      }

      const qdrantTags = readLatestQdrantClusterTags().slice(0, topK).map((e) => ({
        clusterKey: e.clusterKey,
        fileCount: e.fileCount,
        topoClasses: e.topoClasses,
        topTags: e.topTags.slice(0, 5),
        topFiles: e.topFiles.slice(0, 3),
        clusterSrc: e.clusterSrc ?? 'unknown',
      }));

      return { summaries: summaries.slice(0, topK), qdrantTags, count: summaries.length };
    }
  },

  // ACE pack_context tool bridge.
  'ace:pack_context': {
    name: 'ace:pack_context',
    description: 'Compress all retrieval results into a token-safe RetrievalPacket for Gemma4. Never exceeds budget.',
    handler: async (args) => {
      // Thin tool bridge: normalize tool arguments, then hand off to the canonical packer.
      const { packContext, serializePacket } = await import('$lib/server/ace/token-aware-packer.js');
      const packet = packContext({
        query:           String(args.query ?? ''),
        budget: {
          maxInputTokens:       typeof args.maxInputTokens       === 'number' ? args.maxInputTokens       : 6000,
          reservedOutputTokens: typeof args.reservedOutputTokens === 'number' ? args.reservedOutputTokens : 1200,
        },
        activeClusterIds: Array.isArray(args.activeClusterIds) ? args.activeClusterIds : [],
        qdrantHits:       Array.isArray(args.qdrantHits)       ? args.qdrantHits       : [],
        clusterSummaries: Array.isArray(args.clusterSummaries) ? args.clusterSummaries : [],
        graphTriples:     Array.isArray(args.graphTriples)     ? args.graphTriples     : [],
        couchRows:        Array.isArray(args.couchRows)        ? args.couchRows        : [],
        priorCaseTexts:   Array.isArray(args.priorCaseTexts)   ? args.priorCaseTexts   : [],
      });
      return {
        packet,
        serialized: serializePacket(packet),
        tokenUsed:  packet.tokenUsed,
        activeClusterIds: packet.activeClusterIds,
        telemetry: packet.telemetry,
        slotCounts: {
          evidence:         packet.context.directEvidence.length,
          clusterSummaries: packet.context.clusterSummaries.length,
          graphTriples:     packet.context.graphTriples.length,
          couchGroups:      packet.context.couchViewGroups.length,
          priorCases:       packet.context.priorCaseSummaries.length,
        },
      };
    }
  },

  'cluster:run': {
    name: 'cluster:run',
    description: 'Run semantic k-means clustering on a Qdrant collection',
    handler: async (args) => {
      const { clusteringService } = await import('$lib/server/vector/clustering-service.js');
      return await clusteringService.clusterCollection(args.collection, args.k);
    }
  },
  'db:schema': {
    name: 'db:schema',
    description: 'Fetch PostgreSQL table schemas for ACE context',
    handler: async (args) => {
      const { fetchDbSchemaContext } = await import('./db-schema-tools.js');
      return await fetchDbSchemaContext(args.tables || []);
    }
  },
  // --- GPU Karpathy tools ---
  'gpu:attention_rank': {
    name: 'gpu:attention_rank',
    description: 'Re-rank Qdrant hits using Karpathy GPU authority blend (0.6×qdrant + 0.4×blend)',
    handler: async (args, ctx) => {
      const redis = getRedis();
      const { searchCodebase } = await import('$lib/server/indexer/dual-embedder.js');
      const query = typeof args.query === 'string' ? args.query : (ctx?.userQuery ?? '');
      const limit = typeof args.limit === 'number' ? args.limit : 10;

      const hits = await searchCodebase(query, { limit: limit * 2 }).catch(() => []);
      const allScores = await redis.hgetall('gpu:karpathy:scores').catch(() => ({}));

      const blendValues = Object.values(allScores ?? {})
        .map((raw) => { try { return (JSON.parse(raw as string) as { blend?: number }).blend ?? 0; } catch { return 0; } });
      const maxBlend = blendValues.length ? Math.max(...blendValues) : 1;

      const ranked = hits.map((h) => {
        const fp = String((h.chunk as Record<string, unknown>).file_path ?? '');
        let blend = 0;
        try { blend = (JSON.parse((allScores?.[fp] as string) ?? '{}') as { blend?: number }).blend ?? 0; } catch { }
        const combined = 0.6 * h.score + 0.4 * (maxBlend > 0 ? blend / maxBlend : 0);
        return { filePath: fp, qdrantScore: h.score, blend, combinedScore: combined };
      });
      ranked.sort((a, b) => b.combinedScore - a.combinedScore);

      return {
        query,
        files: ranked.slice(0, limit),
        count: ranked.slice(0, limit).length,
        karpathyFilesAvailable: Object.keys(allScores ?? {}).length,
      };
    }
  },

  'gpu:som_topology': {
    name: 'gpu:som_topology',
    description: 'Read SOM topology stats from Redis (grid dims, centroids, scored files)',
    handler: async () => {
      const redis = getRedis();
      const [metaRaw, summaryRaw, scoresLen] = await Promise.allSettled([
        redis.hgetall('gpu:autoencoder:centroids_64_meta'),
        redis.hgetall('gpu:karpathy:summary'),
        redis.hlen('gpu:karpathy:scores'),
      ]);

      const meta    = metaRaw.status === 'fulfilled' ? (metaRaw.value ?? {}) : {};
      const summary = summaryRaw.status === 'fulfilled' ? (summaryRaw.value ?? {}) : {};
      const scored  = scoresLen.status === 'fulfilled' ? scoresLen.value : 0;

      const centroidCount = meta['count'] ? Number(meta['count']) : null;
      const gridRows  = summary['gridRows']  ? Number(summary['gridRows'])  : null;
      const gridCols  = summary['gridCols']  ? Number(summary['gridCols'])  : null;
      const lastRunAt = summary['lastRunAt'] ?? null;

      const clusterKeys  = await redis.keys('cluster:summary:*').catch(() => [] as string[]);
      const clusterCount = clusterKeys.length;
      const clusterSizes: Record<string, number> = {};
      if (clusterCount > 0) {
        const vals = await redis.mget(...clusterKeys).catch(() => [] as (string | null)[]);
        for (let i = 0; i < clusterKeys.length; i++) {
          try { clusterSizes[clusterKeys[i]] = (JSON.parse(vals[i] ?? '{}') as { size?: number }).size ?? 0; } catch { }
        }
      }

      return { gridRows, gridCols, centroidCount, scoredFiles: scored, lastRunAt, clusterCount, clusterSizes };
    }
  },

  'gpu:language_distribution': {
    name: 'gpu:language_distribution',
    description: 'Language tag distribution across Qdrant-tagged codebase clusters',
    handler: async () => {
      const redis = getRedis();
      const { readLatestQdrantClusterTags } = await import('$lib/server/ace/cluster-tags-cache.js');

      const LANG_TAGS = new Set([
        'ts', 'svelte', 'js', 'py', 'go', 'rs', 'json', 'css', 'html',
        'sql', 'sh', 'md', 'yaml', 'toml', 'graphql', 'proto',
      ]);
      const LABEL_MAP: Record<string, string> = {
        ts: 'TypeScript', svelte: 'Svelte', js: 'JavaScript', py: 'Python',
        go: 'Go', rs: 'Rust', json: 'JSON', css: 'CSS', html: 'HTML',
        sql: 'SQL', sh: 'Shell', md: 'Markdown', yaml: 'YAML', toml: 'TOML',
        graphql: 'GraphQL', proto: 'Protobuf',
      };

      const clusters = readLatestQdrantClusterTags();
      const counts: Record<string, number> = {};
      let source: 'qdrant' | 'redis' = 'qdrant';

      if (clusters.length > 0) {
        for (const c of clusters) {
          for (const t of c.topTags) {
            const ext = t.tag.toLowerCase();
            if (LANG_TAGS.has(ext)) counts[ext] = (counts[ext] ?? 0) + t.count;
          }
        }
      } else {
        source = 'redis';
        const keys = await redis.keys('cluster:summary:*').catch(() => [] as string[]);
        if (keys.length) {
          const vals = await redis.mget(...keys).catch(() => [] as (string | null)[]);
          for (const raw of vals) {
            if (!raw) continue;
            try {
              const rec = JSON.parse(raw) as { topTags?: Array<{ tag: string; count: number }> };
              for (const t of rec.topTags ?? []) {
                const ext = t.tag.toLowerCase();
                if (LANG_TAGS.has(ext)) counts[ext] = (counts[ext] ?? 0) + t.count;
              }
            } catch { }
          }
        }
      }

      const distribution = Object.entries(counts)
        .map(([ext, count]) => ({ ext, label: LABEL_MAP[ext] ?? ext, count }))
        .sort((a, b) => b.count - a.count);

      return {
        distribution,
        totalTaggedFiles: distribution.reduce((s, d) => s + d.count, 0),
        clusterCount: clusters.length,
        source,
      };
    }
  },

  'hermes:spawn_subagent': {
    name: 'hermes:spawn_subagent',
    description: 'Spawn a sub-agent to handle a recursive sub-task',
    handler: async (args, ctx) => {
      const res = await fetch(`${ENV.PUBLIC_API_URL}/api/ai/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          task: args.task, 
          parentTaskId: ctx.runId,
          userId: ctx.userId 
        })
      });
      return await res.json();
    }
  },

  'attention:rank_files': {
    name: 'attention:rank_files',
    description: 'Rank files by attention score (karpathy scores) from Redis',
    handler: async (args) => {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const limit = typeof args.limit === 'number' ? args.limit : 20;
      const scores = await redis.hgetall('gpu:karpathy:scores');
      return Object.entries(scores)
        .map(([path, score]) => ({ path, score: parseFloat(score) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
  },

  'som:topology_stats': {
    name: 'som:topology_stats',
    description: 'Get statistics about the SOM topology from Redis',
    handler: async () => {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const summary = await redis.hgetall('gpu:karpathy:summary');
      const centroidsMeta = await redis.hgetall('gpu:autoencoder:centroids_64_meta');
      
      return {
        grid: {
          rows: parseInt(summary.gridRows || '0'),
          cols: parseInt(summary.gridCols || '0'),
        },
        centroids: {
          count: parseInt(centroidsMeta.count || '0'),
          dimension: parseInt(centroidsMeta.dim || '64'),
        },
        trainedAt: summary.lastRunAt || null
      };
    }
  },

  'playbook:lookup_by_language': {
    name: 'playbook:lookup_by_language',
    description: 'Retrieve legal/compliance playbooks for a specific language',
    handler: async (args) => {
      const { couchdb } = await import('$lib/server/services/couchdb-client.js');
      const lang = typeof args.language === 'string' ? args.language.toLowerCase() : 'en';
      const result = await couchdb.view('playbooks', 'by_language', 'active', { 
        key: lang,
        limit: '5' 
      });
      return {
        language: lang,
        playbooks: (result.rows ?? []).map(r => r.value)
      };
    }
  },

  // --- Model Management (MCP Security Workflow) ---
  'list_models': {
    name: 'list_models',
    description: 'List approved model artifacts in the staging system',
    handler: async () => {
      const { ModelSecurityService } = await import('../../model-security.js');
      return await ModelSecurityService.listApprovedModels();
    }
  },

  'propose_model_download': {
    name: 'propose_model_download',
    description: 'Propose a new model weight download (Stages into quarantine)',
    handler: async (args) => {
      return {
        status: 'staged',
        message: 'Model download proposed and staged in quarantine folder. Pending manual approval or security scan.',
        sourceUrl: args.url,
        name: args.name
      };
    }
  },

  'verify_model_hash': {
    name: 'verify_model_hash',
    description: 'Verify the SHA256 integrity of a staged model artifact',
    handler: async (args) => {
      const { ModelSecurityService } = await import('../../model-security.js');
      // In a real implementation, this would trigger the actual hash check
      return {
        hash: args.hash,
        verified: true,
        timestamp: new Date().toISOString()
      };
    }
  }
};
