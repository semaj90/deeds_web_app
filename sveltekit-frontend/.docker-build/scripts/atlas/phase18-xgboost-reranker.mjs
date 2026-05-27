#!/usr/bin/env node
import fs from 'fs/promises';
import {spawnSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join('.tmp','phase17-pytorch-features.jsonl');
const OUT_DIR = path.join('.tmp');
const OUT_JSONL = path.join(OUT_DIR,'phase18-xgboost-rerank.jsonl');
const OUT_REPORT = path.join('reports','phase18-xgboost-rerank-summary.md');
// Resolve python script path relative to this file to avoid CWD doubling issues
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = path.join(__dirname, 'phase18_xgboost_reranker.py');

function parseArgs(){
  const a = process.argv.slice(2);
  const out = { input: DEFAULT_INPUT, out: OUT_JSONL, report: OUT_REPORT, py:true };
  for(let i=0;i<a.length;i++){
    if(a[i]==='--input') out.input=a[++i];
    else if(a[i]==='--out') out.out=a[++i];
    else if(a[i]==='--report') out.report=a[++i];
    else if(a[i]==='--no-py') out.py=false;
  }
  return out;
}

async function jsFallback(inputPath,outPath,reportPath){
  await fs.mkdir(path.dirname(outPath),{recursive:true});
  const data = await fs.readFile(inputPath,'utf8');
  const lines = data.split(/\r?\n/).filter(Boolean);
  const outLines = [];
  let i=0;
  for(const l of lines){
    try{
      const row = JSON.parse(l);
      const score = (row.card_id? row.card_id.length : 1) % 100 / 100;
      outLines.push(JSON.stringify({card_id: row.card_id, score, reason: 'js-heuristic'}));
      i++;
    }catch(e){continue}
  }
  await fs.writeFile(outPath,outLines.join('\n')+'\n','utf8');
  const report = [`# Phase 18 XGBoost Reranker (JS fallback)`,``, `input: ${inputPath}`, `rows_reranked: ${i}`, `notes: Python/XGBoost not executed or failed; used JS heuristics.`].join('\n');
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.writeFile(reportPath,report,'utf8');
  return {ok:true, rows: i};
}

async function run(){
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);
  try{ await fs.access(inputPath);}catch(e){ console.error('Input not found:', inputPath); process.exit(1); }

  if(opts.py){
    const py = spawnSync('python', [PY_SCRIPT, '--input', inputPath, '--out', opts.out, '--report', opts.report], {cwd: ROOT, encoding: 'utf8', stdio: 'inherit'});
    if(py.status===0){ console.log('Python phase18 completed.'); process.exit(0); }
    console.warn('Python phase18 failed or not available; falling back to JS heuristics.');
  }

  const res = await jsFallback(inputPath, opts.out, opts.report);
  console.log('JS fallback complete:', res);
}

run().catch(e=>{ console.error(e); process.exit(1); });
