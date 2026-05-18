#!/usr/bin/env node
/**
 * rollback-atlas-run.mjs
 *
 * Removes data persisted during a specific parent atlas or synthesis run.
 * Targets:
 *   - Redis (deletes keys with matching runId in hash)
 *   - CouchDB (finds and bulk-deletes docs matching runId)
 *   - Neo4j (deletes nodes/edges matching runId)
 *   - Qdrant (deletes point payload keys for codebase chunks and deletes custom collection points matching runId)
 *
 * Usage:
 *   node scripts/atlas/rollback-atlas-run.mjs --runId <id> [--dry-run]
 */

import dotenv from 'dotenv';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { scanKeys } from './_atlas-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const args = process.argv.slice(2);
const runId = args.find(a => a.startsWith('--runId='))?.split('=')[1] || args[args.indexOf('--runId') + 1];
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');

if (!runId) {
  console.error('Usage: node scripts/atlas/rollback-atlas-run.mjs --runId <id> [--dry-run]');
  process.exit(1);
}

console.log(`=======================================================`);
console.log(`  YoRHa Legal AI - Rollback Orchestrator [Phase 3B]     `);
console.log(`=======================================================`);
console.log(`[target] Run ID : ${runId}`);
console.log(`[mode]   Dry-Run: ${DRY_RUN}`);
console.log(`=======================================================\n`);

async function rollback() {
  const startAt = Date.now();

  // 1. Redis Rollback
  await rollbackRedis();

  // 2. Neo4j Rollback
  await rollbackNeo4j();

  // 3. Qdrant Rollback
  await rollbackQdrant();

  // 4. CouchDB Rollback
  await rollbackCouchDB();

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
  console.log(`\n=======================================================`);
  console.log(`  Rollback sweep completed in ${elapsed}s`);
  console.log(`=======================================================`);
}

async function rollbackRedis() {
  console.log('── Redis [Bifrost & Hot Cache] ──');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log(`Connecting to Redis at ${redisUrl}...`);
  
  const redis = new Redis(redisUrl);
  try {
    const patterns = [
      'wiki:note:dir:*',
      'ace:cluster:*',
      'code:llm_output:path:*',
      'summary:cluster:*',
      'engram:memory:*',
      'ace:packet:*'
    ];

    let foundKeysCount = 0;
    let deletedKeysCount = 0;
    const deletePipeline = redis.pipeline();

    for (const pattern of patterns) {
      const keys = await scanKeys(redis, pattern, 10000);
      for (const key of keys) {
        try {
          const type = await redis.type(key);
          let keyRunId = null;
          
          if (type === 'hash') {
            const hash = await redis.hgetall(key);
            keyRunId = hash.runId;
          } else if (type === 'string') {
            const val = await redis.get(key);
            if (val) {
              try {
                const parsed = JSON.parse(val);
                keyRunId = parsed.runId;
              } catch {
                if (val.includes(runId)) {
                  keyRunId = runId;
                }
              }
            }
          }

          if (keyRunId === runId) {
            foundKeysCount++;
            if (!DRY_RUN) {
              deletePipeline.del(key);
              deletedKeysCount++;
            }
          }
        } catch (keyErr) {
          console.warn(`    [warn] Failed to read key ${key}: ${keyErr.message}`);
        }
      }
    }

    if (foundKeysCount === 0) {
      console.log(`  No keys matched runId "${runId}".`);
    } else {
      if (DRY_RUN) {
        console.log(`  [dry-run] Would delete ${foundKeysCount} Redis keys.`);
      } else {
        console.log(`  Executing deletion of ${deletedKeysCount} keys in pipeline...`);
        await deletePipeline.exec();
        console.log(`  ✓ Successfully deleted ${deletedKeysCount} Redis keys.`);
      }
    }
  } catch (err) {
    console.error(`  ✕ Redis rollback failed: ${err.message}`);
  } finally {
    redis.disconnect();
  }
  console.log('');
}

async function rollbackNeo4j() {
  console.log('── Neo4j [GraphRAG Topology] ──');
  const neo4jUrl = process.env.NEO4J_URL || 'bolt://localhost:7687';
  const neo4jUser = process.env.NEO4J_USER || 'neo4j';
  const neo4jPass = process.env.NEO4J_PASS || 'deeds123';
  console.log(`Connecting to Neo4j at ${neo4jUrl}...`);

  const driver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPass));
  const session = driver.session();

  try {
    // Audit current counts matching the runId
    const nodeCountRes = await session.executeRead(tx => tx.run(`
      MATCH (n {runId: $runId}) RETURN count(n) AS count
    `, { runId }));
    const edgeCountRes = await session.executeRead(tx => tx.run(`
      MATCH ()-[r {runId: $runId}]->() RETURN count(r) AS count
    `, { runId }));

    const nodeCount = nodeCountRes.records[0].get('count').toNumber();
    const edgeCount = edgeCountRes.records[0].get('count').toNumber();

    console.log(`  Found ${nodeCount} nodes and ${edgeCount} relationships matching runId "${runId}".`);

    if (nodeCount === 0 && edgeCount === 0) {
      console.log('  No Neo4j nodes or edges to delete.');
    } else {
      if (DRY_RUN) {
        console.log(`  [dry-run] Would DETACH DELETE ${nodeCount} nodes and DELETE ${edgeCount} relationships.`);
      } else {
        console.log('  Executing Cypher delete sweep...');
        const deleteRes = await session.executeWrite(tx => tx.run(`
          MATCH (n {runId: $runId})
          DETACH DELETE n
        `, { runId }));
        
        const deleteEdgesRes = await session.executeWrite(tx => tx.run(`
          MATCH ()-[r {runId: $runId}]->()
          DELETE r
        `, { runId }));

        console.log(`  ✓ Successfully deleted matched elements.`);
      }
    }
  } catch (err) {
    console.error(`  ✕ Neo4j rollback failed: ${err.message}`);
  } finally {
    await session.close();
    await driver.close();
  }
  console.log('');
}

