#!/usr/bin/env node

/**
 * Phase 72 Qdrant Topology Layer
 *
 * Manages error vectors and cluster summaries in Qdrant
 * Collections:
 *   - phase72_errors: error vectors with metadata
 *   - phase72_summaries: cluster summary vectors
 */

import { QdrantClient } from '@qdrant/js-client-rest'

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'
const VECTOR_SIZE = 768 // embeddinggemma dimension

let qdrant = null

/**
 * Initialize Qdrant client
 */
export function initQdrant() {
  if (qdrant) return qdrant

  qdrant = new QdrantClient({
    url: QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
  })

  return qdrant
}

/**
 * Ensure error vectors collection exists
 */
export async function ensureErrorsCollection() {
  const q = initQdrant()

  try {
    await q.getCollection('phase72_errors')
  } catch (err) {
    if (err.status === 404) {
      console.log('[phase72-qdrant] Creating phase72_errors collection...')
      await q.createCollection('phase72_errors', {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine'
        }
      })
    } else {
      throw err
    }
  }
}

/**
 * Ensure summaries collection exists
 */
export async function ensureSummariesCollection() {
  const q = initQdrant()

  try {
    await q.getCollection('phase72_summaries')
  } catch (err) {
    if (err.status === 404) {
      console.log('[phase72-qdrant] Creating phase72_summaries collection...')
      await q.createCollection('phase72_summaries', {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine'
        }
      })
    } else {
      throw err
    }
  }
}

/**
 * Upsert error vectors to Qdrant
 */
export async function upsertErrorVectors(errors) {
  const q = initQdrant()
  await ensureErrorsCollection()

  const points = errors.map((e, idx) => ({
    id: idx, // Qdrant requires numeric IDs; use hash as payload
    vector: e.vector,
    payload: {
      error_id: e.id,
      error_hash: e.hash,
      file_path: e.file,
      line: e.line,
      column: e.column,
      code: e.code,
      severity: e.severity,
      message: e.message,
      phase: e.phase ?? 72,
      cycle: e.cycle ?? 1,
      cluster_id: e.cluster_id ?? null,
      created_at: new Date().toISOString()
    }
  }))

  try {
    await q.upsert('phase72_errors', {
      wait: true,
      points
    })
    console.log(`[phase72-qdrant] Upserted ${points.length} error vectors`)
  } catch (err) {
    console.error('[phase72-qdrant] Error upserting errors:', err)
    throw err
  }
}

/**
 * Search for similar errors
 */
export async function searchSimilarErrors(vector, limit = 10) {
  const q = initQdrant()
  await ensureErrorsCollection()

  try {
    const results = await q.search('phase72_errors', {
      vector,
      limit,
      with_payload: true
    })

    return results.map((r) => ({
      score: r.score,
      payload: r.payload
    }))
  } catch (err) {
    console.error('[phase72-qdrant] Error searching errors:', err)
    throw err
  }
}

/**
 * Upsert cluster summaries to Qdrant
 */
export async function upsertSummaries(summaries) {
  const q = initQdrant()
  await ensureSummariesCollection()

  const points = summaries.map((s, idx) => ({
    id: idx,
    vector: s.vector,
    payload: {
      summary_id: s.id,
      cluster_id: s.cluster_id,
      summary_text: s.text,
      model: s.model ?? 'gemma3-legal:latest',
      phase: s.phase ?? 72,
      cycle: s.cycle ?? 1,
      created_at: new Date().toISOString()
    }
  }))

  try {
    await q.upsert('phase72_summaries', {
      wait: true,
      points
    })
    console.log(`[phase72-qdrant] Upserted ${points.length} summary vectors`)
  } catch (err) {
    console.error('[phase72-qdrant] Error upserting summaries:', err)
    throw err
  }
}

/**
 * Search for similar summaries (RAG)
 */
export async function searchSimilarSummaries(vector, limit = 5) {
  const q = initQdrant()
  await ensureSummariesCollection()

  try {
    const results = await q.search('phase72_summaries', {
      vector,
      limit,
      with_payload: true
    })

    return results.map((r) => ({
      score: r.score,
      payload: r.payload
    }))
  } catch (err) {
    console.error('[phase72-qdrant] Error searching summaries:', err)
    throw err
  }
}

/**
 * Get collection stats
 */
export async function getCollectionStats() {
  const q = initQdrant()

  try {
    const errorsStats = await q.getCollection('phase72_errors').catch(() => null)
    const summariesStats = await q.getCollection('phase72_summaries').catch(() => null)

    return {
      errors: errorsStats ? { points_count: errorsStats.points_count } : null,
      summaries: summariesStats ? { points_count: summariesStats.points_count } : null
    }
  } catch (err) {
    console.error('[phase72-qdrant] Error getting stats:', err)
    return { errors: null, summaries: null }
  }
}

/**
 * Delete collection (for cleanup)
 */
export async function deleteCollection(name) {
  const q = initQdrant()

  try {
    await q.deleteCollection(name)
    console.log(`[phase72-qdrant] Deleted collection: ${name}`)
  } catch (err) {
    console.error(`[phase72-qdrant] Error deleting collection ${name}:`, err)
  }
}

// CLI: Show collection stats
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const stats = await getCollectionStats()
    console.log('Phase 72 Qdrant Collections:')
    console.log(`  Errors: ${stats.errors?.points_count ?? 0} points`)
    console.log(`  Summaries: ${stats.summaries?.points_count ?? 0} points`)
  } catch (err) {
    console.error('Error:', err)
  }
}

export default {
  initQdrant,
  ensureErrorsCollection,
  ensureSummariesCollection,
  upsertErrorVectors,
  searchSimilarErrors,
  upsertSummaries,
  searchSimilarSummaries,
  getCollectionStats,
  deleteCollection
}
