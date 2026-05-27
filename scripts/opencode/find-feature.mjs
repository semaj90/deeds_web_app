#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function usage(){
  console.log('Usage: node scripts/opencode/find-feature.mjs --feature <name> [--json]');
  process.exit(1);
}

const argv = process.argv.slice(2);
let feature = null; let asJson = false; let fastMode = false;
for(const a of argv) if(a === '--fast') fastMode = true;
for(let i=0;i<argv.length;i++){
  const a = argv[i];
  if(a === '--feature'){ feature = argv[++i]; continue; }
  if(a === '--json'){ asJson = true; continue; }
  if(a.startsWith('--feature=')){ feature = a.split('=')[1]; continue; }
}
// allow positional: node find-feature.mjs ace-context
if(!feature) feature = argv.find(a => a && !a.startsWith('--')) || process.env.FEATURE || process.argv[2];
if(!feature) {
  // try npm config env var (npm run --feature=...) fallback
  feature = process.env.npm_config_feature || process.env.npm_config_argv || null;
  if(feature && typeof feature === 'string') {
    // npm_config_argv can be JSON; if so, skip
    if(feature.startsWith('{')) feature = null;
  }
}
if(!feature) usage();

function walk(dir){
  const files = [];
  const stack = [dir];
  while(stack.length){
    const d = stack.pop();
    let ents = [];
    try{ ents = fs.readdirSync(d, { withFileTypes: true }); } catch(e){ continue; }
    for(const e of ents){
      if(e.isDirectory()){
        if(['node_modules','.git','.svelte-kit','.vite','build','dist','.tmp'].includes(e.name)) continue;
        stack.push(path.join(d,e.name));
      } else {
        files.push(path.join(d,e.name));
      }
    }
  }
  return files;
}

function grepFiles(term){
  const hits = new Set();
  const files = walk(ROOT);
  const re = new RegExp(term,'i');
  for(const f of files){
    try{
      const txt = fs.readFileSync(f,'utf8');
      if(re.test(txt)) hits.add(path.relative(ROOT,f));
    }catch(e){}
  }
  return [...hits].slice(0,500);
}

// Gather canonical refs
const directCandidates = [
  `scripts/opencode/${feature}.mjs`,
  `scripts/opencode/get-${feature}.mjs`,
  `docs/opencode/${feature}.md`,
  `.opencode/${feature}.json`,
  `.opencode/ace-context.json`
];

const found = new Set();
for(const c of directCandidates){ if(fs.existsSync(path.join(ROOT,c))){ found.add(c); } }
// Grep for feature name across repo (fastMode restricts roots)
let grepHits = [];
if(fastMode){
  const roots = ['scripts/opencode','docs/opencode','.opencode','sveltekit-frontend/docs'];
  for(const r of roots){
    const abs = path.join(ROOT, r);
    if(!fs.existsSync(abs)) continue;
    try{ const files = walk(abs); for(const f of files){ try{ const txt = fs.readFileSync(f,'utf8'); if(new RegExp(feature,'i').test(txt)) grepHits.push(path.relative(ROOT,f)); }catch(e){} } }catch(e){}
  }
} else {
  grepHits = grepFiles(feature);
}
for(const h of grepHits) found.add(h);

// package scripts that look relevant
let pkgScripts = {};
try{ const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')); pkgScripts = pkg.scripts||{}; }catch(e){}
const relatedScripts = Object.keys(pkgScripts).filter(n => n.toLowerCase().includes('opencode') || n.toLowerCase().includes(feature)).slice(0,20);

const output = {
  feature,
  sourceRefs: Array.from(found).slice(0,50),
  relatedScripts,
  recommendedSubagent: 'atlas-context',
  patchCard: {
    type: 'gemma4_patch_card',
    target_file: 'scripts/opencode/get-ace-context.mjs',
    problem: `Need feature map wiring for ${feature} context.`,
    acceptance: [
      `.opencode/feature-map/${feature}.json exists`,
      'sourceRefs preserved',
      'stdout compact'
    ]
  }
};

// write outputs
const outDir = path.join(ROOT,'.opencode','feature-map');
try{ fs.mkdirSync(outDir, { recursive: true }); } catch(e){}
const outPath = path.join(outDir, `${feature}.json`);
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// also write patch card alongside
const patchPath = path.join(outDir, `${feature}-patch-card.json`);
fs.writeFileSync(patchPath, JSON.stringify(output.patchCard, null, 2));

const summary = { written: [path.relative(ROOT,outPath), path.relative(ROOT,patchPath)], sourceCount: output.sourceRefs.length };
if(asJson) console.log(JSON.stringify(Object.assign({}, output, {summary}), null, 2)); else console.log(JSON.stringify(summary));

process.exit(0);
