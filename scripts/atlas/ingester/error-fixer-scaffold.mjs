#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const TASKS = path.join(ROOT, '.tmp', 'ingest', 'tasks.ndjson');

function readND(file){ return fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[] }

function main(){
  const tasks = readND(TASKS);
  const fixes = tasks.map(t=>({ taskId:t.id, applied:false, note:'scaffold - manual fix required' }));
  const out = path.join(ROOT,'.tmp','ingest','fixes.ndjson');
  fs.writeFileSync(out, fixes.map(f=>JSON.stringify(f)).join('\n')+'\n','utf8');
  console.log('wrote fixes:', fixes.length);
}

main();
