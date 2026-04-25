#!/usr/bin/env node

/**
 * Phase 72 Topology Vectorization
 *
 * Complete pipeline:
 * 1. Get errors from Go ingest service
 * 2. Check Redis cache for existing vectors
 * 3. Embed missing errors with embeddinggemma:latest (Ollama)
 * 4. Store in Redis cache
 * 5. Persist to Postgres + pgvector
 * 6. Upsert to Qdrant for topology search
 *
 * This is the "Phase 72 → Phase 78 Topology Brain"
 */

import crypto from 'node:crypto'
import { Pool } from 'pg'
import fetch from 'node-fetch'

import { embedTexts } from '../src/lib/services/ollama-embeddings.ts'
import {
  getCachedErrorVector,
  cacheErrorVector,
  initRedis,
  closeRedis
} from './phase72-redis-cache.mjs'
import {
  upsertErrorVectors,
  ensureErrorsCollection,
  initQdrant
} from './phase72-qdrant-topology.mjs'

const GO_INGEST_URL = process.env.GO_INGEST_URL ?? 'http://127.0.0.1:8089'
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'

function log(msg) {
  console.log(`[phase72-topology] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Make stable error hash
 */
function makeErrorHash(error) {
  return crypto
    .createHash('sha1')
    .update(`${error.file}:${error.line}:${error.column}:${error.code}:${error.message}`)
    .digest('hex')
}

/**
 * Get errors from Go ingest service
 */
async function getErrorsFromGo() {
  log('Fetching errors from Go ingest service...')

  const res = await fetch(`${GO_INGEST_URL}/phase72/parse`, {
    method: 'POST'
  })

  if (!res.ok) {
    throw new Error(`Go ingest service error: ${res.status} ${await res.text()}`)
  }

  const json = await res.json()
  return json.errors ?? []
}

/**
 * Main vectorization pipeline
 */
export async function runPhase72Topology(cycle = 1) {
  const startTime = Date.now()
  const pg = new Pool({ connectionString: DATABASE_URL })

  try {
    // 1. Get errors from Go ingest service
    const errors = await getErrorsFromGo()
    log(`Got ${errors.length} errors from ingest service`)

    if (errors.length === 0) {
      log('No errors to process')
      return { errors: 0, vectors: 0, cached: 0, new: 0, duration: 0 }
    }

    // 2. Check Redis cache and identify missing vectors
    log('Checking Redis cache...')
    const toEmbed = []
    const cached = []
    let cacheHits = 0

    for (const error of errors) {
      const hash = makeErrorHash(error)
      const cachedVec = await getCachedErrorVector(hash)

      if (cachedVec) {
        cached.push({ error, hash, vector: cachedVec })
        cacheHits++
      } else {
        toEmbed.push({ error, hash })
      }
    }

    log(`Cache hits: ${cacheHits}/${errors.length} (${((cacheHits / errors.length) * 100).toFixed(1)}%)`)

    // 3. Embed missing errors with embeddinggemma:latest
    let newVectors = []
    if (toEmbed.length > 0) {
      log(`Embedding ${toEmbed.length} new errors with embeddinggemma:latest...`)
      const texts = toEmbed.map((e) => `${e.error.code}: ${e.error.message}`)
      newVectors = await embedTexts(texts)
      log(`Embedded ${newVectors.length} errors`)
    }

    // 4. Combine cached + new vectors
    const allVectors = []
    let newIdx = 0

    for (const entry of cached) {
      allVectors.push({
        id: entry.hash,
        hash: entry.hash,
        file: entry.error.file,
        line: entry.error.line,
        column: entry.error.column,
        code: entry.error.code,
        severity: entry.error.severity,
        message: entry.error.message,
        vector: entry.vector,
        phase: 72,
        cycle
      })
    }

    for (const entry of toEmbed) {
      const vec = newVectors[newIdx++]
      allVectors.push({
        id: entry.hash,
        hash: entry.hash,
        file: entry.error.file,
        line: entry.error.line,
        column: entry.error.column,
        code: entry.error.code,
        severity: entry.error.severity,
        message: entry.error.message,
        vector: vec,
        phase: 72,
        cycle
      })

      // Cache the new vector
      await cacheErrorVector(entry.hash, vec)
    }

    log(`Total vectors: ${allVectors.length}`)

    // 5. Persist to Postgres + pgvector
    log('Persisting to Postgres + pgvector...')
    const client = await pg.connect()

    try {
      await client.query('BEGIN')

      for (const entry of allVectors) {
        // Insert error
        const errRes = await client.query(
          `
          INSERT INTO phase72_error (id, error_hash, file_path, line, column, code, severity, message, phase, cycle)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (error_hash) DO UPDATE
          SET cycle = EXCLUDED.cycle, updated_at = now()
          RETURNING id
          `,
          [
            entry.hash,
            entry.file,
            entry.line,
            entry.column,
            entry.code,
            entry.severity,
            entry.message,
            entry.phase,
            entry.cycle
          ]
        )

        const errorId = errRes.rows[0].id

        // Insert vector
        await client.query(
          `
          INSERT INTO phase72_error_vector (error_id, model, embedding)
          VALUES ($1, $2, $3)
          ON CONFLICT (error_id) DO UPDATE
          SET model = EXCLUDED.model, embedding = EXCLUDED.embedding
          `,
          [errorId, 'embeddinggemma:latest', JSON.stringify(entry.vector)]
        )
      }

      await client.query('COMMIT')
      log(`Persisted ${allVectors.length} errors to Postgres`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // 6. Upsert to Qdrant for topology search
    log('Upserting to Qdrant...')
    await ensureErrorsCollection()
    await upsertErrorVectors(allVectors)

    const duration = Date.now() - startTime
    log(`✓ Phase 72 Topology complete in ${duration}ms`)

    return {
      errors: errors.length,
      vectors: allVectors.length,
      cached: cacheHits,
      new: toEmbed.length,
      duration
    }
  } catch (err) {
    console.error(`[phase72-topology] FATAL: ${err.message}`)
    throw err
  } finally {
    await pg.end()
    await closeRedis()
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const cycle = parseInt(process.argv[2] ?? '1')
    const result = await runPhase72Topology(cycle)
    console.log('\n✅ Phase 72 Topology Vectorization Complete')
    console.log(`   Errors: ${result.errors}`)
    console.log(`   Vectors: ${result.vectors}`)
    console.log(`   Cached: ${result.cached}`)
    console.log(`   New: ${result.new}`)
    console.log(`   Duration: ${result.duration}ms`)
    process.exitCode = 0
  } catch (err) {
    console.error('Error:', err)
    process.exitCode = 1
  }
}

export default { runPhase72Topology }
