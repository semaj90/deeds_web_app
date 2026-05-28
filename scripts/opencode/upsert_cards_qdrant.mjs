#!/usr/bin/env node
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import { join } from 'path';

const SUMMARIES_JSONL = '.opencode/cards/summaries.jsonl';
const CARDS_DIR = '.opencode/cards';
const EMBED_URL = process.env.EMBED_URL || process.env.OLLAMA_EMBED_URL || process.env.EMBEDDING_URL;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'atlas_cards';

function usage(){
  console.log('Usage: node scripts/opencode/upsert_cards_qdrant.mjs');
}

async function readSummaries(){
  try{
    await fs.access(SUMMARIES_JSONL);
  }catch(e){
    throw new Error('No summaries file found. Run summarize_cards_gemma4.mjs first.');
  }
  const out = [];
  const rl = readline.createInterface({ input: createReadStream(SUMMARIES_JSONL), crlfDelay: Infinity });
  for await (const line of rl){
    if(!line.trim()) continue;
    try{ out.push(JSON.parse(line)); }catch(e){}
  }
  return out;
}

function pseudoEmbed(text){
  // deterministic small vector from hash
  let h = 2166136261 >>> 0;
  for(let i=0;i<text.length;i++){ h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0; }
  const vec = new Array(64).fill(0).map((_,i)=> ((h + i*2654435761) % 1000) / 1000 );
  return vec;
}

async function callEmbed(text){
  if(!EMBED_URL) return pseudoEmbed(text);
  const res = await fetch(EMBED_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({input: text}) });
  if(!res.ok) throw new Error(`Embed failed: ${res.status}`);
  const j = await res.json();
  // support different shapes
  if(Array.isArray(j)) return j[0];
  if(j.embedding) return j.embedding;
  if(j.data && Array.isArray(j.data) && j.data[0].embedding) return j.data[0].embedding;
  throw new Error('Unknown embedding response shape');
}

async function upsertToQdrant(points){
  if(!QDRANT_URL) return null;
  const url = QDRANT_URL.replace(/\/$/, '') + `/collections/${QDRANT_COLLECTION}/points?wait=true`;
  const body = { points };
  const res = await fetch(url, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!res.ok) throw new Error(`Qdrant upsert failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main(){
  try{
    const summaries = await readSummaries();
    const ndjsonPath = '.opencode/qdrant-upload.ndjson';
    await fs.mkdir('.opencode', { recursive: true });
    const ndjsonLines = [];
    for(const s of summaries){
      const cardFile = s.sourceRef || ''; // may be file
      const file = cardFile.split('#')[0];
      const text = s.summary || '';
      let vector;
      try{ vector = await callEmbed(text); }catch(e){ console.error('Embedding failed for', s.card_id, e.message); vector = pseudoEmbed(text); }
      const payload = { card_id: s.card_id, sourceRef: s.sourceRef, summary: s.summary, keywords: s.keywords || [], tags: s.tags || [], file };
      const point = { id: s.card_id, vector, payload };
      ndjsonLines.push(JSON.stringify(point));
      // try live upsert per-point if QDRANT_URL set
      if(QDRANT_URL){
        try{
          await upsertToQdrant([point]);
          console.log('Upserted', s.card_id, 'to Qdrant');
        }catch(e){
          console.error('Qdrant upsert failed for', s.card_id, e.message);
        }
      }
    }
    // write NDJSON fallback
    await fs.writeFile(ndjsonPath, ndjsonLines.join('\n') + '\n', 'utf8');
    console.log('Wrote NDJSON to', ndjsonPath);
  }catch(err){
    console.error('Error:', err.message);
    process.exitCode = 2;
  }
}

main();
