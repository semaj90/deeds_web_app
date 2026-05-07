#!/usr/bin/env node
/**
 * build-codebase-relationships.mjs
 *
 * Reads existing static artifacts (code-relations-latest.json, nes-glyph-architecture.json,
 * codebase-graph.json) and writes a structured set of analysis files to:
 *
 *   memory/runs/<run_id>/
 *     relationship_map.json       — edge counts + top files per relation type
 *     graph_nodes.json            — NES cluster nodes (file, cluster, tags, topo_class)
 *     graph_edges.json            — sampled edges grouped by relation type
 *     qdrant_cluster_tags.json    — cluster×tag frequency table for llm_synthesis
 *     ace_hit_relationships.json  — ACE-critical files with their inbound/outbound relations
 *     llm_synthesis_mapping.json  — per-cluster context packets for Gemma4
 *     next_actions.md             — P0/P1 TODO list derived from gap state
 *     ingest.jsonl                — JSONL for LLM ingestion (one object per cluster)
 *
 * Usage:
 *   node scripts/graph/build-codebase-relationships.mjs
 *   node scripts/graph/build-codebase-relationships.mjs --print
 *   node scripts/graph/build-codebase-relationships.mjs --run-id=2026-05-07T01-00-00
 *
 * npm: "graph:build-relations": "node scripts/graph/build-codebase-relationships.mjs"
 *      "graph:build-relations:print": "node scripts/graph/build-codebase-relationships.mjs --print"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const MEMORY_RUNS = resolve(ROOT, 'memory/runs');
const DOCS_GRAPH  = resolve(ROOT, 'docs/graph');
const LOGS_DIR    = resolve(ROOT, 'logs/task-output');

const args = process.argv.slice(2);
const PRINT = args.includes('--print');
const RUN_ID_OVERRIDE = (() => {
  const a = args.find(a => a.startsWith('--run-id='));
  return a ? a.slice(9) : null;
})();

const RUN_ID  = RUN_ID_OVERRIDE ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_DIR = resolve(MEMORY_RUNS, RUN_ID);

// ── helpers ───────────────────────────────────────────────────────────────────

function safeRead(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}
function safeJson(p) {
  const t = safeRead(p);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
function write(name, obj) {
  const p = join(RUN_DIR, name);
  writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
  return p;
}

/**
 * Normalize a file path to a repo-relative forward-slash form starting with "src/".
 * Handles: absolute Windows paths, absolute Unix paths, mixed slashes, leading "./"
 */
export function normalizeRepoPath(p) {
  if (!p) return '';
  // Normalize separators
  let s = String(p).replace(/\\/g, '/');
  // Strip everything up to and including the repo root markers
  const markers = ['sveltekit-frontend/src/', '/src/', 'src/'];
  for (const m of markers) {
    const idx = s.indexOf(m);
    if (idx !== -1) {
      s = s.slice(idx + m.indexOf('src/'));
      break;
    }
  }
  // Strip leading "./"
  s = s.replace(/^\.\//, '');
  return s;
}

// ── load sources ─────────────────────────────────────────────────────────────

const relArtifact      = safeJson(join(LOGS_DIR, 'code-relations-latest.json')) ?? {};
const nesGraph         = safeJson(join(DOCS_GRAPH, 'nes-glyph-architecture.json')) ?? {};
const cgraph           = safeJson(join(DOCS_GRAPH, 'codebase-graph.json')) ?? {};
const multihop         = safeJson(join(DOCS_GRAPH, 'multihop-codebase-map.json')) ?? {};
// Cluster→AGENTS.md index — built by scripts/graph/build-cluster-agents-index.mjs
const clusterAgentsIdx = safeJson(join(DOCS_GRAPH, 'cluster-agents-index.json')) ?? null;
// GDS enrichment artifact — populated by graphify:gds; optional (null-safe throughout)
const gdsArtifact = safeJson(resolve(ROOT, 'memory/graphify/gds/latest.json')) ?? null;
// Build index: stableKey/filePath → { communityId, graphAuthorityScore } for O(1) lookup
const gdsAuthorityIndex = new Map();
if (gdsArtifact?.topAuthority) {
  for (const entry of gdsArtifact.topAuthority) {
    const key = entry.stableKey ?? entry.filePath ?? entry.file_path;
    if (key) gdsAuthorityIndex.set(key, { communityId: entry.communityId ?? null, graphAuthorityScore: entry.graphAuthorityScore ?? null });
  }
}

const sampleEdges  = (() => {
  const raw = relArtifact.sample;
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw ?? '[]'); } catch { return []; }
})();

