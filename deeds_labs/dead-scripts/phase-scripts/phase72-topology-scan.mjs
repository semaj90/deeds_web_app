#!/usr/bin/env node

/**
 * Phase 72: Integrated Topology-Aware Error Scanner
 *
 * New workflow:
 * 1. Run ripgrep for fast error detection (12x faster)
 * 2. Generate embeddings with embeddinggemma (check cache first)
 * 3. Store in Postgres + pgvector + Qdrant topology
 * 4. Return error clusters and similar errors
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ora from 'ora'
import TopologyManager from './phase72-topology-manager.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const USE_RIPGREP = process.env.PHASE72_USE_RIPGREP !== 'false'
const USE_CACHE = process.env.PHASE72_USE_CACHE !== 'false'
const PHASE = parseInt(process.env.PHASE72_PHASE || '72', 10)
const CYCLE = parseInt(process.env.PHASE72_CYCLE || '1', 10)

function log(msg) {
  console.log(`[phase72-scan] ${msg}`)
}

/**
 * Run ripgrep to find TypeScript errors (fast path)
 */
async function scanWithRipgrep() {
  const spinner = ora('Scanning with ripgrep...').start()

  return new Promise((resolve, reject) => {
    // Search for common TS error patterns
    const patterns = [
      'TS\\d{4}:',           // TS2304: Cannot find name
      'Type .* is not assignable',
      'Property .* does not exist',
      'Cannot find module',
      'error TS\\d+'
    ]

    const rgArgs = [
      '--json',
      '--no-heading',
      '--line-number',
      '--column',
      '--type', 'ts',
      '--type', 'tsx',
      '--type', 'svelte',
      '-e', patterns.join('|'),
      'src/'
    ]

    const proc = spawn('rg', rgArgs, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let buf = ''
    proc.stdout.on('data', chunk => buf += chunk.toString())

    proc.on('exit', (code) => {
      if (code !== 0 && code !== 1) {
        spinner.fail('ripgrep failed')
        return reject(new Error(`ripgrep exited with ${code}`))
      }

      const errors = buf
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            const data = JSON.parse(line)
            if (data.type !== 'match') return null

            const text = data.data.lines.text
            const match = text.match(/TS(\d+):\s*(.*)/) || text.match(/(error|warning):\s*(.*)/)

            if (!match) return null

            return {
              file_path: data.data.path.text,
              line: data.data.line_number,
              column: data.data.submatches?.[0]?.start || 0,
              code: match[1].startsWith('TS') ? match[1] : 'TS0000',
              severity: text.includes('error') ? 'error' : 'warning',
              message: match[2]?.trim() || text
            }
          } catch {
            return null
          }
        })
        .filter(e => e !== null)

      spinner.succeed(`ripgrep found ${errors.length} errors`)
      resolve(errors)
    })

    proc.on('error', (err) => {
      spinner.fail('ripgrep not available')
      reject(err)
    })
  })
}

/**
 * Fallback: Run svelte-check (slower)
 */
async function scanWithSvelteCheck() {
  const spinner = ora('Running svelte-check (fallback)...').start()

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['svelte-check', '--output', 'machine'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: true
    })

    let buf = ''
    proc.stdout.on('data', chunk => buf += chunk.toString())

    proc.on('exit', (code) => {
      if (code !== 0 && code !== 1) {
        spinner.fail('svelte-check failed')
        return reject(new Error(`svelte-check exited with ${code}`))
      }

      try {
        const data = JSON.parse(buf)
        const diagnostics = data?.diagnostics ?? data?.errors ?? []

        const errors = diagnostics.map(e => ({
          file_path: e.filename,
          line: e.start?.line || 0,
          column: e.start?.column || 0,
          code: e.code || 'TS0000',
          severity: e.severity || 'error',
          message: e.message || e.text || 'Unknown error'
        }))

        spinner.succeed(`svelte-check found ${errors.length} errors`)
        resolve(errors)
      } catch (err) {
        spinner.fail('Failed to parse svelte-check output')
        reject(err)
      }
    })
  })
}

/**
 * Main workflow
 */
async function main() {
  log(`Starting Phase ${PHASE} Cycle ${CYCLE} error scan`)
  log(`Config: ripgrep=${USE_RIPGREP}, cache=${USE_CACHE}`)

  // Step 1: Scan for errors
  let errors
  try {
    if (USE_RIPGREP) {
      try {
        errors = await scanWithRipgrep()
      } catch (err) {
        log(`ripgrep failed: ${err.message}, falling back to svelte-check`)
        errors = await scanWithSvelteCheck()
      }
    } else {
      errors = await scanWithSvelteCheck()
    }
  } catch (err) {
    console.error('Error scanning failed:', err)
    process.exitCode = 1
    return
  }

  if (errors.length === 0) {
    log('✅ No errors found!')
    return
  }

  // Step 2: Initialize topology manager
  const spinner = ora('Connecting to topology storage...').start()
  const topology = new TopologyManager()

  try {
    await topology.connect()
    spinner.succeed('Connected to Postgres + Qdrant + Redis')
  } catch (err) {
    spinner.fail(`Failed to connect to topology: ${err.message}`)
    process.exitCode = 1
    return
  }

  // Step 3: Ingest errors (embed + store)
  const ingestSpinner = ora('Ingesting errors to topology...').start()

  try {
    const result = await topology.ingestErrors(errors, {
      phase: PHASE,
      cycle: CYCLE,
      skipCache: !USE_CACHE
    })

    ingestSpinner.succeed(
      `Ingested ${result.stored} errors (${result.cache_hits} cache hits, ${result.new_embeddings} new embeddings)`
    )

    // Step 4: Get statistics
    const stats = await topology.getStats()

    log('\n=== Topology Statistics ===')
    log(`Total errors in DB: ${stats.postgres.errors}`)
    log(`Total clusters: ${stats.postgres.clusters}`)
    log(`Total summaries: ${stats.postgres.summaries}`)
    log(`Qdrant error vectors: ${stats.qdrant.errors.points_count}`)
    log(`Qdrant summary vectors: ${stats.qdrant.summaries.points_count}`)

    if (stats.redis) {
      log(`Redis cache: ${stats.redis.embeddings.keys} embeddings, ${stats.redis.fixes.keys} fixes`)
    }

    // Step 5: Save scan results
    const outputPath = path.join(ROOT, `phase${PHASE}-cycle${CYCLE}-results.json`)
    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        phase: PHASE,
        cycle: CYCLE,
        timestamp: new Date().toISOString(),
        errors: errors.length,
        ingestion: result,
        stats
      }, null, 2),
      'utf8'
    )

    log(`\n✅ Phase ${PHASE} Cycle ${CYCLE} complete`)
    log(`Results saved to ${outputPath}`)

  } catch (err) {
    ingestSpinner.fail(`Ingestion failed: ${err.message}`)
    console.error(err)
    process.exitCode = 1
  } finally {
    await topology.disconnect()
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exitCode = 1
  })
}

export { scanWithRipgrep, scanWithSvelteCheck }
