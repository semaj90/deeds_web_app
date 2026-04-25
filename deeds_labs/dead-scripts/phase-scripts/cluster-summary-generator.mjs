#!/usr/bin/env node

/**
 * Phase 72 Cluster Summary Generator
 * Generates LLM summaries for error clusters and stores them for RAG
 */

import ora from 'ora'
import TopologyManager from './phase72-topology-manager.mjs'

/**
 * Generate summaries for all clusters without summaries
 */
export async function generateMissingSummaries(options = {}) {
  const { phase = 72, cycle = null, dryRun = false } = options

  const manager = new TopologyManager()
  await manager.connect()

  const spinner = ora('Finding clusters without summaries...').start()

  try {
    // Find clusters without summaries
    const query = cycle !== null
      ? `SELECT c.id, c.label, c.size, c.phase, c.cycle
         FROM phase72_cluster c
         LEFT JOIN phase72_cluster_summary s ON c.id = s.cluster_id
         WHERE s.id IS NULL AND c.phase = $1 AND c.cycle = $2
         ORDER BY c.size DESC`
      : `SELECT c.id, c.label, c.size, c.phase, c.cycle
         FROM phase72_cluster c
         LEFT JOIN phase72_cluster_summary s ON c.id = s.cluster_id
         WHERE s.id IS NULL AND c.phase = $1
         ORDER BY c.size DESC`

    const params = cycle !== null ? [phase, cycle] : [phase]

    const client = await manager.pool.connect()
    const result = await client.query(query, params)
    client.release()

    const clusters = result.rows

    if (clusters.length === 0) {
      spinner.succeed('No clusters need summaries')
      await manager.disconnect()
      return { generated: 0, skipped: 0 }
    }

    spinner.text = `Found ${clusters.length} clusters without summaries`

    if (dryRun) {
      spinner.info(`[DRY RUN] Would generate ${clusters.length} summaries`)
      console.log(JSON.stringify(clusters, null, 2))
      await manager.disconnect()
      return { generated: 0, skipped: clusters.length }
    }

    spinner.succeed(`Found ${clusters.length} clusters`)

    // Generate summaries
    let generated = 0
    let failed = 0

    for (const cluster of clusters) {
      const taskSpinner = ora(`Generating summary for cluster ${cluster.id} (${cluster.label}, ${cluster.size} errors)...`).start()

      try {
        const result = await manager.generateClusterSummary(cluster.id, {
          model: 'gemma3-legal:latest'
        })

        taskSpinner.succeed(`Generated summary for cluster ${cluster.id}: "${result.summaryText.substring(0, 80)}..."`)
        generated++

      } catch (err) {
        taskSpinner.fail(`Failed to generate summary for cluster ${cluster.id}: ${err.message}`)
        failed++
      }
    }

    console.log(`\nSummary generation complete:`)
    console.log(`  ✅ Generated: ${generated}`)
    console.log(`  ❌ Failed: ${failed}`)

    await manager.disconnect()

    return { generated, failed }

  } catch (err) {
    spinner.fail(`Error: ${err.message}`)
    await manager.disconnect()
    throw err
  }
}

/**
 * Generate summary for a specific cluster
 */
export async function generateClusterSummary(clusterId, options = {}) {
  const { model = 'gemma3-legal:latest' } = options

  const manager = new TopologyManager()
  await manager.connect()

  const spinner = ora(`Generating summary for cluster ${clusterId}...`).start()

  try {
    const result = await manager.generateClusterSummary(clusterId, { model })
    spinner.succeed(`Summary generated: "${result.summaryText}"`)
    await manager.disconnect()
    return result
  } catch (err) {
    spinner.fail(`Error: ${err.message}`)
    await manager.disconnect()
    throw err
  }
}

/**
 * Show cluster summary
 */
