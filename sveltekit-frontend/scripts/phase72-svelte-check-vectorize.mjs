#!/usr/bin/env node

/**
 * Phase 72: Run svelte-check and vectorize errors with LibTorch GPU support
 *
 * Workflow:
 * 1. Run svelte-check to collect errors
 * 2. Try to use LibTorch GPU vectorizer (N-API addon or CLI)
 * 3. Fall back to simple feature extraction if LibTorch unavailable
 * 4. Export vectors for GPU clustering pipeline
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectLibTorchVectorizer } from './phase72-detect-libtorch.mjs'

import { parseSvelteCheckOutput } from './phase72-svelte-check-parse.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SVELTE_CHECK_JSON = path.join(ROOT, 'svelte-check-machine.json')
const VECTORS_FILE = path.join(ROOT, 'svelte-check-vectors.json')

function log(msg) {
  console.log(`[phase72-scv] [${new Date().toISOString()}] ${msg}`)
}

function runSvelteCheck() {
  return new Promise((resolve, reject) => {
    log('Running svelte-check...')
    const proc = spawn('npx', ['svelte-check', '--output', 'machine', '--tsconfig', './tsconfig.frontend.json'], {
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
        log(`svelte-check exited with code ${code}`)
      }
      fs.writeFileSync(SVELTE_CHECK_JSON, buf, 'utf8')
      resolve(buf)
    })
  })
}

/**
 * Build raw features from parsed diagnostics
 */
function buildErrorFeatures(diagnostics) {
  return diagnostics.map((e) => {
    // Attempt to extract a numeric code from message or use hash
    const code = e.code === 'SVELTE_CHECK_ERROR' ? 0 : Number(e.code)

    return {
        code,
        severity: Number(e.severity === 'error' ? 2 : 1),
        line: Number(e.line ?? 0),
        column: Number(e.column ?? 0),
        file_score: e.file ? e.file.length / 1024 : 0,
        filename: e.file,
        message: e.message
    }
  })
}

/**
 * Encode errors using LibTorch N-API addon (.node)
 */
async function encodeWithAddon(nativePath, features) {
  log(`Using LibTorch N-API addon at ${nativePath}`)

  // require() because it's CJS native addon
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const addon = require(nativePath)

  if (typeof addon.encodeErrorsGpu !== 'function') {
    throw new Error('encodeErrorsGpu not found in addon')
  }

  // expect Float32Array or nested array
  const result = addon.encodeErrorsGpu(features)
  return result
}

/**
 * Encode errors using LibTorch CLI executable (.exe)
 */
async function encodeWithCLI(nativePath, features) {
  log(`Using LibTorch CLI at ${nativePath}`)

  return new Promise((resolve, reject) => {
    const proc = spawn(nativePath, [], {
      cwd: path.dirname(nativePath),
      shell: false
    })

    let out = ''
    let err = ''

    proc.stdout.on('data', (c) => (out += c.toString()))
    proc.stderr.on('data', (c) => (err += c.toString()))

    proc.on('error', (e) => reject(e))

    proc.on('exit', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`CLI exited with ${code}: ${err || 'no stderr'}`)
        )
      }
      try {
        resolve(JSON.parse(out))
      } catch (e) {
        reject(e)
      }
    })

    proc.stdin.write(JSON.stringify(features))
    proc.stdin.end()
  })
}

/**
 * Fallback: simple feature-based vectorization
 */
function encodeWithSimpleFeatures(features) {
  log('Using simple feature-based vectorization')

  // Convert features to 5-dimensional vectors
  // [code_norm, severity_norm, line_norm, column_norm, file_score]
  const vectors = features.map((f) => [
    f.code / 1000,           // normalize code (0-1)
    f.severity / 2,          // normalize severity (0-1)
    Math.min(f.line / 1000, 1),    // normalize line (0-1)
    Math.min(f.column / 100, 1),   // normalize column (0-1)
    f.file_score             // file score (already 0-1)
  ])

  log(`Generated ${vectors.length} vectors from ${features.length} features`)
  return vectors
}

async function parseAndVectorize() {
  log('Parsing errors...')

  const raw = fs.readFileSync(SVELTE_CHECK_JSON, 'utf8')
  const diagnostics = parseSvelteCheckOutput(raw)

  const features = buildErrorFeatures(diagnostics)
  log(`Collected ${features.length} errors`)

  // Try LibTorch first, fall back to simple features
  const detection = detectLibTorchVectorizer()
  let vectors

  if (detection.found) {
    try {
      if (detection.type === 'addon') {
        vectors = await encodeWithAddon(detection.path, features)
      } else {
        vectors = await encodeWithCLI(detection.path, features)
      }
      log(`✓ LibTorch GPU vectorization complete: ${features.length} → vectors`)
    } catch (err) {
      log(`LibTorch failed, falling back to simple features: ${err?.message || String(err)}`)
      vectors = encodeWithSimpleFeatures(features)
    }
  } else {
    log('LibTorch not found, using simple feature vectorizer')
    vectors = encodeWithSimpleFeatures(features)
  }

  // Save
  fs.writeFileSync(
    VECTORS_FILE,
    JSON.stringify({ features, vectors }, null, 2),
    'utf8'
  )
  log(`Saved vectors → ${VECTORS_FILE}`)

  return { errors: features.length, vectors: Array.isArray(vectors) ? vectors.length : 1 }
}

async function main() {
  try {
    log('Running svelte-check + LibTorch/simple vectorization...')
    await runSvelteCheck()
    const stats = await parseAndVectorize()
    log(`✓ Complete: ${stats.errors} errors → ${stats.vectors} vectors`)
    process.exitCode = 0
  } catch (err) {
    console.error(`[phase72-scv] FATAL: ${err instanceof Error ? err.stack : String(err)}`)
    process.exitCode = 1
  }
}

// Run if executed directly
const isMainModule = process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) ||
                     process.argv[1].endsWith('phase72-svelte-check-vectorize.mjs'))

if (isMainModule) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exitCode = 1
  })
}
