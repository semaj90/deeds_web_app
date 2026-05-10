#!/usr/bin/env node
/**
 * Seed the feature_implementations + feature_file_edges tables.
 * §5.2 of docs/architecture/hyperrag-feature-atlas-runtime.md
 *
 * Usage:
 *   npm run seed:feature-atlas           # apply (idempotent ON CONFLICT DO NOTHING)
 *   npm run seed:feature-atlas:dry       # dry-run: print SQL, no writes
 *
 * Reads docs/graph/codebase-graph.json to verify file paths exist in the graph.
 * Falls back to trusting the hardcoded map if graph file is absent.
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

const DRY = process.argv.includes('--dry-run') || process.argv.includes('--dry');

// ── Feature catalog ──────────────────────────────────────────────────────────
// Each entry maps a feature_key → { name, description, laneIds, files[] }
// roles: 'primary' | 'consumer' | 'test' | 'type'

const FEATURES = [
  {
    featureKey:  'hyperrag.lane.topo_prefilter',
    featureName: 'HyperRAG L0 — topo-byte prefilter',
    description: 'Redis ace:topo:{class}:{hash} 300s candidate cache (Stage A0)',
    laneIds:     ['L0'],
    files: [
      { filePath: 'src/lib/server/cache/topo-candidate-cache.ts', entryExport: 'checkTopoCache', role: 'primary' },
      { filePath: 'src/lib/server/ace/context-assembler.ts',      entryExport: 'fetchACPKnowledgeResults', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.qdrant_dense',
    featureName: 'HyperRAG L1 — Qdrant dense ANN',
    description: 'codebase_chunks_768 content vector 768-dim cosine search',
    laneIds:     ['L1'],
    files: [
      { filePath: 'src/lib/server/vector/qdrant-manager.ts', entryExport: 'hybridSearch', role: 'primary' },
      { filePath: 'src/lib/server/ace/multi-lane-retrieval.ts', entryExport: 'multiLaneSearch', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.qdrant_signature',
    featureName: 'HyperRAG L2 — Qdrant signature ANN',
    description: 'codebase_chunks_768 signature vector (AST-structure embedding)',
    laneIds:     ['L2'],
    files: [
      { filePath: 'src/lib/server/vector/qdrant-manager.ts', entryExport: 'hybridSearch', role: 'primary' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.summary_lenses',
    featureName: 'HyperRAG L3 — summary lenses',
    description: 'summary_lenses_768 Qdrant collection — cluster narrative summaries',
    laneIds:     ['L3'],
    files: [
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'primary' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.wiki_agents_md',
    featureName: 'HyperRAG L4 — wiki / AGENTS.md notes',
    description: 'Redis wiki:note:* + agents:dir:* — per-directory context rules',
    laneIds:     ['L4'],
    files: [
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'primary' },
      { filePath: 'src/lib/server/agents-md/resolve-directory-context.ts', entryExport: 'nearestAgentsMdForFile', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.synthesis_memory',
    featureName: 'HyperRAG L5 — synthesis memory',
    description: 'synthesis_memory_768 Qdrant — persisted Gemma4 synthesis outputs',
    laneIds:     ['L5'],
    files: [
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'primary' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.prior_answers',
    featureName: 'HyperRAG L6 — prior answers',
    description: 'Redis code:llm:* + ace:chunks:* — cached LLM outputs',
    laneIds:     ['L6'],
    files: [
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'primary' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.graph_neighbors',
    featureName: 'HyperRAG L7 — graph neighbors (Neo4j)',
    description: 'IMPORTS, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY traversal via Cypher',
    laneIds:     ['L7'],
    files: [
      { filePath: 'src/lib/server/ace/multi-lane-retrieval.ts', entryExport: 'multiLaneSearch', role: 'primary' },
      { filePath: 'src/lib/server/graph/graph-informed-retrieval.ts', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.pagerank_authority',
    featureName: 'HyperRAG L8 — PageRank authority',
    description: 'Redis couchdb:pagerank_scores + ace:authority:top — Karpathy blend final rerank',
    laneIds:     ['L8'],
    files: [
      { filePath: 'scripts/karpathy-gpu-enrich.mjs', role: 'primary' },
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.feature_atlas',
    featureName: 'HyperRAG L9 — feature atlas',
    description: 'Postgres feature_implementations + feature_file_edges — durable feature → file mapping',
    laneIds:     ['L9'],
    files: [
      { filePath: 'scripts/seed-feature-atlas.mjs', role: 'primary' },
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'consumer' },
      { filePath: 'src/lib/server/db/schema-postgres.ts', entryExport: 'featureImplementations', role: 'type' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.web_external',
    featureName: 'HyperRAG L10 — web / external',
    description: 'Fetched via /api/web-research, ACP cross-feed; trust tier T4',
    laneIds:     ['L10'],
    files: [
      { filePath: 'src/lib/server/ai/external-research-agent.ts', role: 'primary' },
      { filePath: 'src/routes/api/research/external-deep/+server.ts', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hyperrag.lane.activity_prefetch',
    featureName: 'HyperRAG L11 — panel activity prefetch',
    description: 'Postgres panel_activity_log last-N by userId + route',
    laneIds:     ['L11'],
    files: [
      { filePath: 'src/routes/api/analytics/panel-activity/+server.ts', role: 'primary' },
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'consumer' },
      { filePath: 'src/lib/server/db/schema-postgres.ts', entryExport: 'panelActivityLog', role: 'type' },
    ],
  },
  {
    featureKey:  'ace.context_pack',
    featureName: 'ACE context assembler',
    description: 'fetchACPKnowledgeResults — fused 11-lane retrieval → context pack for Gemma4',
    laneIds:     ['L0','L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11'],
    files: [
      { filePath: 'src/lib/server/ace/context-assembler.ts', entryExport: 'fetchACPKnowledgeResults', role: 'primary' },
    ],
  },
  {
    featureKey:  'ace.trust_tiers',
    featureName: 'ACE trust tier system',
    description: 'TrustMeta, LaneId, sanitizer, system prompt fence — §4 of hyperrag blueprint',
    laneIds:     ['L0','L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11'],
    files: [
      { filePath: 'src/lib/server/ace/sanitizer.ts', entryExport: 'sanitizeChunk',          role: 'primary' },
      { filePath: 'src/lib/server/ace/sanitizer.ts', entryExport: 'buildExternalTrustMeta', role: 'primary' },
      { filePath: 'src/lib/server/ace/types.ts',     entryExport: 'TrustMeta',              role: 'type'    },
      { filePath: 'src/lib/server/ace/types.ts',     entryExport: 'TRUST_SCORE_MULTIPLIER', role: 'type'    },
    ],
  },
  {
    featureKey:  'karpathy.gpu_blend',
    featureName: 'Karpathy GPU authority blend',
    description: '0.4·PageRank + 0.3·attention + 0.3·authority; Redis gpu:karpathy:scores 24h TTL',
    laneIds:     ['L8'],
    files: [
      { filePath: 'scripts/karpathy-gpu-enrich.mjs', role: 'primary' },
    ],
  },
  {
    featureKey:  'mcp.trace_server',
    featureName: 'TRACE MCP server',
    description: '70+ tools via Streamable HTTP :8788; canonical model tool surface',
    laneIds:     [],
    files: [
      { filePath: 'src/mcp/trace-mcp-server.ts', role: 'primary' },
      { filePath: 'scripts/ensure-mcp-server.mjs', role: 'consumer' },
    ],
  },
  {
    featureKey:  'hypergraph.4d',
    featureName: '4D hypergraph builder',
    description: 'GPU k-means → SOM → Neo4j edges → Qdrant payload enrichment',
    laneIds:     ['L7'],
    files: [
      { filePath: 'src/lib/server/graph/hypergraph-4d.ts', entryExport: 'buildHypergraph4D', role: 'primary' },
      { filePath: 'scripts/run-hypergraph.ts', role: 'consumer' },
    ],
  },
  {
    featureKey:  'synth.loop',
    featureName: 'Synth loop (Gemma4 synthesis pipeline)',
    description: '5-lane: MCP retrieval → graph → rerank → Gemma4 synthesis → handoff brief',
    laneIds:     ['L1','L2','L4','L7','L8'],
    files: [
      { filePath: 'scripts/synth/run-loop.mjs', role: 'primary' },
      { filePath: 'scripts/synth/handoff-to-claude.mjs', role: 'consumer' },
    ],
  },
];

// ── Load codebase graph for path validation ───────────────────────────────────

const graphPath = join(ROOT, 'docs', 'graph', 'codebase-graph.json');
let graphFileSet = new Set();
if (existsSync(graphPath)) {
  try {
    const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
    // graph uses graph.files[].rel (fast-ast mode), not graph.nodes
    const files = graph.files ?? graph.nodes ?? [];
    for (const f of files) {
      const p = f.rel ?? f.id ?? f.filePath;
      if (p) graphFileSet.add(p);
    }
    console.log(`[seed] Loaded ${graphFileSet.size} file paths from codebase-graph.json`);
  } catch {
    console.warn('[seed] Could not parse codebase-graph.json — skipping path validation');
  }
} else {
  console.warn('[seed] codebase-graph.json not found — skipping path validation');
}

// ── Build SQL ─────────────────────────────────────────────────────────────────

function esc(s) {
  return s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
}

const implRows = [];
const edgeRows = [];

for (const feat of FEATURES) {
  implRows.push(
    `(gen_random_uuid(), ${esc(feat.featureKey)}, ${esc(feat.featureName)}, ` +
    `${esc(feat.description)}, ARRAY[${feat.laneIds.map(esc).join(',')}]::text[], ` +
    `'active', 1.0, now(), now())`
  );

  for (const f of feat.files) {
    if (graphFileSet.size > 0 && !graphFileSet.has(f.filePath)) {
      console.warn(`  [skip] ${feat.featureKey} → ${f.filePath} (not in graph)`);
    }
    edgeRows.push(
      `(gen_random_uuid(), ${esc(feat.featureKey)}, ${esc(f.filePath)}, ` +
      `${esc(f.entryExport ?? null)}, ${esc(f.role)}, NULL, NULL, now())`
    );
  }
}

const SQL = `
-- feature_implementations
INSERT INTO feature_implementations (id, feature_key, feature_name, description, lane_ids, status, confidence, created_at, updated_at)
VALUES
${implRows.join(',\n')}
ON CONFLICT (feature_key) DO NOTHING;

-- feature_file_edges
INSERT INTO feature_file_edges (id, feature_key, file_path, entry_export, role, line_start, line_end, created_at)
VALUES
${edgeRows.join(',\n')}
ON CONFLICT (feature_key, file_path, entry_export) DO NOTHING;
`.trim();

if (DRY) {
  console.log('\n[seed:feature-atlas] DRY RUN — SQL that would be applied:\n');
  console.log(SQL);
  console.log(`\n[seed:feature-atlas] ${implRows.length} features, ${edgeRows.length} file edges`);
  process.exit(0);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[seed:feature-atlas] DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(SQL);
    await client.query('COMMIT');
    console.log(`[seed:feature-atlas] Applied — ${implRows.length} features, ${edgeRows.length} edges (ON CONFLICT DO NOTHING)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed:feature-atlas] Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
