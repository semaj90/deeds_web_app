#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const IN_DIR = path.join(ROOT, '.tmp', 'ingest');
const OUT = path.join(ROOT, '.tmp', 'ingest', 'tasks.ndjson');

function readNDJSON(file) { const s = fs.readFileSync(file,'utf8'); return s.split('\n').filter(Boolean).map(l=>JSON.parse(l)); }

function main(){
  if(!fs.existsSync(IN_DIR)) { console.error('ingest dir missing'); process.exit(1); }
  const nodesFile = path.join(IN_DIR,'nodes.ndjson');
  if(!fs.existsSync(nodesFile)) { console.error('nodes.ndjson missing'); process.exit(1); }
  const nodes = readNDJSON(nodesFile);
  const tasks = [];
  for(const n of nodes){
    // simple tasker: create review tasks for cards without titles
    if(n.type==='card' && (!n.title || n.title.length<3)){
      tasks.push({ id:`task-${n.id}`, type:'review', target:n.id, reason:'missing-title' });
    }
  }
  fs.writeFileSync(OUT, tasks.map(t=>JSON.stringify(t)).join('\n')+'\n','utf8');
  console.log('wrote tasks:', tasks.length);
}

main();
