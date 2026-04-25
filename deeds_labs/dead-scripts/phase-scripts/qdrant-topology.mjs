#!/usr/bin/env node

/**
 * Qdrant Topology Manager for Phase 72
 * Manages error and summary collections in Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest'

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333'
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined

// Collection names
export const COLLECTIONS = {
  ERRORS: 'phase72_errors',
  SUMMARIES: 'phase72_summaries'
}

/**
 * Get Qdrant client instance
 */
export function getQdrantClient() {
  return new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY
  })
}

/**
 * Create Phase 72 collections if they don't exist
 */
export async function ensureCollections(vectorSize = 768) {
  const client = getQdrantClient()

  console.log('[qdrant] Ensuring collections exist...')

  // Create errors collection
  try {
    await client.createCollection(COLLECTIONS.ERRORS, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine'
      },
      optimizers_config: {
        indexing_threshold: 10000
      },
      hnsw_config: {
        m: 16,
        ef_construct: 100
      }
    })
    console.log(`[qdrant] Created collection: ${COLLECTIONS.ERRORS}`)
  } catch (err) {
    if (err.message?.includes('already exists')) {
      console.log(`[qdrant] Collection already exists: ${COLLECTIONS.ERRORS}`)
    } else {
      throw err
    }
  }

  // Create summaries collection
  try {
    await client.createCollection(COLLECTIONS.SUMMARIES, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine'
      },
      optimizers_config: {
        indexing_threshold: 1000
      },
      hnsw_config: {
        m: 16,
        ef_construct: 100
      }
    })
    console.log(`[qdrant] Created collection: ${COLLECTIONS.SUMMARIES}`)
  } catch (err) {
    if (err.message?.includes('already exists')) {
      console.log(`[qdrant] Collection already exists: ${COLLECTIONS.SUMMARIES}`)
    } else {
      throw err
    }
  }

  return { vectorSize, collections: [COLLECTIONS.ERRORS, COLLECTIONS.SUMMARIES] }
}

/**
 * Upsert error vectors to Qdrant
 */
export async function upsertErrors(errors, embeddings) {
  const client = getQdrantClient()

  const points = errors.map((error, i) => ({
    id: error.error_hash || error.id,
    vector: embeddings[i],
    payload: {
      error_id: error.id,
      error_hash: error.error_hash,
      file_path: error.file_path || error.file,
      line: error.line,
      column: error.column,
      code: error.code,
      severity: error.severity || 'error',
      message: error.message,
      phase: error.phase || 72,
      cycle: error.cycle || 1,
      cluster_id: error.cluster_id || null,
      created_at: error.created_at || new Date().toISOString()
    }
  }))

  await client.upsert(COLLECTIONS.ERRORS, {
    wait: true,
    points
  })

  console.log(`[qdrant] Upserted ${points.length} error vectors`)
  return points.length
}

/**
 * Upsert summary vectors to Qdrant
 */
export async function upsertSummaries(summaries, embeddings) {
  const client = getQdrantClient()

  const points = summaries.map((summary, i) => ({
    id: summary.id,
    vector: embeddings[i],
    payload: {
      summary_id: summary.id,
      cluster_id: summary.cluster_id,
      phase: summary.phase || 72,
      cycle: summary.cycle || 1,
      summary_text: summary.summary_text || summary.text,
      model: summary.model || 'gemma3-legal:latest',
      created_at: summary.created_at || new Date().toISOString()
    }
  }))

  await client.upsert(COLLECTIONS.SUMMARIES, {
    wait: true,
    points
  })

  console.log(`[qdrant] Upserted ${points.length} summary vectors`)
  return points.length
}

/**
 * Search for similar errors by vector
 */
export async function searchSimilarErrors(queryVector, options = {}) {
  const client = getQdrantClient()

  const {
    limit = 10,
    scoreThreshold = 0.85,
    filter = null
  } = options

  const results = await client.search(COLLECTIONS.ERRORS, {
    vector: queryVector,
    limit,
    score_threshold: scoreThreshold,
    filter,
    with_payload: true
  })

  return results
}

/**
 * Search summaries for RAG context
 */
export async function searchSummaries(queryVector, options = {}) {
  const client = getQdrantClient()

  const {
    limit = 5,
    scoreThreshold = 0.80,
    filter = null
  } = options

  const results = await client.search(COLLECTIONS.SUMMARIES, {
    vector: queryVector,
    limit,
    score_threshold: scoreThreshold,
    filter,
    with_payload: true
  })

  return results
}

/**
 * Get cluster members (all errors in a cluster)
 */
export async function getClusterMembers(clusterId, limit = 100) {
  const client = getQdrantClient()

  const results = await client.scroll(COLLECTIONS.ERRORS, {
    filter: {
      must: [
        {
          key: 'cluster_id',
          match: { value: clusterId }
        }
      ]
    },
    limit,
    with_payload: true,
    with_vector: false
  })

  return results.points
}

/**
 * Get collection statistics
 */
export async function getCollectionStats() {
  const client = getQdrantClient()

  const errorStats = await client.getCollection(COLLECTIONS.ERRORS)
  const summaryStats = await client.getCollection(COLLECTIONS.SUMMARIES)

  return {
    errors: {
      points_count: errorStats.points_count,
      vectors_count: errorStats.vectors_count,
      indexed_vectors_count: errorStats.indexed_vectors_count
    },
    summaries: {
      points_count: summaryStats.points_count,
      vectors_count: summaryStats.vectors_count,
      indexed_vectors_count: summaryStats.indexed_vectors_count
    }
  }
}

/**
 * Delete all points in collections (for testing)
 */
export async function clearCollections() {
  const client = getQdrantClient()

  await client.deleteCollection(COLLECTIONS.ERRORS)
  await client.deleteCollection(COLLECTIONS.SUMMARIES)

  console.log('[qdrant] Deleted all collections')
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]

  async function main() {
    if (command === 'init') {
      const dim = parseInt(process.argv[3] || '768')
      await ensureCollections(dim)
    } else if (command === 'stats') {
      const stats = await getCollectionStats()
      console.log('Qdrant Collection Statistics:')
      console.log(JSON.stringify(stats, null, 2))
    } else if (command === 'clear') {
      await clearCollections()
      await ensureCollections()
    } else {
      console.log('Usage: node qdrant-topology.mjs [init|stats|clear] [vectorDim]')
    }
  }

  main().catch(console.error)
}

export default {
  ensureCollections,
  upsertErrors,
  upsertSummaries,
  searchSimilarErrors,
  searchSummaries,
  getClusterMembers,
  getCollectionStats,
  clearCollections
}
