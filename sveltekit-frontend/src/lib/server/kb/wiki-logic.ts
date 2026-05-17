import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { count, eq, ilike, or } from 'drizzle-orm';
import { ENV } from '../env.server.js';
import { getRedis } from '../redis.js';
import { db } from '../db/client.js';
import { enhancedGraphMappings } from '../db/schema/graph-mappings.js';
import { featureMaps, grpoMemorySticks } from '../db/schema/features.js';
import { getNeo4jDriver } from '../neo4j-driver.js';
import { readWikiCard } from '../wiki/wiki-couchdb-client.js';

const GRAPH_PATH = 'docs/graph/codebase-graph.json';
const COUCHDB_DB = process.env.COUCHDB_AGENTS_DB ?? process.env.COUCHDB_WIKI_DB ?? 'karpathy_wiki';

type WikiSearchOptions = {
  limit?: number;
};

type WikiSearchHit = {
  id: string;
  kind: string;
  label: string;
  path?: string | null;
  summary?: string | null;
  score: number;
  sources: string[];
  trace?: Record<string, unknown>;
};

export async function getWikiStatus() {
  const [mappingCount, featureStats, redisStats, couchStats, qdrantStats, neo4jStats] =
    await Promise.all([
      safe(
        'postgres:mapping-count',
        async () => {
          const [row] = await db.select({ value: count() }).from(enhancedGraphMappings);
          return Number(row?.value ?? 0);
        },
        0
      ),
      safe(
        'postgres:feature-map-count',
        async () => {
          const [featureMapRow] = await db.select({ value: count() }).from(featureMaps);
          const [memoryStickRow] = await db.select({ value: count() }).from(grpoMemorySticks);
          return {
            mapCount: Number(featureMapRow?.value ?? 0),
            memoryStickCount: Number(memoryStickRow?.value ?? 0),
          };
        },
        { mapCount: 0, memoryStickCount: 0 }
      ),
      getRedisStats(),
      getCouchDbStats(),
      getQdrantStats(),
      getNeo4jStats(),
    ]);

  const graph = readCodebaseGraph();
  const graphDirs = getGraphDirectories(graph);
  const staleDirectories = graphDirs
    .filter((dir) => !redisStats.agentDirectories.has(dir))
    .slice(0, 25);

  const lastGraphify = await getLatestGraphifyTimestamp();

  return {
    pageCount: mappingCount,
    staleDirectories,
    latestGraphifyTimestamp: lastGraphify,
    redisAgentsKeyCount: redisStats.agentsKeyCount,
    couchdbWikiDocCount: couchStats.docCount,
    qdrantPayloadCoverage: qdrantStats.payloadCoverage,
    neo4jAgentsCardCount: neo4jStats.agentsCardCount,
    lastGraphify,
    redis: {
      agentsCards: redisStats.agentsKeyCount,
      wikiPages: redisStats.wikiPageKeyCount,
      karpathyScoreCount: redisStats.karpathyScoreCount,
    },
    couchdb: couchStats,
    qdrant: qdrantStats,
    neo4j: neo4jStats,
    featureMap: {
      mapCount: featureStats.mapCount,
      memoryStickCount: featureStats.memoryStickCount,
      dryRunOnly: featureStats.mapCount === 0,
    },
    directoryCount: graphDirs.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function searchWiki(query: string, options: WikiSearchOptions = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const [postgresHits, graphHits, rgHits, redisScores, qdrantHits, couchHits] = await Promise.all([
    searchPostgresMappings(query, limit),
    searchCodebaseGraph(query, limit),
    searchAgentsMarkdown(query, limit),
    getKarpathyScores(),
    searchQdrantPayloads(query, limit),
    searchCouchWikiDocs(query, limit),
  ]);

  const merged = new Map<string, WikiSearchHit>();
  for (const hit of [...postgresHits, ...graphHits, ...rgHits, ...qdrantHits, ...couchHits]) {
    const existing = merged.get(hit.id);
    const karpathyBoost = redisScores.get(hit.path ?? hit.id) ?? redisScores.get(hit.id) ?? 0;
    const score = hit.score + Math.min(karpathyBoost, 1);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.sources = Array.from(new Set([...existing.sources, ...hit.sources]));
      existing.summary ||= hit.summary;
      existing.path ||= hit.path;
      existing.trace = {
        ...(existing.trace ?? {}),
        ...(hit.trace ?? {}),
      };
    } else {
      merged.set(hit.id, { ...hit, score });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({
      ...hit,
      trace: {
        ...(hit.trace ?? {}),
        used: hit.sources,
        karpathyScore: redisScores.get(hit.path ?? hit.id) ?? redisScores.get(hit.id) ?? 0,
      },
    }));
}

export async function explainWikiPage(id: string) {
  const [mapping] = await db.select()
    .from(enhancedGraphMappings)
    .where(eq(enhancedGraphMappings.id, id))
    .limit(1);

  let wikiCard = null;
  try {
    wikiCard = await readWikiCard(id);
  } catch {
    wikiCard = null;
  }

  if (!mapping && !wikiCard) return null;

  const mappedPath = String(mapping?.path ?? (wikiCard as any)?.dirPath ?? (wikiCard as any)?.path ?? '');
  const featureId = id.startsWith('feature:') ? id : `feature:${id.replace(/^agents:dir:/, '').replace(/:/g, '-')}`;
  const [feature] = await db.select().from(featureMaps).where(eq(featureMaps.id, featureId)).limit(1);
  const memorySticks = await db.select()
    .from(grpoMemorySticks)
    .where(eq(grpoMemorySticks.featureId, feature?.id ?? id))
    .limit(5);

  const graph = readCodebaseGraph();
  const graphNode = findGraphNode(graph, mappedPath || id);
  const sourceFiles = collectSourceFiles(mapping, wikiCard, graphNode);

  return {
    mapping: mapping ?? {
      id,
      kind: 'wiki_page',
      label: (wikiCard as any)?.title ?? id,
      path: mappedPath,
      summary: (wikiCard as any)?.summary ?? '',
      metadata: {},
    },
    feature: feature ? {
      id: feature.id,
      name: feature.name,
      glyph: parseJsonMaybe(feature.glyph),
      status: feature.status,
      paths: feature.paths,
    } : null,
    wikiCard,
    sourceFiles,
    staticImports: graphNode?.imports ?? graphNode?.staticImports ?? [],
    dynamicImports: graphNode?.dynamicImports ?? [],
    pathAliases: graphNode?.pathAliases ?? [],
    featureKeys: (wikiCard as any)?.featureKeys ?? (feature ? [feature.id] : []),
    qdrantTags: graphNode?.tags ?? graphNode?.qdrantTags ?? [],
    graphLinks: {
      edges: mapping?.edges ?? [],
      triples: feature?.graphTriples ?? [],
    },
    activityScore: Number((wikiCard as any)?.activityScore ?? graphNode?.activityScore ?? 0),
    memorySticks: memorySticks.map((stick) => ({
      id: stick.id,
      queryHash: stick.queryHash,
      contextPacketHash: stick.contextPacketHash,
      rewardSignals: stick.rewardSignals,
      selectedIds: stick.selectedIds,
      rejectedIds: stick.rejectedIds,
    })),
    recommendations: buildRecommendations(mapping, wikiCard, graphNode, feature),
  };
}

export async function refreshDirectory(dirPath: string, dryRun = true) {
  const normalizedPath = dirPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const agentsPath = path.join(normalizedPath, 'LLMS.md');
  const graph = readCodebaseGraph();
  const graphNode = findGraphNode(graph, normalizedPath);
  const existsOnDisk = fs.existsSync(normalizedPath);
  const hasAgentsCard = fs.existsSync(agentsPath);
  const proposedChanges = [
    hasAgentsCard ? `Read ${agentsPath}` : `Create or refresh ${agentsPath}`,
    `Recalculate lexical metadata for ${normalizedPath}`,
    `Update AGENTS/Karpathy cache packet for ${normalizedPath}`,
    `Queue Neo4j AgentsCard relationships for ${normalizedPath}`,
  ];

  return {
    path: normalizedPath,
    dryRun,
    status: dryRun ? 'dry_run' : 'queued',
    timestamp: new Date().toISOString(),
    existsOnDisk,
    hasAgentsCard,
    graphNodeFound: Boolean(graphNode),
    proposedChanges,
    message: dryRun
      ? 'No writes performed. Pass dryRun=false only from an operator-approved refresh flow.'
      : 'Refresh request accepted by API boundary; full re-index jobs are intentionally not started here.',
  };
}

async function getRedisStats() {
  return safe('redis:wiki-stats', async () => {
    const redis = getRedis();
    const [agentKeys, wikiKeys, karpathyScores] = await Promise.all([
      scanRedisKeys(redis, 'agents:dir:*'),
      scanRedisKeys(redis, 'wiki:page:*'),
      redis.hgetall('gpu:karpathy:scores').catch(() => ({} as Record<string, string>)),
    ]);
    const agentDirectories = new Set(agentKeys.map((key) => key.replace(/^agents:dir:/, '').replace(/-/g, '/')));
    return {
      agentsKeyCount: agentKeys.length,
      wikiPageKeyCount: wikiKeys.length,
      karpathyScoreCount: Object.keys(karpathyScores).length,
      agentDirectories,
    };
  }, {
    agentsKeyCount: 0,
    wikiPageKeyCount: 0,
    karpathyScoreCount: 0,
    agentDirectories: new Set<string>(),
  });
}

async function getCouchDbStats() {
  return safe('couchdb:wiki-stats', async () => {
    const res = await couchFetch(`/${COUCHDB_DB}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { doc_count?: number; update_seq?: string | number };
    return {
      database: COUCHDB_DB,
      docCount: Number(body.doc_count ?? 0),
      updateSeq: body.update_seq ?? null,
    };
  }, {
    database: COUCHDB_DB,
    docCount: 0,
    updateSeq: null,
  });
}

async function getQdrantStats() {
  return safe('qdrant:wiki-stats', async () => {
    const { QdrantManager } = await import('../vector/qdrant-manager.js');
    const qdrant = new QdrantManager();
    const collection = qdrant.collections.codebase_chunks;
    const info = await qdrant.client.getCollection(collection);
    const pointCount = Number((info as any).points_count ?? (info as any).vectors_count ?? 0);
    const payloadSchema = (info as any).payload_schema ?? {};
    return {
      collection,
      pointCount,
      payloadCoverage: {
        collection,
        pointCount,
        indexedPayloadFields: Object.keys(payloadSchema).length,
        status: (info as any).status ?? 'unknown',
      },
    };
  }, {
    collection: 'codebase_chunks_768',
    pointCount: 0,
    payloadCoverage: {
      collection: 'codebase_chunks_768',
      pointCount: 0,
      indexedPayloadFields: 0,
      status: 'unavailable',
    },
  });
}

async function getNeo4jStats() {
  return safe('neo4j:wiki-stats', async () => {
    const neo4j = getNeo4jDriver();
    const session = neo4j.session();
    try {
      const result = await session.run('MATCH (n:AgentsCard) RETURN count(n) as count');
      const value = result.records[0]?.get('count');
      return { agentsCardCount: typeof value?.toNumber === 'function' ? value.toNumber() : Number(value ?? 0) };
    } finally {
      await session.close();
    }
  }, { agentsCardCount: 0 });
}

async function searchPostgresMappings(query: string, limit: number): Promise<WikiSearchHit[]> {
  return safe('postgres:wiki-search', async () => {
    const rows = await db.select()
      .from(enhancedGraphMappings)
      .where(or(
        ilike(enhancedGraphMappings.label, `%${query}%`),
        ilike(enhancedGraphMappings.summary, `%${query}%`),
        ilike(enhancedGraphMappings.path, `%${query}%`)
      ))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      path: row.path,
      summary: row.summary,
      score: 0.8,
      sources: ['postgres_jsonb'],
      trace: { postgres: true },
    }));
  }, []);
}

async function searchAgentsMarkdown(query: string, limit: number): Promise<WikiSearchHit[]> {
  return safe('rg:agents-search', async () => {
    const output = execFileSync('rg', ['-n', '-i', '--glob', 'LLMS.md', query, 'src'], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024,
      timeout: 5000,
    });
    return output.split(/\r?\n/)
      .filter(Boolean)
      .slice(0, limit)
      .map((line) => {
        const [file, lineNumber, ...rest] = line.split(':');
        const dir = file.replace(/\/?AGENTS\.md$/, '').replace(/\\/g, '/');
        return {
          id: `agents:dir:${dir.replace(/[\/\\]/g, '-')}`,
          kind: 'agents_card',
          label: dir,
          path: dir,
          summary: rest.join(':').trim().slice(0, 240),
          score: 0.65,
          sources: ['rg_LLMS.md'],
          trace: { line: Number(lineNumber) },
        };
      });
  }, []);
}

async function searchQdrantPayloads(query: string, limit: number): Promise<WikiSearchHit[]> {
  return safe('qdrant:payload-search', async () => {
    const { QdrantManager } = await import('../vector/qdrant-manager.js');
    const qdrant = new QdrantManager();
    const collection = qdrant.collections.codebase_chunks;
    const response = await qdrant.client.scroll(collection, {
      limit: Math.min(limit * 10, 100),
      with_payload: true,
      with_vector: false,
    });
    const needle = query.toLowerCase();
    return (response.points ?? [])
      .filter((point: any) => JSON.stringify(point.payload ?? {}).toLowerCase().includes(needle))
      .slice(0, limit)
      .map((point: any) => ({
        id: String(point.payload?.stable_key ?? point.payload?.path ?? point.id),
        kind: String(point.payload?.kind ?? 'qdrant_chunk'),
        label: String(point.payload?.title ?? point.payload?.label ?? point.payload?.path ?? point.id),
        path: point.payload?.path ? String(point.payload.path) : null,
        summary: String(point.payload?.summary ?? point.payload?.text ?? '').slice(0, 300),
        score: 0.55,
        sources: ['qdrant_payload'],
        trace: { qdrantCollection: collection },
      }));
  }, []);
}

async function searchCouchWikiDocs(query: string, limit: number): Promise<WikiSearchHit[]> {
  return safe('couchdb:wiki-search', async () => {
    const res = await couchFetch(`/${COUCHDB_DB}/_all_docs?include_docs=true&limit=${Math.min(limit * 5, 100)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { rows?: Array<{ id: string; doc?: Record<string, unknown> }> };
    const needle = query.toLowerCase();
    return (body.rows ?? [])
      .filter((row) => JSON.stringify(row.doc ?? {}).toLowerCase().includes(needle))
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        kind: String(row.doc?.kind ?? row.doc?.type ?? 'couchdb_wiki_doc'),
        label: String(row.doc?.title ?? row.doc?.name ?? row.id),
        path: row.doc?.dirPath ? String(row.doc.dirPath) : row.doc?.path ? String(row.doc.path) : null,
        summary: String(row.doc?.summary ?? row.doc?.content ?? '').slice(0, 300),
        score: 0.6,
        sources: ['couchdb_wiki'],
        trace: { couchdb: COUCHDB_DB },
      }));
  }, []);
}

async function getKarpathyScores() {
  return safe('redis:karpathy-scores', async () => {
    const raw = await getRedis().hgetall('gpu:karpathy:scores');
    return new Map(Object.entries(raw).map(([key, value]) => [key, Number(value) || 0]));
  }, new Map<string, number>());
}

function searchCodebaseGraph(query: string, limit: number): WikiSearchHit[] {
  const graph = readCodebaseGraph();
  const needle = query.toLowerCase();
  const nodes = [
    ...(Array.isArray((graph as any).files) ? (graph as any).files : []),
    ...(Array.isArray((graph as any).directories) ? (graph as any).directories : []),
    ...(Array.isArray((graph as any).nodes) ? (graph as any).nodes : []),
  ];
  return nodes
    .filter((node: any) => JSON.stringify(node).toLowerCase().includes(needle))
    .slice(0, limit)
    .map((node: any) => {
      const nodePath = String(node.path ?? node.dir ?? node.id ?? '');
      return {
        id: String(node.id ?? `graph:${nodePath}`),
        kind: String(node.kind ?? (node.dir ? 'directory' : 'graph_node')),
        label: String(node.label ?? node.name ?? nodePath),
        path: nodePath || null,
        summary: String(node.summary ?? node.description ?? '').slice(0, 300),
        score: 0.7,
        sources: ['codebase_graph'],
        trace: { graphPath: GRAPH_PATH },
      };
    });
}

async function getLatestGraphifyTimestamp() {
  return safe('graphify:last-timestamp', async () => {
    const redisValue = await getRedis().get('ace:last_graphify_at').catch(() => null);
    if (redisValue) return redisValue;
    if (fs.existsSync(GRAPH_PATH)) return fs.statSync(GRAPH_PATH).mtime.toISOString();
    return null;
  }, null as string | null);
}

function readCodebaseGraph(): Record<string, unknown> {
  try {
    if (!fs.existsSync(GRAPH_PATH)) return {};
    return JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function getGraphDirectories(graph: Record<string, unknown>): string[] {
  const dirs = Array.isArray((graph as any).directories) ? (graph as any).directories : [];
  return dirs.map((dir: any) => String(dir.dir ?? dir.path ?? dir.id ?? '')).filter(Boolean);
}

function findGraphNode(graph: Record<string, unknown>, idOrPath: string): any {
  const nodes = [
    ...((graph as any).files ?? []),
    ...((graph as any).directories ?? []),
    ...((graph as any).nodes ?? []),
  ];
  return nodes.find((node: any) => [node.id, node.path, node.dir, node.stableKey].filter(Boolean).includes(idOrPath));
}

function collectSourceFiles(mapping: any, wikiCard: any, graphNode: any): string[] {
  return Array.from(new Set([
    mapping?.path,
    ...(Array.isArray(wikiCard?.sourceFiles) ? wikiCard.sourceFiles : []),
    ...(Array.isArray(wikiCard?.files) ? wikiCard.files : []),
    ...(Array.isArray(graphNode?.files) ? graphNode.files : []),
    graphNode?.path,
  ].filter(Boolean).map(String)));
}

function buildRecommendations(mapping: any, wikiCard: any, graphNode: any, feature: any): string[] {
  const recommendations: string[] = [];
  if (!feature) recommendations.push('No related FeatureMap found; compile a feature note if this page is part of a user-facing workflow.');
  if (!wikiCard) recommendations.push('No CouchDB wiki card found; refresh the directory card in dry-run first.');
  if (!graphNode) recommendations.push('No codebase-graph node matched; run graph metadata refresh before full re-index.');
  if ((mapping?.edges ?? []).length === 0) recommendations.push('No graph edges recorded; enrich imports/schema/cache references.');
  return recommendations.length > 0 ? recommendations : ['Wiki page is connected across graph, cache, and feature metadata.'];
}

async function scanRedisKeys(redis: any, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0' && keys.length < 10000);
  return keys;
}

async function couchFetch(pathname: string, init: RequestInit = {}) {
  const user = process.env.COUCHDB_USER ?? 'admin';
  const pass = process.env.COUCHDB_PASS ?? 'password';
  return fetch(`${ENV.COUCHDB_URL}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function parseJsonMaybe(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[wiki-logic] ${label} unavailable:`, (err as Error).message);
    return fallback;
  }
}
