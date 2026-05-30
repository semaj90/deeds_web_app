#!/usr/bin/env node
import process from 'process'

const argv = process.argv.slice(2)
const opts = { collection: null, reason: 'atlas_clusters', dryRun: true }
for (let i=0;i<argv.length;i++){
  const a = argv[i]
  if (a === '--collection' && argv[i+1]) { opts.collection = argv[++i]; continue }
  if (a === '--reason' && argv[i+1]) { opts.reason = argv[++i]; continue }
  if (a === '--dry-run') { opts.dryRun = true; continue }
  if (a === '--publish') { opts.dryRun = false; continue }
}

if (!opts.collection) {
  console.error('missing --collection'); process.exit(1)
}

const msg = JSON.stringify({ collection: opts.collection, reason: opts.reason, ts: new Date().toISOString() })
console.log('Prepared message:', msg)
if (opts.dryRun) {
  console.log('Dry-run: not publishing to Redis. Use --publish to send.')
  process.exit(0)
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
let client = null
try {
  // Prefer ioredis if available (already in repo deps)
  const IORedis = await import('ioredis')
  const IORedisDefault = IORedis.default || IORedis
  client = new IORedisDefault(REDIS_URL)
  await client.connect?.()
  await client.publish('bifrost:collection:updated', msg)
  if (typeof client.disconnect === 'function') await client.disconnect()
  else if (typeof client.quit === 'function') await client.quit()
  console.log('Published to bifrost:collection:updated (ioredis)')
} catch (e) {
  // Fallback to node-redis if ioredis not present
  try {
    const { createClient } = await import('redis')
    client = createClient({ url: REDIS_URL })
    client.on('error', (err) => console.error('Redis error', err))
    await client.connect()
    await client.publish('bifrost:collection:updated', msg)
    console.log('Published to bifrost:collection:updated (redis)')
    await client.disconnect()
  } catch (err) {
    console.error('Failed to publish to Redis:', err.message || err)
    process.exitCode = 2
  }
}
