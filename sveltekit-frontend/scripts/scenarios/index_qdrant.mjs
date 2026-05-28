#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const root = path.resolve(process.cwd());
const ndjsonPath = path.join(root, '.tmp', 'jsonb_export.ndjson');
const alternateNdjsonPath = path.join(root, 'sveltekit-frontend', '.tmp', 'jsonb_export.ndjson');
const candidates = [
  path.join(root, '.cache', 'cards'),
  path.join(root, '..', '.cache', 'cards'),
  path.join(root, 'sveltekit-frontend', '.cache', 'cards')
];

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const EMBED_MODE = (process.env.EMBED_MODE || 'http').toLowerCase(); // pseudo | file | http
const EMBED_ENDPOINTS = [
  process.env.EMBED_URL || 'http://localhost:5173/api/embed',
  process.env.OLLAMA_EMBED_URL || 'http://localhost:11434/api/embed',
  process.env.OLLAMA_EMBED_URL_ALT || 'http://localhost:11434/api/embeddings'
];
const EMBED_BATCH_SIZE = Number(process.env.EMBED_BATCH_SIZE || 128);
const PRECOMPUTED_EMB_PATH = path.join(root, '.tmp', 'precomputed_embeddings.jsonl');

const COLLECTION = process.env.QDRANT_COLLECTION || 'scenarios';
const DIM = Number(process.env.EMBED_DIM || 768);
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

async function exists(p){ return fs.stat(p).then(()=>true).catch(()=>false); }

async function readNdjson(){
  if (await exists(ndjsonPath)) return (await fs.readFile(ndjsonPath,'utf8')).trim().split('\n').map(l=>JSON.parse(l));
  if (await exists(alternateNdjsonPath)) return (await fs.readFile(alternateNdjsonPath,'utf8')).trim().split('\n').map(l=>JSON.parse(l));
  // fallback: find meta.json files
  for (const c of candidates) {
    const metaDir = c;
    if (await exists(metaDir)) {
      const files = await fs.readdir(metaDir);
      const metas = [];
      for (const f of files) if (f.endsWith('.meta.json')) {
        const raw = await fs.readFile(path.join(metaDir,f),'utf8');
        metas.push(JSON.parse(raw));
      }
      return metas;
    }
  }
  return [];
}