const nesNodes     = nesGraph.nodes ?? [];
const edgeCounts   = relArtifact.edgeCounts ?? {};
const totalFiles   = relArtifact.totalFiles ?? 0;
const totalEdges   = relArtifact.totalEdges ?? 0;

// ── 1. relationship_map.json ─────────────────────────────────────────────────

const edgesByType = {};
for (const edge of sampleEdges) {
  const t = edge.relationType ?? 'UNKNOWN';
  if (!edgesByType[t]) edgesByType[t] = [];
  edgesByType[t].push({ src: edge.sourceFile, target: edge.targetKey, confidence: edge.confidence });
}

const topFilesByType = {};
for (const [type, edges] of Object.entries(edgesByType)) {
  const freq = {};
  for (const e of edges) {
    freq[e.src] = (freq[e.src] ?? 0) + 1;
  }
  topFilesByType[type] = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([f, n]) => ({ file: f, count: n }));
}

const topTargetsByType = {};
for (const [type, edges] of Object.entries(edgesByType)) {
  const freq = {};
  for (const e of edges) {
    freq[e.target] = (freq[e.target] ?? 0) + 1;
  }
  topTargetsByType[type] = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t, n]) => ({ target: t, count: n }));
}

const relationshipMap = {
  generatedAt: new Date().toISOString(),
  source: relArtifact.runId ?? 'unknown',
  totalFiles,
  totalEdges,
  edgeCounts,
  topFilesByType,
  topTargetsByType,
};

// ── 2. graph_nodes.json ───────────────────────────────────────────────────────

// Extract repo-relative file path from stableKey ("file:src/...") or legacy fields
function nesFilePath(n) {
  if (n.file_path) return n.file_path;
  if (n.stableKey?.startsWith('file:')) return n.stableKey.slice(5);
  return n.id ?? n.label ?? null;
}

const graphNodes = nesNodes.slice(0, 2000).map(n => ({
  id:          n.stableKey ?? n.id ?? n.file_path,
  filePath:    nesFilePath(n),
  clusterKey:  n.clusterKey,
  clusterSrc:  n.clusterSource,
  tags:        (n.tags ?? []).slice(0, 10),
  topoClass:   n.topo_class ?? n.topoLabel,
  somCluster:  n.som_cluster,
  kind:        n.kind,
  fanIn:       n.directFanIn,
  pageRank:    n.pageRankScore,
}));

// ── 3. graph_edges.json ───────────────────────────────────────────────────────

const graphEdges = {
  generatedAt: new Date().toISOString(),
  totalEdges,
  edgeCounts,
  sample: sampleEdges.slice(0, 500),
};

// ── 4. qdrant_cluster_tags.json ───────────────────────────────────────────────

// Build tag frequency per cluster from NES nodes
const clusterTagMap = {};
for (const n of nesNodes) {
  const ck = n.clusterKey ?? 'unclassified';
  if (!clusterTagMap[ck]) {
    clusterTagMap[ck] = { clusterKey: ck, clusterSrc: n.clusterSource, tagFreq: {}, files: [], topoClasses: new Set() };
  }
  for (const t of (n.tags ?? [])) {
    clusterTagMap[ck].tagFreq[t] = (clusterTagMap[ck].tagFreq[t] ?? 0) + 1;
  }
  clusterTagMap[ck].files.push(nesFilePath(n));
  if (n.topo_class ?? n.topoLabel) clusterTagMap[ck].topoClasses.add(n.topo_class ?? n.topoLabel);
}

const qdrantClusterTags = Object.values(clusterTagMap)
  .map(c => ({
    clusterKey:  c.clusterKey,
    clusterSrc:  c.clusterSrc,
    fileCount:   c.files.length,
    topoClasses: [...c.topoClasses].slice(0, 5),
    topTags:     Object.entries(c.tagFreq)
                   .sort((a, b) => b[1] - a[1])
                   .slice(0, 12)
                   .map(([tag, count]) => ({ tag, count })),
    topFiles:    c.files.slice(0, 8),
  }))
  .sort((a, b) => b.fileCount - a.fileCount);

// ── 5. ace_hit_relationships.json ─────────────────────────────────────────────

