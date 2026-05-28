#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
const root = path.resolve(process.cwd());
const ndjson = path.join(root, '.tmp', 'jsonb_export.ndjson');
const out = path.join(root, '.tmp', 'precomputed_embeddings.jsonl');
const DIM = Number(process.env.EMBED_DIM || 768);

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

async function run(){
  try{
    const raw = await fs.readFile(ndjson,'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const outLines = [];
    for (const l of lines){
      const o = JSON.parse(l);
      const id = o.id || o.sourceRef || o.path;
      const text = o.summary || o.path || o.sourceRef || id;
      const vector = pseudoVectorFor(text);
      outLines.push(JSON.stringify({ id, source_ref: o.sourceRef || o.path, vector }));
    }
    await fs.mkdir(path.dirname(out),{recursive:true});
    await fs.writeFile(out, outLines.join('\n')+'\n','utf8');
    console.log('Wrote', out);
  }catch(e){ console.error(e); process.exit(1); }
}

run();
