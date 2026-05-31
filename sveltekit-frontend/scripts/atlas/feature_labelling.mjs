#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha1(input){ return crypto.createHash('sha1').update(input).digest('hex'); }

const OUT_DIR = path.resolve(process.cwd(), '.tmp');
const FEATURE_LABELS_OUT = path.join(OUT_DIR, 'feature_labels.jsonl');
const KANBAN_TASKS_OUT = path.join(OUT_DIR, 'kanban_tasks.jsonl');

const repoRoot = path.resolve(OUT_DIR, '..');

const CANDIDATES = [
  path.resolve(repoRoot, '.tmp', 'feature_labels.jsonl'),
  path.resolve(repoRoot, '.tmp', 'feature_labels.ndjson'),
  path.resolve(repoRoot, '.tmp', 'feature_labels.json'),
  path.resolve(repoRoot, '.tmp', 'feature-labels.ndjson'),
  path.resolve(process.cwd(), '.tmp', 'feature_labels.jsonl'),
  path.resolve(process.cwd(), '.tmp', 'feature_labels.ndjson')
];

// CLI / env limit for synthesized labels. Use --limit N or FEATURE_LABEL_LIMIT env var.
const argv = process.argv.slice(2);
let LIMIT = 1000;
const li = argv.indexOf('--limit');
if (li !== -1 && argv[li+1]) LIMIT = parseInt(argv[li+1], 10) || LIMIT;
else if (process.env.FEATURE_LABEL_LIMIT) LIMIT = parseInt(process.env.FEATURE_LABEL_LIMIT, 10) || LIMIT;
if (LIMIT <= 0) LIMIT = Infinity;

function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function copyFile(src, dst){ const s = fs.readFileSync(src, 'utf8'); fs.writeFileSync(dst, s); }

function jsonToJsonl(src, dst){ const data = JSON.parse(fs.readFileSync(src,'utf8')); const lines = Array.isArray(data) ? data.map(JSON.stringify) : [JSON.stringify(data)]; fs.writeFileSync(dst, lines.join('\n') + '\n'); }

function synthesizeFromInventory(invPath, dstLabels, dstTasks){
  const rl = fs.readFileSync(invPath,'utf8').split(/\r?\n/).filter(Boolean);
  const labels = [];
  const tasks = [];
  for(let i=0;i<rl.length && labels.length < LIMIT;i++){
    try{
      const obj = JSON.parse(rl[i]);
      const href = obj.path || obj.file || obj.source || (obj.source_ref && obj.source_ref.path) || obj.name || '';
      const id = sha1(href || JSON.stringify(obj));
      const parts = (href||'').split(/[\\\/]/).filter(Boolean);
      const guess = parts.slice(-3).join('/');
      labels.push({ feature_id: id, path: href, label: guess || obj.title || obj.name || 'unknown', tags: obj.tags||[] });
      tasks.push({ task_id: 'kanban-'+id.slice(0,8), title: `Label ${guess||id.slice(0,8)}`, description: href, status: 'todo' });
    }catch(e){ continue; }
  }
  ensureDir(path.dirname(dstLabels));
  fs.writeFileSync(dstLabels, labels.map(JSON.stringify).join('\n') + (labels.length? '\n':''));
  ensureDir(path.dirname(dstTasks));
  fs.writeFileSync(dstTasks, tasks.map(JSON.stringify).join('\n') + (tasks.length? '\n':''));
  return { labelsCount: labels.length, tasksCount: tasks.length };
}

async function main(){
  ensureDir(OUT_DIR);
  // Try copying existing candidates
  for (const c of CANDIDATES){ if (fs.existsSync(c)){
    console.log('Found existing labels at', c);
    if (c.endsWith('.json')) jsonToJsonl(c, FEATURE_LABELS_OUT);
    else copyFile(c, FEATURE_LABELS_OUT);
    // create a minimal kanban tasks file
    if (!fs.existsSync(KANBAN_TASKS_OUT)) fs.writeFileSync(KANBAN_TASKS_OUT, JSON.stringify({generatedFrom:c}) + '\n');
    // if the existing file already meets or exceeds the requested LIMIT, we're done
    const existingCount = fs.readFileSync(FEATURE_LABELS_OUT,'utf8').split(/\r?\n/).filter(Boolean).length;
    console.log('Wrote', FEATURE_LABELS_OUT, '-', existingCount, 'records');
    if (existingCount >= LIMIT) return;
    console.log('Existing labels', existingCount, 'is less than requested limit', LIMIT, '- will attempt to synthesize additional labels.');
    // fallthrough to inventory-based synthesis which will overwrite FEATURE_LABELS_OUT
  }}

  // fallback: look for an inventory file to synthesize labels
  const invCandidates = [path.resolve(process.cwd(), '.tmp', 'ingest', 'atlas-data-files.jsonl'), path.resolve(process.cwd(), '.tmp', 'atlas-data-files.jsonl'), path.resolve(repoRoot, '.tmp', 'atlas-data-files.jsonl'), path.resolve(repoRoot, '.tmp', 'feature_labels.ndjson')];
  for (const inv of invCandidates){ if (fs.existsSync(inv)){
    console.log('Synthesizing labels from inventory', inv, 'limit=', LIMIT===Infinity? '∞' : LIMIT);
    const out = synthesizeFromInventory(inv, FEATURE_LABELS_OUT, KANBAN_TASKS_OUT);
    console.log('Synthesized', out.labelsCount, 'labels and', out.tasksCount, 'tasks');
    return;
  }}

  // last resort: scan repo .tmp for any feature-label-like files
  const repoTmp = path.resolve(repoRoot, '.tmp');
  if (fs.existsSync(repoTmp)){
    const files = fs.readdirSync(repoTmp).filter(f=>/feature[_-]?labels?/i.test(f) || /feature[_-]?labels?/i.test(f));
    if (files.length){
      const src = path.join(repoTmp, files[0]);
      console.log('Copying', src, '->', FEATURE_LABELS_OUT);
      copyFile(src, FEATURE_LABELS_OUT);
      fs.writeFileSync(KANBAN_TASKS_OUT, JSON.stringify({generatedFrom:src})+'\n');
      return;
    }
  }

  console.log('No existing labels or inventory found. Writing empty placeholders.');
  fs.writeFileSync(FEATURE_LABELS_OUT, '');
  fs.writeFileSync(KANBAN_TASKS_OUT, '');
}

main().catch(err=>{ console.error(err); process.exit(1); });