// ACE-critical files: context-assembler, multi-lane-retrieval, retrieval-lanes,
// cache-keys, ngram-retrieval, error-fingerprint, graph-expander, qdrant-manager
const ACE_FILES = [
  'context-assembler.ts',
  'multi-lane-retrieval.ts',
  'retrieval-lanes.ts',
  'cache-keys.ts',
  'ngram-retrieval.ts',
  'error-fingerprint.ts',
  'graph-expander.ts',
  'qdrant-manager.ts',
  'gemma4-agent.ts',
  'trace-subagent-orchestrator.ts',
  'synthesis-memory-archiver.ts',
  'dual-embedder.ts',
];

// Normalize all sample edge source paths once for fast matching
const normalizedSample = sampleEdges.map(e => ({
  ...e,
  _normSrc: normalizeRepoPath(e.sourceFile),
}));

// Use the dedicated aceEdges field (written by extract-code-relations with no sampling cap)
// so all 12 canonical ACE files can find their outbound edges.
// Fall back to normalizedSample if aceEdges not present (older artifact).
const aceEdgePool = (() => {
  const raw = relArtifact.aceEdges;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map(e => ({ ...e, _normSrc: normalizeRepoPath(e.sourceFile) }));
  }
  return normalizedSample;
})();

const aceHitRelationships = ACE_FILES.map(fname => {
  const stem = fname.replace(/\.(ts|mjs|js)$/, '');
  const outbound = aceEdgePool.filter(e =>
    e._normSrc.endsWith('/' + fname) ||
    e._normSrc === fname ||
    e.sourceFile?.endsWith(fname)          // basename fallback
  );
  const inbound = aceEdgePool.filter(e =>
    e.relationType !== 'HAS_AGENTS_SCOPE' &&
    (e.targetKey?.includes(stem) || e.targetKey === fname)
  );
  return {
    file: fname,
    outboundCount: outbound.length,
    inboundCount:  inbound.length,
    outbound: outbound.map(e => `${e.relationType} → ${e.targetKey}`).slice(0, 15),
    inbound:  inbound.map(e => `${e.relationType} ← ${normalizeRepoPath(e.sourceFile)}`).slice(0, 8),
  };
}).filter(r => r.outboundCount > 0 || r.inboundCount > 0);

// ── synthesisBlock ─────────────────────────────────────────────────────────────

// Compact relationship-aware context block for injecting into ACE synthesisBlock.
// Groups ACE hit files by rough topo_class derived from path structure.
function inferTopoClass(fname) {
  if (fname.includes('retrieval') || fname.includes('assembler') || fname.includes('lane'))
    return 'ace:retrieval-spine';
  if (fname.includes('cache') || fname.includes('redis'))
    return 'ace:cache-layer';
  if (fname.includes('embed') || fname.includes('graph') || fname.includes('qdrant'))
    return 'ace:vector-layer';
  if (fname.includes('synthesis') || fname.includes('memory') || fname.includes('archiver'))
    return 'ace:synthesis-layer';
  if (fname.includes('agent') || fname.includes('orchestrator'))
    return 'ace:agent-layer';
  return 'ace:general';
}

const aceByCluster = {};
for (const r of aceHitRelationships) {
  const cls = inferTopoClass(r.file);
  if (!aceByCluster[cls]) aceByCluster[cls] = [];
  aceByCluster[cls].push(r);
}

const synthesisBlockLines = ['### Relationship-Aware Codebase Context', ''];
for (const [cls, files] of Object.entries(aceByCluster)) {
  synthesisBlockLines.push(`Cluster: ${cls}`);
  synthesisBlockLines.push('Files:');
  for (const r of files) {
    synthesisBlockLines.push(`- ${r.file}`);
    for (const rel of r.outbound.slice(0, 5)) {
      synthesisBlockLines.push(`  - ${rel}`);
    }
  }
  synthesisBlockLines.push('');
}
const synthesisBlock = synthesisBlockLines.join('\n');

// ── 6. llm_synthesis_mapping.json ─────────────────────────────────────────────

// Build per-cluster context packets suitable for Gemma4 synthesis prompt injection.
// One packet per real GPU cluster (skip fallback/unclassified).
const gpuClusters = qdrantClusterTags.filter(c => c.clusterSrc === 'gpu-kmeans').slice(0, 20);
const fallbackClusters = qdrantClusterTags.filter(c => c.clusterSrc !== 'gpu-kmeans').slice(0, 10);

