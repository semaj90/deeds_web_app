#!/usr/bin/env node
import fs from 'fs'
import readline from 'readline'
import { createHash } from 'crypto'
import path from 'path'

const FRONTEND_ROOT = 'sveltekit-frontend'
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

// ── Integrate Schema Drift & Gaps into Feature Labeling and Kanban Tasks ─────
const temporalAuditPath = path.join(FRONTEND_ROOT || 'sveltekit-frontend', '.tmp', 'drizzle-temporal-audit.latest.json')
if (fs.existsSync(temporalAuditPath)) {
  try {
    const auditData = JSON.parse(fs.readFileSync(temporalAuditPath, 'utf8'))
    let taskCounter = 1
    
    for (const c of auditData.classifications || []) {
      // 1. Process Column-level Drifts
      if (c.columnDrifts && c.columnDrifts.length > 0) {
        for (const drift of c.columnDrifts) {
          const taskId = `TASK-schema-drift-${String(taskCounter++).padStart(3, '0')}`
          const gapRecord = {
            feature_id: `schema.drift.${c.tableName}.${drift.column}`,
            workspace_task_id: taskId,
            source_ref: c.file || `src/lib/server/db/schema/${c.tableName}.ts`,
            schema_table: c.tableName,
            schema_column: drift.column,
            drift_status: drift.driftType,
            risk: 'medium'
          }
          
          featureLines.push(JSON.stringify({
            file: gapRecord.source_ref,
            id: sha256hex(gapRecord.feature_id),
            features: [{name: 'database', count: 1}],
            topFeature: 'database',
            schema_gap: gapRecord
          }))
          
          kanbanLines.push(JSON.stringify({
            title: `Fix Schema Drift: ${c.tableName}.${drift.column}`,
            file: gapRecord.source_ref,
            id: sha256hex(gapRecord.feature_id),
            feature: 'database',
            workspace_task_id: taskId,
            notes: `Drift Type: ${drift.driftType}. Details: ${drift.details}. Table: ${c.tableName}. Column: ${drift.column}`
          }))
        }
      }
      
      // 2. Process Table-level Gaps (Undeclared or high risk empty)
      if (['LIVE_UNDECLARED_ACTIVE', 'HIGH_RISK_DO_NOT_DROP', 'UNKNOWN_NEEDS_OPERATOR'].includes(c.classification)) {
        const taskId = `TASK-schema-drift-${String(taskCounter++).padStart(3, '0')}`
        const risk = c.classification === 'LIVE_UNDECLARED_ACTIVE' ? 'high' : 'medium'
        const gapRecord = {
          feature_id: `schema.drift.${c.tableName}`,
          workspace_task_id: taskId,
          source_ref: 'drizzle/manual/unjournaled',
          schema_table: c.tableName,
          schema_column: '*',
          drift_status: c.classification,
          risk: risk
        }
        
        featureLines.push(JSON.stringify({
          file: gapRecord.source_ref,
          id: sha256hex(gapRecord.feature_id),
          features: [{name: 'database', count: 1}],
          topFeature: 'database',
          schema_gap: gapRecord
        }))
        
        kanbanLines.push(JSON.stringify({
          title: `Fix Table Gap: ${c.tableName} (${c.classification})`,
          file: gapRecord.source_ref,
          id: sha256hex(gapRecord.feature_id),
          feature: 'database',
          workspace_task_id: taskId,
          notes: `Table: ${c.tableName} is ${c.classification} with row count ${c.rowCount}. Risk: ${risk}`
        }))
      }
    }
    console.log(`🔗 Integrated ${taskCounter - 1} schema drift/gap tasks from temporal audit`)
  } catch (e) {
    console.error(`[ERROR] Failed to integrate temporal audit: ${e.message}`)
  }
}

fs.writeFileSync(outFeatures, featureLines.join('\n') + (featureLines.length? '\n':''))
fs.writeFileSync(outKanban, kanbanLines.join('\n') + (kanbanLines.length? '\n':''))

console.log('Feature labelling complete. Wrote:', outFeatures, outKanban)

