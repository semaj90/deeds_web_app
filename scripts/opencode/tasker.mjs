#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const NODES_PATH = path.resolve(process.cwd(), '.opencode', 'ingest', 'nodes.ndjson');
const OUT_DIR = path.resolve(process.cwd(), '.opencode', 'recommendations');
const OUT_PATH = path.join(OUT_DIR, 'tasks.ndjson');

function now(){ return new Date().toISOString(); }

async function ensureDir(d){ try{ await fs.mkdir(d, { recursive:true }); }catch(e){} }

async function readNdjson(p){
  if(!existsSync(p)) return [];
  const txt = await fs.readFile(p, 'utf8');
  return txt.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l)}catch(e){return null}}).filter(Boolean);
}

function nodeToTask(node){
  return {
    id: `task-${node.id}`,
    title: `Review: ${node.title}`,
    source: node.source || node.path,
    tags: node.tags || [],
    featureCandidates: node.tags || [],
    createdAt: now(),
  };
}

async function run(){
  const argv = process.argv.slice(2);
  const APPLY = argv.includes('--apply');

  const nodes = await readNdjson(NODES_PATH);
  if(nodes.length===0){ console.log('No nodes found at', NODES_PATH); return; }

  await ensureDir(OUT_DIR);

  const tasks = nodes.map(nodeToTask);

  if(APPLY){
    const handle = await fs.open(OUT_PATH, 'a');
    for(const t of tasks) await handle.write(JSON.stringify(t)+'\n');
    await handle.close();
    console.log(`Appended ${tasks.length} tasks to ${OUT_PATH}`);
  } else {
    console.log(`[DRY RUN] Generated ${tasks.length} tasks (use --apply to write ${OUT_PATH})`);
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
