#!/usr/bin/env node

/**
 * Phase 73: Summarize Clusters
 *
 * For each cluster without a summary:
 * 1. Sample errors from the cluster
 * 2. Call gemma3-legal:latest to generate a summary
 * 3. Embed the summary with embeddinggemma:latest
 * 4. Store in phase72_cluster_summary
 * 5. Upsert to Qdrant phase72_summaries collection
 */

import { Pool } from 'pg'
import fetch from 'node-fetch'
import { QdrantClient } from '@qdrant/js-client-rest'
import 'dotenv/config'

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434'
const DATABASE_URL = process.env.DATABASE_URL
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'

function log(msg) {
  console.log(`[phase73-summary] [${new Date().toISOString()}] ${msg}`)
}

/**
 * Embed text with embeddinggemma:latest
 */
async function embedText(text) {
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
 * Generate summary prompt for a cluster
 */
async function summarizeClusterPrompt(cluster, samples) {
  const lines = []
  lines.push('You are an expert Svelte/TypeScript build engineer inside a large mono-repo.')
  lines.push('Summarize the ROOT CAUSE and FIX STRATEGY for this cluster of errors in 3–6 bullet points.')
  lines.push('Focus on patterns (missing imports, bad props, wrong bindings, old Svelte 4 syntax, etc.).')
  lines.push('')
  lines.push(`Cluster label: ${cluster.label}`)
  lines.push(`Cycle: ${cluster.cycle}`)
  lines.push('')
  lines.push('Sample errors:')

  for (let i = 0; i < samples.length; i++) {
    const e = samples[i]
    lines.push(`#${i + 1} [${e.code}] ${e.message} (${e.file_path}:${e.line}:${e.column})`)
  }

  lines.push('')
  lines.push('Return only bullet points, no preface, no conclusion. Each bullet: one concrete insight.')

  return lines.join('\n')
}

/**
 * Call gemma3-legal:latest via Ollama chat API
 */
async function callGemmaLegalChat(prompt) {
  const res = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      messages: [
        {
          role: 'system',
          content: 'You fix Svelte/TS build errors. Be concise and actionable.'
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
 * Ensure Qdrant collection exists
 */
async function ensureSummaryCollection(qdrant) {
  try {
    await qdrant.getCollection('phase72_summaries')
  } catch {
    log('Creating phase72_summaries collection in Qdrant...')
    await qdrant.createCollection('phase72_summaries', {
      vectors: { size: 768, distance: 'Cosine' }
    })
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error('[phase73-summary] DATABASE_URL not set')
    process.exit(1)
  }

  const pg = new Pool({ connectionString: DATABASE_URL })
  const qdrant = new QdrantClient({ url: QDRANT_URL })

  await ensureSummaryCollection(qdrant)

  const client = await pg.connect()

  try {
    const cycle = Number(process.env.PHASE72_CYCLE ?? '1')
    const maxClusters = Number(process.env.PHASE73_MAX_CLUSTERS ?? '100')
    const samplesPerCluster = Number(process.env.PHASE73_SAMPLES_PER_CLUSTER ?? '6')

    log(`summarizing clusters for cycle=${cycle} (limit ${maxClusters})...`)

    // 1. Get clusters that do NOT yet have a summary
    const clustersRes = await client.query(
      `
      SELECT c.id, c.label, c.cycle, c.size
      FROM phase72_cluster c
      LEFT JOIN phase72_cluster_summary s ON s.cluster_id = c.id
      WHERE c.phase = 72
      AND c.cycle = $1
      AND s.id IS NULL
      ORDER BY c.size DESC
      LIMIT $2
      `,
      [cycle, maxClusters]
    )

    const clusters = clustersRes.rows
    log(`found ${clusters.length} clusters without summary`)

    for (const cluster of clusters) {
      log(`cluster ${cluster.id} (${cluster.size} errors) – summarizing...`)

      // 2. Sample some errors from this cluster
      const errsRes = await client.query(
        `
        SELECT e.code, e.message, e.file_path, e.line, e.column
        FROM phase72_error e
        WHERE e.cluster_id = $1
        ORDER BY e.created_at DESC
        LIMIT $2
        `,
        [cluster.id, samplesPerCluster]
      )

      const samples = errsRes.rows
      if (!samples.length) continue

      const prompt = await summarizeClusterPrompt(cluster, samples)
      const summaryText = (await callGemmaLegalChat(prompt)).trim()

      if (!summaryText) {
        log(`empty summary for cluster ${cluster.id}, skipping`)
        continue
      }

      const embedding = await embedText(summaryText)

      // 3. Insert into Postgres
      const ins = await client.query(
        `
        INSERT INTO phase72_cluster_summary (cluster_id, summary_text, model, embedding)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [cluster.id, summaryText, 'gemma3-legal:latest', embedding]
      )

      const summaryId = ins.rows[0].id

      // 4. Upsert into Qdrant summaries collection
      await qdrant.upsert('phase72_summaries', {
        wait: false,
        points: [
          {
            id: summaryId,
            vector: embedding,
            payload: {
              summary_id: summaryId,
              cluster_id: cluster.id,
              label: cluster.label,
              summary_text: summaryText,
              cycle: cluster.cycle,
              phase: 72,
              model: 'gemma3-legal:latest'
            }
          }
        ]
      })
function summarizeClusterPrompt(cluster, samples) {
  const lines = [
    'You are an expert Svelte/TypeScript build engineer inside a large mono-repo.',
    'Summarize the ROOT CAUSE and FIX STRATEGY for this cluster of errors in 3–6 bullet points.',
    'Focus on patterns (missing imports, bad props, wrong bindings, old Svelte 4 syntax, etc.).',
    '',
    `Cluster label: ${cluster.label}`,
    `Cycle: ${cluster.cycle}`,
    '',
    'Sample errors:'
  ]

  samples.forEach((e, i) => {
    lines.push(`#${i + 1} [${e.code}] ${e.message} (${e.file_path}:${e.line}:${e.column})`)
  })

      log(`cluster ${cluster.id} summarized as ${summaryId}`)
    }
  lines.push('', 'Return only bullet points, no preface, no conclusion. Each bullet: one concrete insight.')

  return lines.join('\n')
}

    log('done')
  } catch (err) {
    console.error('[phase73-summary] error:', err)
/**
 * Call gemma3-legal:latest via Ollama chat API
 */
async function callGemmaLegalChat(prompt) {
  const res = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      messages: [
        {
          role: 'system',
          content: 'You fix Svelte/TS build errors. Be concise and actionable.'
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
 * Ensure Qdrant collection exists
 */
async function ensureSummaryCollection(qdrant) {
  try {
    await qdrant.getCollection('phase72_summaries')
  } catch {
    log('Creating phase72_summaries collection in Qdrant...')
    await qdrant.createCollection('phase72_summaries', {
      vectors: { size: 768, distance: 'Cosine' }
    })
  }
}

/**
 * Process a single cluster
 */
async function processCluster(cluster, client, qdrant, samplesPerCluster) {
  log(`cluster ${cluster.id} (${cluster.size} errors) – summarizing...`)

  // Sample errors from this cluster
  const errsRes = await client.query(
    `
    SELECT e.code, e.message, e.file_path, e.line, e.column
    FROM phase72_error e
    WHERE e.cluster_id = $1
    ORDER BY e.created_at DESC
    LIMIT $2
    `,
    [cluster.id, samplesPerCluster]
  )

  const samples = errsRes.rows
  if (!samples.length) return

  const prompt = summarizeClusterPrompt(cluster, samples)
  const summaryText = (await callGemmaLegalChat(prompt)).trim()

  if (!summaryText) {
    log(`empty summary for cluster ${cluster.id}, skipping`)
    return
  }

  const embedding = await embedText(summaryText)

  // Insert into Postgres
  const ins = await client.query(
    `
    INSERT INTO phase72_cluster_summary (cluster_id, summary_text, model, embedding)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [cluster.id, summaryText, 'gemma3-legal:latest', embedding]
  )

  const summaryId = ins.rows[0].id

  // Upsert into Qdrant summaries collection
  await qdrant.upsert('phase72_summaries', {
    wait: false,
    points: [
      {
        id: summaryId,
        vector: embedding,
        payload: {
          summary_id: summaryId,
          cluster_id: cluster.id,
          label: cluster.label,
          summary_text: summaryText,
          cycle: cluster.cycle,
          phase: 72,
          model: 'gemma3-legal:latest'
        }
      }
    ]
  })

  log(`cluster ${cluster.id} summarized as ${summaryId}`)
}

async function main() {
  if (!DATABASE_URL) {
    console.error('[phase73-summary] DATABASE_URL not set')
    process.exit(1)
  } finally {
    client.release()
    await pg.end()
  }
}

  const pg = new Pool({ connectionString: DATABASE_URL })
  const qdrant = new QdrantClient({ url: QDRANT_URL })

  await ensureSummaryCollection(qdrant)

  const client = await pg.connect()

  try {
    const cycle = Number(process.env.PHASE72_CYCLE ?? '1')
    const maxClusters = Number(process.env.PHASE73_MAX_CLUSTERS ?? '100')
    const samplesPerCluster = Number(process.env.PHASE73_SAMPLES_PER_CLUSTER ?? '6')

    log(`summarizing clusters for cycle=${cycle} (limit ${maxClusters})...`)

    // Get clusters that do NOT yet have a summary
    const clustersRes = await client.query(
      `
      SELECT c.id, c.label, c.cycle, c.size
      FROM phase72_cluster c
      LEFT JOIN phase72_cluster_summary s ON s.cluster_id = c.id
      WHERE c.phase = 72
      AND c.cycle = $1
      AND s.id IS NULL
      ORDER BY c.size DESC
      LIMIT $2
      `,
      [cycle, maxClusters]
    )

    const clusters = clustersRes.rows
    log(`found ${clusters.length} clusters without summary`)

    // Process clusters with controlled concurrency
    const concurrency = Number(process.env.PHASE73_CONCURRENCY ?? '3')
    for (let i = 0; i < clusters.length; i += concurrency) {
      const batch = clusters.slice(i, i + concurrency)
      await Promise.all(
        batch.map(cluster => processCluster(cluster, client, qdrant, samplesPerCluster))
      )
    }

main().catch((err) => {
  console.error(err)
    log('done')
  } catch (err) {
    console.error('[phase73-summary] error:', err)
  process.exit(1)
  } finally {
    client.release()
    await pg.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