async function pseudoVectorFor(text){
  // deterministic pseudo vector from text hash
  let h = 2166136261 >>> 0;
  for (let i=0;i<text.length;i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  const vec = new Array(DIM);
  let seed = h;
  for (let i=0;i<DIM;i++){
    seed = (seed * 1664525 + 1013904223) >>> 0;
    vec[i] = ((seed % 1000) / 1000) * 2 - 1; // [-1,1)
  }
  return vec;
}

let precomputedMap = null;
async function loadPrecomputed(){
  if (precomputedMap !== null) return precomputedMap;
  precomputedMap = new Map();
  try{
    if (await exists(PRECOMPUTED_EMB_PATH)){
      const raw = await fs.readFile(PRECOMPUTED_EMB_PATH,'utf8');
      for (const l of raw.trim().split('\n')){
        if (!l) continue;
        try{ const o = JSON.parse(l); if (o.id) precomputedMap.set(o.id, o.vector); if (o.source_ref) precomputedMap.set(o.source_ref, o.vector); }catch(e){}
      }
    }
  }catch(e){}
  return precomputedMap;
}

async function tryEmbed(text, meta){
  // meta may contain id, sourceRef, content_hash
  if (EMBED_MODE === 'pseudo') return pseudoVectorFor(text || (meta?.sourceRef || meta?.path || ''));
  if (EMBED_MODE === 'file'){
    const map = await loadPrecomputed();
    const keys = [meta?.id, meta?.sourceRef, meta?.path, meta?.content_hash].filter(Boolean);
    for (const k of keys) if (map.has(k)) return map.get(k);
    // fallback deterministic but marked
    return pseudoVectorFor(text || (meta?.sourceRef || meta?.path || ''));
  }
  // HTTP mode: try endpoints sequentially
  const embedModel = process.env.EMBED_MODEL || 'embeddinggemma:latest';
  for (const url of EMBED_ENDPOINTS){
    if (!url) continue;
    try{
      const res = await fetch(url, { 
        method:'POST', 
        headers:{'content-type':'application/json'}, 
        body: JSON.stringify({ model: embedModel, input: text, prompt: text }) 
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (Array.isArray(j.data) && Array.isArray(j.data[0].embedding)) return j.data[0].embedding;
      if (Array.isArray(j.embeddings) && Array.isArray(j.embeddings[0])) return j.embeddings[0];
      if (Array.isArray(j.embedding)) return j.embedding;
      if (Array.isArray(j)) return j;
      if (j.result && Array.isArray(j.result[0]?.embedding)) return j.result[0].embedding;
    }catch(e){ continue; }
  }
  throw new Error('No embedding endpoint responded');
}

async function ensureCollection(){
  const url = `${QDRANT_URL}/collections/${COLLECTION}`;
  const resp = await fetch(url);
  if (resp.status===200) return true;
  // create
  const createUrl = `${QDRANT_URL}/collections/${COLLECTION}`;
  const body = {
    vectors: { size: DIM, distance: 'Cosine' },
    optimizers_config: { indexing_threshold: 100 }
  };
  const r = await fetch(createUrl, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Failed to create Qdrant collection: ' + await r.text());
  return true;
}

async function upsertPoints(points){
  if (dryRun){
    return { upserted: points.length };
  }
  const url = `${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`;
  const body = { points };
  const r = await fetch(url, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function run(){
  const items = await readNdjson();
  console.log('Found', items.length, 'items');
  if (items.length===0) return process.exit(0);
  await ensureCollection();

  const points = [];
  for (const it of items){
    const text = it.summary || it.path || '';
    let vector=null;
    try{ vector = await tryEmbed(text, it); } catch(e){ console.warn('embed failed for', it.path, e.message); continue; }
    const rawId = it.id || (it.sourceRef || it.path) + (it.content_hash||'');
    const md5 = crypto.createHash('md5').update(rawId).digest('hex');
    const id = `${md5.slice(0,8)}-${md5.slice(8,12)}-${md5.slice(12,16)}-${md5.slice(16,20)}-${md5.slice(20,32)}`;
    const payload = {
      scenario_id: it.id || null,
      source_ref: it.sourceRef || it.path,
      content_hash: it.content_hash || null,
      area: it.area || null,
      schema_version: it.schema_version || null,
      confidence_threshold: it.confidence_threshold ?? 0.75,
      requires_llm: it.requires_llm ?? false
    };
    points.push({ id, vector, payload });
  }

  let res = null;
  await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
  if (points.length === 0) {
    const report = { collection: COLLECTION, dim: DIM, input: items.length, to_upsert: 0, dryRun, note: 'no embeddings generated; check EMBED_URL or Ollama' };
    const reportPath = path.join(root, '.tmp', 'scenario_index_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    const summaryPath = path.join(root, '.tmp', 'scenario_index_report_summary.md');
    await fs.writeFile(summaryPath, `# Scenario Index Report\n\n- input: ${items.length}\n- to_upsert: 0\n- note: no embeddings generated; check EMBED_URL or Ollama\n`, 'utf8');
    console.log(JSON.stringify({ status: 'ok', report_path: path.relative(root, reportPath), summary_path: path.relative(root, summaryPath), counts: { input: items.length, to_upsert: 0 } }));
    return;
  }
  const resData = await upsertPoints(points);
  const report = { collection: COLLECTION, dim: DIM, input: items.length, to_upsert: points.length, dryRun, qdrant: resData };
  const reportPath = path.join(root, '.tmp', 'scenario_index_report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  const summaryPath = path.join(root, '.tmp', 'scenario_index_report_summary.md');
  await fs.writeFile(summaryPath, `# Scenario Index Report\n\n- input: ${items.length}\n- to_upsert: ${points.length}\n- collection: ${COLLECTION}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'ok', report_path: path.relative(root, reportPath), summary_path: path.relative(root, summaryPath), counts: { input: items.length, to_upsert: points.length } }));
}

run().catch(err=>{ console.error(err); process.exit(1); });
