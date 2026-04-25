#!/usr/bin/env node

/**
 * Phase 72: Hardened Svelte-Check Machine Output Parser
 *
 * Robustly parses svelte-check's machine-readable output.
 * Format: TIMESTAMP TYPE "FILE" LINE:COL "MESSAGE"
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function log(msg) {
  console.log(`[phase72-parse] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Robustly parse svelte-check machine output
 */
export function parseSvelteCheckOutput(raw) {
  const errors = []
  const lines = raw.split(/\r?\n/)
  let skipped = 0
  let parsed = 0

  // Regex for svelte-check --output machine
  // Format: <timestamp> <TYPE> "<filepath>" <line>:<col> "<message>"
  // Example: 1769573384817 WARNING "src\lib\components\AIChatAssistant.svelte" 9:60 "This reference..."
  const lineRegex = /^(\d+)\s+(ERROR|WARNING)\s+"([^"]+)"\s+(\d+):(\d+)\s+"(.*)"$/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('START') || trimmed.endsWith('COMPLETED')) {
      skipped++
      continue
    }

    const match = trimmed.match(lineRegex)
    if (match) {
      const severity = match[2].toLowerCase()
      const filename = match[3]
      const lineNum = parseInt(match[4])
      const colNum = parseInt(match[5])
      const message = match[6]

      errors.push({
        file: filename,
        line: lineNum,
        column: colNum,
        code: 'SVELTE_CHECK_ERROR', // Machine output doesn't always have the numeric code in a separate field
        message: message,
        severity: severity === 'error' ? 'error' : 'warning'
      })
      parsed++
    } else {
      // Handle potential variation or simpler format
      // Sometimes it might not have the timestamp if not redirected/piped same way
      skipped++
    }
  }

  log(`Parsed ${parsed} errors, skipped ${skipped} lines`)
  return errors
}

/**
 * Run svelte-check and parse output
 */
export async function runSvelteCheckAndParse() {
  const { spawn } = await import('node:child_process')

  return new Promise((resolve, reject) => {
    log('Running svelte-check...')
    // We use the --tsconfig to respect the exclusions
    const proc = spawn('npx', ['svelte-check', '--output', 'machine', '--tsconfig', './tsconfig.frontend.json'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('exit', (code) => {
      // svelte-check returns 1 if errors found, which is fine
      if (code !== 0 && code !== 1) {
        log(`svelte-check exited with code ${code}`)
      }

      const errors = parseSvelteCheckOutput(stdout)
      resolve(errors)
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * CLI: Run and output JSON
 */
async function main() {
  try {
    const errors = await runSvelteCheckAndParse()
    console.log(JSON.stringify(errors, null, 2))
    process.exitCode = 0
  } catch (err) {
    console.error(`[phase72-parse] FATAL: ${err.message}`)
    process.exitCode = 1
  }
}

// Run if executed directly
const isMainModule = process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) ||
                     process.argv[1].endsWith('phase72-svelte-check-parse.mjs'))

if (isMainModule) {
  main()
}