const llmSynthesisMapping = {
  generatedAt: new Date().toISOString(),
  purpose: 'Per-cluster context packets for llm_synthesis prompt block injection',
  gaps: [
    // gap_synth_001: CLOSED — bifrostChat is in trace-subagent-orchestrator.ts
    // gap_synth_002: CLOSED — archiveSynthesisMemory is wired in orchestrator
    // gap_synth_003: CLOSED — cluster_key written by som-topology-pipeline.ts
    // gap_synth_004: CLOSED — scripts/run-authority-scores.mjs (standalone neo4j-driver)
    // gap_synth_005: CLOSED — scripts/wiki/writeback-rerank-to-qdrant.mjs writes avg_rerank_* to Qdrant
  ],
  gpuClusterPackets: gpuClusters.map(c => {
    // Resolve GDS community + authority for this cluster's representative file
    const repFile = c.topFiles?.[0] ?? '';
    const repFileStem = repFile.split('/').pop() ?? repFile;
    const gdsEntry = gdsAuthorityIndex.get(repFile) ?? gdsAuthorityIndex.get(repFileStem) ?? null;
    return {
      cluster_key:           c.clusterKey,
      cluster_src:           c.clusterSrc,
      file_count:            c.fileCount,
      topo_classes:          c.topoClasses,
      top_tags:              c.topTags.map(t => t.tag),
      top_files:             c.topFiles,
      community_id:          gdsEntry?.communityId ?? null,
      graph_authority_score: gdsEntry?.graphAuthorityScore ?? null,
      synthesis_prompt_hint:
        `Summarise the ${c.clusterKey} cluster (${c.fileCount} files). ` +
        `Key domains: ${c.topoClasses.join(', ') || 'mixed'}. ` +
        `Top tags: ${c.topTags.slice(0,5).map(t=>t.tag).join(', ')}.` +
        (gdsEntry?.communityId != null ? ` GDS community: ${gdsEntry.communityId}.` : '') +
        (gdsEntry?.graphAuthorityScore != null ? ` Authority score: ${gdsEntry.graphAuthorityScore.toFixed(3)}.` : ''),
    };
  }),
  fallbackClusterCount: fallbackClusters.length,
  aceCriticalRelations: aceHitRelationships.map(r => ({
    file: r.file,
    relations: [...r.outbound.slice(0, 8)],
  })),
  synthesisBlock,
};

// ── 7. next_actions.md ────────────────────────────────────────────────────────

// Dynamic cluster-coverage gaps derived from cluster-agents-index.json
const clusterCoverageGaps = (() => {
  if (!clusterAgentsIdx?.clusters) {
    return [{
      id: 'gap_agents_index',
      open: true,
      priority: 'P0',
      title: 'Run `npm run graph:cluster-agents` to build cluster→AGENTS.md index (needed for P0/P1 gap detection)',
    }];
  }
  const gaps = [];
  for (const c of clusterAgentsIdx.clusters) {
    if (c.memberCount > 100 && c.coverage === 0) {
      const tags = (c.bowTerms ?? []).slice(0, 3).join('/') || 'mixed';
      gaps.push({
        id:       `gap_agents_cluster_${c.clusterId}`,
        open:     true,
        priority: 'P0',
        title:    `cluster:${c.clusterId} (${c.memberCount} files, ${tags}) has NO AGENTS.md coverage — add AGENTS.md to \`${c.topDir || 'src'}\``,
      });
    } else if (c.memberCount > 30 && c.coverage < 0.3 && c.agentsMdCount < 2) {
      const tags = (c.bowTerms ?? []).slice(0, 2).join('/') || 'mixed';
      gaps.push({
        id:       `gap_agents_cluster_${c.clusterId}`,
        open:     true,
        priority: 'P1',
        title:    `cluster:${c.clusterId} (${c.memberCount} files, ${tags}) has ${Math.round(c.coverage * 100)}% AGENTS.md coverage — enrich \`${c.topDir || 'src'}/AGENTS.md\``,
      });
    }
  }
  return gaps;
})();

