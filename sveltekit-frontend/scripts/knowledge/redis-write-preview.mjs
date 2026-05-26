#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const cwd = process.cwd();
const enrichedPath = path.join(cwd, 'memory','knowledge','document-knowledge-cards.langext.jsonl');
const embedPreview = path.join(cwd, 'memory','knowledge','document-knowledge-embeds.jsonl');
const outPreview = path.join(cwd, 'memory','knowledge','document-knowledge-redis-preview.jsonl');

function parseLines(text){ return text.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return null} }).filter(Boolean); }

async function buildPreview(){
  let raw;
  try{ raw = await fs.readFile(enrichedPath,'utf8'); }catch(e){
    try{ raw = await fs.readFile(path.join(cwd,'memory','knowledge','document-knowledge-cards.jsonl'),'utf8'); }catch(e2){ console.error('No cards found for Redis preview'); process.exitCode=2; return []; }
  }
  const cards = parseLines(raw);

  const preview = [];
  const featureMap = new Map();
  const pruneCandidates = [];

  for (const c of cards){
    const key = `knowledge:card:${c.cardId}`;
    const value = { cardId: c.cardId, title: c.title, summary: c.summary, featureLabels: c.featureLabels||[], retrieval: c.retrieval||{}, lifecycle: c.lifecycle||{}, entities: c.entities||{} };
    preview.push({ key, value });

    for (const f of (c.featureLabels||[])){
      if (!featureMap.has(f)) featureMap.set(f, new Set());
      featureMap.get(f).add(c.cardId);
    }

    const lowConfidence = (c.lifecycle && typeof c.lifecycle.confidence === 'number' && c.lifecycle.confidence < 0.4);
    const noSource = !(c.sourceRefs && c.sourceRefs.length>0);
    if (c.lifecycle && c.lifecycle.status === 'candidate_prune') pruneCandidates.push(c.cardId);
    else if (lowConfidence || noSource) pruneCandidates.push(c.cardId);
  }

  for (const [f, setIds] of featureMap.entries()){
    preview.push({ key: `knowledge:feature:${f}`, value: Array.from(setIds) });
  }

  preview.push({ key: 'knowledge:prune:candidates', value: pruneCandidates });

  return preview;
}

async function writePreview(preview){
  await fs.mkdir(path.dirname(outPreview), { recursive: true });
  const s = preview.map(p=>JSON.stringify(p)).join('\n') + '\n';
  await fs.writeFile(outPreview, s, 'utf8');
}

async function liveWrite(preview){
  const REDIS_URL = process.env.REDIS_URL || process.env.REDIS;
  if (!REDIS_URL) { throw new Error('REDIS_URL not set for live mode'); }
  let Redis;
  try{ Redis = (await import('ioredis')).default; }catch(e){ throw new Error('ioredis not installed; cannot run live writes'); }
  const client = new Redis(REDIS_URL);
  try{
    for (const p of preview){
      const key = p.key;
      const val = JSON.stringify(p.value);
      await client.set(key, val);
    }
    await client.quit();
  }catch(e){ await client.quit().catch(()=>{}); throw e; }
}

async function main(){
  console.log('Redis preview: dry-run (no external writes). Use --live to write to Redis (requires REDIS_URL and ioredis).');
  const live = process.argv.includes('--live');

  const preview = await buildPreview();
  if (!preview) return;
  await writePreview(preview);
  console.log('Wrote preview to', outPreview, 'keys:', preview.length);

  if (live){
    try{ await liveWrite(preview); console.log('Live write completed'); }catch(e){ console.error('Live write failed:', e.message); process.exitCode=3 }
  }
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
