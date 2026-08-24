/**
 * Read-only identity enrichment for the Graphify-first AST entity export.
 * No canonical entity, vector, graph, or cache writes are performed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const inputPath = path.resolve(ROOT, inputArg?.slice('--input='.length) ?? '.tmp/atlas/graphify-file-index-v1/ast-entities.jsonl');
const outputPath = path.resolve(ROOT, outputArg?.slice('--output='.length) ?? '.tmp/atlas/graphify-file-index-v1/ast-entity-identity.jsonl');

const lines = (await fs.readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean);
const candidates = lines.map((line) => JSON.parse(line)).filter((row) => row.entity_id);
const result = {
  schema: 'atlas.ast-entity-prefill-identity-receipt.v1',
  input_path: inputPath,
  output_path: outputPath,
  input_candidates: candidates.length,
  resolved: 0,
  unresolved: 0,
  status: 'BLOCKED_DEPENDENCY',
  database_writes: false,
  canonical_entity_writes: false,
  docker_fallback_attempted: false,
  rows: [],
};

function dockerIdentityLookup(sourceRefs) {
  const lookup = new Map();
  for (const sourceRef of sourceRefs) {
    const escaped = String(sourceRef).replaceAll("'", "''");
    const sql = `SELECT packet_key, source_ref, feature_id, title_id, tree_node_id FROM atlas_packets WHERE source_ref = '${escaped}' ORDER BY packet_key LIMIT 1;`;
    try {
      const output = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\\t', '-c', sql], { encoding: 'utf8', timeout: 5000 });
      const fields = output.trim().split('\t');
      if (fields.length >= 5 && fields[0]) lookup.set(sourceRef, { packet_key: fields[0], source_ref: fields[1], feature_id: fields[2] || null, title_id: fields[3] || null, tree_node_id: fields[4] || null });
    } catch { /* preserve unresolved candidate */ }
  }
  return lookup;
}

function appendResolvedRows(lookup) {
  for (const candidate of candidates) {
    const identity = lookup.get(candidate.source_ref);
    result.rows.push({ ...candidate, packet_key: identity?.packet_key ?? null, feature_id: identity?.feature_id ?? null, title_id: identity?.title_id ?? null, tree_node_id: identity?.tree_node_id ?? null, identity_status: identity?.packet_key ? 'RESOLVED_CANDIDATE' : 'UNRESOLVED_CANDIDATE', source_revision: identity?.packet_key ? 'GRAPHIFY_PACKET_ROW_REVISION_PENDING' : candidate.source_revision });
    if (identity?.packet_key) result.resolved += 1;
    else result.unresolved += 1;
  }
}

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env), connectionTimeoutMillis: 2500 });
try {
  const client = await pool.connect();
  try {
    const refs = [...new Set(candidates.map((row) => row.source_ref).filter(Boolean))];
    const lookup = new Map();
    for (let offset = 0; offset < refs.length; offset += 500) {
      const batch = refs.slice(offset, offset + 500);
      const query = await client.query(
        `SELECT packet_key, source_ref, feature_id, title_id, tree_node_id
           FROM atlas_packets
          WHERE source_ref = ANY($1::text[])
          ORDER BY packet_key`,
        [batch],
      );
      for (const row of query.rows) lookup.set(row.source_ref, row);
    }
    appendResolvedRows(lookup);
    result.status = 'READ_ONLY_COMPLETE';
  } finally {
    client.release();
  }
} catch (error) {
  result.error = String(error?.message ?? error);
  result.docker_fallback_attempted = true;
  const lookup = dockerIdentityLookup([...new Set(candidates.map((row) => row.source_ref).filter(Boolean))]);
  appendResolvedRows(lookup);
  result.status = 'READ_ONLY_DOCKER_FALLBACK';
} finally {
  await pool.end();
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, result.rows.map((row) => JSON.stringify(row)).join('\n') + (result.rows.length ? '\n' : ''), 'utf8');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
