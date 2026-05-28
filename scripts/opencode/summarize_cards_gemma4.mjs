#!/usr/bin/env node
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import { join } from 'path';

const INDEX = '.opencode/cards/index.json';
const CARDS_DIR = '.opencode/cards';
const SUMMARIES_JSONL = '.opencode/cards/summaries.jsonl';
const GEMMA4_URL = process.env.GEMMA4_URL || process.env.OLLAMA_URL || process.env.TURBOQUANT_URL || process.env.LLM_SERVER_URL;
const MODEL = process.env.GEMMA4_MODEL || process.env.OLLAMA_MODEL || 'gemma4';
const CONCURRENCY = Number(process.env.SUMMARY_CONCURRENCY || 1);

function usage(){
  console.log('Usage: node scripts/opencode/summarize_cards_gemma4.mjs [--top N] [--all]');
}

async function readIndex(){
  const raw = await fs.readFile(INDEX, 'utf8');
  return JSON.parse(raw);
}

async function readSeen(){
  try{
    await fs.access(SUMMARIES_JSONL);
  }catch(e){
    return new Set();
  }
  const seen = new Set();
  const rl = readline.createInterface({ input: createReadStream(SUMMARIES_JSONL), crlfDelay: Infinity });
  for await (const line of rl){
    if(!line.trim()) continue;
    try{ const obj = JSON.parse(line); if(obj.card_id) seen.add(obj.card_id); }catch(e){}
  }
  return seen;
}

async function callGemma(prompt){
  if(!GEMMA4_URL) throw new Error('GEMMA4_URL not set');
  const url = GEMMA4_URL.replace(/\/$/, '');
  const payload = {}
  // Ollama-style
  if(url.includes('ollama') || url.includes('v1/chat')){
    payload.model = MODEL;
    payload.prompt = prompt;
  }else{
    payload.model = MODEL;
    payload.prompt = prompt;
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if(!res.ok) throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  try{ return JSON.parse(text); }catch(e){ return { raw: text }; }
}

function buildPrompt(card){
  return `You are an assistant that extracts a short summary and keywords from a document.\nRespond with JSON containing keys: summary (one paragraph), keywords (array of short keywords), tags (array of short tags).\n\nDocument ID: ${card.id}\nSource: ${card.sourceRef || card.file || 'unknown'}\n\nContent:\n${card.text || card.excerpt || ''}`;
}

async function main(){
  const argv = process.argv.slice(2);
  const topArg = argv.indexOf('--top');
  const top = topArg >= 0 ? Number(argv[topArg+1]||50) : 50;
  const all = argv.includes('--all');

  try{
    const index = await readIndex();
    const seen = await readSeen();
    const candidates = all ? index : index.slice(0, top);
    await fs.mkdir('.opencode/cards', { recursive: true });

    for(const meta of candidates){
      if(seen.has(meta.id)){
        console.log('skip (already summarized):', meta.id);
        continue;
      }
      const path = join(CARDS_DIR, meta.file);
      try{
        const raw = await fs.readFile(path, 'utf8');
        const card = JSON.parse(raw);
        const prompt = buildPrompt(card);
        console.log('Summarizing', meta.id);
        try{
          const resp = await callGemma(prompt);
          const summary = resp.summary ?? resp.text ?? resp.output ?? (typeof resp === 'string' ? resp : JSON.stringify(resp));
          const keywords = resp.keywords ?? resp.kws ?? resp.tags ?? [];
          const tags = resp.tags ?? [];
          const out = { card_id: meta.id, sourceRef: card.sourceRef || meta.file, summary: String(summary).trim(), keywords: Array.isArray(keywords)?keywords:[], tags: Array.isArray(tags)?tags:[], mtime: Math.floor(Date.now()/1000) };
          await fs.appendFile(SUMMARIES_JSONL, JSON.stringify(out) + '\n', 'utf8');
          console.log('Wrote summary for', meta.id);
        }catch(e){
          console.error('LLM call failed for', meta.id, e.message);
        }
      }catch(e){
        console.error('Failed to read card', meta.file, e.message);
      }
    }
  }catch(err){
    if(err.message.includes('GEMMA4_URL')){
      console.log('GEMMA4_URL not configured. Start your llama-server/ollama instance and set GEMMA4_URL or OLLAMA_URL.');
    }else{
      console.error('Error:', err.message);
    }
    process.exitCode = 2;
  }
}

main();
