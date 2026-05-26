#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const cwd = process.cwd();
const cardsPath = path.join(cwd, 'memory','knowledge','document-knowledge-cards.langext.jsonl');
const edgesPath = path.join(cwd, 'memory','knowledge','document-knowledge-edges.jsonl');
const outPacks = path.join(cwd, 'memory','knowledge','document-knowledge-ace-packs.jsonl');
const manifestPath = path.join(cwd, 'memory','knowledge','document-knowledge-manifest.json');

function parseLines(text){ return text.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return null} }).filter(Boolean); }

async function main(){
  console.log('ACE pack synthesis: dry-run (no external calls)');
  let raw;
  try{ raw = await fs.readFile(cardsPath,'utf8'); }catch(e){ console.error('Cards missing:', cardsPath); process.exitCode=2; return }
  const cards = parseLines(raw);
  const byId = new Map(cards.map(c=>[c.cardId, c]));

  let edgeRaw = '';
  try{ edgeRaw = await fs.readFile(edgesPath,'utf8'); }catch(e){}
  const edges = edgeRaw ? parseLines(edgeRaw) : [];

  // build adjacency
  const adj = new Map();
  for (const e of edges){ if (!adj.has(e.sourceId)) adj.set(e.sourceId, []); adj.get(e.sourceId).push(e); }

  const packs = [];
  for (const c of cards){
    const neighbors = (adj.get(c.cardId) || []).slice(0,50);
    // score neighbors: duplicates=3, implements/depends_on=2, uses=1, others=0.5
    const scored = neighbors.map(n=>{
      let score = 0.5;
      if (n.relation === 'duplicates') score = 3;
      else if (n.relation === 'implements' || n.relation==='depends_on') score = 2;
      else if (n.relation === 'uses') score = 1;
      return { edge: n, score };
    }).sort((a,b)=>b.score - a.score).slice(0,10);

    const contextCards = scored.map(s=>{ const id = s.edge.targetId; const card = byId.get(id); return card ? { cardId: card.cardId, title: card.title, summary: card.summary, featureLabels: card.featureLabels||[] } : { cardId: id, missing: true }; });

    const pack = {
      cardId: c.cardId,
      title: c.title,
      summary: c.summary,
      entities: c.entities || {},
      neighbors: contextCards,
      aceContext: {
        tokensEstimate: Math.max(50, Math.min(1200, Math.floor((c.summary||'').length/4))),
        reason: 'heuristic neighborhood + LangExtract entities'
      },
      generatedAt: new Date().toISOString()
    };
    packs.push(pack);
  }

  await fs.mkdir(path.dirname(outPacks), { recursive: true });
  await fs.writeFile(outPacks, packs.map(p=>JSON.stringify(p)).join('\n') + '\n','utf8');

  // update manifest
  try{
    const man = JSON.parse(await fs.readFile(manifestPath,'utf8'));
    man.generatedAt = new Date().toISOString();
    man.counts = { cards: cards.length, edges: (edges||[]).length, acePacks: packs.length };
    await fs.writeFile(manifestPath, JSON.stringify(man,null,2),'utf8');
  }catch(e){}

  console.log(JSON.stringify({ cards: cards.length, acePacks: packs.length, outPacks }, null, 2));
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
