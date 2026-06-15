#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { loadCentroids, validateDim, buildPointsFromCentroids } from './qdrant-utils.mjs'

const argv = process.argv.slice(2)
const opts = { input: null, collection: null, dryRun: true, write: false, publish: false, dim: 768 }
for (let i=0;i<argv.length;i++){
  const a = argv[i]
  if (a === '--input' && argv[i+1]) { opts.input = argv[++i]; continue }
  if (a === '--collection' && argv[i+1]) { opts.collection = argv[++i]; continue }
  if (a === '--dry-run') { opts.dryRun = true; continue }
  if (a === '--write') { opts.write = true; opts.dryRun = false; continue }
  if (a === '--publish') { opts.publish = true; continue }
  if (a === '--dim' && argv[i+1]) { opts.dim = Number(argv[++i]); continue }
}

if (!opts.input) { console.error('missing --input'); process.exit(1) }
if (!opts.collection) { console.error('missing --collection'); process.exit(1) }
const inPath = path.resolve(opts.input)
if (!fs.existsSync(inPath)) { console.error('input not found', inPath); process.exit(1) }

const centroids = loadCentroids(inPath)
if (!validateDim(centroids, opts.dim)) {
  console.error('invalid vector dim in centroids. expected', opts.dim)
  process.exit(1)
}

const points = buildPointsFromCentroids(centroids, opts.collection)
console.log('points to upsert:', points.length)
console.log('sample point ids:', points.slice(0,3).map(p=>p.id))

if (!opts.write) {
  console.log('Dry-run: not writing to Qdrant. To write add --write')
  console.log('To preview Redis publish: add --publish (no publish in dry-run)')
  process.exit(0)
}

// perform write to Qdrant
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333'
const url = `${QDRANT_URL.replace(/\/$/,'')}/collections/${opts.collection}/points?wait=true`
const body = { points }
console.log('Writing to Qdrant at', url)
const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
if (!res.ok) {
  console.error('Qdrant upsert failed', res.status, await res.text())
  process.exit(1)
}
console.log('Qdrant upsert OK')

if (opts.publish) {
  // delegate to the publish helper script so behavior is centralized
  try {
    const { spawn } = await import('child_process')
    const publishScript = new URL('./publish-bifrost-invalidation.mjs', import.meta.url).pathname
    const args = [publishScript, '--collection', opts.collection, '--publish']
    console.log('Spawning publisher:', 'node', args.join(' '))
    const child = spawn(process.execPath, args, { stdio: 'inherit' })
    const exit = await new Promise((resolve) => child.on('exit', resolve))
    if (exit === 0) console.log('Published Redis invalidation via helper')
    else console.error('Publisher exited with code', exit)
  } catch (e) {
    console.error('Failed to invoke publisher helper:', e?.message || e)
  }
}

