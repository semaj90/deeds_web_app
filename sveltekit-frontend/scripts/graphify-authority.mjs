#!/usr/bin/env node
/**
 * graphify-authority.mjs
 * 
 * Computes PageRank across the Neo4j graph, writes the scores back to Neo4j,
 * mirrors them to Redis, and patches Qdrant payloads.
 */

import neo4jPkg from 'neo4j-driver';
import { Redis } from 'ioredis';
import fetch from 'node-fetch';

const REDIS_URL      = process.env.REDIS_URL       ?? 'redis://127.0.0.1:6379';
const NEO4J_URI      = process.env.NEO4J_URI       ?? 'bolt://localhost:7687';
const NEO4J_USER     = process.env.NEO4J_USER      ?? 'neo4j';
const NEO4J_PASS     = process.env.NEO4J_PASSWORD  ?? 'neo4j123';
const QDRANT_URL     = process.env.QDRANT_URL      ?? 'http://127.0.0.1:6333';
const COLLECTION     = 'codebase_chunks_768';

const driver = neo4jPkg.driver(NEO4J_URI, neo4jPkg.auth.basic(NEO4J_USER, NEO4J_PASS));

async function main() {
  console.log('=== Graph Authority (PageRank) Pipeline ===');
  
  const session = driver.session();
  try {
    // 1. Project graph
    console.log('[neo4j] Projecting graph for GDS...');
    
    // Drop existing graph if it exists
    await session.run(`
      CALL gds.graph.exists('codebaseGraph') YIELD exists
      WITH exists WHERE exists
      CALL gds.graph.drop('codebaseGraph') YIELD graphName
      RETURN graphName
    `);

    await session.run(`
      CALL gds.graph.project(
        'codebaseGraph',
        ['CodebaseFile', 'SOMCluster'],
        {
          BELONGS_TO_CLUSTER: {
            orientation: 'UNDIRECTED'
          }
        }
      )
    `);
    
    // 2. Run PageRank and write back
    console.log('[neo4j] Running PageRank...');
    const prResult = await session.run(`
      CALL gds.pageRank.write('codebaseGraph', {
        maxIterations: 20,
        dampingFactor: 0.85,
        writeProperty: 'pagerank'
      })
      YIELD nodePropertiesWritten, ranIterations
      RETURN nodePropertiesWritten, ranIterations
    `);
    
    const written = prResult.records[0].get('nodePropertiesWritten').toNumber();
    console.log(`[neo4j] Wrote ${written} pagerank properties (iterations: ${prResult.records[0].get('ranIterations').toNumber()})`);
    
    // 3. Export top scores
    console.log('[neo4j] Exporting scores...');
    const scoresResult = await session.run(`
      MATCH (n)
      WHERE n.pagerank IS NOT NULL
      RETURN labels(n) AS labels, n.id AS id, n.filePath AS filePath, n.pagerank AS pagerank
      ORDER BY n.pagerank DESC
    `);
    
    const redis = new Redis(REDIS_URL, { lazyConnect: true });
    await redis.connect();
    
    const scoreMap = new Map();
    let redisCount = 0;
    
    const redisPipe = redis.pipeline();
    
    for (const record of scoresResult.records) {
      const labels = record.get('labels');
      const pr = record.get('pagerank');
      
      if (labels.includes('CodebaseFile')) {
        const fp = record.get('filePath');
        if (fp) {
          redisPipe.set(`graph:pagerank:file:${fp}`, pr.toString());
          scoreMap.set(fp, pr);
          redisCount++;
        }
      } else if (labels.includes('SOMCluster')) {
        const cid = record.get('id');
        if (cid !== null && cid !== undefined) {
          redisPipe.set(`graph:pagerank:cluster:${cid}`, pr.toString());
          redisCount++;
        }
      }
    }
    
    await redisPipe.exec();
    console.log(`[redis] Updated ${redisCount} graph:pagerank:* keys`);
    await redis.quit();

    // 4. Update Qdrant
    console.log(`[qdrant] Patching Qdrant payloads...`);
    let offset = undefined;
    const BATCH = 100;
    let mirrored = 0;
    
    while (true) {
      const scrollBody = JSON.stringify({
        limit: BATCH,
        with_payload: ['stable_key', 'relativePath', 'file_path'],
        with_vector: false,
        ...(offset != null ? { offset } : {}),
      });

      const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: scrollBody
      }).catch(() => null);

      if (!scrollRes?.ok) break;

      const data = await scrollRes.json();
      const pts = data.result?.points ?? [];
      if (pts.length === 0) break;

      for (const pt of pts) {
        const rawKey = pt.payload?.stable_key ?? pt.payload?.relativePath ?? pt.payload?.file_path;
        if (!rawKey) continue;
        const sk = rawKey.replace(/^src\//, '');
        
        let filePr = scoreMap.get(sk) || scoreMap.get(rawKey) || scoreMap.get('src/' + sk);
        
        if (filePr !== undefined) {
          await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              payload: { 
                pagerank: filePr,
                authority_score: filePr,
                graph_centrality_version: "gds-pagerank-v1"
              }, 
              points: [pt.id] 
            }),
          }).catch(() => {});
          mirrored++;
        }
      }

      offset = data.result?.next_page_offset ?? null;
      if (!offset || pts.length < BATCH) break;
    }
    
    console.log(`[qdrant] Patched ${mirrored} payloads with pagerank`);

    // Clean up projected graph
    await session.run(`CALL gds.graph.drop('codebaseGraph')`);
    
    console.log('=== Done ===');
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
