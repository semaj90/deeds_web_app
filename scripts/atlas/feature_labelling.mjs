#!/usr/bin/env node
import fs from 'fs'
import readline from 'readline'
import { createHash } from 'crypto'
import path from 'path'

const tmp = '.tmp'
const callsFile = path.join(tmp, 'calls.jsonl')
const identityFile = path.join(tmp, 'identity-catalog.jsonl')
const outFeatures = path.join(tmp, 'feature_labels.jsonl')
const outKanban = path.join(tmp, 'kanban_tasks.jsonl')

function sha256hex(s){return createHash('sha256').update(s).digest('hex')}

function readJsonl(file){
  if(!fs.existsSync(file)) return []
  return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(l=>{try{return JSON.parse(l)}catch(e){return null}}).filter(Boolean)
}

const identities = readJsonl(identityFile)
const calls = readJsonl(callsFile)

// Build file id -> normalized path map
const fileById = new Map()
for(const it of identities){
  if(it.kind === 'sourceRef' && it.normalizedValue){
    fileById.set(it.id || sha256hex(it.normalizedValue), it.normalizedValue)
  }
}

// Simple heuristic rules for feature mapping
const rules = [
  {re: /\bcache\b|\/cache\//i, feature: 'cache'},
  {re: /\bdb\b|drizzle|pg\b|postgres|sql|query/ig, feature: 'database'},
  {re: /evidence|courtroom|timeline|document|legal|statute/ig, feature: 'evidence'},
  {re: /ollama|gemma|llm|llama|model|embed|embedding/ig, feature: 'llm'},
  {re: /qdrant|vector|pgvector|hnsw/ig, feature: 'vector-search'},
  {re: /gpu|libtorch|tensorrt|cuda|webgpu/ig, feature: 'gpu'},
  {re: /neo4j|graph|pagerank|topology/ig, feature: 'graph'},
  {re: /ui|svelte|component|button|dialog|bits-ui/ig, feature: 'ui'},
  {re: /auth|session|lucia|login|logout|csrf/ig, feature: 'auth'},
  {re: /ingest|upload|minio|seaweed|s3|object storage/ig, feature: 'ingest'},
]

// Aggregate features per source file
const fileFeatures = new Map()

function addFeature(file, feat, example){
  if(!fileFeatures.has(file)) fileFeatures.set(file, {counts:new Map(), examples:new Map()})
  const entry = fileFeatures.get(file)
  entry.counts.set(feat, (entry.counts.get(feat)||0)+1)
  if(!entry.examples.has(feat)) entry.examples.set(feat, example)
}

for(const call of calls){
  const srcId = call.sourceRefId || call.sourceRef || null
  const srcFile = fileById.get(srcId) || call.sourceRef || '<unknown>'
  const callee = (call.calleeImportSource || '') + ' ' + (call.calleeSymbol || '')
  for(const r of rules){
    try{
      if(r.re.test(callee) || (call.calleeImportSource && r.re.test(call.calleeImportSource))){
        addFeature(srcFile, r.feature, {callee: call.calleeSymbol, import: call.calleeImportSource})
      }
    }catch(e){
      // ignore regex errors
    }
  }
}

// Also scan identities for path-based features
for(const [id,file] of fileById.entries()){
  for(const r of rules){
    try{ if(r.re.test(file)) addFeature(file, r.feature, {reason: 'path-match'}) }catch(e){}
  }
}

// Build output arrays
const featureLines = []
const kanbanLines = []

for(const [file,meta] of fileFeatures.entries()){
  const counts = Array.from(meta.counts.entries()).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)
  const top = counts[0]?.name || 'other'
  const id = sha256hex(file)
  featureLines.push(JSON.stringify({file, id, features:counts, topFeature: top}))
  // Create a simple Kanban task for top feature
  kanbanLines.push(JSON.stringify({title:`Label: ${top} — Review ${path.basename(file)}`, file, id, feature:top, notes:`Review ${file} for feature '${top}'. Example: ${JSON.stringify(meta.examples.get(top)||{})}`}))
}

fs.writeFileSync(outFeatures, featureLines.join('\n') + (featureLines.length? '\n':''))
fs.writeFileSync(outKanban, kanbanLines.join('\n') + (kanbanLines.length? '\n':''))

console.log('Feature labelling complete. Wrote:', outFeatures, outKanban)
