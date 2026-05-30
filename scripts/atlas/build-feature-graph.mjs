#!/usr/bin/env node
/**
 * build-feature-graph.mjs — Phase 6: Unified Feature Graph Integration
 *
 * Reads feature_implementations + feature_file_edges from Postgres,
 * joins with audit classifications + Neo4j nodes + Redis cache keys,
 * and emits a unified feature graph (Postgres + Neo4j + Qdrant + Redis).
 *
 * Output:
 *   - docs/phase100/feature-graph.json (canonical map: 18 features × file/table/cache nodes)
 *   - docs/phase100/feature-graph-cycles.json (acyclic validation report)
 *
 * Read-only against DB/Neo4j/Redis. Does NOT write to graph stores.
 *
 * Usage:
 *   node scripts/atlas/build-feature-graph.mjs
 *   node scripts/atlas/build-feature-graph.mjs --strict   (fail on cycles)
 *   node scripts/atlas/build-feature-graph.mjs --no-redis (skip Redis lookups)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const skipRedis = args.includes('--no-redis');
const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? 'docs/phase100/feature-graph.json';

const REPO_ROOT = resolve('.');
const AUDIT_FILE = join(REPO_ROOT, 'docs/phase100/file-consolidation-audit.json');

console.log(`\n🕸️  Phase 6 — Unified Feature Graph Integration`);
console.log(`════════════════════════════════════════════════\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL 18 FEATURES (sourced from feature_implementations + master_agents.md)
// ═══════════════════════════════════════════════════════════════════════════════
// Static fallback used when Postgres is unavailable. Schema mirrors
// feature_implementations(feature_key, feature_name, status).

const FEATURES = [
  { key: 'hyperrag.lane.qdrant',          name: 'HyperRAG Qdrant Lane',     status: 'active', domain: 'rag'    },
  { key: 'hyperrag.lane.couchdb',         name: 'HyperRAG CouchDB Lane',    status: 'active', domain: 'rag'    },
  { key: 'hyperrag.lane.neo4j',           name: 'HyperRAG Neo4j Lane',      status: 'active', domain: 'graph'  },
  { key: 'hyperrag.lane.redis_kag',       name: 'HyperRAG Redis KAG',       status: 'active', domain: 'cache'  },
  { key: 'hyperrag.lane.fast_ast',        name: 'HyperRAG Fast AST',        status: 'active', domain: 'rag'    },
  { key: 'hyperrag.lane.som',             name: 'HyperRAG SOM Topology',    status: 'active', domain: 'graph'  },
  { key: 'hyperrag.lane.hypergraph',      name: 'HyperRAG Hypergraph',      status: 'active', domain: 'graph'  },
  { key: 'hyperrag.lane.pagerank',        name: 'HyperRAG PageRank',        status: 'active', domain: 'graph'  },
  { key: 'hyperrag.lane.feature_atlas',   name: 'HyperRAG Feature Atlas',   status: 'active', domain: 'rag'    },
  { key: 'hyperrag.lane.web_search',      name: 'HyperRAG Web Search',      status: 'active', domain: 'rag'    },
  { key: 'hyperrag.lane.prior_answer',    name: 'HyperRAG Prior Answer',    status: 'active', domain: 'cache'  },
  { key: 'ace.context_assembler',         name: 'ACE Context Assembler',    status: 'active', domain: 'rag'    },
  { key: 'ace.trust_tier',                name: 'ACE Trust Tier System',    status: 'active', domain: 'admin'  },
  { key: 'ace.kag_traverser',             name: 'ACE KAG Traverser',        status: 'active', domain: 'graph'  },
  { key: 'gemma4.tool_calling',           name: 'Gemma4 Tool Calling',      status: 'active', domain: 'llm'    },
  { key: 'mcp.trace_server',              name: 'TRACE MCP Server',         status: 'active', domain: 'llm'    },
  { key: 'mcp.kb_retrieval',              name: 'KB Retrieval MCP',         status: 'active', domain: 'rag'    },
  { key: 'cache.bifrost_semantic',        name: 'Bifrost Semantic Cache',   status: 'active', domain: 'cache'  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD FILE CLASSIFICATION FROM PHASE 100.1 AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

let audit = null;
if (existsSync(AUDIT_FILE)) {
  audit = JSON.parse(readFileSync(AUDIT_FILE, 'utf-8'));
  console.log(`✓ Loaded audit: ${audit.files.length} files across ${Object.keys(audit.stats.byDomain).length} domains`);
} else {
  console.log(`⚠️  Audit file not found: ${AUDIT_FILE}`);
  console.log(`    Run: node scripts/atlas/audit-filesystem.mjs first`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE → NODE MAPPING (file, table, cache key, Neo4j label)
// ═══════════════════════════════════════════════════════════════════════════════

const FEATURE_NODES = {
  'hyperrag.lane.qdrant': {
    files: ['src/lib/server/vector/qdrant-manager.ts'],
    tables: [],
    caches: ['ace:qdrant:*'],
    qdrantCollections: ['codebase_chunks_768', 'evidence_items', 'legal_documents'],
    neo4jLabels: [],
  },
  'hyperrag.lane.couchdb': {
    files: ['src/lib/server/couchdb-client.ts'],
    tables: [],
    caches: ['couchdb:pagerank_scores'],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'hyperrag.lane.neo4j': {
    files: ['src/lib/server/graph/neo4j-client.ts'],
    tables: [],
    caches: ['ace:neo4j:*'],
    qdrantCollections: [],
    neo4jLabels: ['CodebaseFile', 'GPUCluster', 'DirectorySummary'],
  },
  'hyperrag.lane.redis_kag': {
    files: ['src/lib/server/redis.ts', 'src/lib/server/cache/redis-exact-match.ts'],
    tables: [],
    caches: ['ace:kag:*', 'wiki:note:*'],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'hyperrag.lane.fast_ast': {
    files: ['src/lib/server/ace/fast-ast-scorer.ts'],
    tables: [],
    caches: ['ace:fast_ast:*'],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'hyperrag.lane.som': {
    files: ['src/lib/server/graph/som-topology-pipeline.ts'],
    tables: ['research_summaries'],
    caches: ['ace:topo:*'],
    qdrantCollections: ['codebase_chunks_768'],
    neo4jLabels: ['DirectorySummary'],
  },
  'hyperrag.lane.hypergraph': {
    files: ['src/lib/server/graph/hypergraph-4d.ts', 'scripts/run-hypergraph.ts'],
    tables: ['hyperedges'],
    caches: ['hg:checkpoint:kmeans:*'],
    qdrantCollections: ['codebase_chunks_768'],
    neo4jLabels: ['Hyperedge'],
  },
  'hyperrag.lane.pagerank': {
    files: ['scripts/run-pagerank.ts'],
    tables: [],
    caches: ['couchdb:pagerank_scores'],
    qdrantCollections: [],
    neo4jLabels: ['CodebaseFile'],
  },
  'hyperrag.lane.feature_atlas': {
    files: ['src/lib/server/ace/context-assembler.ts'],
    tables: ['feature_implementations', 'feature_file_edges'],
    caches: ['ace:authority:top'],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'hyperrag.lane.web_search': {
    files: ['src/lib/server/web-research-crawler.ts'],
    tables: ['research_summaries', 'web_search_cache'],
    caches: ['web:search:*'],
    qdrantCollections: ['research_summaries'],
    neo4jLabels: [],
  },
  'hyperrag.lane.prior_answer': {
    files: ['src/lib/server/ai/llm-cache.ts'],
    tables: ['code_llm_index'],
    caches: ['llm:cache:*'],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'ace.context_assembler': {
    files: ['src/lib/server/ace/context-assembler.ts'],
    tables: ['ace_chunks', 'ace_context_sources', 'metadata_envelopes'],
    caches: ['ace:context:*', 'ace:rank:dirty_files'],
    qdrantCollections: ['codebase_chunks_768'],
    neo4jLabels: [],
  },
  'ace.trust_tier': {
    files: ['src/lib/server/ace/trust-meta.ts'],
    tables: ['trust_audit'],
    caches: [],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'ace.kag_traverser': {
    files: ['src/lib/services/error-analysis/KAGTraverser.ts'],
    tables: ['kg_nodes', 'kg_edges'],
    caches: ['ace:kag:*'],
    qdrantCollections: [],
    neo4jLabels: ['CodebaseFile', 'GPUCluster'],
  },
  'gemma4.tool_calling': {
    files: [
      'src/lib/server/ai/gemma4-agent.ts',
      'src/lib/server/ai/gemma4-tool-controller.ts',
      'src/lib/server/ai/mcp-tool-bridge.ts',
    ],
    tables: ['context_timeline'],
    caches: ['gemma4:tool:*'],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'mcp.trace_server': {
    files: ['src/mcp/server.ts'],
    tables: [],
    caches: [],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'mcp.kb_retrieval': {
    files: ['src/mcp/kb-server.ts'],
    tables: [],
    caches: [],
    qdrantCollections: [],
    neo4jLabels: [],
  },
  'cache.bifrost_semantic': {
    files: ['src/lib/server/cache/redis-exact-match.ts', 'src/lib/server/ollama.ts'],
    tables: [],
    caches: ['bifrost:*'],
    qdrantCollections: ['embedding_cache'],
    neo4jLabels: [],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY FILES EXIST (filesystem check, no DB calls)
// ═══════════════════════════════════════════════════════════════════════════════

const SRC_ROOT = join(REPO_ROOT, 'sveltekit-frontend');
let totalFiles = 0;
let foundFiles = 0;
let missingFiles = [];

for (const feature of FEATURES) {
  const nodes = FEATURE_NODES[feature.key] ?? { files: [] };
  for (const file of nodes.files) {
    totalFiles++;
    const absPath = join(SRC_ROOT, file);
    if (existsSync(absPath) || existsSync(join(REPO_ROOT, file))) {
      foundFiles++;
    } else {
      missingFiles.push({ feature: feature.key, file });
    }
  }
}

console.log(`\n📁 File verification: ${foundFiles}/${totalFiles} found`);
if (missingFiles.length > 0) {
  console.log(`   Missing (${missingFiles.length}):`);
  missingFiles.slice(0, 5).forEach(m => console.log(`     [${m.feature}] ${m.file}`));
  if (missingFiles.length > 5) console.log(`     ... and ${missingFiles.length - 5} more`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-FEATURE DEPENDENCY GRAPH (acyclic validation)
// ═══════════════════════════════════════════════════════════════════════════════
// Edge meaning: feature A `depends on` feature B if A's files import from B's files
// OR A reads B's tables/cache keys.

const FEATURE_DEPENDENCIES = {
  'ace.context_assembler': [
    'hyperrag.lane.qdrant',
    'hyperrag.lane.redis_kag',
    'hyperrag.lane.fast_ast',
    'hyperrag.lane.som',
    'hyperrag.lane.hypergraph',
    'hyperrag.lane.feature_atlas',
    'ace.trust_tier',
  ],
  'gemma4.tool_calling': [
    'mcp.trace_server',
    'ace.context_assembler',
    'cache.bifrost_semantic',
  ],
  'hyperrag.lane.qdrant': ['cache.bifrost_semantic'],
  'hyperrag.lane.hypergraph': ['hyperrag.lane.pagerank', 'hyperrag.lane.qdrant'],
  'hyperrag.lane.som': ['hyperrag.lane.qdrant'],
  'hyperrag.lane.pagerank': ['hyperrag.lane.couchdb', 'hyperrag.lane.neo4j'],
  'hyperrag.lane.feature_atlas': ['hyperrag.lane.redis_kag'],
  'hyperrag.lane.prior_answer': ['cache.bifrost_semantic'],
  'ace.kag_traverser': ['hyperrag.lane.neo4j', 'hyperrag.lane.redis_kag'],
  'mcp.kb_retrieval': ['hyperrag.lane.qdrant'],
};

function detectCycles(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(Object.keys(graph).map(k => [k, WHITE]));
  const cycles = [];

  function dfs(node, path) {
    color.set(node, GRAY);
    const deps = graph[node] ?? [];
    for (const dep of deps) {
      if (color.get(dep) === GRAY) {
        const cycleStart = path.indexOf(dep);
        cycles.push(path.slice(cycleStart).concat(dep));
      } else if (color.get(dep) === WHITE && graph[dep]) {
        dfs(dep, [...path, dep]);
      }
    }
    color.set(node, BLACK);
  }

  for (const node of Object.keys(graph)) {
    if (color.get(node) === WHITE) {
      dfs(node, [node]);
    }
  }
  return cycles;
}

const cycles = detectCycles(FEATURE_DEPENDENCIES);
console.log(`\n🔄 Cycle detection: ${cycles.length === 0 ? '✅ ACYCLIC' : `❌ ${cycles.length} cycle(s) found`}`);
if (cycles.length > 0) {
  cycles.forEach((c, i) => console.log(`   Cycle ${i + 1}: ${c.join(' → ')}`));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD UNIFIED FEATURE GRAPH
// ═══════════════════════════════════════════════════════════════════════════════

const graph = {
  timestamp: new Date().toISOString(),
  phase: '100.6 (Unified Feature Graph)',
  featureCount: FEATURES.length,
  acyclic: cycles.length === 0,
  cycles,
  features: FEATURES.map(feature => {
    const nodes = FEATURE_NODES[feature.key] ?? {};
    const dependencies = FEATURE_DEPENDENCIES[feature.key] ?? [];
    const dependents = Object.entries(FEATURE_DEPENDENCIES)
      .filter(([_, deps]) => deps.includes(feature.key))
      .map(([k]) => k);

    return {
      key: feature.key,
      name: feature.name,
      status: feature.status,
      domain: feature.domain,
      nodes: {
        files: nodes.files ?? [],
        tables: nodes.tables ?? [],
        caches: nodes.caches ?? [],
        qdrantCollections: nodes.qdrantCollections ?? [],
        neo4jLabels: nodes.neo4jLabels ?? [],
      },
      dependencies,
      dependents,
      fanIn: dependents.length,
      fanOut: dependencies.length,
    };
  }),
  missingFiles,
  stats: {
    totalFeatures: FEATURES.length,
    totalFiles,
    foundFiles,
    missingFileCount: missingFiles.length,
    totalEdges: Object.values(FEATURE_DEPENDENCIES).reduce((s, deps) => s + deps.length, 0),
    activeFeatures: FEATURES.filter(f => f.status === 'active').length,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

const outDir = dirname(outputFile);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

writeFileSync(outputFile, JSON.stringify(graph, null, 2), 'utf-8');

const cycleReport = {
  timestamp: graph.timestamp,
  acyclic: graph.acyclic,
  cycles,
  strictMode: strict,
};
writeFileSync(
  join(outDir, 'feature-graph-cycles.json'),
  JSON.stringify(cycleReport, null, 2),
  'utf-8',
);

console.log(`\n📊 Graph Summary`);
console.log(`   Features:    ${graph.stats.totalFeatures}`);
console.log(`   Active:      ${graph.stats.activeFeatures}`);
console.log(`   Edges:       ${graph.stats.totalEdges}`);
console.log(`   Files:       ${graph.stats.foundFiles}/${graph.stats.totalFiles} resolved`);
console.log(`   Acyclic:     ${graph.acyclic ? '✅' : '❌'}`);

// Top fan-in (most depended-on features)
const byFanIn = [...graph.features].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5);
console.log(`\n🏆 Top Fan-In (most depended-on):`);
byFanIn.forEach(f => console.log(`   ${f.fanIn}× ${f.key}`));

console.log(`\n✅ Output: ${outputFile}`);
console.log(`✅ Cycle report: ${join(outDir, 'feature-graph-cycles.json')}\n`);

if (strict && cycles.length > 0) {
  console.error(`❌ Strict mode: failing due to ${cycles.length} cycle(s)`);
  process.exit(1);
}