const openGapChecks = [
  { id: 'gap_synth_001', open: false, title: 'CLOSED — bifrostChat in trace-subagent-orchestrator.ts' },
  { id: 'gap_synth_002', open: false, title: 'CLOSED — archiveSynthesisMemory wired in orchestrator' },
  { id: 'gap_synth_003', open: false, title: 'CLOSED — cluster_key written by som-topology-pipeline.ts' },
  { id: 'gap_synth_004', open: !existsSync(join(ROOT, 'scripts/run-authority-scores.mjs')),
    title: 'CLOSED — scripts/run-authority-scores.mjs (standalone neo4j-driver)' },
  { id: 'gap_synth_005', open: !existsSync(join(ROOT, 'scripts/wiki/writeback-rerank-to-qdrant.mjs')),
    title: 'CLOSED — scripts/wiki/writeback-rerank-to-qdrant.mjs writes avg_rerank_* to Qdrant' },
  { id: 'gap_gds_001',   open: gdsArtifact === null,
    title: 'Run graphify:gds to generate memory/graphify/gds/latest.json — enables communityId + authority enrichment' },
  { id: 'gap_gds_002',   open: !(safeRead(join(ROOT, 'src/lib/server/ace/context-assembler.ts')) ?? '').includes('enrichClusterContextWithGds'),
    title: 'Wire enrichClusterContextWithGds into ACE context assembly (GDS → ClusterContextPacket)' },
  { id: 'gap_rel_001',   open: !existsSync(join(ROOT, 'src/lib/server/graph/relationship-extractor.ts')),
    title: 'Create relationship-extractor.ts TypeScript source' },
  { id: 'gap_rel_002',   open: !(safeRead(join(ROOT, 'src/lib/server/db/schema-postgres.ts')) ?? '').includes('code_relations'),
    title: 'Add codeRelations Drizzle table to schema-postgres.ts' },
  { id: 'gap_rel_004',   open: !(safeRead(join(ROOT, 'src/lib/server/ace/context-assembler.ts')) ?? '').includes('readLatestQdrantClusterTags'),
    title: 'Feed qdrant_cluster_tags.json into ACE synthesisBlock' },
  { id: 'gap_rel_005',   open: false, title: 'Write relationship_map.json per run via build-codebase-relationships.mjs (this script)' },
  { id: 'gap_rel_006',   open: !(existsSync(join(ROOT, 'scripts/wiki/ingest-kag-notes.mjs')) && existsSync(join(ROOT, 'memory/kag-notes/manifest.json'))),
    title: 'Make graph analysis artifacts readable by ACE (ingest.jsonl → KAG notes)' },
  { id: 'gap_analytics_001', open: !existsSync(join(ROOT, 'src/routes/api/admin/pipeline/events/+server.ts')),
    title: 'Add /api/admin/pipeline/events SSE route for dev analytics' },
  ...clusterCoverageGaps,
];

const nextActionsLines = [
  `# Next Actions — ${RUN_ID}`,
  '',
  `> Generated by \`scripts/graph/build-codebase-relationships.mjs\``,
  `> Relationship extraction: **${totalEdges.toLocaleString()} edges** across **${totalFiles.toLocaleString()} files**`,
  '',
  '## P0 — Critical (blocks synthesis)',
  '',
  ...openGapChecks
    .filter(g => g.open && (g.priority === 'P0' || g.id === 'gap_gds_001' || g.id === 'gap_rel_001'))
    .map(g => `- [ ] **${g.id}** — ${g.title}`),
  '',
  '## P1 — Important (improves ACE quality)',
  '',
  ...openGapChecks
    .filter(g => g.open && g.priority !== 'P0' && !(['gap_synth_001','gap_synth_002','gap_synth_003'].includes(g.id)))
    .map(g => `- [ ] **${g.id}** — ${g.title}`),
  '',
  '## Relationship Extraction Status',
  '',
  `| Type | Count |`,
  `|------|-------|`,
  ...Object.entries(edgeCounts).map(([t, n]) => `| ${t} | ${n.toLocaleString()} |`),
  '',
  '## Top Qdrant Collections Referenced',
  '',
  ...(topTargetsByType['QUERIES_QDRANT_COLLECTION'] ?? [])
    .map(t => `- \`${t.target}\` — ${t.count} files`),
  '',
  '## Top Tables Referenced',
  '',
  ...(topTargetsByType['QUERIES_TABLE'] ?? [])
    .map(t => `- \`${t.target}\` — ${t.count} files`),
  '',
  '## GPU Clusters for llm_synthesis',
  '',
  ...gpuClusters.slice(0, 12).map(c =>
    `- \`${c.clusterKey}\` (${c.fileCount} files) tags: ${c.topTags.slice(0,4).map(t=>t.tag).join(', ')}`
  ),
  '',
  synthesisBlock,
  ...(clusterAgentsIdx ? [
    '## Cluster → AGENTS.md Coverage',
    '',
    `> Built by \`scripts/graph/build-cluster-agents-index.mjs\` · ${clusterAgentsIdx.generatedAt?.slice(0,19) ?? ''}`,
    `> ${clusterAgentsIdx.totalWithCoverage}/${clusterAgentsIdx.clusterCount} clusters covered · ${clusterAgentsIdx.agentsMdUnique} unique AGENTS.md files`,
    '',
    '### Uncovered clusters (P0)',
    '',
    ...(clusterAgentsIdx.clusters ?? [])
      .filter(c => c.coverage === 0 && c.memberCount > 50)
      .slice(0, 8)
      .map(c => {
        const tags = (c.bowTerms ?? []).slice(0,3).join(', ') || 'mixed';
        return `- **cluster:${c.clusterId}** (${c.memberCount} files) ${tags} → \`${c.topDir}\``;
      }),
    '',
    '### Well-covered clusters (sample)',
    '',
    ...(clusterAgentsIdx.clusters ?? [])
      .filter(c => c.coverage >= 0.8 && c.memberCount > 30)
      .slice(0, 6)
      .map(c => `- cluster:${c.clusterId} (${c.memberCount} files, ${c.agentsMdCount} AGENTS.md) ${(c.bowTerms ?? []).slice(0,2).join('/')}`),
    '',
  ] : ['## Cluster → AGENTS.md Coverage', '', '> Not built yet — run `npm run graph:cluster-agents`', '']),
  `---`,
  `_Run ID: ${RUN_ID}_`,
];

