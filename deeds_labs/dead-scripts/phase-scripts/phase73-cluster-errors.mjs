#!/usr/bin/env node

/**
 * Phase 73: Cluster Errors
 *
 * Groups similar errors into clusters using cosine similarity
 * Writes clusters to phase72_cluster table
 * Updates phase72_error.cluster_id
 */

import { Pool } from 'pg'
import fetch from 'node-fetch'
import 'dotenv/config'

/**
 * Cosine similarity for 768-dim vectors
 */
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0

  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    na += x * x
    nb += y * y
  }

  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * Compute centroid of vectors
 */
function centroid(vectors) {
  if (!vectors.length) return []

  const dim = vectors[0].length
  const out = new Array(dim).fill(0)

  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      out[i] += v[i]
    }
  }

  for (let i = 0; i < dim; i++) {
    out[i] /= vectors.length
  }

  return out
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    console.error('[phase73] DATABASE_URL not set')
    process.exit(1)
  }

  const pg = new Pool({ connectionString: DATABASE_URL })
  const cycle = Number(process.env.PHASE72_CYCLE ?? '1')
  const simThreshold = Number(process.env.PHASE73_SIM_THRESHOLD ?? '0.92')

  console.log(`[phase73] clustering errors for cycle=${cycle}, threshold=${simThreshold}...`)

  const client = await pg.connect()

  try {
    // 1. Load all errors + vectors for phase 72, given cycle
    const res = await client.query(
      `
      SELECT e.id, e.code, e.message, e.file_path, e.line, e.column, v.embedding
      FROM phase72_error e
      JOIN phase72_error_vector v ON v.error_id = e.id
      WHERE e.phase = 72 AND e.cycle = $1
      `,
      [cycle]
    )

    const rows = res.rows
    console.log(`[phase73] loaded ${rows.length} errors`)
    if (rows.length === 0) {
      console.log('[phase73] no errors to cluster')
      return
    }


    const points = rows.map((r) => ({
      error_id: r.id,
      code: r.code,
      message: r.message,
      file_path: r.file_path,
      line: r.line,
      column: r.column,
      vector: r.embedding
    }))

    // 2. Greedy clustering
    const clusters = []
    const assigned = new Array(points.length).fill(false)

    for (let i = 0; i < points.length; i++) {
      if (assigned[i]) continue

      const p = points[i]
      const members = [i]
      assigned[i] = true

      for (let j = i + 1; j < points.length; j++) {
        if (assigned[j]) continue

        const q = points[j]

        // Quick filter: same TS code often cluster together
        if (p.code !== q.code) continue

        const s = cosineSim(p.vector, q.vector)
        if (s >= simThreshold) {
          assigned[j] = true
          members.push(j)
        }
      }

      const vecs = members.map((idx) => points[idx].vector)
      clusters.push({
        indices: members,
        centroid: centroid(vecs)
      })
    }

    console.log(
      `[phase73] created ${clusters.length} clusters (avg size ~${(points.length / (clusters.length || 1)).toFixed(1)})`
    )

    // 3. Persist clusters
    await client.query('BEGIN')

    const insertClusterText = `
      INSERT INTO phase72_cluster (label, phase, cycle, size, centroid)
      VALUES ($1, 72, $2, $3, $4)
      RETURNING id
    `

    const clusterMap = new Map() // error_id -> cluster_id

    for (const cluster of clusters) {
      const sample = points[cluster.indices[0]]
      const label = `[${sample.code}] ${sample.message.slice(0, 80)}`
      const size = cluster.indices.length
      const cent = cluster.centroid

      const ins = await client.query(insertClusterText, [label, cycle, size, cent])
      const clusterId = ins.rows[0].id

      for (const idx of cluster.indices) {
        const errId = points[idx].error_id
        clusterMap.set(errId, clusterId)
      }
    }

    // Add cluster_id column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'phase72_error'
          AND column_name = 'cluster_id'
        ) THEN
          ALTER TABLE phase72_error
          ADD COLUMN cluster_id UUID;
        END IF;
      END$$;
    `)

    // Update cluster_id on phase72_error
    const updateStmt = `
      UPDATE phase72_error
      SET cluster_id = $2
      WHERE id = $1
    `

    for (const [errId, clusterId] of clusterMap.entries()) {
      await client.query(updateStmt, [errId, clusterId])
    }

    await client.query('COMMIT')
    console.log('[phase73] clusters persisted to Postgres')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[phase73] error:', err)
    process.exit(1)
  } finally {
    client.release()
    await pg.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