export async function showClusterSummary(clusterId) {
  const manager = new TopologyManager()
  await manager.connect()

  const client = await manager.pool.connect()

  // Get cluster info
  const clusterResult = await client.query(
    `SELECT c.*, s.summary_text, s.model, s.created_at as summary_created_at
     FROM phase72_cluster c
     LEFT JOIN phase72_cluster_summary s ON c.id = s.cluster_id
     WHERE c.id = $1`,
    [clusterId]
  )

  if (clusterResult.rows.length === 0) {
    console.log(`Cluster ${clusterId} not found`)
    client.release()
    await manager.disconnect()
    return
  }

  const cluster = clusterResult.rows[0]

  // Get sample errors
  const errorsResult = await client.query(
    `SELECT code, message, file_path, line, severity
     FROM phase72_error
     WHERE cluster_id = $1
     LIMIT 10`,
    [clusterId]
  )

  client.release()
  await manager.disconnect()

  console.log('\n=== Cluster Information ===')
  console.log(`ID: ${cluster.id}`)
  console.log(`Label: ${cluster.label}`)
  console.log(`Size: ${cluster.size} errors`)
  console.log(`Phase: ${cluster.phase}, Cycle: ${cluster.cycle}`)
  console.log(`Created: ${cluster.created_at}`)

  if (cluster.summary_text) {
    console.log('\n=== Summary ===')
    console.log(`Model: ${cluster.model}`)
    console.log(`Generated: ${cluster.summary_created_at}`)
    console.log(`\n${cluster.summary_text}`)
  } else {
    console.log('\n⚠️ No summary generated yet')
  }

  console.log('\n=== Sample Errors ===')
  for (const err of errorsResult.rows) {
    console.log(`  ${err.severity.toUpperCase()} ${err.code}: ${err.message}`)
    console.log(`    at ${err.file_path}:${err.line}`)
  }
}

/**
 * List all clusters
 */
export async function listClusters(options = {}) {
  const { phase = 72, withSummaries = false } = options

  const manager = new TopologyManager()
  await manager.connect()

  const query = withSummaries
    ? `SELECT c.id, c.label, c.size, c.phase, c.cycle, c.created_at,
              s.summary_text IS NOT NULL as has_summary
       FROM phase72_cluster c
       LEFT JOIN phase72_cluster_summary s ON c.id = s.cluster_id
       WHERE c.phase = $1 AND s.summary_text IS NOT NULL
       ORDER BY c.size DESC`
    : `SELECT c.id, c.label, c.size, c.phase, c.cycle, c.created_at,
              s.summary_text IS NOT NULL as has_summary
       FROM phase72_cluster c
       LEFT JOIN phase72_cluster_summary s ON c.id = s.cluster_id
       WHERE c.phase = $1
       ORDER BY c.size DESC`

  const client = await manager.pool.connect()
  const result = await client.query(query, [phase])
  client.release()

  await manager.disconnect()

  console.log(`\nPhase ${phase} Clusters (${result.rows.length} total):\n`)
  console.log('ID                                   | Label                          | Size | Summary')
  console.log('-------------------------------------|--------------------------------|------|--------')

  for (const row of result.rows) {
    const summary = row.has_summary ? '✅' : '❌'
    console.log(`${row.id} | ${row.label.padEnd(30)} | ${String(row.size).padStart(4)} | ${summary}`)
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]
  const arg = process.argv[3]

  async function main() {
    if (command === 'generate') {
      if (arg) {
        // Generate for specific cluster
        await generateClusterSummary(arg)
      } else {
        // Generate all missing
        await generateMissingSummaries()
      }
    } else if (command === 'show' && arg) {
      await showClusterSummary(arg)
    } else if (command === 'list') {
      await listClusters({ withSummaries: arg === '--with-summaries' })
    } else {
      console.log('Phase 72 Cluster Summary Generator')
      console.log('')
      console.log('Usage:')
      console.log('  node cluster-summary-generator.mjs generate          # Generate all missing summaries')
      console.log('  node cluster-summary-generator.mjs generate <id>     # Generate for specific cluster')
      console.log('  node cluster-summary-generator.mjs show <id>         # Show cluster with summary')
      console.log('  node cluster-summary-generator.mjs list              # List all clusters')
      console.log('  node cluster-summary-generator.mjs list --with-summaries  # List only clusters with summaries')
    }
  }

  main().catch(console.error)
}

export { generateClusterSummary, generateMissingSummaries, listClusters, showClusterSummary }

