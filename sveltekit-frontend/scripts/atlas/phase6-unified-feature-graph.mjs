#!/usr/bin/env node
/**
 * phase6-unified-feature-graph.mjs
 *
 * Phase 6: Map 18 semantic features to their file, table, and cache nodes in Neo4j.
 * Validates cross-feature dependencies and asserts directed acyclic graph (DAG) status.
 */

import 'dotenv/config';
import neo4j from 'neo4j-driver';

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASS = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';

const isDryRun = process.argv.includes('--dry-run');

console.log('🚀 Phase 6: Unified Feature Graph Integration');
console.log(`   URI: ${URI}`);
console.log(`   User: ${USER}`);
console.log();

const features = [
  // Domain 1: Codebase Intelligence
  { key: 'graphql-kag-search', name: 'GraphQL/KAG Search', domain: 'Codebase Intelligence', folder: 'src/lib/services/knowledge-search/' },
  { key: 'rag-pipeline', name: 'RAG Pipeline', domain: 'Codebase Intelligence', folder: 'src/lib/server/ai/' },
  { key: 'vector-embeddings', name: 'Vector Embeddings', domain: 'Codebase Intelligence', folder: 'src/lib/server/vector/' },
  { key: 'neo4j-graph', name: 'Neo4j Graph', domain: 'Codebase Intelligence', folder: 'src/lib/server/graph/' },

  // Domain 2: Legal AI
  { key: 'evidence-pipeline', name: 'Evidence Pipeline', domain: 'Legal AI', folder: 'src/lib/server/indexer/' },
  { key: 'case-management', name: 'Case Management', domain: 'Legal AI', folder: 'src/routes/(app)/cases/' },
  { key: 'citations-authority', name: 'Citations & Legal Authority', domain: 'Legal AI', folder: 'src/lib/server/analysis/' },
  { key: 'forensics-analysis', name: 'Forensics & Analysis', domain: 'Legal AI', folder: 'src/lib/server/analysis/forensics' },

  // Domain 3: Frontend
  { key: 'auth-sessions', name: 'Authentication & Sessions', domain: 'Frontend', folder: 'src/lib/auth/' },
  { key: 'ui-components', name: 'UI Components & Styling', domain: 'Frontend', folder: 'src/lib/components/' },
  { key: 'forms-validation', name: 'Forms & Validation', domain: 'Frontend', folder: 'src/lib/server/forms/' },
  { key: 'routing-navigation', name: 'Routing & Navigation', domain: 'Frontend', folder: 'src/routes/' },

  // Domain 4: Backend Services
  { key: 'mcp-tools', name: 'MCP Tools & Agentic', domain: 'src/mcp/' },
  { key: 'message-queue', name: 'Message Queue (RabbitMQ)', domain: 'Backend Services', folder: 'src/lib/server/queue/' },
  { key: 'cache-session', name: 'Cache & Session', domain: 'Backend Services', folder: 'src/lib/server/cache/' },
  { key: 'inference-llm', name: 'Inference & LLM', domain: 'Backend Services', folder: 'src/lib/server/ai/ollama' },
  { key: 'database-orm', name: 'Database & ORM', domain: 'Backend Services', folder: 'src/lib/server/db/' },
  { key: 'observability-logging', name: 'Observability & Logging', domain: 'Backend Services', folder: 'src/lib/server/observability/' }
];

// Directed cross-feature dependencies as outlined in docs/CODEBASE-FEATURE-MAPPING-2026-05-29.md
const dependencies = [
  { from: 'auth-sessions', to: 'routing-navigation' },
  { from: 'routing-navigation', to: 'rag-pipeline' },
  { from: 'graphql-kag-search', to: 'neo4j-graph' },
  { from: 'graphql-kag-search', to: 'vector-embeddings' },
  { from: 'rag-pipeline', to: 'vector-embeddings' },
  { from: 'rag-pipeline', to: 'cache-session' },
  { from: 'evidence-pipeline', to: 'vector-embeddings' },
  { from: 'evidence-pipeline', to: 'database-orm' },
  { from: 'citations-authority', to: 'neo4j-graph' },
  { from: 'citations-authority', to: 'database-orm' },
  { from: 'forensics-analysis', to: 'citations-authority' },
  { from: 'mcp-tools', to: 'auth-sessions' },
  { from: 'message-queue', to: 'database-orm' },
  { from: 'cache-session', to: 'database-orm' },
  { from: 'inference-llm', to: 'cache-session' },
  { from: 'observability-logging', to: 'database-orm' }
];

