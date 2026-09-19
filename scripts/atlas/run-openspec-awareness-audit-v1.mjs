#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot=path.resolve(process.argv[2]??process.cwd());
const reportsDir=path.resolve(process.argv[3]??path.join(repoRoot,'docs/reports'));
// Keep the repository-wide projection bounded on large worktrees. Override explicitly
// when a full census is intended; the report remains advisory either way.
process.env.ATLAS_AUDIT_MAX_FILES ??= '5000';
process.env.ATLAS_GRAPHIFY_MAX_BYTES ??= String(256 * 1024 * 1024);
const here=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(reportsDir,{recursive:true});
function run(bin,args){
  console.log(`\n> ${bin} ${args.join(' ')}`);
  execFileSync(bin,args,{stdio:'inherit',cwd:repoRoot});
}
run(process.execPath,[path.join(here,'audit-openspec-directory-graph-v1.mjs'),repoRoot,path.join(reportsDir,'openspec-directory-graph-v1.json')]);
run(process.env.PYTHON??'python',[path.join(here,'cluster-openspec-file-graph-v1.py'),path.join(reportsDir,'openspec-directory-graph-v1.json'),path.join(reportsDir,'openspec-file-kmeans-v1.json'),process.env.ATLAS_KMEANS_K??'12',process.env.ATLAS_KMEANS_SEED??'1337']);
run(process.execPath,[path.join(here,'audit-openspec-file-labels-v1.mjs'),reportsDir,path.join(reportsDir,'openspec-file-labels-v1.json')]);
run(process.execPath,[path.join(here,'audit-openspec-file-task-fanout-v1.mjs'),reportsDir,path.join(reportsDir,'openspec-file-task-fanout-v1.json'),repoRoot]);
run(process.execPath,[path.join(here,'audit-atlas-runtime-readiness-v1.mjs'),repoRoot,reportsDir,path.join(reportsDir,'atlas-runtime-readiness-v1.json')]);
run(process.execPath,[path.join(here,'build-openspec-challenger-tournament-v1.mjs'),reportsDir,path.join(reportsDir,'openspec-challenger-tournament-v1.json')]);
run(process.execPath,[path.join(here,'audit-openspec-progress-v2.mjs'),reportsDir,path.join(reportsDir,'openspec-progress-audit-v2.json')]);
console.log('\nParent Atlas awareness audit complete. No runtime or task-ledger writes were requested.');
