#!/usr/bin/env node

/**
 * Phase 72 Pipeline Test
 *
 * Tests the full Phase 72 workflow:
 * 1. Detect LibTorch (if available)
 * 2. Run svelte-check + vectorization
 * 3. Log results to JSONL
 * 4. Report status
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectLibTorchVectorizer } from './phase72-detect-libtorch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGS_DIR = path.join(ROOT, 'logs', 'phase72')

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true })
}

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_FILE = path.join(LOGS_DIR, `run-${RUN_ID}.jsonl`)

function log(level, msg, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...data
  }
  console.log(`[${level}] ${msg}`)
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
}

function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      ...options
    })

    let stdout = ''
    let stderr = ''

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString()
        process.stdout.write(data)
      })
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        process.stderr.write(data)
      })
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
      } else {
        reject({ stdout, stderr, code })
      }
    })
  })
}

async function main() {
  const startTime = Date.now()

  log('INFO', 'Phase 72 Pipeline Test Started', { runId: RUN_ID })

  try {
    // Step 1: Detect LibTorch
    log('INFO', 'Detecting LibTorch vectorizer...')
    const detection = detectLibTorchVectorizer()

    if (detection.found) {
      log('INFO', `✓ LibTorch found: ${detection.path} (type=${detection.type})`, {
        libtorch: {
          found: true,
          path: detection.path,
          type: detection.type
        }
      })
    } else {
      log('WARN', 'LibTorch not found, will use TS/WASM vectorizer', {
        libtorch: { found: false }
      })
    }

    // Step 2: Run svelte-check + vectorization
    log('INFO', 'Running svelte-check + vectorization...')
    const vectorizeStart = Date.now()

    try {
      await executeCommand('node', ['scripts/phase72-svelte-check-vectorize.mjs'])
      const vectorizeDuration = Date.now() - vectorizeStart
      log('INFO', `✓ Vectorization complete (${vectorizeDuration}ms)`, {
        vectorization: {
          duration_ms: vectorizeDuration,
          success: true
        }
      })
    } catch (err) {
      const vectorizeDuration = Date.now() - vectorizeStart
      log('ERROR', `Vectorization failed: ${err.message}`, {
        vectorization: {
          duration_ms: vectorizeDuration,
          success: false,
          error: err.message
        }
      })
      throw err
    }

    // Step 3: Check output files
    log('INFO', 'Checking output files...')
    const vectorsFile = path.join(ROOT, 'svelte-check-vectors.json')
    const analysisFile = path.join(ROOT, 'svelte-check-machine.json')

    if (fs.existsSync(vectorsFile)) {
      const vectorsData = JSON.parse(fs.readFileSync(vectorsFile, 'utf8'))
      const vectorCount = Array.isArray(vectorsData.vectors) ? vectorsData.vectors.length : 1
      const featureCount = Array.isArray(vectorsData.features) ? vectorsData.features.length : 0

      log('INFO', `✓ Vectors file created: ${vectorCount} vectors from ${featureCount} features`, {
        vectors: {
          file: vectorsFile,
          count: vectorCount,
          features: featureCount
        }
      })
    } else {
      log('WARN', 'Vectors file not found', { vectors: { file: vectorsFile, found: false } })
    }

    if (fs.existsSync(analysisFile)) {
      const analysisData = JSON.parse(fs.readFileSync(analysisFile, 'utf8'))
      const errorCount = analysisData.diagnostics ? analysisData.diagnostics.length : 0

      log('INFO', `✓ Analysis file created: ${errorCount} errors detected`, {
        analysis: {
          file: analysisFile,
          errors: errorCount
        }
      })
    } else {
      log('WARN', 'Analysis file not found', { analysis: { file: analysisFile, found: false } })
    }

    // Step 4: Summary
    const totalDuration = Date.now() - startTime
    log('INFO', `✓ Phase 72 Pipeline Test Complete (${totalDuration}ms)`, {
      summary: {
        duration_ms: totalDuration,
        log_file: LOG_FILE,
        success: true
      }
    })

    console.log(`\n✅ Phase 72 Pipeline Test Complete`)
    console.log(`   Duration: ${(totalDuration / 1000).toFixed(2)}s`)
    console.log(`   Log: ${LOG_FILE}`)
    process.exitCode = 0

  } catch (err) {
    const totalDuration = Date.now() - startTime
    log('ERROR', `Phase 72 Pipeline Test Failed: ${err.message}`, {
      summary: {
        duration_ms: totalDuration,
        log_file: LOG_FILE,
        success: false,
        error: err.message
      }
    })

    console.error(`\n❌ Phase 72 Pipeline Test Failed`)
    console.error(`   Error: ${err.message}`)
    console.error(`   Log: ${LOG_FILE}`)
    process.exitCode = 1
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1].endsWith('phase72-test-pipeline.mjs')

if (isMainModule) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exitCode = 1
  })
}
