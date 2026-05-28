#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv){
  const opts = {}
  for (let i=0;i<argv.length;i++){
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.replace(/^--/, '')
    const val = (i+1<argv.length && !argv[i+1].startsWith('--')) ? argv[i+1] : 'true'
    opts[key]=val
  }
  return opts
}

const argv = process.argv.slice(2)
const opts = parseArgs(argv)

// determine repo root from script location unless overridden
const scriptDir = __dirname
const repoRoot = opts['repo-root'] || opts.repoRoot || path.resolve(scriptDir, '../..')

const INPUT = opts.input || path.join(repoRoot, '.tmp', 'atlas-component-profiles.jsonl')
const OUT_JSON = opts.outJson || path.join(repoRoot, '.tmp', 'atlas-component-qdrant-index-report.json')
const OUT_MD = opts.outMd || path.join(repoRoot, 'reports', 'atlas-component-qdrant-index-report.md')
const FAILS = opts.failures || path.join(repoRoot, '.tmp', 'atlas-component-qdrant-failures.jsonl')
const COLLECTION = opts.collection || 'atlas_component_profiles_768'
const BATCH_SIZE = Number(opts['batch-size'] || opts.batchSize || 64)
const EMBEDDING_URL = opts['embedding-url'] || opts['embeddingUrl'] || process.env.EMBEDDING_URL || 'http://127.0.0.1:11434/v1/embeddings'
const QDRANT_URL = opts['qdrant-url'] || process.env.QDRANT_URL || 'http://127.0.0.1:6333'
const VECTOR_SIZE = Number(opts['vector-size'] || opts['vectorSize'] || 768)
const EMBEDDING_MODEL = opts['embedding-model'] || opts.embeddingModel || process.env.EMBEDDING_MODEL || 'embeddinggemma:latest'
const PREFLIGHT_ONLY = opts['preflight-only'] === 'true' || opts['preflight-only'] === true || opts.preflight === 'true' || opts.preflight === true
const DRY_REPORT = opts['dry-run-report'] === 'true' || opts['dry-run-report'] === true || opts['dryRunReport'] === 'true' || opts.dryRunReport === true
const DRY = opts['dry-run'] === 'true' || opts['dry-run'] === true || opts.dry === 'true' || opts.dry === true
const LIMIT = opts.limit ? Number(opts.limit) : undefined

function safeParse(line){
  try{ return JSON.parse(line) }catch(e){ return null }
}

async function fetchJson(url, opts){
  const res = await fetch(url, opts)
  const txt = await res.text()
  try{ return JSON.parse(txt) }catch(e){ return {raw: txt, status: res.status} }
}

