#!/usr/bin/env node
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTaxonomyForestV1 } from './taxonomy-forest-invariants-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(REPO_ROOT, 'docs/reports/taxonomy-forest-invariants-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, connectionTimeoutMillis: 5000, application_name: 'atlas-taxonomy-forest-invariants-v1-readonly' });
let client;

try {
  client = await pool.connect();
  await client.query('BEGIN READ ONLY');
  const nodeResult = await client.query('SELECT node_key, parent_key FROM taxonomy_nodes ORDER BY node_key');
  const edgeResult = await client.query('SELECT relation, source_key, target_key FROM taxonomy_edges ORDER BY relation, target_key, source_key');
  const invariants = evaluateTaxonomyForestV1(nodeResult.rows, edgeResult.rows);
  await client.query('ROLLBACK');

  const report = {
    schema: 'atlas.taxonomy-forest-invariants.v1',
    generatedAt: new Date().toISOString(),
    status: invariants.isBranchingForest ? 'PROVEN' : 'INVARIANT_VIOLATION',
    source: { database: 'legal_ai_db', relations: ['taxonomy_nodes', 'taxonomy_edges'], transaction: 'READ ONLY; rolled back' },
    contract: {
      parentKeyRelation: 'BRANCHING_FOREST',
      typedRelations: 'DIRECTED_ACYCLIC_GRAPH; multiple parents are measured and reported, not rejected as a forest violation',
      rationale: 'taxonomy_nodes.parent_key encodes one parent per node; taxonomy_edges encode typed semantic relations and measured multi-parent targets',
      canonicalAuthority: false,
    },
    invariants,
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 },
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!invariants.isBranchingForest) process.exitCode = 2;
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
