#!/usr/bin/env node

/**
 * Phase 72 Topology Manager
 * Integrates Postgres + pgvector + Qdrant + Redis + embeddinggemma
 *
 * This is the "brain" that stores error topology as a knowledge graph
 */

import crypto from 'crypto'
import pg from 'pg'
import embeddinggemma from './embeddinggemma-client.mjs'
import { Phase72Cache } from './phase72-redis-cache.mjs'
import qdrant from './qdrant-topology.mjs'

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:123456@localhost:5432/legal_ai_db'

/**
 * Create error hash (sha256 of file:line:col:code:msg)
 */
export function makeErrorHash(error) {
  const key = `${error.file || error.file_path}:${error.line}:${error.column}:${error.code}:${error.message}`
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Phase 72 Topology Manager Class
 */
export class TopologyManager {
  constructor(options = {}) {
    this.pool = new Pool({ connectionString: DATABASE_URL })
    this.cache = new Phase72Cache()
    this.cacheConnected = false
    this.vectorDim = options.vectorDim || 768
  }

  /**
   * Initialize connections
   */
  async connect() {
    // Test Postgres connection
    const client = await this.pool.connect()
    await client.query('SELECT 1')
    client.release()
    console.log('[topology] Connected to Postgres')

    // Connect to Redis cache
    try {
      await this.cache.connect()
      this.cacheConnected = true
      console.log('[topology] Connected to Redis cache')
    } catch (err) {
      console.warn('[topology] Redis unavailable, continuing without cache:', err.message)
    }

    // Ensure Qdrant collections exist
    await qdrant.ensureCollections(this.vectorDim)
    console.log('[topology] Qdrant collections ready')
  }

  /**
   * Disconnect all services
   */
  async disconnect() {
    await this.pool.end()
    if (this.cacheConnected) {
      await this.cache.disconnect()
    }
  }

  /**
   * Ingest errors with embeddings
   * Main entry point for Phase 72 error processing
   */
  async ingestErrors(errors, options = {}) {
    const { phase = 72, cycle = 1, skipCache = false } = options

    console.log(`[topology] Ingesting ${errors.length} errors (phase ${phase}, cycle ${cycle})`)

    // Step 1: Add error hashes
    const errorsWithHashes = errors.map(e => ({
      ...e,
      error_hash: makeErrorHash(e)
    }))

    // Step 2: Check cache for existing embeddings
    let cacheHits = 0
    let cacheMisses = []

    if (!skipCache && this.cacheConnected) {
      console.log('[topology] Checking Redis cache for embeddings...')
      const cached = await this.cache.getEmbeddingsBatch(errorsWithHashes)

      for (const result of cached) {
        if (result.cached && result.vector) {
          result.error.embedding = result.vector
          cacheHits++
        } else {
          cacheMisses.push(result.error)
        }
      }

      console.log(`[topology] Cache: ${cacheHits} hits, ${cacheMisses.length} misses`)
    } else {
      cacheMisses = errorsWithHashes
    }

    // Step 3: Generate embeddings for cache misses
    let newEmbeddings = []
    if (cacheMisses.length > 0) {
      console.log(`[topology] Generating ${cacheMisses.length} embeddings via embeddinggemma...`)
      newEmbeddings = await embeddinggemma.embedErrors(cacheMisses, { progress: true })

      // Cache new embeddings
      if (this.cacheConnected) {
        for (let i = 0; i < cacheMisses.length; i++) {
          if (newEmbeddings[i]) {
            cacheMisses[i].embedding = newEmbeddings[i]
            await this.cache.setEmbedding(cacheMisses[i], newEmbeddings[i])
          }
        }
      }
    }

    // Step 4: Persist to Postgres + Qdrant
    const allErrors = errorsWithHashes.map(e => ({
      ...e,
      embedding: e.embedding || null
    }))

    await this._persistErrors(allErrors, phase, cycle)

    console.log(`[topology] Ingestion complete: ${errors.length} errors stored`)

    return {
      total: errors.length,
      cache_hits: cacheHits,
      new_embeddings: newEmbeddings.length,
      stored: errors.length
    }
  }

  /**
   * Internal: Persist errors to Postgres + Qdrant
   */
  async _persistErrors(errors, phase, cycle) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const qdrantPoints = []

      for (const error of errors) {
        if (!error.embedding) {
          console.warn(`[topology] Skipping error without embedding: ${error.error_hash}`)
          continue
        }

        // Insert/update error in Postgres
        const errorResult = await client.query(
          `INSERT INTO phase72_error (
            id, error_hash, file_path, line, column, code, severity, message, phase, cycle
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
          ON CONFLICT (error_hash) DO UPDATE SET
            cycle = EXCLUDED.cycle,
            updated_at = now()
          RETURNING id`,
          [
            error.error_hash,
            error.file_path || error.file,
            error.line,
            error.column,
            error.code,
            error.severity || 'error',
            error.message,
            phase,
            cycle
          ]
        )

        const errorId = errorResult.rows[0].id

        // Insert/update embedding in Postgres
        await client.query(
          `INSERT INTO phase72_error_vector (error_id, model, embedding)
          VALUES ($1, $2, $3)
          ON CONFLICT (error_id) DO UPDATE SET
            model = EXCLUDED.model,
            embedding = EXCLUDED.embedding`,
          [errorId, 'embeddinggemma:latest', error.embedding]
        )

        // Prepare Qdrant point
        qdrantPoints.push({
          id: error.error_hash,
          vector: error.embedding,
          payload: {
            error_id: errorId,
            error_hash: error.error_hash,
            file_path: error.file_path || error.file,
            line: error.line,
            column: error.column,
            code: error.code,
            severity: error.severity || 'error',
            message: error.message,
            phase,
            cycle,
            cluster_id: error.cluster_id || null,
            created_at: new Date().toISOString()
          }
        })
      }

      // Commit Postgres transaction
      await client.query('COMMIT')

      // Upsert to Qdrant (async, non-blocking)
      if (qdrantPoints.length > 0) {
        await qdrant.upsertErrors(qdrantPoints.map(p => p.payload), qdrantPoints.map(p => p.vector))
      }

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Create cluster and assign errors
   */
  async createCluster(errorIds, label, options = {}) {
    const { phase = 72, cycle = 1 } = options

    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Calculate centroid from error vectors
      const vectors = await client.query(
        `SELECT embedding FROM phase72_error_vector WHERE error_id = ANY($1)`,
        [errorIds]
      )

      const centroid = this._calculateCentroid(vectors.rows.map(r => r.embedding))

      // Create cluster
      const clusterResult = await client.query(
        `INSERT INTO phase72_cluster (label, phase, cycle, size, centroid)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [label, phase, cycle, errorIds.length, centroid]
      )

      const clusterId = clusterResult.rows[0].id

      // Assign errors to cluster
      await client.query(
        `UPDATE phase72_error SET cluster_id = $1 WHERE id = ANY($2)`,
        [clusterId, errorIds]
      )

      await client.query('COMMIT')

      console.log(`[topology] Created cluster ${clusterId} with ${errorIds.length} errors`)

      return { clusterId, size: errorIds.length, label }

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Generate and store cluster summary
   */
  async generateClusterSummary(clusterId, options = {}) {
    const { model = 'gemma3-legal:latest' } = options

    // Get cluster errors for context
    const client = await this.pool.connect()
    const errors = await client.query(
      `SELECT code, message, file_path, line
       FROM phase72_error
       WHERE cluster_id = $1
       LIMIT 20`,
      [clusterId]
    )
    client.release()

    if (errors.rows.length === 0) {
      throw new Error(`Cluster ${clusterId} has no errors`)
    }

    // Build prompt for LLM
    const errorSamples = errors.rows
      .map(e => `- ${e.code}: ${e.message} (${e.file_path}:${e.line})`)
      .join('\n')

    const prompt = `Analyze these TypeScript errors and provide a concise summary (2-3 sentences):

${errorSamples}

Summary:`

    // Call LLM (gemma3-legal:latest)
    const response = await fetch(`${process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434'}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`LLM summary generation failed: ${response.status}`)
    }

    const data = await response.json()
    const summaryText = data.response?.trim()

    if (!summaryText) {
      throw new Error('LLM returned empty summary')
    }

    // Embed summary
    const summaryEmbedding = await embeddinggemma.embedText(summaryText)

    // Store in Postgres
    const client2 = await this.pool.connect()
    const result = await client2.query(
      `INSERT INTO phase72_cluster_summary (cluster_id, summary_text, model, embedding)
      VALUES ($1, $2, $3, $4)
      RETURNING id`,
      [clusterId, summaryText, model, summaryEmbedding]
    )
    client2.release()

    const summaryId = result.rows[0].id

    // Store in Qdrant
    await qdrant.upsertSummaries(
      [{ id: summaryId, cluster_id: clusterId, summary_text: summaryText, model }],
      [summaryEmbedding]
    )

    console.log(`[topology] Generated summary for cluster ${clusterId}`)

    return { summaryId, summaryText, model }
  }

  /**
   * Search for similar errors
   */
  async findSimilarErrors(queryText, options = {}) {
    const { limit = 10, threshold = 0.85 } = options

    // Embed query
    const queryVector = await embeddinggemma.embedText(queryText)

    // Search Qdrant
    const results = await qdrant.searchSimilarErrors(queryVector, {
      limit,
      scoreThreshold: threshold
    })

    return results.map(r => ({
      ...r.payload,
      similarity: r.score
    }))
  }

  /**
   * Search summaries for RAG context
   */
  async searchSummaries(queryText, options = {}) {
    const { limit = 5, threshold = 0.80 } = options

    // Embed query
    const queryVector = await embeddinggemma.embedText(queryText)

    // Search Qdrant
    const results = await qdrant.searchSummaries(queryVector, {
      limit,
      scoreThreshold: threshold
    })

    return results.map(r => ({
      ...r.payload,
      similarity: r.score
    }))
  }

  /**
   * Get statistics
   */
  async getStats() {
    const client = await this.pool.connect()

    const errorCount = await client.query('SELECT COUNT(*) FROM phase72_error')
    const clusterCount = await client.query('SELECT COUNT(*) FROM phase72_cluster')
    const summaryCount = await client.query('SELECT COUNT(*) FROM phase72_cluster_summary')
    const vectorCount = await client.query('SELECT COUNT(*) FROM phase72_error_vector')

    client.release()

    const qdrantStats = await qdrant.getCollectionStats()
    const cacheStats = this.cacheConnected ? await this.cache.getStats() : null

    return {
      postgres: {
        errors: parseInt(errorCount.rows[0].count),
        clusters: parseInt(clusterCount.rows[0].count),
        summaries: parseInt(summaryCount.rows[0].count),
        vectors: parseInt(vectorCount.rows[0].count)
      },
      qdrant: qdrantStats,
      redis: cacheStats
    }
  }

  /**
   * Helper: Calculate centroid of vectors
   */
  _calculateCentroid(vectors) {
    if (vectors.length === 0) return null

    const dim = vectors[0].length
    const sum = new Array(dim).fill(0)

    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        sum[i] += vec[i]
      }
    }

    return sum.map(v => v / vectors.length)
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]

  async function main() {
    const manager = new TopologyManager()
    await manager.connect()

    try {
      if (command === 'stats') {
        const stats = await manager.getStats()
        console.log('Topology Statistics:')
        console.log(JSON.stringify(stats, null, 2))
      } else if (command === 'search') {
        const query = process.argv[3] || 'CardTitle upload missing'
        console.log(`Searching for: "${query}"`)
        const results = await manager.findSimilarErrors(query, { limit: 5 })
        console.log(JSON.stringify(results, null, 2))
      } else {
        console.log('Usage: node phase72-topology-manager.mjs [stats|search "query"]')
      }
    } finally {
      await manager.disconnect()
    }
  }

  main().catch(console.error)
}

export { makeErrorHash, TopologyManager }
export default TopologyManager
