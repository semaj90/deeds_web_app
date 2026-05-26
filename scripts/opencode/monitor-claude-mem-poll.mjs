#!/usr/bin/env node
/**
 * Monitor the Claude-Mem API for new observations and forward them
 * to the internal indexing endpoint which calls the server-side ingestion library.
 *
 * Behavior:
 *  - If `REDIS_URL` is provided and `ioredis` is available, subscribe to
 *    the `claude-mem:new` channel and index messages published there.
 *  - Always periodically poll the HTTP `CLAUDE_MEM_API` as a fallback
 *    to ensure no events are missed.
 *
 * Usage:
 *   node scripts/opencode/monitor-claude-mem-poll.mjs
 *
 * Environment:
 *   CLAUDE_MEM_API (default http://localhost:5173/api/memory/claude-mem)
 *   INTERNAL_INDEX_URL (default http://localhost:5173/api/internal/index-memory)
 *   REDIS_URL (optional) — if set, will attempt Pub/Sub subscription first
 *   POLL_INTERVAL_MS (default 10000)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from './logger.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CLAUDE_MEM_API = process.env.CLAUDE_MEM_API || 'http://localhost:5173/api/memory/claude-mem'
const INTERNAL_INDEX_URL = process.env.INTERNAL_INDEX_URL || 'http://localhost:5173/api/internal/index-memory'
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10_000)
const PROCESSED_FILE = path.join(__dirname, '..', '.cache', 'processed-claude-mem.json')
const logger = createLogger({ file: path.join(__dirname, '..', 'logs', 'claude-mem.log') })

async function loadProcessed() {
  try {
    const s = await fs.promises.readFile(PROCESSED_FILE, 'utf8')
    return new Set(JSON.parse(s))
  } catch (_) { return new Set() }
}

async function saveProcessed(set) {
  await fs.promises.mkdir(path.dirname(PROCESSED_FILE), { recursive: true })
  await fs.promises.mkdir(path.join(__dirname, '..', 'logs'), { recursive: true })
  await fs.promises.writeFile(PROCESSED_FILE, JSON.stringify(Array.from(set)), 'utf8')
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch ${url} failed ${res.status}`)
  return res.json()
}

async function forward(observation) {
  const res = await fetch(INTERNAL_INDEX_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(observation)
  })
  if (!res.ok) throw new Error(`Indexing failed ${res.status}`)
  return res.json()
}

async function main() {
  const processed = await loadProcessed()
  logger.info('Starting Claude-Mem monitor', { CLAUDE_MEM_API, INTERNAL_INDEX_URL, POLL_INTERVAL_MS })

  // If REDIS_URL is provided, try to use Redis Streams (durable consumer group)
  const REDIS_URL = process.env.REDIS_URL
  const STREAM_KEY = process.env.REDIS_STREAM_KEY || 'claude-mem-stream'
  const GROUP = process.env.REDIS_CONSUMER_GROUP || 'claude-mem-group'
  const CONSUMER = process.env.REDIS_CONSUMER_NAME || `consumer-${process.pid}`
  let redis
  let useStreams = false
  if (REDIS_URL) {
    try {
      const IORedisModule = await import('ioredis')
      const IORedis = IORedisModule.default || IORedisModule
      redis = new IORedis(REDIS_URL)
      await redis.ping()
      logger.info('Connected to Redis', { REDIS_URL })

      // Ensure consumer group exists (create if missing)
      try {
        await redis.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM')
        logger.info('Created Redis stream consumer group', { stream: STREAM_KEY, group: GROUP })
      } catch (err) {
        // XGROUP throws if group exists; ignore
        if (!/BUSYGROUP/.test(err.message)) logger.info('Consumer group exists or create failed', { err: err.message })
      }

      useStreams = true
    } catch (err) {
      logger.warn('Redis unavailable, falling back to HTTP polling', { err: err.message })
      redis = null
      useStreams = false
    }
  }

  // Optional eval-copy into Redis 8 (opt-in). Safe, non-blocking.
  const ENABLE_REDIS8 = (process.env.ENABLE_REDIS8_EVAL || 'false').toLowerCase() === 'true'
  const REDIS8_URL = process.env.REDIS8_URL
  const REDIS8_STREAM_KEY = process.env.REDIS8_STREAM_KEY || 'ace:memory:events-eval'
  let redis8 = null
  if (ENABLE_REDIS8 && REDIS8_URL) {
    try {
      const IORedisModule2 = await import('ioredis')
      const IORedis2 = IORedisModule2.default || IORedisModule2
      redis8 = new IORedis2(REDIS8_URL)
      await redis8.ping()
      logger.info('Connected to Redis8 eval', { REDIS8_URL })
    } catch (err) {
      logger.warn('Redis8 eval not available; continuing without eval copy', { err: err.message })
      redis8 = null
    }
  }

  // If using streams, start a dedicated consumer loop with metrics
  if (useStreams && redis) {
    let processedCount = 0
    let failedCount = 0
    let lastAckedId = null
    const METRICS_INTERVAL_MS = Number(process.env.METRICS_INTERVAL_MS || 30_000)

    async function collectAndLogMetrics() {
      try {
        const metrics = { processedCount, failedCount, lastAckedId, timestamp: Date.now() }
        // XPENDING summary
        let pendingCount = 0
        try {
          const xp = await redis.xpending(STREAM_KEY, GROUP).catch(() => null)
          if (xp && typeof xp === 'object' && xp.count != null) pendingCount = Number(xp.count)
          else if (Array.isArray(xp)) pendingCount = xp.length
        } catch (_) { pendingCount = 0 }
        metrics.pendingCount = pendingCount

        // stream lag via XINFO STREAM last-generated-id
        try {
          const xinfo = await redis.xinfo('STREAM', STREAM_KEY).catch(() => null)
          if (Array.isArray(xinfo)) {
            const info = {}
            for (let i = 0; i < xinfo.length; i += 2) info[xinfo[i]] = xinfo[i+1]
            const lastId = info['last-generated-id']
            if (lastId && typeof lastId === 'string' && lastId.includes('-')) {
              const ms = Number(lastId.split('-')[0])
              metrics.lagMs = Date.now() - ms
              metrics.lastGeneratedId = lastId
            }
          }
        } catch (_) { /* ignore */ }

        logger.info('StreamMetrics', metrics)
        // append to metrics log
        try {
          const metricsFile = path.join(__dirname, '..', 'logs', 'claude-mem-metrics.jsonl')
          await fs.promises.mkdir(path.dirname(metricsFile), { recursive: true })
          await fs.promises.appendFile(metricsFile, JSON.stringify(metrics) + '\n')
        } catch (_) {}
      } catch (err) {
        logger.warn('Metrics collection failed', { err: err.message })
      }
    }

    // start periodic metrics collector
    const metricsTimer = setInterval(() => { collectAndLogMetrics().catch(() => {}) }, METRICS_INTERVAL_MS)

    (async () => {
      logger.info('Starting Redis Streams consumer loop', { stream: STREAM_KEY, group: GROUP, consumer: CONSUMER })
      while (true) {
        try {
          // First, try to claim and process pending entries older than 60s
          try {
            const pending = await redis.xpending(STREAM_KEY, GROUP, '-', '+', 10)
            if (Array.isArray(pending) && pending.length) {
              const ids = pending.map(p => p[0])
              // Claim ownership for these IDs (min-idle-time 60000 ms)
              const claimed = await redis.xclaim(STREAM_KEY, GROUP, CONSUMER, 60000, ids)
              for (const entry of claimed) {
                const id = entry[0]
                const fieldsArr = entry[1]
                const item = {}
                for (let i = 0; i < fieldsArr.length; i += 2) item[fieldsArr[i]] = fieldsArr[i+1]
                const itemId = item.observation_id || item.id || item.uuid || null
                if (!itemId) {
                  await redis.xack(STREAM_KEY, GROUP, id)
                  continue
                }
                if (processed.has(itemId)) {
                  await redis.xack(STREAM_KEY, GROUP, id)
                  lastAckedId = id
                  continue
                }
                try {
                  logger.info('Processing claimed stream entry', { id: itemId })
                  await forward(item)
                  processed.add(itemId)
                  await saveProcessed(processed)
                  await redis.xack(STREAM_KEY, GROUP, id)
                  processedCount += 1
                  lastAckedId = id
                  // Optionally publish a copy to Redis8 eval stream (opt-in)
                  if (redis8) {
                    try {
                      await redis8.xadd(REDIS8_STREAM_KEY, '*', 'data', JSON.stringify(item))
                      logger.info('Published eval copy to Redis8', { id: itemId, stream: REDIS8_STREAM_KEY })
                    } catch (err) {
                      logger.warn('Failed to publish eval copy to Redis8', { err: err.message })
                    }
                  }
                  logger.info('Acknowledged claimed entry', { id: itemId })
                } catch (err) {
                  failedCount += 1
                  logger.error('Failed to process claimed entry', { id: itemId, err: err.message })
                }
              }
            }
          } catch (err) {
            // non-fatal
            logger.warn('Pending processing check failed', { err: err.message })
          }

          // Read new messages (block for up to POLL_INTERVAL_MS)
          const res = await redis.xreadgroup('GROUP', GROUP, CONSUMER, 'BLOCK', POLL_INTERVAL_MS, 'COUNT', 10, 'STREAMS', STREAM_KEY, '>')
          if (!res) continue
          // res -> [[streamKey, [[id, [field, val, ...]], ...]]]
          for (const streamResp of res) {
            const entries = streamResp[1]
            for (const entry of entries) {
              const id = entry[0]
              const fieldsArr = entry[1]
              const item = {}
              for (let i = 0; i < fieldsArr.length; i += 2) item[fieldsArr[i]] = fieldsArr[i+1]
              const itemId = item.observation_id || item.id || item.uuid || null
              if (!itemId) {
                await redis.xack(STREAM_KEY, GROUP, id)
                continue
              }
              if (processed.has(itemId)) {
                await redis.xack(STREAM_KEY, GROUP, id)
                lastAckedId = id
                continue
              }
              try {
                logger.info('Indexing observation (stream)', { id: itemId })
                await forward(item)
                processed.add(itemId)
                await saveProcessed(processed)
                await redis.xack(STREAM_KEY, GROUP, id)
                processedCount += 1
                lastAckedId = id
                if (redis8) {
                  try {
                    await redis8.xadd(REDIS8_STREAM_KEY, '*', 'data', JSON.stringify(item))
                    logger.info('Published eval copy to Redis8', { id: itemId, stream: REDIS8_STREAM_KEY })
                  } catch (err) {
                    logger.warn('Failed to publish eval copy to Redis8', { err: err.message })
                  }
                }
                logger.info('Indexed and acked observation (stream)', { id: itemId })
              } catch (err) {
                failedCount += 1
                logger.error('Failed to index (stream)', { id: itemId, err: err.message })
              }
            }
          }
        } catch (err) {
          logger.warn('Stream consumer loop error', { err: err.message })
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    })()
  }

  while (true) {
    try {
      const data = await fetchJson(CLAUDE_MEM_API)
      // Expecting array of observations or object {observations: []}
      let items = []
      if (Array.isArray(data)) items = data
      else if (Array.isArray(data.observations)) items = data.observations
      else if (data.latest) items = Array.isArray(data.latest) ? data.latest : [data.latest]

      for (const item of items) {
        const id = item.observation_id || item.id || item.uuid || null
        if (!id) continue
        if (processed.has(id)) continue
        try {
          logger.info('Indexing observation (http)', { id })
          await forward(item)
          processed.add(id)
          await saveProcessed(processed)
            // Optionally publish eval copy to Redis8
            if (redis8) {
              try {
                await redis8.xadd(REDIS8_STREAM_KEY, '*', 'data', JSON.stringify(item))
                logger.info('Published eval copy to Redis8', { id, stream: REDIS8_STREAM_KEY })
              } catch (err) {
                logger.warn('Failed to publish eval copy to Redis8', { err: err.message })
              }
            }
            logger.info('Indexed observation (http)', { id })
        } catch (err) {
          logger.error('Failed to index (http)', { id, err: err.message })
        }
      }
    } catch (err) {
      logger.warn('Poll error', { err: err.message })
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch(err => { logger.error('Fatal', { err: err.message }); process.exit(1) })
