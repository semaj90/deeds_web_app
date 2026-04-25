#!/usr/bin/env node

/**
 * Phase 72 Fast Error Scanner
 * Uses ripgrep + Redis cache for 10x faster error collection
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Phase72Cache } from './phase72-redis-cache.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const USE_RIPGREP = process.env.PHASE72_USE_RIPGREP !== 'false'
const USE_CACHE = process.env.PHASE72_USE_CACHE !== 'false'

function log(msg) {
  console.log(`[phase72-fast] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Run ripgrep scanner (fast path)
 */
async function scanWithRipgrep() {
  return new Promise((resolve, reject) => {
    log('Running ripgrep scanner...')

    const scriptPath = path.join(__dirname, 'phase72-ripgrep-scanner.ps1')
    const proc = spawn('pwsh', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-RootDir', path.join(ROOT, 'src'),
      '-OutputFormat', 'ndjson'
    ], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit']
    })

    let output = ''
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0 && code !== 1) {
        return reject(new Error(`ripgrep scanner exited with ${code}`))
      }

      // Parse NDJSON output
      const errors = output
        .split('\n')
        .filter(line => line.trim() && line.startsWith('{'))
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)

      log(`Found ${errors.length} errors via ripgrep`)
      resolve(errors)
    })
  })
}

/**
 * Run svelte-check (slow fallback)
 */
async function scanWithSvelteCheck() {
  return new Promise((resolve, reject) => {
    log('Running svelte-check (fallback)...')

    const proc = spawn('npx', ['svelte-check', '--output', 'machine'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: true
    })

    let buf = ''
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0 && code !== 1) {
        return reject(new Error(`svelte-check exited with ${code}`))
      }

      try {
        const data = JSON.parse(buf)
        const errors = (data?.diagnostics || data?.errors || []).map(e => ({
          file: e.filename || e.file || '',
          line: e.start?.line || e.line || 0,
          column: e.start?.column || e.column || 0,
          code: e.code || '',
          message: e.message || e.text || '',
          severity: e.severity === 'error' ? 2 : 1
        }))

        log(`Found ${errors.length} errors via svelte-check`)
        resolve(errors)
      } catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * Filter errors using Redis cache
 */
async function filterCachedErrors(errors, cache) {
  if (!USE_CACHE || !cache.connected) {
    log('Cache disabled, processing all errors')
    return { uncached: errors, cached: [] }
  }

  log('Checking cache for known errors...')
  const results = await cache.getErrorFixesBatch(errors)

  const cached = []
  const uncached = []

  for (const result of results) {
    if (result.cached && result.fix) {
      cached.push({
        ...result.error,
        fix: result.fix,
        fromCache: true
      })
    } else {
      uncached.push(result.error)
    }
  }

  log(`Cache hits: ${cached.length}/${errors.length} (${((cached.length/errors.length)*100).toFixed(1)}%)`)
  log(`Uncached errors to process: ${uncached.length}`)

  return { uncached, cached }
}

/**
 * Get embeddings (with cache)
 */
async function getEmbeddings(errors, cache) {
  if (!USE_CACHE || !cache.connected) {
    log('Cache disabled, generating all embeddings')
    return { embeddings: null, needsGeneration: errors }
  }

  log('Checking cache for embeddings...')
  const results = await cache.getEmbeddingsBatch(errors)

  const cached = []
  const needsGeneration = []

  for (const result of results) {
    if (result.cached && result.vector) {
      cached.push({
        error: result.error,
        vector: result.vector
      })
    } else {
      needsGeneration.push(result.error)
    }
  }

  log(`Embedding cache hits: ${cached.length}/${errors.length} (${((cached.length/errors.length)*100).toFixed(1)}%)`)
  log(`Embeddings to generate: ${needsGeneration.length}`)

  return {
    embeddings: cached.length > 0 ? cached : null,
    needsGeneration
  }
}

/**
 * Generate embeddings for uncached errors
 */
async function generateEmbeddings(errors) {
  if (errors.length === 0) {
    log('No embeddings to generate')
    return []
  }

  return new Promise((resolve, reject) => {
    log(`Generating embeddings for ${errors.length} errors...`)

    const pythonPath = process.env.PHASE72_PYTHON ||
                       path.resolve(ROOT, '../.venv/Scripts/python.exe')

    const proc = spawn(pythonPath, [
      path.join(__dirname, 'phase72_gpu_vectorizer.py')
    ], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit']
    })

    let output = ''
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        return reject(new Error(`GPU vectorizer exited with ${code}`))
      }

      try {
        const result = JSON.parse(output)
        if (result.error) {
          return reject(new Error(result.message || 'Vectorizer error'))
        }

        log(`Generated ${result.vectors?.length || 0} embeddings`)
        resolve(result.vectors || [])
      } catch (err) {
        reject(err)
      }
    })

    // Send errors to GPU vectorizer
    proc.stdin.write(JSON.stringify({ errors }))
    proc.stdin.end()
  })
}

