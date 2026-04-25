#!/usr/bin/env node

/**
 * Phase 78: Suggest Fix
 *
 * RAG over error summaries to suggest fixes for new errors
 *
 * Usage:
 *   node scripts/phase78-suggest-fix.mjs "TS2304" "Cannot find name 'CardTitle'" "src/routes/+page.svelte" 42 13
 *
 * Or import and use programmatically:
 *   import { suggestFixForError } from './phase78-suggest-fix.mjs'
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import crypto from 'crypto'
import 'dotenv/config'
import fetch from 'node-fetch'

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434'
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'

function log(msg) {
  console.log(`[phase78-fix] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Embed text with embeddinggemma:latest
 */
async function embed(text) {
  const res = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  })

  if (!res.ok) {
    throw new Error(`embed error: ${res.status} ${await res.text()}`)
  }

  const json = await res.json()
  return json.embedding
}

/**
 * Chat with gemma3-legal:latest
 */
async function chatGemmaLegal(prompt) {
  const res = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      messages: [
        {
          role: 'system',
          content: 'You are an AI build engineer that proposes safe, minimal code fixes for SvelteKit + TypeScript errors.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false
    })
  })

  if (!res.ok) {
    throw new Error(`gemma3-legal error: ${res.status} ${await res.text()}`)
  }

  const json = await res.json()
  return json.message?.content ?? ''
}

/**
 * Suggest fix for an error using RAG over cluster summaries
 */
export async function suggestFixForError(error) {
  const qdrant = new QdrantClient({ url: QDRANT_URL })

  // 1. Embed the error
  const text = `[${error.code}] ${error.message} in ${error.file_path}:${error.line}:${error.column}`
  log(`Searching for similar errors: ${text}`)

  const vec = await embed(text)

  // 2. Search cluster summaries
  let searchRes
  try {
    searchRes = await qdrant.search('phase72_summaries', {
      vector: vec,
      limit: 5,
      with_payload: true
    })
  } catch (err) {
    log(`Qdrant search failed: ${err.message}`)
    // Fallback: no context
    searchRes = []
  }

  const context = searchRes
    .map((hit, idx) => {
      const p = hit.payload
      return `Match #${idx + 1} (score=${hit.score.toFixed(3)})\nLabel: ${p.label}\nSummary:\n${p.summary_text}\n`
    })
    .join('\n---\n')

  const prompt = [
    'You are given a new error and several summaries of past error clusters.',
    'Use them to propose a concrete fix for THIS specific error.',
    '',
    'NEW ERROR:',
    text,
    '',
    'RELATED CLUSTER SUMMARIES:',
    context || '(No similar errors found in knowledge base)',
    '',
    'Respond with:',
    '- 1–3 bullet points explaining the root cause',
    '- 1–3 bullet points describing the minimal code fix',
    '- If relevant, mention Svelte 5 vs Svelte 4 patterns, Bits-UI v2, and UnoCSS shortcuts.',
    '- Be specific about imports, component props, and syntax changes.'
  ].join('\n')

  const answer = await chatGemmaLegal(prompt)
  return answer
}

/**
 * Record the result of a applied fix to the knowledge base
 */
export async function recordFixResult(error, fix, success) {
  const qdrant = new QdrantClient({ url: QDRANT_URL })

  const text = `[${error.code}] ${error.message} in ${error.file_path}`
  const vec = await embed(text)

  const payload = {
    code: error.code,
    message: error.message,
    file_path: error.file_path,
    fix_suggestion: fix.suggestion,
    success: success,
    timestamp: new Date().toISOString()
  }

  try {
    // Store in a feedback collection - assuming 'phase78_feedback' exists or auto-created
    // If not, we might need to create it. For now, let's try to upsert.
    // Using a random UUID for point ID
    const pointId = crypto.randomUUID()

    await qdrant.upsert('phase78_feedback', {
      points: [{
        id: pointId,
        vector: vec,
        payload: payload
      }]
    })
    log(`Recorded fix result: ${success ? 'SUCCESS' : 'FAILURE'}`)
  } catch (err) {
    log(`Failed to record fix result: ${err.message}`)
  }
}

/**
 * CLI usage
 */
async function main() {
  const [code, message, file_path, lineStr, colStr] = process.argv.slice(2)

  if (!code || !message || !file_path) {
    console.error('Usage: node scripts/phase78-suggest-fix.mjs CODE MESSAGE FILE_PATH [LINE] [COLUMN]')
    console.error('Example: node scripts/phase78-suggest-fix.mjs "TS2304" "Cannot find name \'CardTitle\'" "src/routes/+page.svelte" 42 13')
    process.exit(1)
  }

  const error = {
    code,
    message,
    file_path,
    line: Number(lineStr ?? '0'),
    column: Number(colStr ?? '0')
  }

  try {
    const fix = await suggestFixForError(error)
    console.log('\n=== Suggested Fix ===\n')
    console.log(fix)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

export default { suggestFixForError, recordFixResult }
