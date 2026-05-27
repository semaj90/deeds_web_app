#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NEO4J_HTTP = process.env.NEO4J_HTTP || 'http://localhost:7474/db/neo4j/query/v2';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const AUTH_HEADER = `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASSWORD}`).toString('base64')}`;

const ROOT = resolve(process.cwd());
const GRAPH_DIR = join(ROOT, 'docs', 'graph');
const REPORT_PATH = join(GRAPH_DIR, 'repo-neo4j-graphrag-report.json');

async function runQuery(cypher) {
  try {
    const response = await fetch(NEO4J_HTTP, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ statement: cypher }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${await response.text()}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Generating docs/graph/repo-neo4j-graphrag-report.json from Neo4j...');
  
  const statsResult = await runQuery(`MATCH (n) WITH count(n) AS nodeCount MATCH ()-[r]->() WITH nodeCount, count(r) AS relCount RETURN nodeCount AS total_nodes, relCount AS total_relationships`);
  
  let totalNodes = 0;
  let totalRelationships = 0;
  
  if (statsResult?.data?.values?.[0]) {
    [totalNodes, totalRelationships] = statsResult.data.values[0];
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'success',
    database: NEO4J_HTTP,
    graphStats: {
      totalNodes,
      totalRelationships
    }
  };

  mkdirSync(GRAPH_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote report to ${REPORT_PATH}`);
}

main().catch(console.error);
