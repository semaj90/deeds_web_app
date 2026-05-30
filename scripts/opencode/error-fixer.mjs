#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { isAvailable, generate } from './gemma4-adapter.mjs';

const TASKS_PATH = path.resolve(process.cwd(), '.opencode', 'recommendations', 'tasks.ndjson');
const OUT_DIR = path.resolve(process.cwd(), '.opencode', 'fixes');
const OUT_PATH = path.join(OUT_DIR, 'fixes.ndjson');

function now(){ return new Date().toISOString(); }

async function ensureDir(d){ try{ await fs.mkdir(d, { recursive:true }); }catch(e){} }

async function readNdjson(p){
  if(!existsSync(p)) return [];
  const txt = await fs.readFile(p, 'utf8');
  return txt.split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l)}catch(e){return null}}).filter(Boolean);
}

async function run(){
  const argv = process.argv.slice(2);
  const APPLY = argv.includes('--apply');

  const tasks = await readNdjson(TASKS_PATH);
  if(tasks.length===0){ console.log('No tasks found at', TASKS_PATH); return; }

  await ensureDir(OUT_DIR);

  const fixes = tasks.map(t=>({
    taskId: t.id,
    suggestion: 'needs-review',
    note: 'Automated placeholder suggestion. Will call Gemma4 when --apply is used and adapter is available.',
    generatedAt: now(),
  }));

  const avail = await isAvailable();
  if(!APPLY){
    console.log('[DRY RUN] Gemma4 availability:', avail);
  }

  if(APPLY){
    console.log('Gemma4 availability:', avail);
    const h = await fs.open(OUT_PATH, 'a');
    for(const f of fixes){
      let suggestionText = f.note;
      if(avail && avail.available){
        try{
          const prompt = `Task ${f.taskId}: produce a short suggested fix or review note.`;
          suggestionText = await generate(prompt);
        }catch(e){
          suggestionText = f.note + ' (gemma4 call failed)';
        }
      }
      f.suggestion = suggestionText;
      await h.write(JSON.stringify(f)+'\n');
    }
    await h.close();
    console.log(`Wrote ${fixes.length} fixes to ${OUT_PATH}`);
  } else {
    console.log(`[DRY RUN] Generated ${fixes.length} fix stubs (use --apply to write ${OUT_PATH})`);
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
