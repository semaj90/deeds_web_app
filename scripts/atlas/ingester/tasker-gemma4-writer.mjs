#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { llamaChat } from '../lib/llama-inference.mjs';

// Resolve repository root robustly on Windows and POSIX
const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');

// Allow overriding paths via CLI or environment for Windows path normalization issues
const TASKS_IN = (argv.includes('--tasks-in') ? argv[argv.indexOf('--tasks-in') + 1] : process.env.TASKS_IN) || path.join(ROOT, '.tmp', 'ingest', 'tasks.ndjson');
const TASKS_OUT = (argv.includes('--tasks-out') ? argv[argv.indexOf('--tasks-out') + 1] : process.env.TASKS_OUT) || path.join(ROOT, '.tmp', 'ingest', 'tasks-updated.ndjson');
const PROPOSALS_OUT = (argv.includes('--proposals-out') ? argv[argv.indexOf('--proposals-out') + 1] : process.env.PROPOSALS_OUT) || path.join(ROOT, '.tmp', 'ingest', 'task-proposals.ndjson');

function readND(file){ return fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[] }
function writeND(file, arr){
  // ensure directory exists (Windows safe)
  const dir = path.dirname(file);
  try{ fs.mkdirSync(dir, { recursive: true }); }catch(e){}
  fs.writeFileSync(file, arr.map(r=>JSON.stringify(r)).join('\n')+'\n','utf8')
}

async function callLLM(prompt){
  const messages = [
    { role: 'system', content: 'You are a concise assistant. Output ONLY a single short task title on one line. Do NOT include reasoning, analysis, or any extra text.' },
    { role: 'user', content: prompt },
  ];
  return llamaChat(messages, { maxTokens: 128, temperature: 0 });
}

function heuristicTitle(task){
  const tid = (task.target||task.featureId||task.taskId||'').toString().slice(0,8);
  if(task.reason) return `Review: ${task.reason} — ${tid}`;
  return `Review card ${tid}`;
}

