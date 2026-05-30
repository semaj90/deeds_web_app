#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const argv = process.argv.slice(2)
const opts = {
  url: 'http://localhost:5984',
  db: 'opencode_ndjson',
  files: [],
  apply: false,
  user: null,
  pass: null,
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--url' && argv[i+1]) { opts.url = argv[++i]; continue }
  if (a === '--db' && argv[i+1]) { opts.db = argv[++i]; continue }
  if (a === '--file' && argv[i+1]) { opts.files.push(argv[++i]); continue }
  if (a === '--user' && argv[i+1]) { opts.user = argv[++i]; continue }
  if (a === '--pass' && argv[i+1]) { opts.pass = argv[++i]; continue }
  if (a === '--apply') { opts.apply = true; continue }
}

if (opts.files.length === 0) {
  const defaults = [
    '.opencode/ingest/nodes.ndjson',
    '.opencode/recommendations/tasks.ndjson',
    '.opencode/fixes/fixes.ndjson',
  ]
  opts.files = defaults.filter(p => fs.existsSync(p))
}

if (opts.files.length === 0) {
  console.error('No ndjson files found to archive.');
  process.exit(1)
}

const BATCH = 500

async function checkCouch() {
  try {
    const res = await fetch(opts.url, { headers: authHeaders() })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return true
  } catch (e) {
    return false
  }
}

async function ensureDb() {
  const dbUrl = `${opts.url.replace(/\/$/, '')}/${opts.db}`
  const res = await fetch(dbUrl, { headers: authHeaders() })
  if (res.status === 200) return true
  if (res.status === 404) {
    const create = await fetch(dbUrl, { method: 'PUT', headers: authHeaders() })
    if (!create.ok) throw new Error('Failed to create DB: ' + create.status)
    return true
  }
  throw new Error('CouchDB unexpected response: ' + res.status)
}

async function bulkDocs(docs) {
  const dbUrl = `${opts.url.replace(/\/$/, '')}/${opts.db}/_bulk_docs`
  const res = await fetch(dbUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ docs }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`_bulk_docs failed: ${res.status} ${text}`)
  }
  return res.json()
}

function authHeaders() {
  if (opts.user && opts.pass) {
    const tok = Buffer.from(`${opts.user}:${opts.pass}`).toString('base64')
    return { Authorization: `Basic ${tok}` }
  }
  return {}
}

async function run() {
  console.log('Files to archive:', opts.files)
  if (!opts.apply) console.log('[DRY RUN] not writing to CouchDB; use --apply to persist')

  const couchAvailable = await checkCouch()
  if (!couchAvailable && opts.apply) {
    console.error('CouchDB not reachable at', opts.url)
    process.exit(2)
  }

  if (opts.apply) await ensureDb()

  for (const f of opts.files) {
    console.log('Processing', f)
    const rl = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
    console.log('  lines:', rl.length)
    if (!opts.apply) {
      const sample = rl.slice(0,3).map(l => { try { return JSON.parse(l) } catch(e){ return l } })
      console.log('  sample:', sample)
      continue
    }

    const docs = []
    for (const line of rl) {
      try {
        const obj = JSON.parse(line)
        if (!obj._id) obj._id = obj.id || obj.taskId || cryptoId()
        docs.push(obj)
        if (docs.length >= BATCH) {
          try {
            await bulkDocs(docs)
          } catch (err) {
            if (err.message.includes('413')) {
              console.warn('  Bulk insert failed (413 Payload Too Large). Falling back to single-document insertion...');
              for (const doc of docs) {
                try {
                  await bulkDocs([doc])
                } catch (singleErr) {
                  console.error(`  Failed to archive document ${doc._id}: ${singleErr.message}`);
                }
              }
            } else {
              throw err;
            }
          }
          docs.length = 0
        }
      } catch (e) {
        console.warn('  skipping invalid json line')
      }
    }
    if (docs.length) {
      try {
        await bulkDocs(docs)
      } catch (err) {
        if (err.message.includes('413')) {
          console.warn('  Bulk insert failed (413 Payload Too Large). Falling back to single-document insertion...');
          for (const doc of docs) {
            try {
              await bulkDocs([doc])
            } catch (singleErr) {
              console.error(`  Failed to archive document ${doc._id}: ${singleErr.message}`);
            }
          }
        } else {
          throw err;
        }
      }
    }
    console.log('  archived', f)
  }
  console.log('Done.')
}

function cryptoId() { try { return (globalThis.crypto && crypto.randomUUID()) || Math.random().toString(36).slice(2) } catch(e) { return Math.random().toString(36).slice(2) } }

run().catch(err => { console.error(err); process.exit(3) })
