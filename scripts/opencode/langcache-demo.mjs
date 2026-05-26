#!/usr/bin/env node
/*
 Simple langcache demo:
 1) Check Redis for cached key `veccache:{hash}`
 2) On miss, query Qdrant for nearest points and store result in Redis with TTL
 3) Print results

 Usage:
  REDIS_URL=redis://localhost:6379 QDRANT_URL=http://localhost:6333 node scripts/opencode/langcache-demo.mjs
*/

import Redis from 'ioredis'
import crypto from 'crypto'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const QDRANT = process.env.QDRANT_URL || 'http://localhost:6333'
const COLLECTION = process.env.QDRANT_COLLECTION || 'demo_docs'

const redis = new Redis(REDIS_URL)

function hashVec(vec){
  return crypto.createHash('sha1').update(JSON.stringify(vec)).digest('hex')
}

async function queryQdrant(vec){
  const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/search`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ vector: vec, limit: 3 })
  })
  return res.json()
}

async function run(){
  // Example query vector (4d)
  const queryVec = [0.15,0.15,0.35,0.45]
  const key = `veccache:${hashVec(queryVec)}`
  const cached = await redis.get(key)
  if (cached) {
    console.log('L1 cache hit:', JSON.parse(cached))
    process.exit(0)
  }

  console.log('L1 miss, querying Qdrant...')
  const qres = await queryQdrant(queryVec)
  const hits = qres.result || qres.points || qres // adapt to qdrant responses
  await redis.set(key, JSON.stringify(hits), 'EX', 3600)
  console.log('Cached L2 results to Redis and returning:', hits)
  await redis.quit()
}

run().catch(e=>{ console.error(e); process.exit(1) })