async function main(){
  const tasks = readND(TASKS_IN);
  if(!tasks.length){ console.log('no tasks found in', TASKS_IN); process.exit(0); }
  // When TEST_SINGLE=1, only process the first task (useful for quick debugging)
  if(process.env.TEST_SINGLE==='1') tasks.splice(1);

  const proposals = [];
  const updated = [];

  for(const t of tasks){
    let title = t.title && t.title.length>3 ? t.title : null;
    if(!title || FORCE){
      const prompt = `Create a short (6-12 words) human-friendly task title for a review task.\nTask reason: ${t.reason || 'unspecified'}\nTarget id: ${t.target || t.featureId || t.taskId}\nKeep it concise.\nIMPORTANT: Output only the final title on a single line. Do NOT include any reasoning, analysis, or extra text.`;
      try{
        if(APPLY || FORCE){
          let out = await callLLM(prompt);
          // If LLM returned a JSON string, try to parse and extract nested fields like reasoning_content
          try{
            if(typeof out === 'string'){
              const trimmed = out.trim();
              if(trimmed.startsWith('{') || trimmed.startsWith('[')){
                const parsed = JSON.parse(out);
                function scanForText(obj){
                  if(!obj && obj !== 0) return null;
                  if(typeof obj === 'string') return obj.trim() || null;
                  if(Array.isArray(obj)){
                    for(const it of obj){
                      const s = scanForText(it);
                      if(s) return s;
                    }
                    return null;
                  }
                  if(typeof obj === 'object'){
                    const kp = ['reasoning_content','content','text','output','result','response'];
                    for(const k of kp){ if(k in obj){ const s = scanForText(obj[k]); if(s) return s; } }
                    for(const k of Object.keys(obj)){
                      const s = scanForText(obj[k]); if(s) return s;
                    }
                  }
                  return null;
                }
                const scanned = scanForText(parsed);
                if(scanned) out = scanned;
              }
            }
          }catch(e){ /* ignore parse errors */ }
          function pickTitle(s){
            if(!s) return null;
            const full = String(s).replace(/\r/g,'');
            const lines = full.split('\n').map(l=>l.trim()).filter(Boolean);
            for(const l of lines){
              const w = l.split(/\s+/).length;
              if(w>=2 && w<=12 && l.length<=120 && !/^(thinking process|here's|analysis|1\.)/i.test(l)){
                return l.replace(/^[0-9\-\)\.\s]+/,'').trim();
              }
            }
            // Check sentence-level candidates
            const sentences = full.split(/(?<=[\.\!\?])\s+/);
            for(const snt of sentences){
              const clean = snt.replace(/^[0-9\-\)\.\s]+/,'').trim();
              const w = clean.split(/\s+/).filter(Boolean).length;
              if(w>=2 && w<=12 && clean.length<=150 && !/^(thinking process|analysis)/i.test(clean.toLowerCase())) return clean;
            }
            // Fallback: first 8 words
            const firstWords = full.split(/\s+/).filter(Boolean).slice(0,8).join(' ');
            return firstWords || null;
          }
          title = pickTitle(out) || heuristicTitle(t);
        } else if(!APPLY){
          let out = await callLLM(prompt).catch(()=>null);
          try{
            if(typeof out === 'string'){
              const trimmed = out.trim();
              if(trimmed.startsWith('{') || trimmed.startsWith('[')){
                const parsed = JSON.parse(out);
                function scanForText(obj){
                  if(!obj && obj !== 0) return null;
                  if(typeof obj === 'string') return obj.trim() || null;
                  if(Array.isArray(obj)){
                    for(const it of obj){
                      const s = scanForText(it);
                      if(s) return s;
                    }
                    return null;
                  }
                  if(typeof obj === 'object'){
                    const kp = ['reasoning_content','content','text','output','result','response'];
                    for(const k of kp){ if(k in obj){ const s = scanForText(obj[k]); if(s) return s; } }
                    for(const k of Object.keys(obj)){
                      const s = scanForText(obj[k]); if(s) return s;
                    }
                  }
                  return null;
                }
                const scanned = scanForText(parsed);
                if(scanned) out = scanned;
              }
            }
          }catch(e){ /* ignore parse errors */ }
          function pickTitle(s){
            if(!s) return null;
            const full = String(s).replace(/\r/g,'');
            const lines = full.split('\n').map(l=>l.trim()).filter(Boolean);
            for(const l of lines){
              const w = l.split(/\s+/).length;
              if(w>=2 && w<=12 && l.length<=120 && !/^(thinking process|here's|analysis|1\.)/i.test(l)){
                return l.replace(/^[0-9\-\)\.\s]+/,'').trim();
              }
            }
            const sentences = full.split(/(?<=[\.\!\?])\s+/);
            for(const snt of sentences){
              const clean = snt.replace(/^[0-9\-\)\.\s]+/,'').trim();
              const w = clean.split(/\s+/).filter(Boolean).length;
              if(w>=2 && w<=12 && clean.length<=150 && !/^(thinking process|analysis)/i.test(clean.toLowerCase())) return clean;
            }
            const firstWords = full.split(/\s+/).filter(Boolean).slice(0,8).join(' ');
            return firstWords || null;
          }
          title = out ? (pickTitle(out) || heuristicTitle(t)) : heuristicTitle(t);
        } else {
          title = heuristicTitle(t);
        }

    // Optional debug logging when DEBUG_TASKER=1 is set
    try{
      if(process.env.DEBUG_TASKER==='1'){
        console.log('TASKER_DEBUG title ->', (t.target||t.taskId), ':', String(title).replace(/\n/g,' ').slice(0,200));
      }
    }catch(e){}
      }catch(e){
        title = heuristicTitle(t);
      }
    }

    proposals.push({ taskId: t.taskId, proposedTitle: title });
    updated.push({ ...t, title });
  }

  writeND(PROPOSALS_OUT, proposals);
  writeND(TASKS_OUT, updated);

  console.log('wrote proposals:', proposals.length, '->', PROPOSALS_OUT);
  console.log('wrote updated tasks:', updated.length, '->', TASKS_OUT);

  if(APPLY){
    fs.renameSync(TASKS_OUT, TASKS_IN);
    console.log('applied titles to', TASKS_IN);
  } else {
    console.log('dry-run; to apply: rerun with --apply');
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
