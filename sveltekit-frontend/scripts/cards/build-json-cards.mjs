#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sortObject, stableHash } from '../index/shared.mjs';
import { buildMasterFeatureCards } from './master-feature-cards.mjs';
import { MASTER_FEATURE_MAP } from '../../src/lib/server/atlas/master-feature-map.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const EXPORT_DIR = path.join(ROOT, 'memory', 'exports');
const CARD_DIR = path.join(ROOT, 'memory', 'cards');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(relPath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJsonl(relPath, fallback = []) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, relPath), 'utf8').trim();
    if (!raw) return fallback;
    return raw.split(/\r?\n/).map((line) => JSON.parse(line));
  } catch {
    return fallback;
  }
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function writeJson(relPath, value) {
  const full = path.join(ROOT, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, `${JSON.stringify(sortObject(value), null, 2)}\n`, 'utf8');
  return full;
}

function writeJsonl(relPath, rows) {
  const full = path.join(ROOT, relPath);
  ensureDir(path.dirname(full));
  const body = rows.map((row) => JSON.stringify(sortObject(row))).join('\n');
  fs.writeFileSync(full, `${body}${rows.length ? '\n' : ''}`, 'utf8');
  return full;
}

function rel(file) {
  return path.join(ROOT, file);
}

function slash(file) {
  return file.replace(/\\/g, '/');
}

function compact(text, limit = 220) {
  const normalized = String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function scoreOf(card) {
  const scores = card.scores ?? {};
  return [
    Number(scores.rank ?? 0),
    Number(scores.memberCount ?? 0) / 10_000,
    Number(scores.directFanOut ?? 0) / 100,
    Number(scores.authority ?? 0),
    Number(scores.recency ?? 0),
  ].reduce((sum, value) => sum + value, 0);
}

function hashCard(card) {
  const clone = { ...card };
  delete clone.hash;
  return stableHash(JSON.stringify(sortObject(clone)));
}

function makeCard(base) {
  const card = { ...base };
  card.hash = hashCard(card);
  return card;
}

function cardLabels(...labels) {
  return [...new Set(labels.filter(Boolean).map((label) => String(label).trim()).filter(Boolean))].sort();
}

function featureCards(atlasTop) {
  return atlasTop.map((row) => {
    const topFiles = Array.isArray(row.top) ? row.top.slice(0, 5).map(String) : [];
    const clusters = Array.isArray(row.clusters) ? row.clusters.slice(0, 8).map(String) : [];
    const tags = Array.isArray(row.tags) ? row.tags.slice(0, 8).map(String) : [];
    const topo = Array.isArray(row.topo) ? row.topo.slice(0, 8).map(String) : [];
    return makeCard({
      id: `feature:${stableHash(String(row.d))}`,
      kind: 'feature',
      labels: cardLabels('feature', ...clusters.map((c) => c.split(':')[0]), ...tags, ...topo),
      summary: compact(
        `${row.d} — rank ${Number(row.rank ?? 0).toFixed(3)}, auth ${Number(row.auth ?? 0).toFixed(3)}, ` +
        `kgpu ${Number(row.kgpu ?? 0).toFixed(3)}; top files: ${topFiles.join(', ')}`
      ),
      sourceRefs: [
        'memory/atlas/codebase-atlas.top.json',
        row.a ? slash(row.a) : 'memory/atlas/codebase-atlas.top.json',
      ],
      scores: {
        rank: Number(row.rank ?? 0),
        authority: Number(row.auth ?? 0),
        gpuWeight: Number(row.kgpu ?? 0),
        hits: Number(row.hits ?? 0),
      },
      payload: {
        directory: row.d,
        agentFile: row.a,
        parentFile: row.p,
        nodes: row.n,
        clusters,
        topo,
        tags,
        top: topFiles,
        pr: row.pr ?? 0,
        avgAuth: row.avgAuth ?? 0,
        hits: row.hits ?? 0,
        dirty: row.dirty ?? 0,
      },
    });
  });
}

function clusterCards(clusterSummaries) {
  return (clusterSummaries?.clusters ?? []).map((row) => {
    const topFiles = row?.metadata?.topFiles ?? [];
    const tags = Array.isArray(row.tags) ? row.tags.slice(0, 8).map(String) : [];
    const patterns = Array.isArray(row.patterns) ? row.patterns.slice(0, 8).map(String) : [];
    return makeCard({
      id: `cluster:${String(row.clusterId)}`,
      kind: 'cluster',
      labels: cardLabels('cluster', ...tags, ...patterns),
      summary: compact(row.summary ?? row.purpose ?? `Cluster ${row.clusterId}`),
      sourceRefs: [
        'docs/graph/cluster-summaries.json',
        ...topFiles.slice(0, 3).map((file) => slash(file)),
      ],
      scores: {
        memberCount: Number(row.memberCount ?? 0),
        llmTotalHits: Number(row.llmTotalHits ?? 0),
        llmPathCount: Number(row.llmPathCount ?? 0),
        hasEmbedding: row.hasEmbedding ? 1 : 0,
      },
      payload: row,
    });
  });
}

function pathwayCards(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const candidates = nodes
    .filter((node) => node && typeof node === 'object')
    .filter((node) => node.isRoute || node.directFanOut > 0 || node.directFanIn > 0 || node.hasAuth || node.hasZod)
    .map((node) => {
      const labels = cardLabels(
        'pathway',
        node.zone,
        node.isRoute ? 'route' : 'module',
        node.hasAuth ? 'auth' : '',
        node.hasZod ? 'zod' : '',
        node.isTest ? 'test' : '',
      );
      const pathName = slash(node.rel ?? 'unknown');
      return makeCard({
        id: `pathway:${stableHash(pathName)}`,
        kind: 'pathway',
        labels,
        summary: compact(
          `${pathName} — zone ${node.zone}, fanOut ${Number(node.directFanOut ?? 0)}, ` +
          `fanIn ${Number(node.directFanIn ?? 0)}, lines ${Number(node.lineCount ?? 0)}`
        ),
        sourceRefs: [
          'memory/graphify/deep/deep-import-graph.json',
          'memory/graphify/deep/deep-import-edges.jsonl',
        ],
        scores: {
          directFanOut: Number(node.directFanOut ?? 0),
          directFanIn: Number(node.directFanIn ?? 0),
          lineCount: Number(node.lineCount ?? 0),
          auth: node.hasAuth ? 1 : 0,
          zod: node.hasZod ? 1 : 0,
        },
        payload: node,
      });
    });

  return candidates
    .sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id))
    .slice(0, 50);
}

