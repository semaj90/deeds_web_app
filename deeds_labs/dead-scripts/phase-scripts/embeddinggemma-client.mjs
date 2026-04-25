#!/usr/bin/env node

/**
 * embeddinggemma Ollama Client
 * Fast batched embeddings using Ollama's embeddinggemma:latest model
 */

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434'
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest'
const BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || '10')

/**
 * Embed a single text using embeddinggemma
 */
export async function embedText(text) {
  const response = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ollama embeddings error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.embedding
}

/**
 * Embed multiple texts in batches
 * Returns array of embeddings in same order as input
 */
export async function embedTexts(texts, options = {}) {
  const batchSize = options.batchSize || BATCH_SIZE
  const model = options.model || EMBEDDING_MODEL
  const showProgress = options.progress || false

  const results = []
  const batches = Math.ceil(texts.length / batchSize)

  if (showProgress) {
    console.log(`[embeddinggemma] Embedding ${texts.length} texts in ${batches} batches...`)
  }

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1

    if (showProgress) {
      console.log(`[embeddinggemma] Batch ${batchNum}/${batches} (${batch.length} texts)`)
    }

    // Process batch in parallel
    const promises = batch.map(async (text) => {
      const response = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: text
        })
      })

      if (!response.ok) {
        console.error(`Failed to embed text: ${text.substring(0, 100)}...`)
        return null
      }

      const data = await response.json()
      return data.embedding
    })

    const batchResults = await Promise.all(promises)
    results.push(...batchResults)
  }

  const successCount = results.filter(r => r !== null).length
  if (showProgress) {
    console.log(`[embeddinggemma] Complete: ${successCount}/${texts.length} embeddings generated`)
  }

  return results
}

/**
 * Embed error messages for Phase 72
 * Formats: "TS2304: Cannot find name 'FooBar'"
 */
export async function embedErrors(errors, options = {}) {
  const texts = errors.map(e => `${e.code}: ${e.message}`)
  return embedTexts(texts, options)
}

/**
 * Embed cluster summaries for RAG
 */
export async function embedSummaries(summaries, options = {}) {
  const texts = summaries.map(s =>
    typeof s === 'string' ? s : s.summary_text || s.text
  )
  return embedTexts(texts, options)
}

/**
 * Check if Ollama + embeddinggemma is available
 */
export async function checkOllamaEmbeddings() {
  try {
    // Try to embed a test string
    const testEmbedding = await embedText('test')
    return {
      available: true,
      dimension: testEmbedding.length,
      model: EMBEDDING_MODEL
    }
  } catch (error) {
    return {
      available: false,
      error: error.message,
      model: EMBEDDING_MODEL
    }
  }
}

/**
 * Get embedding dimension from model
 */
export async function getEmbeddingDimension() {
  const test = await embedText('test')
  return test.length
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]

  async function main() {
    if (command === 'check') {
      console.log('Checking Ollama embeddinggemma availability...')
      const status = await checkOllamaEmbeddings()
      console.log(JSON.stringify(status, null, 2))
    } else if (command === 'test') {
      const texts = [
        'TS2304: Cannot find name CardTitle',
        'TS2339: Property upload does not exist',
        'TS7006: Parameter type implicitly has any type'
      ]
      console.log('Testing batch embedding...')
      const embeddings = await embedTexts(texts, { progress: true })
      console.log(`Generated ${embeddings.length} embeddings`)
      console.log(`Dimension: ${embeddings[0]?.length || 'N/A'}`)
    } else if (command === 'dim') {
      const dim = await getEmbeddingDimension()
      console.log(`Embedding dimension: ${dim}`)
    } else {
      console.log('Usage: node embeddinggemma-client.mjs [check|test|dim]')
    }
  }

  main().catch(console.error)
}

export default {
  embedText,
  embedTexts,
  embedErrors,
  embedSummaries,
  checkOllamaEmbeddings,
  getEmbeddingDimension
}
