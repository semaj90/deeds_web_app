#!/usr/bin/env node

/**
 * Phase 72 Topology Brain - End-to-End Test
 * Tests the complete RAG topology pipeline
 */

import ora from 'ora'
import pg from 'pg'
import embeddinggemma from './embeddinggemma-client.mjs'
import { Phase72Cache } from './phase72-redis-cache.mjs'
import TopologyManager from './phase72-topology-manager.mjs'
import qdrant from './qdrant-topology.mjs'

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:123456@localhost:5432/legal_ai_db'

async function testPrerequisites() {
  const spinner = ora('Testing prerequisites...').start()

  const results = {
    postgres: false,
    redis: false,
    qdrant: false,
    ollama: false
  }

  // Test Postgres
  try {
    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()
    await client.query('SELECT 1')
    client.release()
    await pool.end()
    results.postgres = true
  } catch (err) {
    spinner.warn(`Postgres: ${err.message}`)
  }

  // Test Redis
  try {
    const cache = new Phase72Cache()
    await cache.connect()
    await cache.disconnect()
    results.redis = true
  } catch (err) {
    spinner.warn(`Redis: ${err.message}`)
  }

  // Test Qdrant
  try {
    const response = await fetch('http://localhost:6333/collections')
    if (response.ok) {
      results.qdrant = true
    }
  } catch (err) {
    spinner.warn(`Qdrant: ${err.message}`)
  }

  // Test Ollama
  try {
    const available = await embeddinggemma.checkOllamaEmbeddings()
    results.ollama = available
  } catch (err) {
    spinner.warn(`Ollama: ${err.message}`)
  }

  const allOk = Object.values(results).every(v => v === true)

  if (allOk) {
    spinner.succeed('All prerequisites available')
  } else {
    spinner.fail('Some prerequisites missing')
  }

  console.log('Status:')
  console.log(`  Postgres: ${results.postgres ? '✅' : '❌'}`)
  console.log(`  Redis: ${results.redis ? '✅' : '❌'}`)
  console.log(`  Qdrant: ${results.qdrant ? '✅' : '❌'}`)
  console.log(`  Ollama: ${results.ollama ? '✅' : '❌'}`)

  return results
}

async function testEmbedding() {
  const spinner = ora('Testing embeddinggemma...').start()

  try {
    const sampleErrors = [
      { code: 'TS2304', message: 'Cannot find name CardTitle', file_path: 'src/lib/Card.svelte', line: 42, column: 10 },
      { code: 'TS2322', message: 'Type string is not assignable to type number', file_path: 'src/routes/+page.svelte', line: 18, column: 5 }
    ]

    const embeddings = await embeddinggemma.embedErrors(sampleErrors)

    if (!embeddings || embeddings.length !== 2) {
      throw new Error('Expected 2 embeddings')
    }

    if (!Array.isArray(embeddings[0]) || embeddings[0].length !== 768) {
      throw new Error('Expected 768-dimensional vectors')
    }

    spinner.succeed(`Generated ${embeddings.length} embeddings (768-dim)`)
    return true
  } catch (err) {
    spinner.fail(`Embedding test failed: ${err.message}`)
    return false
  }
}

async function testQdrant() {
  const spinner = ora('Testing Qdrant collections...').start()

  try {
    await qdrant.ensureCollections(768)
    const stats = await qdrant.getCollectionStats()

    spinner.succeed(`Qdrant collections ready (${stats.errors.points_count} error vectors, ${stats.summaries.points_count} summary vectors)`)
    return true
  } catch (err) {
    spinner.fail(`Qdrant test failed: ${err.message}`)
    return false
  }
}

async function testTopologyIngestion() {
  const spinner = ora('Testing topology ingestion...').start()

  try {
    const manager = new TopologyManager()
    await manager.connect()

    const testErrors = [
      {
        file_path: 'src/test/Example.svelte',
        line: 10,
        column: 5,
        code: 'TS2304',
        severity: 'error',
        message: 'Cannot find name TestComponent'
      },
      {
        file_path: 'src/test/Example.svelte',
        line: 15,
        column: 8,
        code: 'TS2322',
        severity: 'error',
        message: 'Type boolean is not assignable to type string'
      }
    ]

    const result = await manager.ingestErrors(testErrors, {
      phase: 72,
      cycle: 999  // Test cycle
    })

    await manager.disconnect()

    if (result.stored !== 2) {
      throw new Error(`Expected 2 stored errors, got ${result.stored}`)
    }

    spinner.succeed(`Ingested ${result.stored} test errors (${result.cache_hits} cache hits, ${result.new_embeddings} new)`)
    return true
  } catch (err) {
    spinner.fail(`Topology ingestion failed: ${err.message}`)
    return false
  }
}