function toolCards() {
  return [
    makeCard({
      id: 'tool:trace.bifrost_dispatch',
      kind: 'tool',
      labels: cardLabels('tool', 'bifrost', 'llm', 'dispatcher'),
      summary: 'Bifrost gateway dispatcher for model, cache, rerank, and embedding tiers.',
      sourceRefs: ['src/mcp/bifrost_tools.ts', 'src/lib/server/ollama.ts'],
      scores: { authority: 0.95, rank: 0.92 },
      payload: {
        tool: 'trace.bifrost_dispatch',
        tiers: ['model', 'cache', 'rerank', 'embedding'],
      },
    }),
    makeCard({
      id: 'tool:trace.kag_search',
      kind: 'tool',
      labels: cardLabels('tool', 'trace', 'kag', 'search'),
      summary: 'TRACE/KAG hybrid search path for graph expansion and contextual retrieval.',
      sourceRefs: ['src/mcp/trace-mcp-server.ts', 'src/lib/server/retrieval'],
      scores: { authority: 0.91, rank: 0.89 },
      payload: { tool: 'trace.kag_search' },
    }),
    makeCard({
      id: 'tool:engram.ace_packet_inject',
      kind: 'tool',
      labels: cardLabels('tool', 'engram', 'ace', 'memory'),
      summary: 'Writes ACE packets and chat-memory hints into the Redis hot path.',
      sourceRefs: ['src/lib/server/ai/engram-memory.ts', 'src/lib/server/ai/engram-registry.ts'],
      scores: { authority: 0.89, rank: 0.87 },
      payload: { tool: 'engram.ace_packet_inject' },
    }),
    makeCard({
      id: 'tool:engram.chat_memory_store',
      kind: 'tool',
      labels: cardLabels('tool', 'engram', 'memory', 'redis'),
      summary: 'Chat memory store path used for bounded conversational context and DYM hints.',
      sourceRefs: ['src/lib/server/ai/engram-memory.ts'],
      scores: { authority: 0.86, rank: 0.84 },
      payload: { tool: 'engram.chat_memory_store' },
    }),
    makeCard({
      id: 'tool:langextract.extract',
      kind: 'tool',
      labels: cardLabels('tool', 'langextract', 'extract', 'compression'),
      summary: 'LangExtract compression and structure extraction lane for prompt suffix reduction.',
      sourceRefs: ['src/lib/server/tools/handlers/langextractBatch.ts', 'src/mcp/trace-mcp-server.ts'],
      scores: { authority: 0.82, rank: 0.8 },
      payload: { tool: 'langextract.extract' },
    }),
    makeCard({
      id: 'tool:reranker.score',
      kind: 'tool',
      labels: cardLabels('tool', 'reranker', 'rank', 'relevance'),
      summary: 'Cross-encoder / lightweight scoring lane used after retrieval before materialization.',
      sourceRefs: ['src/lib/server/rag/ranker.ts', 'src/lib/server/retrieval'],
      scores: { authority: 0.81, rank: 0.79 },
      payload: { tool: 'reranker.score' },
    }),
  ];
}