// Perform DFS Cycle Detection (Acyclic Validation)
function validateAcyclic() {
  const adj = {};
  for (const f of features) {
    adj[f.key] = [];
  }
  for (const dep of dependencies) {
    adj[dep.from].push(dep.to);
  }

  const visited = {}; // 0 = unvisited, 1 = visiting, 2 = visited
  const path = [];

  function dfs(node) {
    visited[node] = 1;
    path.push(node);

    for (const neighbor of adj[node] || []) {
      if (visited[neighbor] === 1) {
        path.push(neighbor);
        const cycleStartIdx = path.indexOf(neighbor);
        const cycle = path.slice(cycleStartIdx);
        console.error(`❌ Cycle detected: ${cycle.join(' -> ')}`);
        return true;
      }
      if (!visited[neighbor]) {
        if (dfs(neighbor)) return true;
      }
    }

    path.pop();
    visited[node] = 2;
    return false;
  }

  for (const f of features) {
    if (!visited[f.key]) {
      if (dfs(f.key)) {
        throw new Error('Graph validation failed: The cross-feature dependency map contains cycles.');
      }
    }
  }

  console.log('✅ Graph Acyclic Verification: The feature dependency graph is Directed Acyclic Graph (DAG) with 0 cycles.');
}

async function main() {
  // Assert acyclic first before applying writes
  validateAcyclic();

  if (isDryRun) {
    console.log('[DRY-RUN] Skipping database changes.');
    return;
  }

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));
  try {
    await driver.verifyConnectivity();
    console.log('[CONNECT] ✓ Neo4j connected');
  } catch (e) {
    console.error('[CONNECT] ✗ Cannot reach Neo4j:', e.message);
    process.exit(1);
  }

  const session = driver.session();
  try {
    // 1. Create Feature Nodes
    console.log('[WRITE] Merging 18 semantic feature nodes...');
    for (const f of features) {
      await session.run(
        `
        MERGE (feat:AtlasFeature {key: $key})
        SET feat.name = $name, feat.domain = $domain, feat.purpose = $purpose
        `,
        { key: f.key, name: f.name, domain: f.domain, purpose: f.folder || '' }
      );
    }
    console.log('  ✓ Feature nodes merged successfully.');

    // 2. Link Features to CodebaseFile nodes
    console.log('[WRITE] Linking features to matching CodebaseFile nodes...');
    for (const f of features) {
      if (f.folder) {
        const result = await session.run(
          `
          MATCH (feat:AtlasFeature {key: $key})
          MATCH (file:CodebaseFile)
          WHERE file.filePath STARTS WITH $folder
          MERGE (feat)-[r:REFERENCES]->(file)
          RETURN count(r) AS links
          `,
          { key: f.key, folder: f.folder }
        );
        console.log(`  - Feature '${f.key}' linked to ${result.records[0].get('links').toNumber()} file(s)`);
      }
    }

    // 3. Create DEPENDS_ON edges between AtlasFeatures
    console.log('[WRITE] Creating DEPENDS_ON edges...');
    let edgeCount = 0;
    for (const dep of dependencies) {
      const result = await session.run(
        `
        MATCH (a:AtlasFeature {key: $from})
        MATCH (b:AtlasFeature {key: $to})
        MERGE (a)-[r:DEPENDS_ON]->(b)
        RETURN count(r) AS created
        `,
        { from: dep.from, to: dep.to }
      );
      edgeCount += result.records[0].get('created').toNumber();
    }
    console.log(`  ✓ Merged ${edgeCount} DEPENDS_ON relationships.`);

    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Phase 6 Feature Graph Integration Complete!');
    console.log('═══════════════════════════════════════════════════════════════');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
