#!/usr/bin/env node
import fs from 'fs/promises';
import {spawnSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join('memory','knowledge','schema-indexer-contract-cards.jsonl');
const OUT_DIR = path.join('.tmp');
const OUT_JSONL = path.join(OUT_DIR,'phase17-pytorch-features.jsonl');
const OUT_REPORT = path.join('reports','phase17-pytorch-feature-summary.md');
// Resolve python script path relative to this file to avoid CWD doubling issues
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = path.join(__dirname, 'phase17_feature_extractor.py');

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
  let counted=0;
  for(const l of lines){
    try{
      const card = JSON.parse(l);
      const cardId = card.cardId || card.card_id || card.id || ('card_'+counted);
      const hasSource = (card.sourceRefs && card.sourceRefs.length>0) || false;
      const lane = card.cardId && card.cardId.startsWith('feature-gap:') ? 'schema_contract' : 'untracked_local';
      const row = {
        card_id: cardId,
        sourceRef: (card.sourceRefs && card.sourceRefs[0]) || null,
        lane,
        feature_vector_ref: null,
        metadata: {
          file_path: (card.entities && card.entities.files && card.entities.files[0]) || null,
          symbol: null,
          schema_name: null,
          retrieval_mode: 'offline-js-fallback',
          indexed: !!card.indexedState?.indexed,
          tracked_by_git: !!card.workspaceState?.tracked
        },
        signals: {
          has_sourceRef: !!hasSource,
          has_schema_contract: lane==='schema_contract',
          has_mcp_route: false,
          is_untracked_local: lane==='untracked_local',
          embedding_available: false
        }
      };
      outLines.push(JSON.stringify(row));
      counted++;
    }catch(e){ continue; }
  }
  await fs.writeFile(outPath,outLines.join('\n')+'\n','utf8');
  const report = [`# Phase 17 PyTorch Feature Extractor (JS fallback)`,``, `input: ${inputPath}`, `rows_extracted: ${outLines.length}`, `notes: Python not executed or failed; used JS fallback heuristics.`].join('\n');
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.writeFile(reportPath,report,'utf8');
  return {ok:true, rows: outLines.length};
}

async function run(){
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);
  try{
    await fs.access(inputPath);
  }catch(e){
    console.error('Input not found:', inputPath);
    process.exit(1);
  }

  if(opts.py){
    // try spawn python
    const py = spawnSync('python', [PY_SCRIPT, '--input', inputPath, '--out', opts.out, '--report', opts.report], {cwd: ROOT, encoding: 'utf8', stdio: 'inherit'});
    if(py.status===0){
      console.log('Python phase17 completed.');
      process.exit(0);
    }
    console.warn('Python phase17 failed or not available; falling back to JS heuristics.');
  }

  const res = await jsFallback(inputPath, opts.out, opts.report);
  console.log('JS fallback complete:', res);
}

run().catch(e=>{ console.error(e); process.exit(1); });
