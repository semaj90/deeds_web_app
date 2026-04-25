#!/usr/bin/env node

/**
 * Phase 78: Brain Pass
 *
 * Orchestrates the complete Phase 72-78 topology brain pipeline:
 * 1. Phase 72: Fast scan + vectorization
 * 2. Phase 73: Clustering
 * 3. Phase 73: Summarization
 * 4. Report statistics
 *
 * Usage:
 *   PHASE72_CYCLE=1 npm run phase78:brain-pass
 *   PHASE72_CYCLE=2 npm run phase78:brain-pass
 */

import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import fetch from 'node-fetch'
import 'dotenv/config'

const DATABASE_URL = process.env.DATABASE_URL

function log(msg) {
  console.log(`[phase78-brain] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Run a script and return promise
 */
function runScript(name, command, args = []) {
  return new Promise((resolve, reject) => {
    log(`Running ${name}...`)
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    })

    proc.on('close', (code) => {
      if (code === 0) {
        log(`✓ ${name} complete`)
        resolve()
      } else {
        log(`✗ ${name} failed with code ${code}`)
        reject(new Error(`${name} failed`))
      }
    })

    proc.on('error', (err) => {
      log(`✗ ${name} error: ${err.message}`)
      reject(err)
    })
  })
}

/**
 * Get topology statistics
 */
async function getTopologyStats(cycle) {
  if (!DATABASE_URL) {
    log('DATABASE_URL not set, skipping stats')
    return null
  }

  const pg = new Pool({ connectionString: DATABASE_URL })
  const client = await pg.connect()

  try {
    // Count errors
    const errorsRes = await client.query(
      'SELECT COUNT(*) as count FROM phase72_error WHERE phase = 72 AND cycle = $1',
      [cycle]
    )
    const errorCount = parseInt(errorsRes.rows[0].count)

    // Count clusters
    const clustersRes = await client.query(
      'SELECT COUNT(*) as count FROM phase72_cluster WHERE phase = 72 AND cycle = $1',
      [cycle]
    )
    const clusterCount = parseInt(clustersRes.rows[0].count)

    // Count summaries
    const summariesRes = await client.query(
      `
      SELECT COUNT(*) as count
      FROM phase72_cluster_summary s
      JOIN phase72_cluster c ON c.id = s.cluster_id
      WHERE c.phase = 72 AND c.cycle = $1
      `,
      [cycle]
    )
    const summaryCount = parseInt(summariesRes.rows[0].count)

    // Top error codes
    const topCodesRes = await client.query(
      `
      SELECT code, COUNT(*) as count
      FROM phase72_error
      WHERE phase = 72 AND cycle = $1
      GROUP BY code
      ORDER BY count DESC
      LIMIT 5
      `,
      [cycle]
    )
    const topCodes = topCodesRes.rows

    return {
      errors: errorCount,
      clusters: clusterCount,
      summaries: summaryCount,
      topCodes
    }
  } catch (err) {
    log(`Error getting stats: ${err.message}`)
    return null
  } finally {
    client.release()
    await pg.end()
  }
}

async function main() {
  const startTime = Date.now()
  const cycle = Number(process.env.PHASE72_CYCLE ?? '1')

  log(`Starting Phase 78 Brain Pass for cycle ${cycle}...`)
  log('')

  try {
    // Step 1: Phase 72 - Fast scan + vectorization
    log('=== Phase 72: Fast Scan + Vectorization ===')
    await runScript(
      'Phase 72 Fast Scan',
      'node',
      ['scripts/phase72-topology-store.mjs']
    )
    log('')

    // Step 2: Phase 73 - Clustering
    log('=== Phase 73: Clustering ===')
    await runScript(
      'Phase 73 Clustering',
      'node',
      ['scripts/phase73-cluster-errors.mjs']
    )
    log('')

    // Step 3: Phase 73 - Summarization
    log('=== Phase 73: Summarization ===')
    await runScript(
      'Phase 73 Summarization',
      'node',
      ['scripts/phase73-summarize-clusters.mjs']
    )
    log('')

    // Step 4: Report statistics
    log('=== Topology Statistics ===')
    const stats = await getTopologyStats(cycle)

    if (stats) {
      log(`Errors: ${stats.errors}`)
      log(`Clusters: ${stats.clusters}`)
      log(`Summaries: ${stats.summaries}`)
      log('')
      log('Top Error Codes:')
      stats.topCodes.forEach((code, idx) => {
        log(`  ${idx + 1}. ${code.code}: ${code.count} errors`)
      })
    }

    const duration = Date.now() - startTime
    log('')
    log(`✓ Phase 78 Brain Pass complete in ${(duration / 1000).toFixed(2)}s`)
    log('')
    log('Next steps:')
    log('  - Use phase78-suggest-fix.mjs to get fix suggestions')
    log('  - Query Qdrant for similar errors')
    log('  - Integrate with ACE for autonomous fixing')
    log('')
  } catch (err) {
    const duration = Date.now() - startTime
    log('')
    log(`✗ Phase 78 Brain Pass failed after ${(duration / 1000).toFixed(2)}s`)
    log(`Error: ${err.message}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
