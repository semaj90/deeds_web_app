#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const OUT_JSON = path.join('.tmp','phase-lane-completion.json');
const OUT_REPORT = path.join('reports','phase-lane-completion.md');

async function exists(p){ try{ await fs.access(p); return true;}catch(e){return false;} }

async function run(){
  const files = {
    parent_atlas_cards: path.join('.tmp', 'parent-atlas-profile-cards.jsonl'),
    phase17: path.join('.tmp','phase17-pytorch-features.jsonl'),
    phase18: path.join('.tmp','phase18-xgboost-rerank.jsonl'),
    hot_keyword_clusters: path.join('.tmp', 'hot-keyword-clusters.json'),
    retrieval_loop_log: path.join('.tmp', 'atlas-retrieval-loop.jsonl')
  };
  const status = {};
  for(const k of Object.keys(files)){
    status[k] = { exists: await exists(files[k]), path: files[k] };
  }
  status.generated_at = new Date().toISOString();
  await fs.mkdir(path.dirname(OUT_JSON),{recursive:true});
  await fs.writeFile(OUT_JSON, JSON.stringify(status,null,2),'utf8');
  const lines = ['# Phase Lane Completion','',`generated_at: ${status.generated_at}`,'','## Status',''];
  for(const k of Object.keys(files)){
    lines.push(`- **${k}**: ${status[k].exists ? 'present' : 'missing'} — ${status[k].path}`);
  }
  lines.push('','Next steps: run `npm run atlas:phase17` and `npm run atlas:phase18` to generate missing outputs.');
  await fs.mkdir(path.dirname(OUT_REPORT),{recursive:true});
  await fs.writeFile(OUT_REPORT, lines.join('\n'),'utf8');
  console.log('wrote', OUT_JSON, OUT_REPORT);
}

run().catch(e=>{ console.error(e); process.exit(1); });
