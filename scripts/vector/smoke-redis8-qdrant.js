#!/usr/bin/env node
import Redis from 'ioredis'
import fetch from 'node-fetch'
import os from 'os'

const REDIS_URL = process.env.REDIS8_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6380'
const STREAM_KEY = process.env.REDIS_STREAM_KEY || 'claude-mem-stream'
const GROUP = process.env.REDIS_CONSUMER_GROUP || 'claude-mem-group'
const CONSUMER = process.env.REDIS_CONSUMER_NAME || `smoke-${process.pid}`
const REDIS8_STREAM_KEY = process.env.REDIS8_STREAM_KEY || 'ace:memory:events-eval'
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333'

async function safe(fn) {
  try { return await fn() } catch (err) { return { error: String(err) } }
}

async function main() {
  console.log('Smoke: Redis8 + Qdrant — connecting to', REDIS_URL, 'and', QDRANT_URL)
  const redis = new Redis(REDIS_URL)
  try {
    const pong = await safe(() => redis.ping())
    console.log('PING ->', pong)

    const info = await safe(() => redis.info())
    if (info.error) console.warn('INFO failed:', info.error)
    else console.log('INFO length:', typeof info === 'string' ? info.length : 'n/a')

    // Ensure consumer group exists
    try {
      await redis.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM')
      console.log('Created consumer group', GROUP)
    } catch (err) {
      if (/BUSYGROUP/.test(String(err))) console.log('Consumer group exists')
      else console.warn('xgroup create error:', String(err))
    }

    // XADD a test entry
    const testData = { source: 'smoke', summary: 'smoke test', host: os.hostname() }
    const xid = await safe(() => redis.xadd(STREAM_KEY, '*', ...Object.entries(testData).flat()))
    if (xid.error) {
      console.error('XADD failed:', xid.error)
    } else {
      console.log('XADD ->', xid)

      // Try to read with XREADGROUP (non-blocking short block)
      const res = await safe(() => redis.xreadgroup('GROUP', GROUP, CONSUMER, 'BLOCK', 2000, 'COUNT', 1, 'STREAMS', STREAM_KEY, '>'))
      if (res && !res.error) {
        console.log('XREADGROUP result length:', Array.isArray(res) ? res.length : 'n/a')
        if (Array.isArray(res) && res.length) {
          const entries = res[0][1]
          for (const e of entries) {
            const id = e[0]
            console.log('Read entry id', id)
            // Acknowledge
            await safe(() => redis.xack(STREAM_KEY, GROUP, id))
            console.log('Acked', id)
          }
        }
      } else console.warn('XREADGROUP error or empty', res)
    }

    // XPENDING
    const pending = await safe(() => redis.xpending(STREAM_KEY, GROUP))
    console.log('XPENDING ->', pending && pending.error ? pending.error : pending)

    // XPENDING summary: try to get count if object returned
    if (pending && !pending.error && typeof pending === 'object' && pending.count != null) {
      console.log('Pending count:', pending.count)
    }

    // Check for vector commands support (VADD/VSIM)
    try {
      const cmdVadd = await safe(() => redis.send_command('COMMAND', ['INFO', 'VADD']))
      const cmdVsim = await safe(() => redis.send_command('COMMAND', ['INFO', 'VSIM']))
      const hasVadd = !(cmdVadd && cmdVadd.error)
      const hasVsim = !(cmdVsim && cmdVsim.error)
      console.log('VADD supported:', hasVadd, 'VSIM supported:', hasVsim)
      if (hasVadd && hasVsim) {
        console.log('Attempting lightweight VADD/VSIM test')
        try {
          // Try a best-effort VADD (many Redis vector modules accept simple CSV floats as payload)
          const vecKey = 'smoke:vecs'
          const id1 = 'v1'
          const id2 = 'v2'
          const vec1 = '0.1,0.2,0.3'
          const vec2 = '0.2,0.1,0.4'
          const add1 = await safe(() => redis.send_command('VADD', [vecKey, id1, vec1]))
          const add2 = await safe(() => redis.send_command('VADD', [vecKey, id2, vec2]))
          console.log('VADD results:', add1, add2)

          // Best-effort VSIM: try to simulate similarity between vec1 and vec2
          const vsim = await safe(() => redis.send_command('VSIM', [vecKey, id1, id2, 'K', '1']))
          console.log('VSIM result:', vsim)
        } catch (err) {
          console.warn('VADD/VSIM test failed (non-fatal):', String(err))
        }
      } else {
        console.log('Vector commands not available; skip VADD/VSIM tests')
      }
    } catch (err) {
      console.warn('Vector command probe failed:', String(err))
    }

    // Qdrant collections check
    try {
      const r = await fetch(new URL('/collections', QDRANT_URL).toString())
      if (!r.ok) console.warn('Qdrant /collections returned', r.status)
      else {
        const j = await r.json()
        console.log('Qdrant collections count:', Array.isArray(j.collections) ? j.collections.length : Object.keys(j || {}).length)
      }
    } catch (err) {
      console.warn('Qdrant check failed:', String(err))
    }

    console.log('Smoke complete — close redis connection')
  } finally {
    await redis.quit().catch(() => {})
  }
}

main().catch(err => { console.error('Fatal smoke error', err); process.exit(1) })
