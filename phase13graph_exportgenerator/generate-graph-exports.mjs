#!/usr/bin/env node
/**
 * Generate stable graph export artifacts for DuckDB / feature synthesis consumers.
 *
 * Writes:
 * - memory/exports/graph-refresh-manifest.json
 * - memory/exports/cluster-cards.jsonl
 * - memory/exports/pathway-cards.jsonl
 *
 * This does NOT promote the graph as production truth.
 * promotionState stays "unpromoted" until downstream validation passes.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();

const EXPORT_DIR = path.join(root, 'memory', 'exports');
const GRAPH_PATH = path.join(root, 'docs', 'graph', 'codebase-graph.json');
const DEEP_GRAPH_PATH = path.join(root, 'memory', 'graphify', 'deep', 'deep-import-graph.json');
const DEEP_EDGES_PATH = path.join(root, 'memory', 'graphify', 'deep', 'deep-import-edges.jsonl');
const DOCSTORE_MANIFEST_PATH = path.join(root, 'memory', 'docstore', 'manifest.json');
const KAG_MANIFEST_PATH = path.join(root, 'memory', 'kag-notes', 'manifest.json');

const CLUSTER_CARDS_PATH = path.join(EXPORT_DIR, 'cluster-cards.jsonl');
const PATHWAY_CARDS_PATH = path.join(EXPORT_DIR, 'pathway-cards.jsonl');
const MANIFEST_PATH = path.join(EXPORT_DIR, 'graph-refresh-manifest.json');

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonlIfExists(filePath, limit = 100000) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines.slice(0, limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizePathLike(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replaceAll('\\', '/');
}

function getNodes(graph) {
  if (!graph) return [];
  if (Array.isArray(graph.nodes)) return graph.nodes;
  if (Array.isArray(graph.files)) return graph.files;
  if (Array.isArray(graph.graph?.nodes)) return graph.graph.nodes;
  return [];
}

function getEdges(graph, jsonlEdges) {
  if (Array.isArray(jsonlEdges) && jsonlEdges.length) return jsonlEdges;
  if (!graph) return [];
  if (Array.isArray(graph.edges)) return graph.edges;
  if (Array.isArray(graph.graph?.edges)) return graph.graph.edges;
  return [];
}

function inferFeatureFamily(filePath) {
  const p = normalizePathLike(filePath).toLowerCase();

  if (p.includes('ace') || p.includes('cartridge') || p.includes('packet')) return 'ace-cache';
  if (p.includes('qdrant') || p.includes('vector')) return 'qdrant-search';
  if (p.includes('redis') || p.includes('cache')) return 'redis-cache';
  if (p.includes('turbovec') || p.includes('turboquant')) return 'turbovec-rerank';
  if (p.includes('opencode') || p.includes('.opencode')) return 'opencode-tools';
  if (p.includes('duckdb')) return 'duckdb-analytics';
  if (p.includes('graph') || p.includes('atlas')) return 'graph-atlas';
  if (p.includes('route') || p.includes('/api/')) return 'sveltekit-api';
  if (p.includes('drizzle') || p.includes('schema') || p.includes('db')) return 'postgres-drizzle';
  if (p.includes('nats')) return 'nats-sidecars';
  if (p.includes('langgraph')) return 'langgraph-dag';

  const top = normalizePathLike(filePath).split('/').slice(0, 2).join('/');
  return top || 'unknown';
}

function filePathOfNode(node) {
  return normalizePathLike(
    node.path ||
    node.file ||
    node.id ||
    node.name ||
    node.source ||
    ''
  );
}

function buildClusterCards(nodes) {
  const groups = new Map();

  for (const node of nodes) {
    const filePath = filePathOfNode(node);
    if (!filePath) continue;

    const featureFamily = node.featureFamily || node.feature_family || inferFeatureFamily(filePath);
    const group = groups.get(featureFamily) || {
      featureFamily,
      paths: [],
      tags: new Set(),
      apiHandlers: 0,
      components: 0,
      routes: 0,
      tests: 0
    };

    group.paths.push(filePath);

    if (filePath.includes('/api/') || filePath.includes('\\api\\')) group.apiHandlers++;
    if (filePath.endsWith('.svelte')) group.components++;
    if (filePath.includes('/routes/') || filePath.includes('\\routes\\')) group.routes++;
    if (/(\.|\/|\\)(test|spec|e2e)\./i.test(filePath) || filePath.includes('/tests/') || filePath.includes('\\tests\\')) group.tests++;

    group.tags.add(featureFamily);
    if (filePath.includes('redis')) group.tags.add('redis');
    if (filePath.includes('qdrant')) group.tags.add('qdrant');
    if (filePath.includes('turbovec')) group.tags.add('turbovec');
    if (filePath.includes('opencode')) group.tags.add('opencode');
    if (filePath.includes('duckdb')) group.tags.add('duckdb');

    groups.set(featureFamily, group);
  }

  return Array.from(groups.values())
    .map((g) => {
      const uniquePaths = Array.from(new Set(g.paths));
      const topFiles = uniquePaths.slice(0, 25);
      return {
        type: 'cluster-card',
        clusterId: `feature:${g.featureFamily}`,
        featureFamily: g.featureFamily,
        status: 'generated',
        promotionState: 'unpromoted',
        tags: Array.from(g.tags),
        counts: {
          files: uniquePaths.length,
          apiHandlers: g.apiHandlers,
          components: g.components,
          routes: g.routes,
          tests: g.tests
        },
        topFiles,
        sourceRefs: topFiles.slice(0, 10).map((p) => `${p}:L1`),
        summary: `Generated cluster for ${g.featureFamily} with ${uniquePaths.length} file(s).`,
        commands: [
          `rg -n -uu "${g.featureFamily}|${Array.from(g.tags).join('|')}" .`
        ]
      };
    })
    .sort((a, b) => b.counts.files - a.counts.files);
}

function endpointOfEdge(edge, keyCandidates) {
  for (const key of keyCandidates) {
    if (typeof edge[key] === 'string') return normalizePathLike(edge[key]);
    if (edge[key]?.path) return normalizePathLike(edge[key].path);
    if (edge[key]?.id) return normalizePathLike(edge[key].id);
  }
  return '';
}

function buildPathwayCards(edges) {
  const byType = new Map();

  for (const edge of edges) {
    const type = edge.type || edge.edgeType || edge.kind || edge.rel || 'unknown';
    const source = endpointOfEdge(edge, ['source', 'from', 'src']);
    const target = endpointOfEdge(edge, ['target', 'to', 'dst']);

    const bucket = byType.get(type) || [];
    if (bucket.length < 100) bucket.push({ source, target, type });
    byType.set(type, bucket);
  }

  return Array.from(byType.entries())
    .map(([type, samples]) => {
      const cleanSamples = samples.filter((s) => s.source || s.target);
      const sourceRefs = cleanSamples
        .slice(0, 12)
        .flatMap((s) => [s.source, s.target])
        .filter(Boolean)
        .map((p) => `${p}:L1`);

      return {
        type: 'pathway-card',
        pathwayId: `edge:${type}`,
        edgeType: type,
        status: 'generated',
        promotionState: 'unpromoted',
        counts: {
          sampledEdges: samples.length
        },
        samples: cleanSamples.slice(0, 20),
        sourceRefs: Array.from(new Set(sourceRefs)).slice(0, 20),
        summary: `Generated pathway card for ${type} edges.`,
        commands: [
          `rg -n -uu "${type}" docs memory src scripts`
        ]
      };
    })
    .sort((a, b) => b.counts.sampledEdges - a.counts.sampledEdges);
}

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8');
  return text.trim() ? text.trim().split(/\r?\n/).length : 0;
}

function main() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const graph = readJsonIfExists(GRAPH_PATH, null);
  const deepGraph = readJsonIfExists(DEEP_GRAPH_PATH, null);
  const deepEdgesJsonl = readJsonlIfExists(DEEP_EDGES_PATH);

  const nodes = getNodes(deepGraph).length ? getNodes(deepGraph) : getNodes(graph);
  const edges = getEdges(deepGraph, deepEdgesJsonl);

  if (!nodes.length) {
    console.error('[graph-exports] No graph nodes found. Expected docs/graph/codebase-graph.json or memory/graphify/deep/deep-import-graph.json.');
    process.exit(1);
  }

  const clusterCards = buildClusterCards(nodes);
  const pathwayCards = buildPathwayCards(edges);

  writeJsonl(CLUSTER_CARDS_PATH, clusterCards);
  writeJsonl(PATHWAY_CARDS_PATH, pathwayCards);

  const sourceFiles = [
    GRAPH_PATH,
    DEEP_GRAPH_PATH,
    DEEP_EDGES_PATH,
    DOCSTORE_MANIFEST_PATH,
    KAG_MANIFEST_PATH
  ].filter(fs.existsSync);

  const manifest = {
    version: 1,
    status: 'generated',
    promotionState: 'unpromoted',
    generatedAt: new Date().toISOString(),
    generator: 'scripts/atlas/generate-graph-exports.mjs',
    sources: sourceFiles.map((p) => normalizePathLike(path.relative(root, p))),
    exports: {
      clusterCards: normalizePathLike(path.relative(root, CLUSTER_CARDS_PATH)),
      pathwayCards: normalizePathLike(path.relative(root, PATHWAY_CARDS_PATH))
    },
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      clusterCards: clusterCards.length,
      pathwayCards: pathwayCards.length,
      clusterCardRows: countLines(CLUSTER_CARDS_PATH),
      pathwayCardRows: countLines(PATHWAY_CARDS_PATH)
    },
    hashes: {
      clusterCardsSha256: sha256(fs.readFileSync(CLUSTER_CARDS_PATH)),
      pathwayCardsSha256: sha256(fs.readFileSync(PATHWAY_CARDS_PATH))
    },
    validation: {
      isStub: false,
      promoted: false,
      notes: [
        'Generated from available graph artifacts.',
        'promotionState remains unpromoted until downstream validation passes.',
        'Do not treat as final graph truth until promoted.'
      ]
    }
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log('[graph-exports] wrote:', path.relative(root, MANIFEST_PATH));
  console.log('[graph-exports] wrote:', path.relative(root, CLUSTER_CARDS_PATH), clusterCards.length, 'rows');
  console.log('[graph-exports] wrote:', path.relative(root, PATHWAY_CARDS_PATH), pathwayCards.length, 'rows');
  console.log('[graph-exports] status: generated, promotionState: unpromoted');
}

main();
