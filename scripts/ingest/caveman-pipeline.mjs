#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const OPENCODE = path.join(ROOT, '.opencode');
const CARDS = path.join(OPENCODE, 'cards');
const CACHE = path.join(OPENCODE, 'cache');

await fs.mkdir(CARDS, { recursive: true });
await fs.mkdir(CACHE, { recursive: true });

function idFor(source, n){ return crypto.createHash('sha1').update(source+':'+n).digest('hex').slice(0,16); }

function tagFromPath(p){
  const parts = p.split(/[\\/]/).filter(Boolean);
  const tag = parts.length? parts[0] : 'root';
  return tag;
}

function detectTopics(text){
  const kws = ['contract','evidence','qdrant','memory','summary','search','embed','legal','code'];
  const found = new Set();
  const t = text.toLowerCase();
  for(const k of kws) if(t.includes(k)) found.add(k);
  return Array.from(found);
}

async function splitFile(filePath){
  const raw = await fs.readFile(filePath,'utf8');
  // approximate tokens by chars (1 token ~ 4 chars). target 800 tokens ~ 3200 chars
  const chunkChars = 3200; // ~800 tokens
  const out = [];
  let i=0; let n=0;
  while(i<raw.length){
    const chunk = raw.slice(i, i+chunkChars);
    const text = chunk.trim();
    if(text) out.push({n: ++n, text});
    i += chunkChars;
  }
  return out;
}

async function ingest(){
  const roots = ['docs','notes'];
  for(const r of roots){
    const dir = path.join(ROOT, r);
    try{
      const files = await fs.readdir(dir, { withFileTypes:true });
      for(const f of files){
        if(!f.isFile()) continue;
        if(!/\.(md|txt)$/i.test(f.name)) continue;
        if(['node_modules','.svelte-kit','.vite','dist','build','logs'].some(x=> dir.includes(x))) continue;
        const full = path.join(dir,f.name);
        const stats = await fs.stat(full);
        if(stats.size > 5_000_000){ console.warn('skipping large file', full); continue; }
        const chunks = await splitFile(full);
        for(const c of chunks){
          const id = idFor(full, c.n);
          const sourceRef = `${path.join(r,f.name)}#chunk-${c.n}`;
          const tags = [ `source:${r}`, `ext:${path.extname(f.name).slice(1)}`, `file:${f.name}`, `folder:${tagFromPath(path.join(r,f.name))}` ];
          const topics = detectTopics(c.text);
          topics.forEach(t=>tags.push(`topic:${t}`));
          const card = { id, sourceRef, text: c.text, tags, mtime: Math.floor(Date.now()/1000) };
          const outPath = path.join(CARDS, `${id}.json`);
          await fs.writeFile(outPath, JSON.stringify(card,null,2),'utf8');
          // cache small excerpt
          const cacheObj = { id, sourceRef, summary: card.text.slice(0,300), tags };
          await fs.writeFile(path.join(CACHE, `${id}.json`), JSON.stringify(cacheObj,null,2),'utf8');
        }
      }
    }catch(e){ /* ignore missing folders */ }
  }
  console.log('Ingest complete. Cards written to', CARDS);
}

function rgAvailable(){
  try{ const r = spawnSync('rg',['--version'],{encoding:'utf8'}); return r.status===0; }catch(e){return false}
}

function rgSearch(keyword){
  if(!rgAvailable()){ console.log('rg not found — falling back to JSON search'); return null; }
  try{
    const r = spawnSync('rg',['-n','-i',keyword, path.join(OPENCODE,'cards')],{encoding:'utf8', maxBuffer: 1024*1024*5});
    return r.stdout.split('\n').filter(Boolean).slice(0,200);
  }catch(e){ return null; }
}

async function jsSearch(keyword){
  const files = await fs.readdir(CARDS).catch(()=>[]);
  const hits = [];
  for(const f of files){
    if(!f.endsWith('.json')) continue;
    const j = JSON.parse(await fs.readFile(path.join(CARDS,f),'utf8'));
    if(j.text.toLowerCase().includes(keyword.toLowerCase()) || j.tags.join(' ').toLowerCase().includes(keyword.toLowerCase())) hits.push({id:j.id, sourceRef:j.sourceRef});
  }
  return hits;
}

async function main(){
  const cmd = process.argv[2] || 'run';
  if(cmd==='split' || cmd==='run'){
    await ingest();
  }
  if(cmd==='search' || cmd==='run'){
    const kw = process.argv[3] || 'contract';
    const rg = rgSearch(kw);
    if(rg){
      console.log('rg results sample:\n', rg.slice(0,20).join('\n'));
    }else{
      const js = await jsSearch(kw);
      console.log('js search results count', js.length, 'sample', js.slice(0,10));
    }
  }
  console.log('Caveman pipeline done. Use Gemma4 to summarize top cards, then embed + upsert to Qdrant atlas_cards.');
}

main().catch(e=>{ console.error(e); process.exit(1); });