function memoryCards() {
  return [
    makeCard({
      id: 'memory:ace-prefix',
      kind: 'memory',
      labels: cardLabels('memory', 'ace', 'prefix', 'prompt-cache'),
      summary: 'TOON-encoded ACE prefix packet used to keep the stable prefix byte-identical.',
      sourceRefs: ['scripts/index/ace-prefix-toon.mjs', 'memory/index/ace-prefix.toon'],
      scores: { recency: 0.95, rank: 0.9 },
      payload: { cache: 'ace-prefix', format: 'toon' },
    }),
    makeCard({
      id: 'memory:bifrost-prefix-cache',
      kind: 'memory',
      labels: cardLabels('memory', 'bifrost', 'prefix', 'kv-cache'),
      summary: 'Bifrost KV prefix cache for shareable system prompts and warm prefixes.',
      sourceRefs: ['src/lib/server/ai/bifrost-cache-manager.ts'],
      scores: { recency: 0.88, rank: 0.84 },
      payload: { cache: 'bifrost:kv:prefix' },
    }),
    makeCard({
      id: 'memory:engram-bigram',
      kind: 'memory',
      labels: cardLabels('memory', 'engram', 'bigram', 'did-you-mean'),
      summary: 'Redis bigram memory for did-you-mean suggestions and spatial query locality.',
      sourceRefs: ['src/lib/server/ai/engram-memory.ts'],
      scores: { recency: 0.87, rank: 0.83 },
      payload: { cache: 'ace:engram:bigram' },
    }),
    makeCard({
      id: 'memory:exact-match',
      kind: 'memory',
      labels: cardLabels('memory', 'exact', 'cache', 'redis'),
      summary: 'Exact-match L1 cache entry format for repeated prompt/response pairs.',
      sourceRefs: ['src/lib/server/cache/redis-exact-match.ts'],
      scores: { recency: 0.86, rank: 0.8 },
      payload: { cache: 'llm-exact-match' },
    }),
  ];
}

function summaryCards() {
  const cards = readJsonl('memory/cards/codebase-summary-cards.jsonl', []);
  return cards
    .filter((card) => card && typeof card === 'object')
    .map((card) => makeCard({
      ...card,
      kind: 'summary',
      labels: Array.isArray(card.labels) ? card.labels : [],
      sourceRefs: Array.isArray(card.sourceRefs) ? card.sourceRefs : [],
      scores: card.scores ?? {},
      payload: card.payload ?? {},
    }))
    .sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
}

function featureMapCards() {
  return buildMasterFeatureCards();
}