async function rollbackQdrant() {
  console.log('── Qdrant [Vector Memory & Payloads] ──');
  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const collections = ['codebase_chunks_768', 'codebase_chunks_64d'];
  console.log(`Connecting to Qdrant at ${qdrantUrl}...`);

  const payloadKeysToClear = [
    'runId', 'pagerank', 'gpu_cluster', 'cluster_alias', 'som_cluster',
    'manifold4', 'activity_w', 'workspace', 'repo', 'path', 'language',
    'kind', 'feature_key', 'route_refs', 'env_keys'
  ];

  try {
    for (const collection of collections) {
      console.log(`  Checking collection: [${collection}]`);
      
      const filter = {
        must: [
          { key: 'runId', match: { value: runId } }
        ]
      };

      // Count matching points
      const scrollRes = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter,
          limit: 1,
          with_payload: false
        })
      });

      if (!scrollRes.ok) {
        console.log(`    Collection [${collection}] scroll failed or collection does not exist.`);
        continue;
      }

      // We scroll to get point IDs
      let pointsToPatch = [];
      let cursor = null;
      let hasMore = true;

      while (hasMore) {
        const batchRes = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter,
            limit: 1000,
            offset: cursor,
            with_payload: false
          })
        });

        if (!batchRes.ok) break;
        const batchData = await batchRes.json();
        const pts = batchData.result?.points ?? [];
        if (pts.length === 0) break;

        pointsToPatch.push(...pts.map(p => p.id));
        cursor = batchData.result?.next_page_offset ?? null;
        if (!cursor) hasMore = false;
      }

      console.log(`    Found ${pointsToPatch.length} points with patched payloads.`);

      if (pointsToPatch.length > 0) {
        if (DRY_RUN) {
          console.log(`    [dry-run] Would delete payload keys [${payloadKeysToClear.join(', ')}] on ${pointsToPatch.length} points.`);
        } else {
          console.log(`    Rolling back payloads on ${pointsToPatch.length} points...`);
          // POST /collections/{collection_name}/points/payload/delete
          const deletePayloadRes = await fetch(`${qdrantUrl}/collections/${collection}/points/payload/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keys: payloadKeysToClear,
              points: pointsToPatch
            })
          });

          if (deletePayloadRes.ok) {
            console.log(`    ✓ Successfully cleared payload attributes.`);
          } else {
            console.error(`    ✕ Failed to clear payloads:`, await deletePayloadRes.text());
          }
        }
      }
    }
  } catch (err) {
    console.error(`  ✕ Qdrant rollback failed: ${err.message}`);
  }
  console.log('');
}

async function rollbackCouchDB() {
  console.log('── CouchDB [MapReduce Cards] ──');
  const rawUrl = process.env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';
  const urlMatch = rawUrl.match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
  const [, COUCH_USER, COUCH_PASS, COUCH_HOST] = urlMatch ?? ['', 'admin', 'deeds123', 'localhost:5984'];
  const BASE = `http://${COUCH_HOST}`;
  const AUTH = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
  console.log(`Connecting to CouchDB at ${BASE}...`);

  try {
    // mango search docs with runId
    const queryRes = await fetch(`${BASE}/wiki_cards/_find`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: { runId },
        fields: ['_id', '_rev'],
        limit: 10000
      })
    });

    if (!queryRes.ok) {
      console.log('  Failed to query CouchDB (or database "wiki_cards" does not exist yet).');
      return;
    }

    const queryData = await queryRes.json();
    const docs = queryData.docs ?? [];
    console.log(`  Found ${docs.length} CouchDB documents matching runId "${runId}".`);

    if (docs.length === 0) {
      console.log('  No CouchDB documents to delete.');
    } else {
      if (DRY_RUN) {
        console.log(`  [dry-run] Would delete ${docs.length} CouchDB documents.`);
      } else {
        console.log(`  Bulk-deleting ${docs.length} documents...`);
        const deleteDocs = docs.map(d => ({ ...d, _deleted: true }));
        
        const bulkRes = await fetch(`${BASE}/wiki_cards/_bulk_docs`, {
          method: 'POST',
          headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
          body: JSON.stringify({ docs: deleteDocs })
        });

        if (bulkRes.ok) {
          console.log(`  ✓ Successfully deleted ${docs.length} CouchDB documents.`);
        } else {
          console.error(`  ✕ CouchDB bulk delete failed:`, await bulkRes.text());
        }
      }
    }
  } catch (err) {
    console.error(`  ✕ CouchDB rollback failed: ${err.message}`);
  }
  console.log('');
}

rollback().catch(console.error);
