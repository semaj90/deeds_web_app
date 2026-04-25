#!/usr/bin/env node

/**
 * Phase 72 LibTorch Vectorizer Detection
 *
 * Detects whether the native LibTorch GPU vectorizer is available.
 * Supports both N-API addon (.node) and CLI executable (.exe) formats.
 *
 * Usage:
 *   node phase72-detect-libtorch.mjs
 *   import { detectLibTorchVectorizer } from './phase72-detect-libtorch.mjs'
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BUILD_DIR = path.join(__dirname, '..', 'build')
const CONFIG = process.env.CMAKE_BUILD_CONFIG || 'Release'

// Adjust basename if your target name is different
const NATIVE_BASENAME = 'ast_error_vectorizer'

/**
 * Generate candidate paths for the native vectorizer
 */
function candidates() {
  const exe = process.platform === 'win32'
    ? `${NATIVE_BASENAME}.exe`
    : NATIVE_BASENAME

  const addon = `${NATIVE_BASENAME}.node`

  return [
    { type: 'addon', path: path.join(BUILD_DIR, CONFIG, addon) },
    { type: 'addon', path: path.join(BUILD_DIR, addon) },
    { type: 'cli', path: path.join(BUILD_DIR, CONFIG, exe) },
    { type: 'cli', path: path.join(BUILD_DIR, exe) }
  ]
}

/**
 * Detect LibTorch vectorizer availability
 * @returns {Object} Detection result with found, path, and type
 */
export function detectLibTorchVectorizer() {
  for (const c of candidates()) {
    if (fs.existsSync(c.path)) {
      return { found: true, ...c }
    }
  }
  return { found: false, path: null, type: null }
}

/**
 * CLI probe - run if executed directly
 */
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1].endsWith('phase72-detect-libtorch.mjs')

if (isMainModule) {
  const res = detectLibTorchVectorizer()
  const ts = new Date().toISOString()

  if (!res.found) {
    console.log(`[${ts}] [phase72-detect] LibTorch vectorizer: NOT FOUND`)
    console.log(`[${ts}] [phase72-detect] Checked paths:`)
    candidates().forEach(c => {
      console.log(`[${ts}]   - ${c.path} (${c.type})`)
    })
    process.exitCode = 1
  } else {
    console.log(
      `[${ts}] [phase72-detect] ✓ LibTorch vectorizer found: ${res.path} (type=${res.type})`
    )
    process.exitCode = 0
  }
}