async function ensureQdrantCollection(){
  const url = `${QDRANT_URL.replace(/\/+$/,'')}/collections/${encodeURIComponent(COLLECTION)}`
  const body = {vectors: {size: VECTOR_SIZE, distance: 'Cosine'}}
  try{
    const existing = await fetchJson(url)
    if (existing && existing.result && existing.result.vectors) return
  }catch(e){ /* ignore */ }
  const createUrl = `${url}`
  await fetchJson(createUrl, {method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
}

async function embedTexts(texts){
  if (DRY) return texts.map(()=>Array(VECTOR_SIZE).fill(0))
  const body = {input: texts}
  if (EMBEDDING_MODEL) body.model = EMBEDDING_MODEL
  const resp = await fetchJson(EMBEDDING_URL, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
  // handle common shapes
  if (resp && resp.embeddings && Array.isArray(resp.embeddings)) return resp.embeddings
  if (resp && resp.data && Array.isArray(resp.data)) return resp.data.map(d=>d.embedding||d.vector||d)
  if (Array.isArray(resp)) return resp
  if (resp && resp[0] && resp[0].embedding) return resp.map(r=>r.embedding)
  throw new Error('Unrecognized embedding response: '+JSON.stringify(resp))
}

async function fetchEmbeddingModels(){
  try{
    const url = EMBEDDING_URL.replace(/\/v1\/.*$/,'') + '/v1/models'
    const resp = await fetchJson(url)
    if (resp && resp.data && Array.isArray(resp.data)) return resp.data.map(d=>d.id)
    if (Array.isArray(resp)) return resp.map(d=>d.id||d)
  }catch(e){ /* ignore */ }
  return null
}

async function preflightEmbedding(){
  const report = { preflight: { ok: false, checked_model: EMBEDDING_MODEL, embedding_url: EMBEDDING_URL, available_models: null, test_vector_len: null, error: null } }
  const models = await fetchEmbeddingModels()
  report.preflight.available_models = models
  if (models && EMBEDDING_MODEL && !models.includes(EMBEDDING_MODEL)){
    report.preflight.error = `model '${EMBEDDING_MODEL}' not found in embedding service`;
    return report
  }
  if (DRY) {
    // don't call real embedding in DRY mode; simulate
    report.preflight.ok = true
    report.preflight.test_vector_len = VECTOR_SIZE
    return report
  }
  try{
    const testText = ['atlas component profile preflight']
    const body = {input: testText}
    if (EMBEDDING_MODEL) body.model = EMBEDDING_MODEL
    const resp = await fetchJson(EMBEDDING_URL, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
    let vec = null
    if (resp && resp.embeddings && Array.isArray(resp.embeddings)) vec = resp.embeddings[0]
    else if (resp && resp.data && Array.isArray(resp.data)) vec = resp.data[0].embedding||resp.data[0].vector||resp.data[0]
    else if (Array.isArray(resp) && resp[0] && resp[0].embedding) vec = resp[0].embedding
    if (!vec){ report.preflight.error = 'Unrecognized embedding response during preflight: '+JSON.stringify(resp); return report }
    report.preflight.test_vector_len = vec.length
    if (vec.length !== VECTOR_SIZE){ report.preflight.error = `vector length ${vec.length} != expected ${VECTOR_SIZE}`; return report }
    report.preflight.ok = true
    return report
  }catch(e){ report.preflight.error = String(e); return report }
}

async function upsertBatch(points){
  if (DRY) return {upserted: points.length}
  const url = `${QDRANT_URL.replace(/\/+$/,'')}/collections/${encodeURIComponent(COLLECTION)}/points`;
  const body = {points}
  const res = await fetchJson(url, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
  return res
}

async function run(){
  if (!fs.existsSync(INPUT)){
    console.error('Input file not found:', INPUT)
    process.exit(1)
  }
  // embedding preflight
  const preflightReport = await preflightEmbedding()
  if (!preflightReport.preflight.ok){
    // write preflight failure into report files and exit
    const preReport = { total: 0, processed: 0, indexed: 0, failures: 0, preflight: preflightReport.preflight, collection: COLLECTION, embedding_url: EMBEDDING_URL, embedding_model: EMBEDDING_MODEL, started_at: new Date().toISOString(), finished_at: new Date().toISOString() }
    fs.mkdirSync(path.dirname(OUT_JSON), {recursive:true})
    fs.writeFileSync(OUT_JSON, JSON.stringify(preReport, null, 2))
    fs.mkdirSync(path.dirname(OUT_MD), {recursive:true})
    const mdpre = [`# Atlas Component Qdrant Index Report - Preflight Failed`, ``, `- Embedding URL: ${EMBEDDING_URL}`, `- Embedding model: ${EMBEDDING_MODEL}`, `- Preflight error: ${preflightReport.preflight.error}`, ``, `Generated: ${preReport.finished_at}`].join('\n')
    fs.writeFileSync(OUT_MD, mdpre)
    console.error('Preflight failed:', preflightReport.preflight.error)
    process.exit(2)
  }

  const lines = fs.readFileSync(INPUT,'utf8').split(/\r?\n/).filter(Boolean)
  const total = LIMIT ? Math.min(LIMIT, lines.length) : lines.length
  const report = {total, processed:0, indexed:0, failures:0, failures_file: FAILS, collection: COLLECTION, batch_size: BATCH_SIZE, embedding_url: EMBEDDING_URL, qdrant_url: QDRANT_URL, started_at: new Date().toISOString()}
  const failStream = fs.createWriteStream(FAILS,{flags:'w'})

  const toProcess = []
  for (let i=0;i<total;i++){
    const obj = safeParse(lines[i])
    if (!obj){ report.failures++; failStream.write(lines[i]+'\n'); continue }
    // build embedding text
    const parts = []
    if (obj.name) parts.push(obj.name)
    if (obj.what_is_it) parts.push(obj.what_is_it)
    if (obj.sourceRef) parts.push(String(obj.sourceRef))
    if (obj.source_ref) parts.push(String(obj.source_ref))
    if (obj.semantic_labels) parts.push(Array.isArray(obj.semantic_labels)?obj.semantic_labels.join(', '):String(obj.semantic_labels))
    if (obj.dependencies) parts.push(Array.isArray(obj.dependencies)?obj.dependencies.join(', '):String(obj.dependencies))
    if (obj.did_you_mean) parts.push(String(obj.did_you_mean))
    const text = parts.filter(Boolean).join('\n') || JSON.stringify(obj)
    toProcess.push({orig: obj, text})
  }

  // dry-run-report: print/write first N candidate texts and exit without calling embedding/Qdrant
  if (DRY && DRY_REPORT){
    const sample = toProcess.slice(0,5).map(t=>t.text)
    report.sample_texts = sample
    report.processed = 0
    report.indexed = 0
    report.failures = report.failures || 0
    report.preflight = preflightReport.preflight
    report.finished_at = new Date().toISOString()
    fs.mkdirSync(path.dirname(OUT_JSON), {recursive:true})
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
    fs.mkdirSync(path.dirname(OUT_MD), {recursive:true})
    const md2 = [`# Atlas Component Qdrant Index Report (Dry-run Report)`, ``, `- Collection: ${COLLECTION}`, `- Total input: ${report.total}`, `- Sample texts (first ${sample.length}):`, ``, ...sample.map(s=>`- ${s.replace(/\n/g,' / ')}`), ``, `- Preflight OK: ${preflightReport.preflight.ok}`, `- Embedding URL: ${EMBEDDING_URL}`, `- Embedding model: ${EMBEDDING_MODEL}`, ``, `Generated: ${report.finished_at}`].join('\n')
    fs.writeFileSync(OUT_MD, md2)
    console.log('Dry-run-report written to', OUT_JSON, OUT_MD)
    process.exit(0)
  }

  if (!DRY){
    try{ await ensureQdrantCollection() }catch(e){ console.warn('Failed to ensure collection (continuing):', e.message) }
  }

  // attach preflight to final report
  report.preflight = preflightReport.preflight

  for (let i=0;i<toProcess.length;i+=BATCH_SIZE){
    const window = toProcess.slice(i, i+BATCH_SIZE)
    const texts = window.map(w=>w.text)
    let embs
    try{ embs = await embedTexts(texts) }catch(e){
      // mark all in window as failures
      for (const w of window){ failStream.write(JSON.stringify({error: e.message, row: w.orig})+'\n'); report.failures++ }
      continue
    }
    // normalize embeddings
    if (!Array.isArray(embs) || embs.length !== texts.length){
      for (const w of window){ failStream.write(JSON.stringify({error: 'embedding-length-mismatch', row: w.orig})+'\n'); report.failures++ }
      continue
    }
    const points = []
    for (let j=0;j<window.length;j++){
      const id = window[j].orig.sourceRef || window[j].orig.source_ref || `atlas-${i+j}`
      const vector = embs[j].map(Number)
      if (!vector || vector.length===0){ failStream.write(JSON.stringify({error:'empty-vector', row: window[j].orig})+'\n'); report.failures++; continue }
      const payload = {source: window[j].orig}
      points.push({id: String(id), vector, payload})
    }
    try{
      const res = await upsertBatch(points)
      report.indexed += points.length
    }catch(e){
      for (const p of points){ failStream.write(JSON.stringify({error: e.message, point: p})+'\n'); report.failures++ }
    }
    report.processed += window.length
    console.log(`Processed ${report.processed}/${report.total} (indexed ${report.indexed}, failures ${report.failures})`)
  }

  failStream.end()
  report.finished_at = new Date().toISOString()
  fs.mkdirSync(path.dirname(OUT_JSON), {recursive:true})
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  // write markdown summary
  fs.mkdirSync(path.dirname(OUT_MD), {recursive:true})
  const md = [`# Atlas Component Qdrant Index Report`, ``, `- Collection: ${COLLECTION}`, `- Total input: ${report.total}`, `- Indexed: ${report.indexed}`, `- Failures: ${report.failures}`, `- Failures file: ${FAILS}`, `- Embedding URL: ${EMBEDDING_URL}`, `- Qdrant URL: ${QDRANT_URL}`, `- Dry run: ${DRY}`, ``, `Generated: ${report.finished_at}`].join('\n')
  fs.writeFileSync(OUT_MD, md)
  console.log('Wrote', OUT_JSON, OUT_MD, 'failures ->', FAILS)
}

run().catch(e=>{ console.error('Fatal error', e); process.exitCode=2 })
