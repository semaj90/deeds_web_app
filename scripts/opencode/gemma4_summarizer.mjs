#!/usr/bin/env node
import fs from 'fs/promises';
import { join } from 'path';

const CARDS_INDEX = '.opencode/cards/index.json';
const CARDS_DIR = '.opencode/cards';
const CACHE_DIR = '.opencode/cache';

const GEMMA4_URL = process.env.GEMMA4_URL || process.env.OLLAMA_URL || process.env.LLM_SERVER_URL || process.env.GEMMA4_FALLBACK_URL;
const GEMMA4_MODEL = process.env.GEMMA4_MODEL || 'gemma4';
const CACHE_SUMMARIES = '.opencode/cards/summaries.jsonl';

function usage(){
  console.log('Usage: node scripts/opencode/gemma4_summarizer.mjs <query> [--top N] [--force] [--dry-run]');
  console.log('Endpoint detection priority: GEMMA4_URL, OLLAMA_URL, LLM_SERVER_URL, http://localhost:8080/v1/chat/completions, http://localhost:11434/api/chat');
}

function buildPrompt(card){
  return `Summarize the following document into a short JSON with keys: summary (one concise paragraph), tags (comma-separated keywords).\n\nDocument:\n${card.title}\n\n${card.text || card.excerpt || ''}`;
}

async function detectEndpoint(){
  // Priority: env vars or defaults
  let url = GEMMA4_URL || process.env.GEMMA4_FALLBACK_URL || process.env.OLLAMA_URL || process.env.LLM_SERVER_URL;
  if(!url) {
    // try local defaults
    url = 'http://localhost:8080/v1/chat/completions';
  }
  url = url.replace(/\/$/, '');
  let style = 'unknown';
  if(/\/v1\//.test(url) || /chat\.completions/.test(url)) style = 'openai';
  if(/\/api\/chat/.test(url) || /:11434/.test(url)) style = 'ollama';
  return { url, style };
}

async function callLLM(prompt, opts={}){
  const { url, style } = await detectEndpoint();
  console.log('LLM endpoint:', url, 'style:', style);

  if(opts.dryRun){
    return { summary: `DRY_RUN summary for prompt (${prompt.slice(0,80)}...)`, tags: [] };
  }

  if(style === 'openai'){
    const payload = { model: GEMMA4_MODEL, messages: [{ role: 'user', content: prompt }] };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if(!res.ok) throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || JSON.stringify(data);
    // attempt to parse JSON from content
    try{ return JSON.parse(content); }catch(e){ return { summary: content, tags: [] }; }
  }

  // Ollama-style
  if(style === 'ollama'){
    const payload = { messages: [{ role: 'user', content: prompt }], model: GEMMA4_MODEL };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if(!res.ok) throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const content = data?.responses?.[0] || data?.output || JSON.stringify(data);
    try{ return JSON.parse(content); }catch(e){ return { summary: content, tags: [] }; }
  }

  // Unknown style: best-effort POST
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model: GEMMA4_MODEL }) });
  if(!res.ok) throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  try{ return JSON.parse(text); }catch(e){ return { summary: text, tags: [] }; }
}

async function main(){
  const argv = process.argv.slice(2);
  if(argv.length === 0){ usage(); process.exit(1); }
  const query = argv[0];
  const topNIndex = argv.indexOf('--top');
  const topN = topNIndex >= 0 ? Number(argv[topNIndex+1] || 20) : 20;

  try{
    const idxRaw = await fs.readFile(CARDS_INDEX, 'utf8');
    const index = JSON.parse(idxRaw);
    // score by occurrences of query in title+excerpt
    const scored = index.map(i=>{
      const hay = (i.title + ' ' + (i.excerpt||'')).toLowerCase();
      const q = query.toLowerCase();
      const score = (hay.split(q).length - 1);
      return { ...i, score };
    }).filter(i=>i.score>0).sort((a,b)=>b.score-a.score).slice(0, topN);

    console.log(`Found ${scored.length} matching cards (top ${topN}).`);
    if(scored.length === 0){ console.log('No matches; try a broader query.'); return; }

    const summariesOut = [];
    const force = argv.includes('--force');
    const dryRun = argv.includes('--dry-run');

    for(const cardMeta of scored){
      const cardPath = join(CARDS_DIR, cardMeta.file);
      const raw = await fs.readFile(cardPath, 'utf8');
      const card = JSON.parse(raw);
      const prompt = buildPrompt(card);
      console.log('Summarizing', cardMeta.id, '...');
      const outPath = join(CACHE_DIR, `${cardMeta.id}.summary.json`);
      try{
        await fs.mkdir(CACHE_DIR, { recursive: true });
      }catch(e){}
      // skip if exists and not forced
      if(!force){
        try{ await fs.access(outPath); console.log('Skipping existing summary for', cardMeta.id); continue; }catch(e){}
      }
      try{
        const resp = await callLLM(prompt, { dryRun });
        const out = { id: cardMeta.id, summary: resp.summary ?? resp.text ?? resp.raw ?? String(resp), tags: resp.tags ?? [] };
        await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
        summariesOut.push({ card_id: cardMeta.id, sourceRef: card.file || null, summary: out.summary, keywords: out.tags || [], tags: ['source:llm','project:opencode'], file: cardMeta.file, mtime: 0 });
        console.log('Wrote summary to', outPath);
      }catch(e){
        console.error('Failed to summarize', cardMeta.id, e.message);
      }
    }
    // append to global summaries.jsonl
    if(summariesOut.length){
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const lines = summariesOut.map(s=>JSON.stringify(s)).join('\n') + '\n';
      await fs.appendFile(CACHE_SUMMARIES, lines, 'utf8');
      console.log('Appended', summariesOut.length, 'summaries to', CACHE_SUMMARIES);
    }
  }catch(err){
    if(err.message.includes('GEMMA4_URL')){
      console.log('\nGEMMA4_URL not configured. To run locally with llama-server.exe, start it and set:');
      console.log('\n  $env:GEMMA4_URL = "http://localhost:8080/"');
      console.log('Then retry the command.');
    }else{
      console.error('Error:', err.message);
    }
    process.exitCode = 2;
  }
}

main();
