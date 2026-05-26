#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

const OUT_DIR = path.join(process.cwd(), 'scripts', 'opencode')
const OUT_FILE = path.join(OUT_DIR, 'audit_progress_observation.json')

const observation = {
  source: 'opencode-audit',
  summary: 'OpenCode audit progress summary: Redis8 eval lane added, Streams consumer patched, smoke scripts added, metrics added (pending verification).',
  details: {
    actions: [
      'Replaced Pub/Sub with Redis Streams consumer',
      'Added redis8-eval docker-compose',
      'Added Node + PowerShell smoke scripts',
      'Added periodic stream metrics logging in poller'
    ],
    filesModified: [
      'scripts/opencode/monitor-claude-mem-poll.mjs',
      'scripts/vector/smoke-redis8-qdrant.js'
    ]
  },
  createdAt: new Date().toISOString()
}

async function main() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true })
  await fs.promises.writeFile(OUT_FILE, JSON.stringify(observation, null, 2), 'utf8')
  console.log('Wrote audit observation to', OUT_FILE)

  const CLAUDE_MEM_API = process.env.CLAUDE_MEM_API || 'http://localhost:5173/api/memory/claude-mem'
  try {
    const res = await fetch(CLAUDE_MEM_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(observation) })
    if (!res.ok) console.warn('POST to CLAUDE_MEM_API failed', res.status)
    else console.log('Posted audit observation to CLAUDE_MEM_API')
  } catch (err) {
    console.warn('Could not post to CLAUDE_MEM_API:', String(err))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