/**
 * Main workflow
 */
async function main() {
  const cache = new Phase72Cache()

  try {
    // Connect to Redis
    if (USE_CACHE) {
      try {
        await cache.connect()
      } catch (err) {
        log(`Warning: Redis connection failed (${err.message}), continuing without cache`)
      }
    }

    // STEP 1: Scan for errors (ripgrep or svelte-check)
    const errors = USE_RIPGREP
      ? await scanWithRipgrep()
      : await scanWithSvelteCheck()

    if (errors.length === 0) {
      log('No errors found!')
      return { errors: 0, cached: 0, generated: 0 }
    }

    // STEP 2: Filter cached errors
    const { uncached, cached } = await filterCachedErrors(errors, cache)

    // STEP 3: Check for cached embeddings
    const { embeddings: cachedEmbeddings, needsGeneration } =
      await getEmbeddings(uncached, cache)

    // STEP 4: Generate missing embeddings
    let newEmbeddings = []
    if (needsGeneration.length > 0) {
      newEmbeddings = await generateEmbeddings(needsGeneration)

      // Cache new embeddings
      if (USE_CACHE && cache.connected) {
        log('Caching new embeddings...')
        for (let i = 0; i < needsGeneration.length; i++) {
          if (newEmbeddings[i]) {
            await cache.setEmbedding(needsGeneration[i], newEmbeddings[i])
          }
        }
      }
    }

    // STEP 5: Combine results
    const allEmbeddings = [
      ...(cachedEmbeddings || []),
      ...needsGeneration.map((err, i) => ({
        error: err,
        vector: newEmbeddings[i]
      }))
    ]

    // Save results
    const outputPath = path.join(ROOT, 'phase72-scan-results.json')
    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      total_errors: errors.length,
      cached_fixes: cached.length,
      uncached_errors: uncached.length,
      cached_embeddings: cachedEmbeddings?.length || 0,
      generated_embeddings: newEmbeddings.length,
      errors: [...cached, ...uncached],
      embeddings: allEmbeddings
    }, null, 2))

    log(`Results saved to ${outputPath}`)
    log('='.repeat(60))
    log('Summary:')
    log(`  Total errors: ${errors.length}`)
    log(`  Cached fixes: ${cached.length} (${((cached.length/errors.length)*100).toFixed(1)}%)`)
    log(`  New embeddings: ${newEmbeddings.length}`)
    log(`  Cached embeddings: ${cachedEmbeddings?.length || 0}`)
    log('='.repeat(60))

    return {
      errors: errors.length,
      cached: cached.length,
      generated: newEmbeddings.length
    }
  } catch (err) {
    console.error(`[phase72-fast] FATAL:`, err)
    throw err
  } finally {
    if (cache.connected) {
      await cache.disconnect()
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(stats => {
      log(`✓ Complete: ${stats.errors} errors, ${stats.cached} cached, ${stats.generated} generated`)
      process.exit(0)
    })
    .catch(err => {
      console.error('Fatal error:', err)
      process.exit(1)
    })
}

export { filterCachedErrors, main, scanWithRipgrep, scanWithSvelteCheck }

