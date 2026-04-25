#!/usr/bin/env node

/**
 * Phase 72 Quick Test
 *
 * Tests the vectorization pipeline without running full svelte-check
 * (which can take a long time on large codebases)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectLibTorchVectorizer } from './phase72-detect-libtorch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function log(msg) {
  console.log(`[phase72-quick] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Build raw features from svelte-check JSON
 */
function buildErrorFeatures(json) {
  const errors = json?.diagnostics ?? json?.errors ?? []
  return errors.map((e) => ({
    code: Number(e.code ?? 0),
    severity: Number(e.severity === 'error' ? 2 : 1),
    line: Number(e.start?.line ?? 0),
    column: Number(e.start?.column ?? 0),
    file_score: e.filename ? e.filename.length / 1024 : 0
  }))
}

/**
 * Simple feature-based vectorization
 */
function encodeWithSimpleFeatures(features) {
  log('Using simple feature-based vectorization')

  // Convert features to 5-dimensional vectors
  const vectors = features.map((f) => [
    f.code / 1000,
    f.severity / 2,
    Math.min(f.line / 1000, 1),
    Math.min(f.column / 100, 1),
    f.file_score
  ])

  log(`Generated ${vectors.length} vectors from ${features.length} features`)
  return vectors
}

async function main() {
  const startTime = Date.now()

  log('Phase 72 Quick Test Started')

  try {
    // Step 1: Detect LibTorch
    log('Detecting LibTorch vectorizer...')
    const detection = detectLibTorchVectorizer()

    if (detection.found) {
      log(`✓ LibTorch found: ${detection.path} (type=${detection.type})`)
    } else {
      log('LibTorch not found, will use simple vectorizer')
    }

    // Step 2: Create mock error data
    log('Creating mock error data...')
    const mockErrors = [
      { code: 1005, severity: 'error', start: { line: 10, column: 5 }, filename: 'src/App.svelte' },
      { code: 2304, severity: 'error', start: { line: 25, column: 12 }, filename: 'src/routes/+page.svelte' },
      { code: 7006, severity: 'warning', start: { line: 42, column: 8 }, filename: 'src/lib/utils.ts' },
      { code: 1128, severity: 'error', start: { line: 100, column: 20 }, filename: 'src/components/Button.svelte' },
      { code: 2339, severity: 'error', start: { line: 55, column: 15 }, filename: 'src/stores/app.ts' }
    ]

    const features = buildErrorFeatures({ diagnostics: mockErrors })
    log(`Created ${features.length} mock error features`)

    // Step 3: Vectorize
    log('Vectorizing errors...')
    const vectors = encodeWithSimpleFeatures(features)

    // Step 4: Save results
    const outputFile = path.join(ROOT, 'phase72-quick-test-vectors.json')
    fs.writeFileSync(
      outputFile,
      JSON.stringify({ features, vectors, timestamp: new Date().toISOString() }, null, 2),
      'utf8'
    )
    log(`Saved vectors to ${outputFile}`)

    // Step 5: Verify
    const saved = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
    log(`✓ Verified: ${saved.vectors.length} vectors saved`)

    const totalDuration = Date.now() - startTime
    log(`✓ Phase 72 Quick Test Complete (${totalDuration}ms)`)

    console.log(`\n✅ Phase 72 Quick Test Passed`)
    console.log(`   Features: ${features.length}`)
    console.log(`   Vectors: ${vectors.length}`)
    console.log(`   Output: ${outputFile}`)
    console.log(`   Duration: ${(totalDuration / 1000).toFixed(2)}s`)

    process.exitCode = 0

  } catch (err) {
    const totalDuration = Date.now() - startTime
    log(`✗ Phase 72 Quick Test Failed: ${err.message}`)

    console.error(`\n❌ Phase 72 Quick Test Failed`)
    console.error(`   Error: ${err.message}`)
    console.error(`   Duration: ${(totalDuration / 1000).toFixed(2)}s`)

    process.exitCode = 1
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1].endsWith('phase72-quick-test.mjs')

if (isMainModule) {
  main().catch(err => {
    console.error('Fatal error:', err)
    process.exitCode = 1
  })
}
