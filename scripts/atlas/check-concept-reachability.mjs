#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { loadRepoEnv } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'concept-reachability-check.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'concept-reachability-check.md');

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
    samples: [],
    error: null,
  };

  let driver;
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session = driver.session();
    try {
      const counts = await session.run(`
        OPTIONAL MATCH (p:Packet)
        WITH count(p) AS packets
        OPTIONAL MATCH (f:Feature)
        WITH packets, count(f) AS features
        OPTIONAL MATCH (c:Concept)
        WITH packets, features, count(c) AS concepts
        OPTIONAL MATCH (:Packet)-[r]->(:Feature)
        WITH packets, features, concepts, count(r) AS packet_feature_edges
        OPTIONAL MATCH (:Packet)-[u:USED_CONCEPT]->(:Concept)
        RETURN packets, features, concepts, packet_feature_edges, count(u) AS used_concept_edges
      `);
      const row = counts.records[0];
      report.counts = {
        packets: asNumber(row.get('packets')),
        features: asNumber(row.get('features')),
        concepts: asNumber(row.get('concepts')),
        packet_feature_edges: asNumber(row.get('packet_feature_edges')),
        used_concept_edges: asNumber(row.get('used_concept_edges')),
      };

      const samples = await session.run(`
        MATCH (n)
        WHERE n.packet_key IS NOT NULL OR n.feature_id IS NOT NULL OR n.name IS NOT NULL
        RETURN labels(n) AS labels,
               coalesce(n.packet_key, n.feature_id, n.name) AS id
        LIMIT 10
      `);
      report.samples = samples.records.map((record) => ({
        labels: record.get('labels'),
        id: record.get('id'),
      }));
      report.status = report.counts.packet_feature_edges > 0 || report.counts.used_concept_edges > 0 ? 'PASS' : 'WARN';
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
      '# Concept Reachability Check',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.status}`,
      `Neo4j: ${uri}`,
      '',
      `- packets: ${report.counts.packets ?? 0}`,
      `- features: ${report.counts.features ?? 0}`,
      `- concepts: ${report.counts.concepts ?? 0}`,
      `- packet-feature edges: ${report.counts.packet_feature_edges ?? 0}`,
      `- used-concept edges: ${report.counts.used_concept_edges ?? 0}`,
      '',
      report.error ? `Error: ${report.error}` : 'No Neo4j error reported.',
    ].join('\n'),
    'utf8',
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'FAIL') process.exitCode = 1;
}

main();
