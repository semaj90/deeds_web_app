#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

const cwd = process.cwd();
const enrichedPath = path.join(cwd, 'memory','knowledge','document-knowledge-cards.langext.jsonl');
const outEmbeds = path.join(cwd, 'memory','knowledge','document-knowledge-embeds.jsonl');
const outQdrantPreview = path.join(cwd, 'memory','knowledge','document-knowledge-qdrant-preview.jsonl');

function parseLines(text){ return text.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return null} }).filter(Boolean); }

function shaToFloatsHex(s, dim){
  // deterministic pseudo-embedding from sha1 hex
  const h = createHash('sha1').update(s).digest('hex');
  const out = new Float32Array(dim);
  for (let i=0;i<dim;i++){
    const idx = (i*2) % (h.length-2);
    const sub = h.substr(idx, 4);
    const v = parseInt(sub,16) / 0xffff; // 0..1
    out[i] = (v*2.0 - 1.0);
  }
  // normalize
  let sum=0; for (let i=0;i<dim;i++) sum += out[i]*out[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i=0;i<dim;i++) out[i] = out[i]/norm;
  return Array.from(out);
}

async function main(){
  console.log('Embed+Upsert: dry-run mode (no external calls). Use --live to enable external requests (requires env configuration).');
  const live = process.argv.includes('--live');
  if (live) console.warn('LIVE mode requested: this script will attempt external calls. Ensure env vars are set and you intend to run live.');

  let raw;
  try{ raw = await fs.readFile(enrichedPath,'utf8'); }catch(e){ console.error('Enriched cards missing:', enrichedPath); process.exitCode=2; return }
  const cards = parseLines(raw);
  const dim = 768;
  const embedLines = [];
  const qdrantLines = [];

  for (const c of cards){
    const seed = (c.cardId || c.title || JSON.stringify(c)).toString();
    const vector = shaToFloatsHex(seed, dim);
    const embed = { cardId: c.cardId, vector, metadata: { kind: c.kind, title: c.title, featureLabels: c.featureLabels||[], sourceRefs: c.sourceRefs||[], lifecycle: c.lifecycle||{} } };
    embedLines.push(embed);

    const qpoint = { id: c.cardId, vector, payload: { cardId: c.cardId, title: c.title, kind: c.kind, featureLabels: c.featureLabels||[], sourceRefs: c.sourceRefs||[] } };
    qdrantLines.push(qpoint);
  }

  await fs.mkdir(path.dirname(outEmbeds), { recursive: true });
  await fs.writeFile(outEmbeds, embedLines.map(l=>JSON.stringify(l)).join('\n') + '\n','utf8');
  await fs.writeFile(outQdrantPreview, qdrantLines.map(l=>JSON.stringify(l)).join('\n') + '\n','utf8');

  console.log(JSON.stringify({ cards: cards.length, embed_preview: outEmbeds, qdrant_preview: outQdrantPreview, liveMode: !!live }, null, 2));
}

main().catch(e=>{ console.error(e); process.exitCode=2 });
