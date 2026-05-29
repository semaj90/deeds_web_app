#!/usr/bin/env node
/**
 * write-graph-refresh-manifest.mjs
 *
 * Creates memory/exports/graph-refresh-manifest.json with a real shape.
 * Reads node/edge counts from existing graph export files if available;
 * writes a valid stub with status "ok" when no graph data is present.
 *
 * Safe on Windows — no /dev/stdin, no destructive ops.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const EXPORT_DIR = path.join(root, 'memory', 'exports');
const MANIFEST_PATH = path.join(EXPORT_DIR, 'graph-refresh-manifest.json');

// Candidate graph source files — checked in priority order
const GRAPH_SOURCES = [
  path.join(root, 'docs', 'graph', 'codebase-graph.json'),
  path.join(root, 'memory', 'graphify', 'deep', 'deep-import-graph.json'),
];

const CLUSTER_CARDS_PATH = path.join(EXPORT_DIR, 'cluster-cards.jsonl');
const PATHWAY_CARDS_PATH = path.join(EXPORT_DIR, 'pathway-cards.jsonl');
const DOMAIN_TOPOLOGY_TMP = path.join(root, '.tmp', 'domain-topology.json');

function countJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return 0;
  return text.split(/\r?\n/).filter(Boolean).length;
}

function tryReadGraph() {
  for (const src of GRAPH_SOURCES) {
    if (!fs.existsSync(src)) continue;
    try {
      const obj = JSON.parse(fs.readFileSync(src, 'utf8'));
      const nodes = Array.isArray(obj.nodes) ? obj.nodes.length
        : Array.isArray(obj.vertices) ? obj.vertices.length
        : 0;
      const edges = Array.isArray(obj.edges) ? obj.edges.length
        : Array.isArray(obj.links) ? obj.links.length
        : 0;
      return { nodes, edges, source: path.relative(root, src).replace(/\\/g, '/') };
    } catch {
      // continue to next candidate
    }
  }
  return null;
}

function buildExportsList() {
  const exports = [];
  for (const p of [CLUSTER_CARDS_PATH, PATHWAY_CARDS_PATH]) {
    if (fs.existsSync(p)) {
      exports.push({
        file: path.relative(root, p).replace(/\\/g, '/'),
        rows: countJsonlLines(p),
      });
    }
  }
  // List other exports in EXPORT_DIR
  if (fs.existsSync(EXPORT_DIR)) {
    const entries = fs.readdirSync(EXPORT_DIR);
    for (const e of entries) {
      if (e === 'graph-refresh-manifest.json') continue;
      if (e.endsWith('.json') || e.endsWith('.jsonl')) {
        const rel = `memory/exports/${e}`;
        if (!exports.find((x) => x.file === rel)) {
          const p = path.join(EXPORT_DIR, e);
          let rows = undefined;
          try {
            if (e.endsWith('.jsonl')) rows = countJsonlLines(p);
            else if (e.endsWith('.json')) {
              const raw = fs.readFileSync(p, 'utf8').trim();
              if (raw) {
                const obj = JSON.parse(raw);
                if (Array.isArray(obj)) rows = obj.length;
                else rows = 1;
              } else rows = 0;
            }
          } catch {}
          const item = { file: rel };
          if (typeof rows === 'number') item.rows = rows;
          exports.push(item);
        }
      }
    }
  }
  return exports;
}

function main() {
  // Ensure output directory exists
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const graphData = tryReadGraph();
  const exports = buildExportsList();
  const exportCount = exports.reduce((s, e) => s + (e.rows || 0), 0);

  // domains: read .tmp/domain-topology.json if present
  let domains = [];
  if (fs.existsSync(DOMAIN_TOPOLOGY_TMP)) {
    try {
      const dt = JSON.parse(fs.readFileSync(DOMAIN_TOPOLOGY_TMP, 'utf8'));
      if (dt && typeof dt === 'object') {
        if (Array.isArray(dt.domains)) domains = dt.domains.map((d) => (d.name || d.id || d));
        else if (dt.domains && typeof dt.domains === 'object') domains = Object.keys(dt.domains);
      }
    } catch {}
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    nodeCount: graphData ? graphData.nodes : 0,
    edgeCount: graphData ? graphData.edges : 0,
    exportCount,
    exports,
    domains,
    producer: 'graph-refresh',
    source: graphData ? graphData.source : 'graph-refresh',
    status: 'ok',
    promotionState: graphData ? 'generated' : 'stub',
    generator: 'scripts/atlas/write-graph-refresh-manifest.mjs',
    notes: graphData
      ? `Read from ${graphData.source}`
      : 'No graph source files found. Run npm run graph:exports to populate with real data.',
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('[write-graph-refresh-manifest] wrote:', path.relative(root, MANIFEST_PATH));
  console.log(`  nodeCount: ${manifest.nodeCount}, edgeCount: ${manifest.edgeCount}, status: ${manifest.status}`);
  if (!graphData) {
    console.log('  No graph source files found — stub written. Run: npm run graph:exports');
  }
}

main();