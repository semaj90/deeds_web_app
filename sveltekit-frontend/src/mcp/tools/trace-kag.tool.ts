import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { getNamedVectorName } from '$lib/server/config/vector-config.js';
import { generateEmbedding } from '$lib/server/grpc/embedding-client.js';

interface KAGHit {
  path: string | null;
  score: number;
  source: 'qdrant' | 'topology' | 'neo4j';
  stableKey?: string | null;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  contentHash?: string | null;
  representationRevision?: string | null;
  topologySnapshotRevision?: string | null;
  summary?: string;
  topoClass?: number;
  cluster?: number;
  authorityScore?: number;
}

function sourceIdentityKey(hit: KAGHit): string | null {
  const { stableKey, sourceRef, sourceRevision, contentHash } = hit;
  const revisionKind = hit.representationRevision ? 'representation' : hit.topologySnapshotRevision ? 'topology_snapshot' : null;
  const revision = hit.representationRevision ?? hit.topologySnapshotRevision;
  if (![stableKey, sourceRef, sourceRevision, contentHash, revision].every((value) => typeof value === 'string' && value.trim())) return null;
  return JSON.stringify([stableKey, sourceRef, sourceRevision, contentHash, revisionKind, revision]);
}

async function embedQuery(text: string): Promise<number[]> {
  const embedding = await generateEmbedding(text, { taskMode: 'unprompted_legacy' });
  if (!embedding) throw new Error('EMBEDDING_UNAVAILABLE');
  return embedding;
}

