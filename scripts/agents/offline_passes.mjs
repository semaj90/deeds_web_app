#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OPENCODE = path.join(ROOT, '.opencode');
await fs.mkdir(OPENCODE, { recursive: true });

function hash(s){ return crypto.createHash('sha256').update(s).digest('hex').slice(0,16); }

async function pass1_decompose(prompt){
  // naive decomposition: split by sentences, extract nouns heuristically
  const sentences = prompt.split(/[\.\n]/).map(s=>s.trim()).filter(Boolean);
  const intent = sentences[0] || prompt;
  const topic_tags = Array.from(new Set(sentences.flatMap(s=>s.split(' ').slice(0,3)))).slice(0,6);
  return { intent, topic_tags, required_capabilities: ['code-edit','search'], unknowns: [] };
}

async function pass2_local_lookup(decomp){
  // search local .opencode cards by naive substring match
  const cardsDir = path.join(OPENCODE,'cards');
  const files = await fs.readdir(cardsDir).catch(()=>[]);
  const matches = [];
  for(const f of files){
    if(!/\.json$/.test(f)) continue;
    const j = JSON.parse(await fs.readFile(path.join(cardsDir,f),'utf8'));
    const text = (j.title+' '+j.text).toLowerCase();
    for(const t of decomp.topic_tags){ if(text.includes(t.toLowerCase())){ matches.push({id:j.id,title:j.title,source:j.source}); break;} }
  }
  return { existing_topic_match: matches.slice(0,10), duplicate_risk: matches.length>5, reusable_examples: matches.slice(0,3) };
}

async function pass3_rebuild(decomp){
  const rebuilt = `Implement: ${decomp.intent}. Use cards: ${decomp.topic_tags.join(', ')}`;
  return { normalized_task_prompt: rebuilt };
}

async function pass4_context_reduce(matches){
  // gather first N cards and produce ace packet seed
  const cardsDir = path.join(OPENCODE,'cards');
  const seed = [];
  for(const m of matches.existing_topic_match.slice(0,20)){
    const j = JSON.parse(await fs.readFile(path.join(cardsDir, `${m.id}.json`),'utf8'));
    seed.push({id:j.id,title:j.title,excerpt:j.text.slice(0,400)});
  }
  const ace = { created: new Date().toISOString(), cards: seed };
  const pathOut = path.join(OPENCODE, `ace-seed-${hash(JSON.stringify(ace))}.json`);
  await fs.writeFile(pathOut, JSON.stringify(ace,null,2),'utf8');
  return { ace_context_packet: ace, patch_card_seed: pathOut };
}

async function pass5_codebase_validate(){
  // run lightweight checks
  const checks = {};
  try { const pkg = JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8')); checks.scripts = Object.keys(pkg.scripts||{}); } catch(e) { checks.scripts = []; }
  // find a few routes
  const routes = await fs.readdir(path.join(ROOT,'sveltekit-frontend','src','routes')).catch(()=>[]);
  return { valid_patch_targets: routes.slice(0,10), risks: [], missing_files: [] };
}

async function pass6_generate_patch(rebuilt, aceSeed){
  // create a simple patch_card describing changes — real codegen not attempted offline
  const id = hash(rebuilt.normalized_task_prompt + Date.now());
  const patch = { id, title: rebuilt.normalized_task_prompt.slice(0,80), seed: aceSeed.patch_card_seed, changes: [{ type: 'edit', path: 'sveltekit-frontend/src/routes/example/+page.svelte', desc: 'Add canvas skeleton' }] };
  const out = path.join(OPENCODE, `patchcard-${id}.json`);
  await fs.writeFile(out, JSON.stringify(patch,null,2),'utf8');
  return { patch_card: out, file_changes: patch.changes, tests_to_run: ['npm run check:fast'] };
}

async function pass7_test_validate(tests){
  // run check:fast and lint as placeholders, but don't fail offline
  const results = { pass_fail: 'deferred', errors: [], retry_plan: [] };
  try {
    const r = spawnSync('npm', ['run', 'check:fast'], { stdio: 'inherit', shell: true });
    results.pass_fail = r.status===0 ? 'pass' : 'fail';
    if (r.status!==0) results.errors.push('check:fast failed');
  } catch(e){ results.pass_fail='skipped'; results.errors.push(e.message); }
  return results;
}

async function pass8_writeback(patch){
  // write a short record into .opencode/memory
  const memDir = path.join(OPENCODE,'memory'); await fs.mkdir(memDir,{recursive:true});
  const rec = { id: hash(patch.patch_card + Date.now()), patch: patch.patch_card, created: new Date().toISOString() };
  const out = path.join(memDir, `${rec.id}.json`);
  await fs.writeFile(out, JSON.stringify(rec,null,2),'utf8');
  return { new_cards: [], new_relations: [], updated_topic: null, example_training_record: out };
}

async function runAll(prompt){
  const p1 = await pass1_decompose(prompt);
  const p2 = await pass2_local_lookup(p1);
  const p3 = await pass3_rebuild(p1);
  const p4 = await pass4_context_reduce(p2);
  const p5 = await pass5_codebase_validate();
  const p6 = await pass6_generate_patch(p3, p4);
  const p7 = await pass7_test_validate(p6.tests_to_run);
  const p8 = await pass8_writeback(p6);
  const out = { pass1:p1, pass2:p2, pass3:p3, pass4:p4, pass5:p5, pass6:p6, pass7:p7, pass8:p8 };
  const outFile = path.join(OPENCODE, `offline-run-${hash(prompt)}.json`);
  await fs.writeFile(outFile, JSON.stringify(out,null,2),'utf8');
  console.log('Offline passes complete ->', outFile);
}

const prompt = process.argv.slice(2).join(' ') || 'Create a SvelteKit canvas prototype for NES-style game';
runAll(prompt).catch(e=>{ console.error(e); process.exit(1); });
