#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot=path.resolve(process.argv[2]??process.cwd());
const reportsDir=path.resolve(process.argv[3]??path.join(repoRoot,'docs/reports'));
const here=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(reportsDir,{recursive:true});
function run(bin,args){
  console.log(`\n> ${bin} ${args.join(' ')}`);
  execFileSync(bin,args,{stdio:'inherit',cwd:repoRoot});
}
run(process.execPath,[path.join(here,'audit-openspec-directory-graph-v1.mjs'),repoRoot,path.join(reportsDir,'openspec-directory-graph-v1.json')]);
run(process.env.PYTHON??'python',[path.join(here,'cluster-openspec-file-graph-v1.py'),path.join(reportsDir,'openspec-directory-graph-v1.json'),path.join(reportsDir,'openspec-file-kmeans-v1.json'),process.env.ATLAS_KMEANS_K??'12',process.env.ATLAS_KMEANS_SEED??'1337']);
run(process.execPath,[path.join(here,'audit-atlas-runtime-readiness-v1.mjs'),repoRoot,reportsDir,path.join(reportsDir,'atlas-runtime-readiness-v1.json')]);
run(process.execPath,[path.join(here,'build-openspec-challenger-tournament-v1.mjs'),reportsDir,path.join(reportsDir,'openspec-challenger-tournament-v1.json')]);
run(process.execPath,[path.join(here,'audit-openspec-progress-v2.mjs'),reportsDir,path.join(reportsDir,'openspec-progress-audit-v2.json')]);
console.log('\nParent Atlas awareness audit complete. No runtime or task-ledger writes were requested.');
