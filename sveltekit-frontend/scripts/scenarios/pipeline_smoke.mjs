#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
const root = path.resolve(process.cwd());
const REPORT = path.join(root,'.tmp','scenario_pipeline_smoke.json');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'scenarios';

async function exists(p){ return fs.stat(p).then(()=>true).catch(()=>false); }

const EMBED_MODE = (process.env.EMBED_MODE || 'http').toLowerCase();
const DIM = Number(process.env.EMBED_DIM || 768);
const PRECOMPUTED_EMB_PATH = path.join(root, '.tmp', 'precomputed_embeddings.jsonl');

function pseudoVectorFor(text){
  let h = 2166136261 >>> 0;
  for (let i=0;i<text.length;i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  const vec = new Array(DIM);
  let seed = h;
  for (let i=0;i<DIM;i++){
    seed = (seed * 1664525 + 1013904223) >>> 0;
    vec[i] = ((seed % 1000) / 1000) * 2 - 1;
  }
  return vec;
}

async function loadPrecomputed(){
  const map = new Map();
  try{
    if (await exists(PRECOMPUTED_EMB_PATH)){
      const raw = await fs.readFile(PRECOMPUTED_EMB_PATH,'utf8');
      for (const l of raw.trim().split('\n')){
        if (!l) continue; try{ const o = JSON.parse(l); if (o.id) map.set(o.id,o.vector); if (o.source_ref) map.set(o.source_ref,o.vector);}catch(e){}
      }
    }
  }catch(e){}
  return map;
}

async function getEmbedding(q){
  if (EMBED_MODE === 'pseudo') return pseudoVectorFor(q);
  if (EMBED_MODE === 'file'){
    const map = await loadPrecomputed();
    // try direct key, else fallback to pseudo
    if (map.size>0){ const v = map.get(q) || map.get(q.slice(0,32)); if (v) return v; }
    return pseudoVectorFor(q);
  }
  // http
  const url = process.env.EMBED_URL || 'http://localhost:5173/api/embed';
  const embedModel = process.env.EMBED_MODEL || 'embeddinggemma:latest';
  const res = await fetch(url, { 
    method:'POST', 
    headers:{'content-type':'application/json'}, 
    body: JSON.stringify({ model: embedModel, input: q, prompt: q }) 
  });
  if (!res.ok) throw new Error('embed failed');
  const j = await res.json();
  if (Array.isArray(j.data) && Array.isArray(j.data[0].embedding)) return j.data[0].embedding;
  if (Array.isArray(j.embeddings) && Array.isArray(j.embeddings[0])) return j.embeddings[0];
  if (Array.isArray(j.embedding)) return j.embedding;
  throw new Error('unknown embed shape');
}

async function qdrantSearch(vec, top=5){
  const url = `${QDRANT_URL}/collections/${COLLECTION}/points/search`;
  const body = { vector: vec, top };
  const res = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function run(){
  const probe = process.env.SMOKE_PROBE || 'robot startup prompt';
  try{
    const vec = await getEmbedding(probe);
    const results = await qdrantSearch(vec, 5);
    const ok = results?.result?.length>0 || results?.points?.length>0 || results?.hits?.length>0;
    const out = { probe, found: ok, counts: { hits: (results?.result?.length || results?.points?.length || results?.hits?.length || 0) } };
    await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
    await fs.writeFile(REPORT, JSON.stringify(out,null,2),'utf8');
    const summaryPath = path.join(root, '.tmp', 'scenario_pipeline_smoke_summary.md');
    await fs.writeFile(summaryPath, `# Pipeline Smoke\n\n- probe: ${probe}\n- found: ${ok}\n- hits: ${out.counts.hits}\n`, 'utf8');
    console.log(JSON.stringify({ status: ok ? 'ok' : 'fail', report_path: path.relative(root, REPORT), summary_path: path.relative(root, summaryPath), counts: out.counts }));
    if (!ok) process.exit(2);
  }catch(e){
    const out = { probe, found: false, error: e.message };
    await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
    await fs.writeFile(REPORT, JSON.stringify(out,null,2),'utf8');
    const summaryPath = path.join(root, '.tmp', 'scenario_pipeline_smoke_summary.md');
    await fs.writeFile(summaryPath, `# Pipeline Smoke - Error\n\n- probe: ${probe}\n- error: ${e.message}\n`, 'utf8');
    console.error(JSON.stringify({ status: 'error', report_path: path.relative(root, REPORT), summary_path: path.relative(root, summaryPath), error: e.message }));
    process.exit(1);
  }
}

run();
