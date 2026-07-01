#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { loadRepoEnv } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'graph-density-check.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'graph-density-check.md');

const env = loadRepoEnv(process.env);
const uri = env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const user = env.NEO4J_USER || 'neo4j';
const password = env.NEO4J_PASSWORD || 'password';

function asNumber(value) {
  if (typeof value?.toNumber === 'function') return value.toNumber();
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    status: 'FAIL',
    neo4j: { uri },
    counts: {},
    density: {},
    error: null,
  };

  let driver;
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (n)
        WITH count(n) AS nodes
        OPTIONAL MATCH ()-[r]->()
        WITH nodes, count(r) AS relationships
        OPTIONAL MATCH (p:Packet)
        WITH nodes, relationships, count(p) AS packets
        OPTIONAL MATCH (f:Feature)
        WITH nodes, relationships, packets, count(f) AS features
        OPTIONAL MATCH (c:Chrom97Context)
        RETURN nodes, relationships, packets, features, count(c) AS chrom97_contexts
      `);
      const row = result.records[0];
      const nodes = asNumber(row.get('nodes'));
      const relationships = asNumber(row.get('relationships'));
      const maxDirected = nodes > 1 ? nodes * (nodes - 1) : 0;
      report.counts = {
        nodes,
        relationships,
        packets: asNumber(row.get('packets')),
        features: asNumber(row.get('features')),
        chrom97_contexts: asNumber(row.get('chrom97_contexts')),
      };
      report.density = {
        directed_density: maxDirected > 0 ? Number((relationships / maxDirected).toFixed(8)) : 0,
        avg_relationships_per_node: nodes > 0 ? Number((relationships / nodes).toFixed(4)) : 0,
      };
      report.status = nodes > 0 ? 'PASS' : 'WARN';
    } finally {
      await session.close();
    }
  } catch (error) {
    report.status = 'WARN';
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (driver) await driver.close();
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Graph Density Check',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.status}`,
      `Neo4j: ${uri}`,
      '',
      `- nodes: ${report.counts.nodes ?? 0}`,
      `- relationships: ${report.counts.relationships ?? 0}`,
      `- packets: ${report.counts.packets ?? 0}`,
      `- features: ${report.counts.features ?? 0}`,
      `- chrom97 contexts: ${report.counts.chrom97_contexts ?? 0}`,
      `- avg relationships/node: ${report.density.avg_relationships_per_node ?? 0}`,
      '',
      report.error ? `Error: ${report.error}` : 'No Neo4j error reported.',
    ].join('\n'),
    'utf8',
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'FAIL') process.exitCode = 1;
}

main();
