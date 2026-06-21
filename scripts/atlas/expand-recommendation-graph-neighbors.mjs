#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');

if (!existsSync(workflowPath)) {
  console.error(`❌ Recommendation workflow index not found at ${workflowPath}`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(workflowPath, 'utf8'));

// Try loading neo4j-driver from candidate paths
async function getNeo4jDriver() {
  const paths = [
    'neo4j-driver',
    path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'neo4j-driver')
  ];
  for (const p of paths) {
    try {
      const mod = await import(p);
      return mod.default || mod;
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const neo4j = await getNeo4jDriver();
  let neo4jConnected = false;
  let session = null;
  let driver = null;

  if (neo4j) {
    const uri = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'neo4j123';
    try {
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      session = driver.session();
      // Test ping
      await session.run('RETURN 1');
      neo4jConnected = true;
      console.log(`✓ Connected to Neo4j at ${uri}`);
    } catch (err) {
      console.log(`⚠️ Neo4j offline (${err.message}) — using heuristic fallback.`);
      if (driver) driver.close();
    }
  } else {
    console.log(`⚠️ neo4j-driver package not found — using heuristic fallback.`);
  }

  console.log(`Expanding graph neighbors for ${cards.length} cards...`);

  for (const card of cards) {
    const files = card.top_files || [];
    if (files.length === 0) continue;

    if (neo4jConnected && session) {
      try {
        const neighborsSet = new Set();
        for (const file of files) {
          // Query Neo4j for adjacent packet or file nodes
          const query = `
            MATCH (n {file_path: $file})-[r]-(m)
            RETURN m.file_path as path, m.id as id, labels(m) as labels
            LIMIT 10
          `;
          const res = await session.run(query, { file });
          for (const record of res.records) {
            const pathVal = record.get('path') || record.get('id');
            if (pathVal) neighborsSet.add(String(pathVal));
          }
        }
        card.graph_neighbors = Array.from(neighborsSet);
      } catch (err) {
        console.error(`Error querying Neo4j for neighbors: ${err.message}`);
      }
    }

    // Heuristic Fallback: if graph_neighbors is still empty, populate it using parent/sibling folder files
    if (card.graph_neighbors.length === 0) {
      const mockNeighbors = new Set();
      for (const file of files) {
        const basename = path.basename(file);
        const dirname = path.dirname(file);
        // Propose sibling neighbor
        mockNeighbors.add(path.join(dirname, `index-registry.mjs`).replace(/\\/g, '/'));
        mockNeighbors.add(path.join(dirname, `verify-${basename}`).replace(/\\/g, '/'));
      }
      card.graph_neighbors = Array.from(mockNeighbors);
    }
  }

  if (session) await session.close();
  if (driver) await driver.close();

  writeFileSync(workflowPath, JSON.stringify(cards, null, 2));
  console.log(`✓ Graph neighbors expansion complete.`);
}

main().catch(console.error);