function buildManifest({ atlasTop, clusters, graph, cards, featureMapCount }) {
  return {
    generatedAt: new Date().toISOString(),
    repoRoot: slash(ROOT),
    sources: {
      atlasTop: {
        path: 'memory/atlas/codebase-atlas.top.json',
        hash: stableHash(readText('memory/atlas/codebase-atlas.top.json')),
        count: Array.isArray(atlasTop) ? atlasTop.length : 0,
      },
      clusterSummaries: {
        path: 'docs/graph/cluster-summaries.json',
        hash: stableHash(readText('docs/graph/cluster-summaries.json')),
        count: Array.isArray(clusters?.clusters) ? clusters.clusters.length : 0,
      },
      deepImportGraph: {
        path: 'memory/graphify/deep/deep-import-graph.json',
        hash: stableHash(readText('memory/graphify/deep/deep-import-graph.json')),
        nodeCount: Number(graph?.stats?.nodeCount ?? 0),
        edgeCount: Number(graph?.stats?.edgeCount ?? 0),
      },
      featureMap: {
        path: 'src/lib/server/atlas/master-feature-map.ts',
        hash: stableHash(readText('src/lib/server/atlas/master-feature-map.ts')),
        count: Number(featureMapCount ?? 0),
      },
    },
    outputs: {
      graphRefreshManifest: 'memory/exports/graph-refresh-manifest.json',
      clusterCards: 'memory/exports/cluster-cards.jsonl',
      pathwayCards: 'memory/exports/pathway-cards.jsonl',
      featureMapCards: 'memory/exports/feature-map-cards.jsonl',
      selectedCards: 'memory/cards/selected-cards.json',
      selectedToon: 'memory/cards/selected-cards.toon',
    },
    cardCounts: cards.reduce((acc, card) => {
      acc[card.kind] = (acc[card.kind] ?? 0) + 1;
      return acc;
    }, /** @type {Record<string, number>} */ ({})),
  };
}

const atlasTop = readJson('memory/atlas/codebase-atlas.top.json', { top: [] })?.top ?? [];
const clusterSummaries = readJson('docs/graph/cluster-summaries.json', { clusters: [] });
const deepGraph = readJson('memory/graphify/deep/deep-import-graph.json', { nodes: [], stats: {} });

const feature = featureCards(Array.isArray(atlasTop) ? atlasTop : []);
const cluster = clusterCards(clusterSummaries);
const pathway = pathwayCards(deepGraph);
const featureMap = featureMapCards();
const summary = summaryCards();
const tools = toolCards();
const memory = memoryCards();

const allCards = [...featureMap, ...feature, ...summary, ...cluster, ...pathway, ...tools, ...memory]
  .sort((a, b) => scoreOf(b) - scoreOf(a) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

const selectedCards = {
  generatedAt: new Date().toISOString(),
  kind: 'selected-cards',
  cards: allCards.slice(0, 24),
  sourceSummary: {
    featureMap: featureMap.length,
    feature: feature.length,
    summary: summary.length,
    cluster: cluster.length,
    pathway: pathway.length,
    tool: tools.length,
    memory: memory.length,
  },
};

ensureDir(EXPORT_DIR);
ensureDir(CARD_DIR);

const manifest = buildManifest({
  atlasTop,
  clusters: clusterSummaries,
  graph: deepGraph,
  cards: allCards,
  featureMapCount: Object.keys(MASTER_FEATURE_MAP).length,
});
writeJson('memory/exports/graph-refresh-manifest.json', manifest);
writeJsonl('memory/exports/feature-map-cards.jsonl', featureMap);
writeJsonl('memory/exports/cluster-cards.jsonl', cluster);
writeJsonl('memory/exports/pathway-cards.jsonl', pathway);
writeJson('memory/cards/selected-cards.json', selectedCards);

const digest = stableHash(JSON.stringify(sortObject(manifest)) + '\n' + JSON.stringify(sortObject(selectedCards)));
console.log(JSON.stringify({
  ok: true,
  generatedAt: manifest.generatedAt,
  counts: manifest.cardCounts,
  selected: selectedCards.cards.length,
  digest,
}, null, 2));
