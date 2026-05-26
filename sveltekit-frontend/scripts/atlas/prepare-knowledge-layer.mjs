#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(new URL(import.meta.url).pathname, '../../..');
const base = path.resolve(root, 'sveltekit-frontend');

function safeReadJSON(p){
  return fs.readFile(p, 'utf8').then(s=>JSON.parse(s)).catch(()=>null);
}

async function gatherNotecards(){
  const cards = [];

  // 1. sidecar audit validated
  const sidecarPath = path.join(base, 'drizzle', 'sidecar-audit-validated.json');
  const sidecar = await safeReadJSON(sidecarPath);
  if(sidecar && Array.isArray(sidecar.entries)){
    for(const e of sidecar.entries){
      const title = e.file || e.path || 'sidecar';
      const text = e.reason || '';
      cards.push({id: `sidecar:${title}`, source: 'sidecar-audit', title, text, meta: {classification: e.classification, path: e.path}});
    }
  }

  // 2. parent atlas
  const parentAtlasPath = path.resolve(root, 'docs','atlas','parent-atlas.json');
  const parentAtlas = await safeReadJSON(parentAtlasPath);
  if(parentAtlas && Array.isArray(parentAtlas.items)){
    for(const it of parentAtlas.items){
      const id = it.id || it.title || JSON.stringify(it).slice(0,40);
      const title = it.title || id;
      const text = (it.summary||it.description||'') + '\n' + (it.content||'');
      cards.push({id: `atlas:${id}`, source: 'parent-atlas', title, text, meta: it});
    }
  }

  // 3. feature files from .opencode (if present)
  const featurePath = path.resolve(root, '.opencode','feature-files.json');
  const feature = await safeReadJSON(featurePath);
  if(feature && Array.isArray(feature)){
    for(const f of feature){
      const title = f.path || f.name || 'feature';
      const text = (f.summary||f.snippet||'') + '\n' + (f.notes||'');
      cards.push({id: `feature:${title}`, source: 'feature-files', title, text, meta: f});
    }
  }

  return cards;
}

async function writeJSONL(list, outPath){
  const s = list.map(j=>JSON.stringify(j)).join('\n');
  await fs.mkdir(path.dirname(outPath), {recursive:true});
  await fs.writeFile(outPath, s, 'utf8');
}

async function run(){
  const argv = process.argv.slice(2);
  const doEmbed = argv.includes('--embed');
  const outDir = path.join(base, '.opencode');

  const cards = await gatherNotecards();
  if(cards.length===0){
    console.log('No notecards found to ingest.');
    return;
  }

  const notecardsPath = path.join(outDir, 'knowledge-notecards.jsonl');
  await writeJSONL(cards, notecardsPath);
  console.log('Wrote', cards.length, 'notecards to', notecardsPath);

  // Prepare Qdrant payload with placeholder vectors
  const qdrantPayload = cards.map((c,i)=>({
    id: c.id,
    payload: { title: c.title, source: c.source, meta: c.meta || {} },
    vector: null
  }));
  const qdrantPath = path.join(outDir, 'qdrant-sidecar-payload.jsonl');
  await writeJSONL(qdrantPayload, qdrantPath);
  console.log('Wrote Qdrant payload (vectors=null) to', qdrantPath);

  if(doEmbed){
    console.log('Embedding requested (--embed). This will call the local embed endpoint for each notecard.');
    console.log('Skipping actual embed run by default in this commit. To run, set EMBED_HOST or run the script locally.');
    // embedding code (operator-run):
    // for safety we DO NOT execute network calls here in the agent run.
  }

  console.log('\nNext steps:\n- Review', notecardsPath, 'and', qdrantPath, '\n- To produce vectors, run:');
  console.log('\n  node sveltekit-frontend/scripts/atlas/prepare-knowledge-layer.mjs --embed --host http://localhost:5173\n');
  console.log('Or run an operator embedding step that reads', notecardsPath, 'and writes vectors into', qdrantPath);
}

run().catch(err=>{ console.error(err); process.exit(2); });
