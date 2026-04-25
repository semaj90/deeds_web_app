#!/usr/bin/env node

/**
 * Phase 72.5: Topology Store
 *
 * Persists errors into Redis + Postgres + Qdrant
 * Called from phase72-fast-scanner.mjs after ripgrep scan
 *
 * Flow:
 * 1. Compute error_hash (SHA1)
 * 2. Check Redis cache
 * 3. Embed missing errors with embeddinggemma:latest
 * 4. Store in Redis (30-day TTL)
 * 5. Persist to Postgres (phase72_error + phase72_error_vector)
 * 6. Upsert to Qdrant (phase72_errors collection)
 */

import crypto from 'node:crypto'
import Redis from 'ioredis'
import { Pool } from 'pg'
import fetch from 'node-fetch'
import { QdrantClient } from '@qdrant/js-client-rest'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const DATABASE_URL = process.env.DATABASE_URL
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434'

const redis = new Redis(REDIS_URL)
const pg = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null
const qdrant = new QdrantClient({ url: QDRANT_URL })

function log(msg) {
  console.log(`[phase72-topology] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Compute stable error hash
 */
function makeErrorHash(error) {
  return crypto
    .createHash('sha1')
    .update(`${error.file}:${error.line}:${error.column}:${error.code}:${error.message}`)
    .digest('hex')
}

/**
 * Ensure Qdrant collection exists
 */
async function ensureQdrantCollections() {
  try {
    await qdrant.getCollection('phase72_errors')
  } catch (err) {
    if (err.status === 404) {
      log('Creating phase72_errors collection in Qdrant...')
      await qdrant.createCollection('phase72_errors', {
        vectors: { size: 768, distance: 'Cosine' }
      })
    } else {
      throw err
    }
  }
}

/**
 * Embed texts with embeddinggemma:latest via Ollama
 */
async function embedTextsWithGemma(texts) {
  const out = []

  for (const text of texts) {
    const res = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      })
    })

    if (!res.ok) {
      throw new Error(`Ollama embeddings error: ${res.status} ${await res.text()}`)
    }

    const json = await res.json()
    out.push(json.embedding)
  }

  return out
}

/**
 * Persist errors into Redis + Postgres + Qdrant
 *
 * @param {Array<{file:string, line:number, column:number, code:string, severity?:string, message:string}>} errors
 * @param {number} cycle - auto-iterate cycle (1, 2, 3, etc.)
 */
export async function storePhase72ErrorsTopology(errors, cycle = 1) {
  if (!errors || errors.length === 0) {
    log('No errors to persist')
    return { stored: 0, cached: 0, new: 0 }
  }

  if (!DATABASE_URL) {
    log('WARNING: DATABASE_URL not set; skipping Postgres persistence')
  }

  await ensureQdrantCollections()

  const records = []
  const toEmbed = []
  let cacheHits = 0

  // 1. Check Redis cache for existing vectors
  log(`Checking Redis cache for ${errors.length} errors...`)
  for (const error of errors) {
    const hash = makeErrorHash(error)
    const cached = await redis.get(`phase72:vec:error:${hash}`)

    if (cached) {
      records.push({
        error,
        hash,
        vector: JSON.parse(cached)
      })
      cacheHits++
    } else {
      toEmbed.push({ error, hash })
    }
  }

  log(`Cache hits: ${cacheHits}/${errors.length}`)

  // 2. Embed missing errors
  if (toEmbed.length > 0) {
    log(`Embedding ${toEmbed.length} new errors with embeddinggemma:latest...`)
    const texts = toEmbed.map(({ error }) => `${error.code}: ${error.message}`)
    const vectors = await embedTextsWithGemma(texts)

    for (let i = 0; i < toEmbed.length; i++) {
      const { error, hash } = toEmbed[i]
      const vec = vectors[i]

      // Cache in Redis (30 days)
      await redis.setex(`phase72:vec:error:${hash}`, 60 * 60 * 24 * 30, JSON.stringify(vec))

      records.push({ error, hash, vector: vec })
    }

    log(`Embedded ${toEmbed.length} errors`)
  }

  // 3. Persist to Postgres + Qdrant
  const qdrantPoints = []
  let client = null

  try {
    if (pg) {
      client = await pg.connect()
      await client.query('BEGIN')
    }

    for (const { error, hash, vector } of records) {
      let errorId = null

      if (client) {
        const res = await client.query(
          `
          INSERT INTO phase72_error (error_hash, file_path, line, column, code, severity, message, phase, cycle)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 72, $8)
          ON CONFLICT (error_hash) DO UPDATE
          SET cycle = EXCLUDED.cycle, updated_at = now()
          RETURNING id
          `,
          [
            hash,
            error.file,
            error.line,
            error.column,
            error.code,
            error.severity ?? 'error',
            error.message,
            cycle
          ]
        )

        errorId = res.rows[0].id

        // Insert vector
        await client.query(
          `
          INSERT INTO phase72_error_vector (error_id, model, embedding)
          VALUES ($1, $2, $3)
          ON CONFLICT (error_id) DO UPDATE
          SET model = EXCLUDED.model, embedding = EXCLUDED.embedding
          `,
          [errorId, 'embeddinggemma:latest', vector]
        )
      }

      // Prepare Qdrant point
      qdrantPoints.push({
        id: hash,
        vector,
        payload: {
          error_id: errorId,
          error_hash: hash,
          file_path: error.file,
          line: error.line,
          column: error.column,
          code: error.code,
          severity: error.severity ?? 'error',
          message: error.message,
          phase: 72,
          cycle,
          created_at: new Date().toISOString()
        }
      })
    }

    if (client) {
      await client.query('COMMIT')
      log(`Persisted ${records.length} errors to Postgres`)
    }

    // Upsert to Qdrant
    if (qdrantPoints.length > 0) {
      await qdrant.upsert('phase72_errors', {
        wait: false,
        points: qdrantPoints
      })
      log(`Upserted ${qdrantPoints.length} errors to Qdrant`)
    }
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK')
    }
    log(`ERROR: ${err.message}`)
    throw err
  } finally {
    if (client) {
      client.release()
    }
  }

  log(`✓ Topology store complete: ${records.length} errors (${cacheHits} cached, ${toEmbed.length} new)`)

  return {
    stored: records.length,
    cached: cacheHits,
    new: toEmbed.length
  }
}

/**
 * Get topology statistics
 */
export async function getTopologyStats() {
  try {
    const dbsize = await redis.dbsize()
    const info = await redis.info('stats')

    return {
      redis: {
        dbsize,
        info: info.split('\n').slice(0, 5).join('\n')
      }
    }
  } catch (err) {
    log(`Error getting stats: ${err.message}`)
    return { redis: { dbsize: 0 } }
  }
}

/**
 * Clear all Phase 72 cache
 */
export async function clearPhase72Cache() {
  try {
    const keys = await redis.keys('phase72:*')
    if (keys.length > 0) {
      await redis.del(...keys)
      log(`Cleared ${keys.length} cache keys`)
    }
  } catch (err) {
    log(`Error clearing cache: ${err.message}`)
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2]

  if (cmd === 'stats') {
    const stats = await getTopologyStats()
    console.log('Phase 72 Topology Stats:')
    console.log(JSON.stringify(stats, null, 2))
  } else if (cmd === 'clear') {
    await clearPhase72Cache()
  } else {
    console.log('Usage: node phase72-topology-store.mjs [stats|clear]')
  }

  process.exit(0)
}

export default {
  storePhase72ErrorsTopology,
  getTopologyStats,
  clearPhase72Cache
}