async function testSimilaritySearch() {
  const spinner = ora('Testing similarity search...').start()

  try {
    const manager = new TopologyManager()
    await manager.connect()

    const results = await manager.findSimilarErrors('Cannot find name CardTitle', {
      limit: 5,
      threshold: 0.80
    })

    await manager.disconnect()

    spinner.succeed(`Found ${results.length} similar errors (threshold 0.80)`)

    if (results.length > 0) {
      console.log('\nTop similar error:')
      console.log(`  ${results[0].code}: ${results[0].message}`)
      console.log(`  at ${results[0].file_path}:${results[0].line}`)
      console.log(`  similarity: ${(results[0].similarity * 100).toFixed(1)}%`)
    }

    return true
  } catch (err) {
    spinner.fail(`Similarity search failed: ${err.message}`)
    return false
  }
}

async function testClusterSummary() {
  const spinner = ora('Testing cluster summary generation...').start()

  try {
    const manager = new TopologyManager()
    await manager.connect()

    // Create test cluster
    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()

    // Get some test errors
    const errorResult = await client.query(
      `SELECT id FROM phase72_error WHERE phase = 72 AND cycle = 999 LIMIT 2`
    )

    if (errorResult.rows.length === 0) {
      throw new Error('No test errors found (run testTopologyIngestion first)')
    }

    const errorIds = errorResult.rows.map(r => r.id)

    client.release()
    await pool.end()

    // Create cluster
    const cluster = await manager.createCluster(errorIds, 'Test Cluster', {
      phase: 72,
      cycle: 999
    })

    // Generate summary
    const summary = await manager.generateClusterSummary(cluster.clusterId, {
      model: 'gemma3-legal:latest'
    })

    await manager.disconnect()

    spinner.succeed(`Generated summary: "${summary.summaryText.substring(0, 80)}..."`)
    return true
  } catch (err) {
    spinner.fail(`Cluster summary failed: ${err.message}`)
    console.error(err)
    return false
  }
}

async function testRAGRetrieval() {
  const spinner = ora('Testing RAG summary retrieval...').start()

  try {
    const manager = new TopologyManager()
    await manager.connect()

    const summaries = await manager.searchSummaries('TypeScript type mismatch errors', {
      limit: 3,
      threshold: 0.75
    })

    await manager.disconnect()

    spinner.succeed(`Retrieved ${summaries.length} summaries for RAG context`)

    if (summaries.length > 0) {
      console.log('\nTop RAG summary:')
      console.log(`  Cluster: ${summaries[0].cluster_id}`)
      console.log(`  Summary: ${summaries[0].summary_text?.substring(0, 100)}...`)
      console.log(`  similarity: ${(summaries[0].similarity * 100).toFixed(1)}%`)
    }

    return true
  } catch (err) {
    spinner.fail(`RAG retrieval failed: ${err.message}`)
    return false
  }
}

async function main() {
  console.log('Phase 72 Topology Brain - End-to-End Test\n')

  const tests = [
    { name: 'Prerequisites', fn: testPrerequisites },
    { name: 'Embedding Generation', fn: testEmbedding },
    { name: 'Qdrant Collections', fn: testQdrant },
    { name: 'Topology Ingestion', fn: testTopologyIngestion },
    { name: 'Similarity Search', fn: testSimilaritySearch },
    { name: 'Cluster Summary', fn: testClusterSummary },
    { name: 'RAG Retrieval', fn: testRAGRetrieval }
  ]

  const results = []

  for (const test of tests) {
    console.log(`\n=== ${test.name} ===`)
    const passed = await test.fn()
    results.push({ name: test.name, passed })
  }

  console.log('\n\n=== Test Summary ===')
  for (const result of results) {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`)
  }

  const allPassed = results.every(r => r.passed)

  if (allPassed) {
    console.log('\n✅ All tests passed!')
    process.exitCode = 0
  } else {
    console.log('\n❌ Some tests failed')
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exitCode = 1
  })
}
