#!/usr/bin/env node
/**
 * project-feature-matrix-neo4j.mjs
 *
 * Stage 5 of the ACE Feature Context Matrix pipeline.
 * Projects chunk → feature → file relationships from an NDJSON file
 * into Neo4j as typed edges:
 *
 *   (:AtlasChunk {chunk_id}) -[:MENTIONS]-> (:CodebaseFile {path})
 *   (:AtlasChunk {chunk_id}) -[:HAS_FEATURE]-> (:AtlasFeature {key})
 *   (:AtlasFeature {key})   -[:REFERENCES]->  (:CodebaseFile {path})
 *
 * Designed for DAG-style traversal in ACE/KAG: given a file path,
 * Cypher can follow MENTIONS/REFERENCES edges to find which chunks
 * discuss it, and which features map to it.
 *
 * Usage:
 *   node scripts/atlas/project-feature-matrix-neo4j.mjs \
 *     --input tmp/chunks/error-context.ndjson \
 *     --dry-run
 *
 *   node scripts/atlas/project-feature-matrix-neo4j.mjs \
 *     --input tmp/chunks/error-context-rg.ndjson
 *
 * Env:
 *   NEO4J_URI      default bolt://localhost:7687
 *   NEO4J_USER     default neo4j
 *   NEO4J_PASS     default neo4j123
 */

import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv      = process.argv.slice(2);
const inputI    = argv.indexOf('--input');
const DRY_RUN   = argv.includes('--dry-run');
const VERBOSE   = argv.includes('--verbose');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;

const NEO4J_URI  = process.env.NEO4J_URI   ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER  ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS  ?? 'neo4j123';

// ── Neo4j driver (lazy import) ────────────────────────────────────────────────
let neo4jDriver = null;

async function getNeo4jDriver() {
  if (neo4jDriver) return neo4jDriver;
  let neo4j;
  try {
    neo4j = await import('neo4j-driver');
  } catch {
    throw new Error('neo4j-driver not installed — run: npm install neo4j-driver');
  }
  const driver = neo4j.default.driver(NEO4J_URI, neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASS));
  await driver.verifyConnectivity();
  neo4jDriver = driver;
  return driver;
}

// ── Cypher helpers ────────────────────────────────────────────────────────────
const MERGE_CHUNK_QUERY = `
MERGE (c:AtlasChunk {chunk_id: $chunk_id})
SET c.source_path = $source_path,
    c.source_type = $source_type,
    c.chunk_index = $chunk_index,
    c.text_snippet = $text_snippet,
    c.tags = $tags,
    c.indexed_at = $indexed_at
`;

const MERGE_FEATURE_QUERY = `
MERGE (f:AtlasFeature {key: $feature_key})
SET f.tags = $tags,
    f.source_type = $source_type
`;

const MERGE_CHUNK_FEATURE_EDGE = `
MATCH (c:AtlasChunk {chunk_id: $chunk_id})
MATCH (f:AtlasFeature {key: $feature_key})
MERGE (c)-[:HAS_FEATURE]->(f)
`;

const MERGE_CHUNK_FILE_EDGE = `
MATCH (c:AtlasChunk {chunk_id: $chunk_id})
MERGE (n:CodebaseFile {path: $file_path})
  ON CREATE SET n.path = $file_path
MERGE (c)-[:MENTIONS]->(n)
`;

const MERGE_FEATURE_FILE_EDGE = `
MATCH (f:AtlasFeature {key: $feature_key})
MERGE (n:CodebaseFile {path: $file_path})
  ON CREATE SET n.path = $file_path
MERGE (f)-[:REFERENCES]->(n)
`;

async function runQuery(session, query, params) {
  if (DRY_RUN) {
    if (VERBOSE) console.log(`  DRY> ${query.trim().split('\n')[0]} params=${JSON.stringify(params)}`);
    return;
  }
  await session.run(query, params);
}

// ── Main ─────────────────────────────────────────────────────────────────────
function deriveFeatureKey(tags, sourcePath) {
  const featureTags = (tags ?? []).filter(t => t.startsWith('feature:')).map(t => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  return path.basename(sourcePath ?? 'unknown').replace(/\.[^.]+$/, '');
}

async function main() {
  if (!INPUT_PATH) {
    console.error('[neo4j-matrix] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[neo4j-matrix] Loaded ${records.length} chunks from ${INPUT_PATH}`);
  console.log(`[neo4j-matrix] dry=${DRY_RUN}  neo4j=${NEO4J_URI}`);

  let driver  = null;
  let session = null;

  if (!DRY_RUN) {
    driver  = await getNeo4jDriver();
    session = driver.session();
  }

  let nodesCreated  = 0;
  let edgesCreated  = 0;

  try {
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const featureKey = deriveFeatureKey(rec.tags, rec.source_path);
      const allPaths = [...new Set([...(rec.file_refs ?? []), ...(rec.rg_paths ?? [])])];

      // Upsert AtlasChunk node
      await runQuery(session, MERGE_CHUNK_QUERY, {
        chunk_id:     rec.chunk_id,
        source_path:  rec.source_path ?? '',
        source_type:  rec.source_type ?? 'notes',
        chunk_index:  rec.chunk_index ?? i,
        text_snippet: (rec.text ?? '').slice(0, 200),
        tags:         rec.tags ?? [],
        indexed_at:   new Date().toISOString(),
      });
      nodesCreated++;

      // Upsert AtlasFeature node
      await runQuery(session, MERGE_FEATURE_QUERY, {
        feature_key: featureKey,
        tags:        rec.tags ?? [],
        source_type: rec.source_type ?? 'notes',
      });
      nodesCreated++;

      // Chunk → Feature edge
      await runQuery(session, MERGE_CHUNK_FEATURE_EDGE, {
        chunk_id:    rec.chunk_id,
        feature_key: featureKey,
      });
      edgesCreated++;

      // Chunk → File edges
      for (const fp of allPaths) {
        await runQuery(session, MERGE_CHUNK_FILE_EDGE, { chunk_id: rec.chunk_id, file_path: fp });
        await runQuery(session, MERGE_FEATURE_FILE_EDGE, { feature_key: featureKey, file_path: fp });
        edgesCreated += 2;
      }

      process.stdout.write(`\r[neo4j-matrix] ${i + 1}/${records.length}  nodes=${nodesCreated} edges=${edgesCreated}  `);
    }
  } finally {
    if (session) await session.close();
    if (driver)  await driver.close();
  }

  console.log(`\n[neo4j-matrix] ✅ Done  nodes=${nodesCreated} edges=${edgesCreated}${DRY_RUN ? ' (dry)' : ''}`);
  if (DRY_RUN) {
    console.log('[neo4j-matrix] Verify with: MATCH (c:AtlasChunk) RETURN count(c)');
    console.log('[neo4j-matrix] Verify with: MATCH ()-[r:HAS_FEATURE|MENTIONS|REFERENCES]->() RETURN type(r), count(r)');
  }
}

main().catch(err => {
  console.error('[neo4j-matrix]', err.message);
  process.exit(1);
});