#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CAPABILITIES } from './lib/capability-catalog-v1.mjs';

const root = path.resolve(process.argv[2] || '.');
const reportsDir = path.resolve(process.argv[3] || path.join(root,'docs/reports'));
const out = path.resolve(process.argv[4] || path.join(reportsDir,'parent-atlas-capability-census-v1.json'));
const maxFiles = Number(process.env.ATLAS_CAPABILITY_MAX_FILES || 20000);
const maxBytes = Number(process.env.ATLAS_CAPABILITY_MAX_FILE_BYTES || 1024*1024);
const SKIP = new Set(['node_modules','.git','.svelte-kit','build','dist','.venv','venv','__pycache__']);

function walk(dir, acc=[]){
  if(acc.length>=maxFiles) return acc;
  let entries=[]; try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return acc;}
  for(const e of entries){
    if(acc.length>=maxFiles) break;
    if(SKIP.has(e.name)) continue;
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p,acc);
    else if(e.isFile()) acc.push(p);
  }
  return acc;
}
const files=walk(root);
const rel=p=>path.relative(root,p).replaceAll('\\','/');
const textCache=new Map();
function fileText(p){
  if(textCache.has(p)) return textCache.get(p);
  let s=''; try{const st=fs.statSync(p); if(st.size<=maxBytes) s=fs.readFileSync(p,'utf8');}catch{}
  s=s.toLowerCase(); textCache.set(p,s); return s;
}
const reportFiles=fs.existsSync(reportsDir)?walk(reportsDir,[]):[];
const reportText=reportFiles.map(p=>({p, r:rel(p), t:fileText(p)}));

function stable(v){return JSON.stringify(v,Object.keys(v).sort());}
function classify(cap){
  const nameHints=cap.fileHints.map(x=>x.toLowerCase());
  const matches=[];
  for(const p of files){
    const r=rel(p).toLowerCase();
    let hit=nameHints.some(h=>r.includes(h));
    if(!hit){const t=fileText(p); hit=nameHints.some(h=>t.includes(h));}
    if(hit){matches.push(rel(p)); if(matches.length>=30) break;}
  }
  const proofHints=cap.proofHints.map(x=>x.toLowerCase());
  const qualifyingReports=[];
  for(const x of reportText){
    if(proofHints.every(h=>x.t.includes(h))) qualifyingReports.push(x.r);
    if(qualifyingReports.length>=10) break;
  }
  let state='UNPROVEN';
  if(cap.criticality==='OPTIONAL_DEFERRED') state='OPTIONAL_DEFERRED';
  if(matches.length) state=cap.criticality==='OPTIONAL_DEFERRED'?'OPTIONAL_DEFERRED':'PRESENT_CONTRACT';
  if(qualifyingReports.length) state='PROVEN';
  // Explicitly preserve known upstream waits if blocker reports mention capability concepts.
  const blockerBlob=reportText.filter(x=>/blocker|critical-path|readiness/.test(x.r.toLowerCase())).map(x=>x.t).join('\n');
  if(state!=='PROVEN' && cap.proofHints.some(h=>blockerBlob.includes(h.toLowerCase())) && /waiting|blocked/.test(blockerBlob)) state='WAITING';
  return { ...cap, state, matchingFiles:matches, qualifyingReports };
}
const capabilities=CAPABILITIES.map(classify);
const summary={};
for(const c of capabilities){summary[c.state]=(summary[c.state]||0)+1;}
const groups={};
for(const c of capabilities){groups[c.group]??=[]; groups[c.group].push(c.id);}
const critical={p10:capabilities.filter(c=>c.criticality==='P10_CRITICAL').map(c=>({id:c.id,state:c.state})), utility:capabilities.filter(c=>c.criticality==='UTILITY_REQUIRED').map(c=>({id:c.id,state:c.state})), optional:capabilities.filter(c=>['CHALLENGER_OPTIONAL','OPTIONAL_DEFERRED'].includes(c.criticality)).map(c=>({id:c.id,state:c.state}))};
const semantic={schema:'atlas.parent-capability-census.v1',scope:{root:rel(root)||'.',filesScanned:files.length,maxFiles},summary,groups,critical,capabilities};
const semanticChecksum=crypto.createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
const result={...semantic,generatedAt:new Date().toISOString(),policy:'READ_ONLY_CAPABILITY_CENSUS_NO_AUTHORITY_MUTATION',semanticChecksum,writesPerformed:false,notes:[
  'PRESENT_CONTRACT is not live proof.',
  'KMeans/SOM/manifold/visual encodings are advisory challengers only.',
  'Parent Atlas ACE residency and cuVS CAGRA ACE (Augmented Core Extraction) are separate concepts and must use distinct identifiers.',
  'Only controller/receipt evidence may change task eligibility or promotion state.'
]};
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({report:out,filesScanned:files.length,summary,semanticChecksum},null,2));
