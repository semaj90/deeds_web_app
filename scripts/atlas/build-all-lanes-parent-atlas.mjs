#!/usr/bin/env node
/**
 * build-all-lanes-parent-atlas.mjs
 *
 * Convert all atlas extractor outputs into canonical lane NDJSON files
 * for DuckDB map-reduce join into parent_atlas_full.parquet.
 *
 * Reads existing artifacts (no re-extraction):
 *   - docs/graph/repo-*.json (env, language, import, workspace, route)
 *   - .opencode/cards/*.json (card)
 *   - .opencode/outcome-ledger-with-cardIds.ndjson (outcome)
 *   - memory/exports/som-metrics.json (som_edge)
 *
 * Output:
 *   - .tmp/ingest/lanes/{lane}.ndjson  (one node per line)
 *   - .tmp/ingest/lanes/{lane}.csv     (CSV for DuckDB)
 *   - .tmp/ingest/edges/{lane}_edges.ndjson + .csv (edges per lane)
 *
 * Lanes: card, outcome, route, env, import, language, workspace, som_edge
 * (codebase_chunk requires live Qdrant; agents_md uses separate query)
 *
 * Usage:
 *   node scripts/atlas/build-all-lanes-parent-atlas.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const LANES_DIR = path.join(ROOT, '.tmp', 'ingest', 'lanes');
const EDGES_DIR = path.join(ROOT, '.tmp', 'ingest', 'edges');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'all-lanes-parent-atlas-report.json');

// ─── Canonical Node Shape ────────────────────────────────────────────────
// Every lane emits nodes with: { lane, node_id, title, sourceRef, payload_json }
// Every lane emits edges with: { lane, from_node_id, to_node_id, edge_type, weight }

function makeNode(lane, node_id, title, sourceRef, payload) {
  return { lane, node_id, title: title || '', sourceRef: sourceRef || '', payload_json: JSON.stringify(payload || {}) };
}

function makeEdge(lane, from, to, edge_type, weight = 1.0) {
  return { lane, from_node_id: from, to_node_id: to, edge_type, weight };
}

// ─── Lane Extractors ─────────────────────────────────────────────────────

function extractCardLane() {
  const cardsDir = path.join(ROOT, '.opencode', 'cards');
  const nodes = [];
  const edges = [];

  if (!fs.existsSync(cardsDir)) return { nodes, edges };

  for (const file of fs.readdirSync(cardsDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const card = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf8'));
      nodes.push(makeNode('card', card.id, card.sourceRef || card.id, card.sourceRef, {
        kind: card.kind,
        som_bmu_row: card.som_bmu_row,
        som_bmu_col: card.som_bmu_col,
        som_bmu_index: card.som_bmu_index,
        reward_avg: card.reward?.avg,
        reward_count: card.reward?.count,
      }));
    } catch {}
  }
  return { nodes, edges };
}

function extractOutcomeLane() {
  const f = path.join(ROOT, '.opencode', 'outcome-ledger-with-cardIds.ndjson');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  for (const line of fs.readFileSync(f, 'utf8').trim().split('\n')) {
    try {
      const o = JSON.parse(line);
      const oid = `outcome:${o.id}`;
      nodes.push(makeNode('outcome', oid, `outcome ${o.reward}`, o.sourceRef, { reward: o.reward, createdAt: o.createdAt }));
      if (Array.isArray(o.cardIds)) {
        for (const cid of o.cardIds) edges.push(makeEdge('outcome', oid, cid, 'ATTRIBUTES_TO', o.reward));
      }
    } catch {}
  }
  return { nodes, edges };
}

function extractRouteLane() {
  const f = path.join(ROOT, 'docs', 'graph', 'repo-sveltekit-route-atlas.json');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const routes = data.routes || data.entries || data.byKind || {};
  const flat = Array.isArray(routes) ? routes : Object.values(routes).flat();

  for (const r of flat) {
    if (!r || typeof r !== 'object') continue;
    const id = `route:${r.path || r.id || r.routeId || JSON.stringify(r).slice(0, 32)}`;
    nodes.push(makeNode('route', id, r.path || r.id || '', r.path, {
      kind: r.kind,
      method: r.method,
      auth: r.auth,
      validation: r.validation,
    }));
  }
  return { nodes, edges };
}

function extractEnvLane() {
  const f = path.join(ROOT, 'docs', 'graph', 'repo-env-map.json');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const envKeys = data.envKeys || {};
  for (const [key, count] of Object.entries(envKeys)) {
    nodes.push(makeNode('env', `env:${key}`, key, '.env', { usage_count: count }));
  }
  return { nodes, edges };
}

function extractLanguageLane() {
  const f = path.join(ROOT, 'docs', 'graph', 'repo-language-map.json');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const langs = data.languages || {};
  for (const [lang, count] of Object.entries(langs)) {
    nodes.push(makeNode('language', `lang:${lang}`, lang, '', { file_count: count }));
  }
  return { nodes, edges };
}

function extractImportLane() {
  const f = path.join(ROOT, 'docs', 'graph', 'repo-import-map.json');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  // Shape: { topTargets: [{key,value}], topSources: [{key,value}] }
  for (const t of (data.topTargets || []).slice(0, 1000)) {
    nodes.push(makeNode('import', `import:target:${t.key}`, t.key, t.key, { usage_count: t.value, role: 'target' }));
  }
  for (const s of (data.topSources || []).slice(0, 2000)) {
    nodes.push(makeNode('import', `import:source:${s.key}`, s.key, s.key, { import_count: s.value, role: 'source' }));
  }
  return { nodes, edges };
}

function extractWorkspaceLane() {
  const f = path.join(ROOT, 'docs', 'graph', 'repo-workspace-map.json');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const workspaces = data.workspaces || data.entries || {};
  const list = Array.isArray(workspaces) ? workspaces : Object.entries(workspaces).map(([k, v]) => ({ name: k, ...v }));
  for (const w of list) {
    if (!w) continue;
    const id = `workspace:${w.name || w.path || w.id || ''}`;
    nodes.push(makeNode('workspace', id, w.name || '', w.path || '', {
      package_count: w.packages?.length || 0,
      file_count: w.fileCount || 0,
    }));
  }
  return { nodes, edges };
}

function extractSomEdgeLane() {
  const f = path.join(ROOT, 'memory', 'exports', 'som-metrics.json');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(f)) return { nodes, edges };

  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const assignments = data.allAssignments || data.sampleAssignments || [];

  // Group cards by SOM cluster, build cluster→card edges
  const byCluster = new Map();
  for (const a of assignments) {
    const cluster = `som:${a.bmuRow}:${a.bmuCol}`;
    if (!byCluster.has(cluster)) byCluster.set(cluster, []);
    byCluster.get(cluster).push(a.cardId);
  }

  for (const [cluster, cards] of byCluster) {
    nodes.push(makeNode('som_edge', cluster, cluster, '', { card_count: cards.length }));
    for (const cid of cards) {
      edges.push(makeEdge('som_edge', cluster, cid, 'CONTAINS', 1.0));
    }
  }
  return { nodes, edges };
}

function extractAuditLane() {
  // Read latest audit run from sveltekit-frontend/memory/runs/
  const runsDir = path.join(ROOT, 'sveltekit-frontend', 'memory', 'runs');
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(runsDir)) return { nodes, edges };

  // Find newest run dir with audit_gates.json (walk newest → oldest)
  const runs = fs.readdirSync(runsDir).filter((d) => /^\d{4}/.test(d)).sort();
  let runId = null;
  let gatesPath = null;
  let failuresPath = null;
  let synthPath = null;

  for (let i = runs.length - 1; i >= 0; i--) {
    const candidate = path.join(runsDir, runs[i], 'audit_gates.json');
    if (fs.existsSync(candidate)) {
      runId = runs[i];
      gatesPath = candidate;
      failuresPath = path.join(runsDir, runs[i], 'audit_failures.json');
      synthPath = path.join(runsDir, runs[i], 'synthesis_summary.json');
      break;
    }
  }
  if (!runId) return { nodes, edges };

  // Run-level node (anchor for all audit data in this lane)
  const runNodeId = `audit:run:${runId}`;
  const gatesData = JSON.parse(fs.readFileSync(gatesPath, 'utf8'));
  nodes.push(makeNode('audit', runNodeId, `Audit run ${runId}`, gatesPath, {
    runId,
    allPass: gatesData.allPass,
    gates: gatesData.gates,
  }));

  // Gate-level nodes — one per gate
  for (const [gateName, value] of Object.entries(gatesData.gates || {})) {
    const id = `audit:gate:${runId}:${gateName}`;
    const failing = typeof value === 'number' && value > 0 && !gateName.includes('consumer') && !gateName.includes('pass') && !gateName.includes('kmeans') && !gateName.includes('som');
    nodes.push(makeNode('audit', id, gateName, '', {
      runId,
      gate: gateName,
      value,
      failing,
    }));
    edges.push(makeEdge('audit', runNodeId, id, 'HAS_GATE', failing ? 1.0 : 0.1));
  }

  // Failure-level nodes — one per failure, with edge to its source file
  if (fs.existsSync(failuresPath)) {
    const failData = JSON.parse(fs.readFileSync(failuresPath, 'utf8'));
    for (const f of (failData.failures || [])) {
      const id = `audit:failure:${runId}:${f.gate}:${f.file.replace(/[/\\]/g, '_')}`;
      nodes.push(makeNode('audit', id, `${f.gate} ${path.basename(f.file)}`, f.file, {
        runId,
        gate: f.gate,
        file: f.file,
        msg: f.msg,
      }));
      edges.push(makeEdge('audit', runNodeId, id, 'HAS_FAILURE', 1.0));
      edges.push(makeEdge('audit', id, f.file, 'TARGETS_FILE', 1.0));
    }
  }

  // P0/P1 cluster hotspots from synthesis_summary.json
  if (fs.existsSync(synthPath)) {
    const synth = JSON.parse(fs.readFileSync(synthPath, 'utf8'));
    for (const tier of ['p0', 'p1']) {
      for (const c of (synth[tier] || [])) {
        const id = `audit:hotspot:${runId}:${c.cluster}`;
        nodes.push(makeNode('audit', id, `${tier.toUpperCase()} ${c.cluster}`, '', {
          runId,
          tier,
          cluster: c.cluster,
          risk: c.risk,
          diagCount: c.diagCount,
          shallowCount: c.shallowCount,
          protocols: c.protocols,
          topFiles: c.topFiles,
        }));
        edges.push(makeEdge('audit', runNodeId, id, 'HAS_HOTSPOT', c.risk || 0.5));
        // Edge from hotspot to each top file (so Gemma4 can navigate)
        for (const tf of (c.topFiles || []).slice(0, 5)) {
          edges.push(makeEdge('audit', id, tf, 'TARGETS_FILE', 1.0));
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── Writers ─────────────────────────────────────────────────────────────

function writeNDJSON(filepath, rows) {
  if (!APPLY) return;
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function writeCSV(filepath, rows) {
  if (!APPLY) return;
  if (rows.length === 0) {
    fs.writeFileSync(filepath, '', 'utf8');
    return;
  }
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf8');
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Build All-Lanes Parent Atlas ───────────────────────');
  console.log(`  Mode: ${APPLY ? 'APPLY (will write files)' : 'DRY-RUN'}`);

  const lanes = [
    { name: 'card', fn: extractCardLane },
    { name: 'outcome', fn: extractOutcomeLane },
    { name: 'route', fn: extractRouteLane },
    { name: 'env', fn: extractEnvLane },
    { name: 'language', fn: extractLanguageLane },
    { name: 'import', fn: extractImportLane },
    { name: 'workspace', fn: extractWorkspaceLane },
    { name: 'som_edge', fn: extractSomEdgeLane },
    { name: 'audit', fn: extractAuditLane },
  ];

  const summary = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    lanes: {},
    totalNodes: 0,
    totalEdges: 0,
  };

  for (const { name, fn } of lanes) {
    try {
      const { nodes, edges } = fn();

      const nodePath = path.join(LANES_DIR, `${name}.ndjson`);
      const nodeCSV = path.join(LANES_DIR, `${name}.csv`);
      const edgePath = path.join(EDGES_DIR, `${name}_edges.ndjson`);
      const edgeCSV = path.join(EDGES_DIR, `${name}_edges.csv`);

      writeNDJSON(nodePath, nodes);
      writeCSV(nodeCSV, nodes);
      writeNDJSON(edgePath, edges);
      writeCSV(edgeCSV, edges);

      summary.lanes[name] = { nodes: nodes.length, edges: edges.length };
      summary.totalNodes += nodes.length;
      summary.totalEdges += edges.length;
      console.log(`  ✅ ${name.padEnd(12)} nodes=${String(nodes.length).padStart(6)}  edges=${String(edges.length).padStart(6)}`);
    } catch (e) {
      summary.lanes[name] = { error: e.message };
      console.log(`  ❌ ${name}: ${e.message}`);
    }
  }

  console.log('\n── Summary ─────────────────────────────────────────────');
  console.log(`  Total nodes: ${summary.totalNodes}`);
  console.log(`  Total edges: ${summary.totalEdges}`);
  console.log(`  Lanes processed: ${Object.keys(summary.lanes).length}`);

  if (APPLY) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`  ✅ Report → ${REPORT_PATH}`);
    console.log(`  ✅ Lanes  → ${LANES_DIR}/`);
    console.log(`  ✅ Edges  → ${EDGES_DIR}/`);
  } else {
    console.log('\n  [DRY-RUN] No files written. Use --apply to persist.');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
