import { z } from 'zod';

interface KAGHit {
  path: string | null;
  score: number;
  source: 'qdrant' | 'topology' | 'neo4j';
  summary?: string;
  topoClass?: number;
  cluster?: number;
  authorityScore?: number;
}

async function embedQuery(text: string): Promise<number[]> {
  const base = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const res = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest', prompt: text }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
  const { embedding } = await res.json() as { embedding: number[] };
  return embedding;
}

async function qdrantSearch(vector: number[], collection: string, limit: number): Promise<KAGHit[]> {
  const base = process.env.QDRANT_URL ?? 'http://localhost:6333';
  const res = await fetch(`${base}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector, limit, with_payload: true }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const { result } = await res.json() as { result: Array<{ id: unknown; score: number; payload: Record<string, unknown> }> };
  return (result ?? []).map(h => ({
    path: (h.payload?.path ?? h.payload?.relative_path ?? null) as string | null,
    score: h.score,
    source: 'qdrant' as const,
    summary: String(h.payload?.summary ?? h.payload?.content ?? '').slice(0, 200),
    cluster: h.payload?.som_cluster != null ? Number(h.payload.som_cluster) : undefined,
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
    const topoResult = await queryTopology(args.query, { radius: args.topoRadius ?? 0.30, limit: Math.min(limit, 20) });
    const topoHits: KAGHit[] = (topoResult?.hits ?? []).map(h => ({
      path: h.path,
      score: h.hybridScore ?? h.manifoldScore,
      source: 'topology' as const,
      summary: h.summary ?? h.contentPreview ?? '',
      topoClass: h.topoClass,
      cluster: h.somCluster ?? undefined,
      authorityScore: h.graphAuthorityScore ?? undefined,
    }));
    traceLog.push(`topology: ${topoHits.length} hits (${Date.now() - t0}ms)`);

    // Stage 4: Neo4j graph expansion of top 5 hits (optional)
    const graphHits: KAGHit[] = [];
    if (args.expandGraph !== false && qdrantHits.length > 0) {
      try {
        const neo4j = await import('neo4j-driver');
        const driver = neo4j.default.driver(
          process.env.NEO4J_URI ?? 'bolt://localhost:7687',
          neo4j.default.auth.basic(process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASSWORD ?? 'neo4j123')
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
    const seen = new Set<string>();
    const all: KAGHit[] = [];

    // weight: qdrant=0.50, topology=0.35, neo4j=0.15
    for (const h of qdrantHits) {
      const key = h.path ?? `q:${all.length}`;
      if (!seen.has(key)) { seen.add(key); all.push({ ...h, score: h.score * 0.50 }); }
    }
    for (const h of topoHits) {
      const key = h.path ?? `t:${all.length}`;
      const existing = all.find(a => a.path === h.path);
      if (existing) { existing.score += h.score * 0.35; existing.topoClass = h.topoClass; existing.cluster = h.cluster ?? existing.cluster; }
      else if (!seen.has(key)) { seen.add(key); all.push({ ...h, score: h.score * 0.35 }); }
    }
    for (const h of graphHits) {
      const key = h.path ?? `g:${all.length}`;
      const existing = all.find(a => a.path === h.path);
      if (existing) { existing.score += h.score * 0.15; existing.authorityScore = h.authorityScore; }
      else if (!seen.has(key)) { seen.add(key); all.push({ ...h, score: h.score * 0.15 }); }
    }

    all.sort((a, b) => b.score - a.score);

    return JSON.stringify({
      query: args.query,
      collection,
      totalFound: all.length,
      durationMs: Date.now() - t0,
      trace: traceLog,
      hits: all.slice(0, limit),
    });
  },
} as const;
