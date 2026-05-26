#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const cwd = process.cwd();
const cardsPath = path.join(cwd, 'memory','knowledge','document-knowledge-cards.langext.jsonl');
const qdrantPreview = path.join(cwd, 'memory','knowledge','document-knowledge-qdrant-preview.jsonl');
const redisPreview = path.join(cwd, 'memory','knowledge','document-knowledge-redis-preview.jsonl');
const outEdges = path.join(cwd, 'memory','knowledge','document-knowledge-edges.jsonl');
const manifestPath = path.join(cwd, 'memory','knowledge','document-knowledge-manifest.json');

function parseLines(text){ return text.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return null} }).filter(Boolean); }

function jaccard(a=[], b=[]){
  const A = new Set(a||[]); const B = new Set(b||[]);
  if (A.size===0 && B.size===0) return 1;
  const inter = [...A].filter(x=>B.has(x)).length;
  const uni = new Set([...A,...B]).size;
  return uni===0?0:inter/uni;
}

async function main(){
  console.log('HyperGraphRAG: generating heuristic edges (dry-run)');
  let raw;
  try{ raw = await fs.readFile(cardsPath,'utf8'); }catch(e){ console.error('Cards file missing:', cardsPath); process.exitCode=2; return }
  const cards = parseLines(raw);
  const byId = new Map(cards.map(c=>[c.cardId, c]));

  // optional previews
  let qpreview = [];
  try{ qpreview = parseLines(await fs.readFile(qdrantPreview,'utf8')); }catch(e){}
  let rpreview = [];
  try{ rpreview = parseLines(await fs.readFile(redisPreview,'utf8')); }catch(e){}

  const edges = [];

  // heuristic 1: duplicates by exact title or very high overlap in featureLabels+entities
  for (let i=0;i<cards.length;i++){
    for (let j=i+1;j<cards.length;j++){
      const a = cards[i], b = cards[j];
      const titleEq = (a.title||'').toLowerCase() === (b.title||'').toLowerCase();
      const featureSim = jaccard(a.featureLabels||[], b.featureLabels||[]);
      const fileSim = jaccard((a.entities||{}).files||[], (b.entities||{}).files||[]);
      const combined = Math.max(featureSim, fileSim);
      if (titleEq || combined > 0.85){
        edges.push({ relation: 'duplicates', sourceId: a.cardId, targetId: b.cardId, reason: titleEq? 'title_eq' : `high_overlap:${combined.toFixed(3)}` });
        continue;
      }
      if (combined > 0.35){
        edges.push({ relation: 'uses', sourceId: a.cardId, targetId: b.cardId, reason: `feature_file_overlap:${combined.toFixed(3)}` });
      }
    }
  }

  // heuristic 2: depends_on if a references a route/file that another card lists in entities.files or routes
  const fileIndex = new Map();
  for (const c of cards){ for (const f of (c.entities||{}).files||[]) { if (!fileIndex.has(f)) fileIndex.set(f,[]); fileIndex.get(f).push(c.cardId); } }
  for (const c of cards){ for (const ref of (c.sourceRefs||[])){ if (fileIndex.has(ref)){ for (const targetId of fileIndex.get(ref)){ if (targetId !== c.cardId) edges.push({ relation: 'depends_on', sourceId: c.cardId, targetId, reason: `sourceRef:${ref}` }); } } } }

  // heuristic 3: uses_model/uses_table/uses_env from entities
  for (const c of cards){
    for (const m of (c.entities||{}).models||[]) edges.push({ relation: 'uses_model', sourceId: c.cardId, targetId: `model:${m}`, reason: 'entity_model' });
    for (const t of (c.entities||{}).tables||[]) edges.push({ relation: 'uses_table', sourceId: c.cardId, targetId: `table:${t}`, reason: 'entity_table' });
    for (const e of (c.entities||{}).envVars||[]) edges.push({ relation: 'uses_env', sourceId: c.cardId, targetId: `env:${e}`, reason: 'entity_env' });
  }

  // dedupe edges (by JSON key)
  const seen = new Set();
  const dedup = [];
  for (const ed of edges){ const key = `${ed.relation}|${ed.sourceId}|${ed.targetId}|${ed.reason}`; if (!seen.has(key)){ seen.add(key); dedup.push(ed); } }

  await fs.mkdir(path.dirname(outEdges), { recursive: true });
  await fs.writeFile(outEdges, dedup.map(e=>JSON.stringify(e)).join('\n')+'\n','utf8');

  // update manifest
  try{
    const man = JSON.parse(await fs.readFile(manifestPath,'utf8'));
    man.generatedAt = new Date().toISOString();
    man.counts = { cards: cards.length, edges: dedup.length };
    await fs.writeFile(manifestPath, JSON.stringify(man,null,2),'utf8');
  }catch(e){}

  console.log(JSON.stringify({ cards: cards.length, edges: dedup.length, outEdges }, null, 2));
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