// ── 8. ingest.jsonl ───────────────────────────────────────────────────────────

const ingestLines = [
  // Edge summary record
  JSON.stringify({
    type: 'edge_summary',
    runId: RUN_ID,
    totalFiles,
    totalEdges,
    edgeCounts,
  }),
  // Per GPU cluster packet
  ...gpuClusters.map(c => JSON.stringify({
    type:        'cluster_context',
    cluster_key: c.clusterKey,
    file_count:  c.fileCount,
    topo_classes: c.topoClasses,
    top_tags:    c.topTags.map(t => t.tag).slice(0, 8),
    top_files:   c.topFiles.slice(0, 6),
  })),
  // ACE critical file relations
  ...aceHitRelationships.slice(0, 12).map(r => JSON.stringify({
    type:      'ace_file_relations',
    file:      r.file,
    outbound:  r.outbound.slice(0, 10),
    inbound:   r.inbound.slice(0, 6),
  })),
];

// ── write all artifacts ───────────────────────────────────────────────────────

mkdirSync(RUN_DIR, { recursive: true });

const written = {
  relationship_map:     write('relationship_map.json',      relationshipMap),
  graph_nodes:          write('graph_nodes.json',           graphNodes),
  graph_edges:          write('graph_edges.json',           graphEdges),
  qdrant_cluster_tags:  write('qdrant_cluster_tags.json',   qdrantClusterTags),
  ace_hit_relationships:write('ace_hit_relationships.json', aceHitRelationships),
  llm_synthesis_mapping:write('llm_synthesis_mapping.json', llmSynthesisMapping),
  next_actions:         (() => {
    const p = join(RUN_DIR, 'next_actions.md');
    writeFileSync(p, nextActionsLines.join('\n'), 'utf-8');
    return p;
  })(),
  ingest: (() => {
    const p = join(RUN_DIR, 'ingest.jsonl');
    writeFileSync(p, ingestLines.join('\n') + '\n', 'utf-8');
    return p;
  })(),
};

// ── summary ───────────────────────────────────────────────────────────────────

if (PRINT) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Codebase Relationship Artifacts — ${RUN_ID}  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`Edges      : ${totalEdges.toLocaleString()} across ${totalFiles.toLocaleString()} files`);
  console.log(`GPU clusters: ${gpuClusters.length} | Fallback: ${fallbackClusters.length}`);
  console.log(`ACE files  : ${aceHitRelationships.length} with relations`);
  console.log('\nEdge counts:');
  for (const [t, n] of Object.entries(edgeCounts)) {
    console.log(`  ${t.padEnd(30)} ${String(n).padStart(6)}`);
  }
  console.log('\nArtifacts written:');
  for (const [name, p] of Object.entries(written)) {
    console.log(`  ${name.padEnd(25)} ${p}`);
  }
  console.log('');
} else {
  console.log(`[build-codebase-relationships] ${RUN_DIR}`);
  console.log(`  edges=${totalEdges} files=${totalFiles} gpuClusters=${gpuClusters.length}`);
}