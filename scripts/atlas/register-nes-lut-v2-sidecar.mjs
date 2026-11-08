#!/usr/bin/env node
/** Register manual SQL candidate in the sidecar ledger. Does not execute SQL. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const target=path.join(root,'sveltekit-frontend/drizzle/sidecar-migrations.json');
const template=JSON.parse(fs.readFileSync(path.join(root,'docs/reports/nes-lut-v2-sidecar-registry-entry.json'),'utf8'));
const data=JSON.parse(fs.readFileSync(target,'utf8'));
if(!Array.isArray(data.sidecars)) throw new Error('SIDECAR_LEDGER_SHAPE_INVALID');
if(template.status!=='active_candidate'||template.appliedBy!=='not-applied'||template.requiresJournalEntry!==false)
  throw new Error('SIDECAR_CANDIDATE_TEMPLATE_INVALID');
const existing=data.sidecars.filter(x=>x.file===template.file);
if(existing.length>1) throw new Error('SIDECAR_DUPLICATE_ENTRIES');
if(existing.length===1){
  if(JSON.stringify(existing[0])!==JSON.stringify(template)) throw new Error('SIDECAR_CONFLICT_REVIEW_REQUIRED');
  console.log(JSON.stringify({status:'ALREADY_REGISTERED',writesPerformed:false}));
}else if(!process.argv.includes('--write')) {
  console.log(JSON.stringify({status:'CANDIDATE_REGISTRATION_PENDING',writesPerformed:false}));
}else{
  const dir=path.join(root,'.tmp/atlas');fs.mkdirSync(dir,{recursive:true});
  const original=fs.readFileSync(target);
  const digest=crypto.createHash('sha256').update(original).digest('hex');
  data.sidecars.push(template);
  const tmp=target+'.nes-v2-tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  fs.renameSync(tmp,target);
  fs.writeFileSync(path.join(dir,`nes-v2-sidecar-registration-${digest.slice(0,12)}.json`),JSON.stringify({beforeSha256:digest,entry:template,sqlExecuted:false,dbWrites:0},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'CANDIDATE_REGISTERED_ONLY',dbWrites:0,sqlExecuted:false}));
}