async function qdrantSearch(vector: number[], collection: string, limit: number): Promise<KAGHit[]> {
  const base = ENV.QDRANT_URL;
  const vectorName = getNamedVectorName(collection);
  const res = await fetch(`${base}/collections/${collection}/points/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: vector,
      ...(vectorName ? { using: vectorName } : {}),
      limit,
      with_payload: true,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as {
    result?: { points?: Array<{ id: unknown; score: number; payload: Record<string, unknown> }> };
    points?: Array<{ id: unknown; score: number; payload: Record<string, unknown> }>;
  };
  const points = data.result?.points ?? data.points ?? [];
  return (points ?? []).map(h => ({
    path: (h.payload?.path ?? h.payload?.relative_path ?? null) as string | null,
    score: h.score,
    source: 'qdrant' as const,
    summary: String(h.payload?.summary ?? h.payload?.content ?? '').slice(0, 200),
    cluster: h.payload?.som_cluster != null ? Number(h.payload.som_cluster) : undefined,
    stableKey: typeof h.payload?.stable_key === 'string' ? h.payload.stable_key : null,
    sourceRef: typeof h.payload?.source_ref === 'string' ? h.payload.source_ref : null,
    sourceRevision: typeof h.payload?.source_revision === 'string' ? h.payload.source_revision : null,
    contentHash: typeof h.payload?.content_hash === 'string' ? h.payload.content_hash : null,
    representationRevision: typeof h.payload?.representation_revision === 'string' ? h.payload.representation_revision : null,
    topologySnapshotRevision: typeof h.payload?.topology_snapshot_revision === 'string' ? h.payload.topology_snapshot_revision : null,
  }));
}

export const traceKagSearchTool = {
  name: 'trace.kag_search',
  description:
    'Full KAG-DAG retrieval pipeline: entity extraction → Qdrant vector search → 4D topology neighborhood → Neo4j graph expansion → authority-weighted rerank. ' +
    'Returns a unified ranked hit list with source attribution (qdrant/topology/neo4j). ' +
    'This is the correct architecture: use this instead of langextract for graph search.',
  parameters: z.object({
    query: z.string().describe('Search query or question'),
    collection: z.enum(['codebase_chunks_768', 'research_summaries', 'legal_documents', 'evidence_items'])
      .default('codebase_chunks_768').optional().describe('Qdrant collection'),
    limit: z.number().int().min(1).max(50).default(20).optional().describe('Total hits to return'),
    expandGraph: z.boolean().default(true).optional().describe('Expand top hits via Neo4j neighbors'),
    topoRadius: z.number().min(0.05).max(1.0).default(0.30).optional().describe('Manifold4 expansion radius'),
  }),
  execute: async (args: { query: string; collection?: string; limit?: number; expandGraph?: boolean; topoRadius?: number }) => {
    const limit = args.limit ?? 20;
    const collection = args.collection ?? 'codebase_chunks_768';
    const traceLog: string[] = [];
    const t0 = Date.now();

    // Stage 1: embed query
    let embedding: number[];
    try {
      embedding = await embedQuery(args.query);
      traceLog.push(`embed: ${Date.now() - t0}ms`);
    } catch (e) {
      return JSON.stringify({ error: `Embedding failed: ${(e as Error).message}` });
    }

    // Stage 2: Qdrant cosine search
    const qdrantHits = await qdrantSearch(embedding, collection, Math.min(limit * 2, 40));
    traceLog.push(`qdrant: ${qdrantHits.length} hits (${Date.now() - t0}ms)`);

    // Stage 3: topology manifold4 search
    const { queryTopology } = await import('$lib/server/retrieval/topology-search-client.js');
    const topoResult = collection === 'codebase_chunks_768'
      ? await queryTopology(args.query, { radius: args.topoRadius ?? 0.30, limit: Math.min(limit, 20) })
      : {
          ok: false as const,
          rankingMode: 'unavailable' as const,
          topologyStatus: 'unavailable' as const,
          fallbackReason: 'collection_not_supported_for_topology',
          identityJoin: undefined,
          hits: [],
        };
    const topoHits: KAGHit[] = (topoResult.ok ? topoResult.hits : []).map(h => ({
      path: h.path,
      score: h.hybridScore ?? h.manifoldScore,
      source: 'topology' as const,
      stableKey: h.stableKey,
      sourceRef: h.sourceRef ?? null,
      sourceRevision: h.sourceRevision ?? null,
      contentHash: h.contentHash ?? null,
      representationRevision: h.representationRevision ?? null,
      topologySnapshotRevision: h.topologySnapshotRevision ?? null,
      summary: h.summary ?? h.contentPreview ?? '',
      topoClass: h.topoClass,
      cluster: h.somCluster ?? undefined,
      authorityScore: h.graphAuthorityScore ?? undefined,
    }));
    traceLog.push(`topology: mode=${topoResult.rankingMode} status=${topoResult.topologyStatus} fallback=${topoResult.fallbackReason ?? 'none'} hits=${topoHits.length} (${Date.now() - t0}ms)`);

    // Stage 4: Neo4j graph expansion of top 5 hits (optional)
    const graphHits: KAGHit[] = [];
    if (args.expandGraph !== false && qdrantHits.length > 0) {
      try {
        const neo4j = await import('neo4j-driver');
        const driver = neo4j.default.driver(
          ENV.NEO4J_URI,
          neo4j.default.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)
        );
        const session = driver.session();
        const topPaths = qdrantHits.slice(0, 5).map(h => h.path).filter(Boolean);
        try {
          if (topPaths.length) {
            const { records } = await session.run(
              `UNWIND $paths AS fp
               MATCH (a:CodebaseFile {filePath: fp})-[:IMPORTS]-(b:CodebaseFile)
               WHERE NOT b.filePath IN $paths
               RETURN DISTINCT b.filePath AS path, b.authorityScore AS auth, b.cluster AS cluster
               LIMIT 20`,
              { paths: topPaths }
            );
            for (const r of records) {
              graphHits.push({
                path: r.get('path'),
                score: Number(r.get('auth') ?? 0) * 0.5,
                source: 'neo4j',
                authorityScore: Number(r.get('auth') ?? 0),
                cluster: r.get('cluster') != null ? Number(r.get('cluster')) : undefined,
              });
            }
          }
        } finally {
          await session.close();
          await driver.close();
        }
        traceLog.push(`neo4j-expand: ${graphHits.length} neighbors (${Date.now() - t0}ms)`);
      } catch { traceLog.push('neo4j-expand: skipped (unavailable)'); }
    }

    // Stage 5: merge + authority-weighted rerank
    const all: KAGHit[] = qdrantHits.map((hit) => ({ ...hit, score: hit.score * 0.50 }));
    const qdrantByIdentity = new Map<string, KAGHit[]>();
    const topologyByIdentity = new Map<string, KAGHit[]>();
    for (const hit of qdrantHits) {
      const key = sourceIdentityKey(hit);
      if (key) qdrantByIdentity.set(key, [...(qdrantByIdentity.get(key) ?? []), hit]);
    }
    for (const hit of topoHits) {
      const key = sourceIdentityKey(hit);
      if (key) topologyByIdentity.set(key, [...(topologyByIdentity.get(key) ?? []), hit]);
    }

    // Weight: cosine=0.50, topology=0.35, graph=0.15. Only exact, unique source identities fuse.
    for (const [key, topologyRows] of topologyByIdentity) {
      const cosineRows = qdrantByIdentity.get(key) ?? [];
      if (topologyRows.length !== 1 || cosineRows.length !== 1) continue;
      const cosine = all.find((candidate) => sourceIdentityKey(candidate) === key);
      if (!cosine) continue;
      cosine.score += topologyRows[0].score * 0.35;
      cosine.topoClass = topologyRows[0].topoClass;
      cosine.cluster = topologyRows[0].cluster ?? cosine.cluster;
    }
    for (const hit of topoHits) {
      const key = sourceIdentityKey(hit);
      const cosineRows = key ? qdrantByIdentity.get(key) ?? [] : [];
      const topologyRows = key ? topologyByIdentity.get(key) ?? [] : [];
      if (!key || cosineRows.length !== 1 || topologyRows.length !== 1) all.push({ ...hit, score: hit.score * 0.35 });
    }
    // Neo4j currently returns paths only. Keep those hits separate until they carry source identity.
    for (const hit of graphHits) all.push({ ...hit, score: hit.score * 0.15 });

    all.sort((a, b) => b.score - a.score);

    return JSON.stringify({
      query: args.query,
      collection,
      totalFound: all.length,
      rankingMode: topoResult.rankingMode,
      topologyStatus: topoResult.topologyStatus,
      fallbackReason: topoResult.fallbackReason ?? null,
      identityJoin: topoResult.identityJoin ?? null,
      durationMs: Date.now() - t0,
      trace: traceLog,
      hits: all.slice(0, limit),
    });
  },
} as const;
