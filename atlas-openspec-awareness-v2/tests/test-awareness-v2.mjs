#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const bundle=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-awareness-'));
const reports=path.join(tmp,'docs','reports');
fs.mkdirSync(path.join(tmp,'src'),{recursive:true}); fs.mkdirSync(reports,{recursive:true});
fs.writeFileSync(path.join(tmp,'src','a.ts'),"import { b } from './b'; export const a=b; // OpenSpec Qdrant\n");
fs.writeFileSync(path.join(tmp,'src','b.ts'),"export const b=1; // tree_node_id Graphify AST\n");
fs.writeFileSync(path.join(tmp,'codebase-graph.json'),JSON.stringify({nodes:[{file_path:'src/b.ts',tree_node_id:'T1'}],edges:[{from_file:'src/a.ts',to_file:'src/b.ts',relation:'imports'}]}));

const node=process.execPath;
execFileSync(node,[path.join(bundle,'scripts/atlas/audit-openspec-directory-graph-v1.mjs'),tmp,path.join(reports,'openspec-directory-graph-v1.json')],{stdio:'pipe'});
const graph=JSON.parse(fs.readFileSync(path.join(reports,'openspec-directory-graph-v1.json'),'utf8'));
assert.equal(graph.summary.files,3); // two source files + codebase-graph.json
assert.ok(graph.summary.importEdges>=1);
assert.ok(graph.summary.graphifyArtifacts>=1);
assert.ok(graph.graphify.treeNodeCounts['src/b.ts']>=1);

execFileSync('python',[path.join(bundle,'scripts/atlas/cluster-openspec-file-graph-v1.py'),path.join(reports,'openspec-directory-graph-v1.json'),path.join(reports,'openspec-file-kmeans-v1.json'),'2','1337'],{stdio:'pipe'});
const km=JSON.parse(fs.readFileSync(path.join(reports,'openspec-file-kmeans-v1.json'),'utf8'));
assert.equal(km.clusters.length,2);
assert.equal(km.authority,'CHALLENGER_NAVIGATION_ONLY');

fs.writeFileSync(path.join(reports,'openspec-execution-controller-v1.json'),JSON.stringify({summary:{total:10,proven:4,actionable:3,waiting:2,deferred:1},tasks:[{taskId:'T1',changeId:'c1',state:'ACTIONABLE',title:'prove Qdrant tag',dependsOnTaskIds:[]}]}));
fs.writeFileSync(path.join(reports,'openspec-blocker-audit-v1.json'),JSON.stringify({groups:[]}));
fs.writeFileSync(path.join(reports,'semantic768-qdrant-cuvs-identity-v2.json'),JSON.stringify({fixture:true,sameIdentity:true,sameMatrix:true}));
fs.writeFileSync(path.join(reports,'qdrant-lineage-tag-readback-v1.json'),JSON.stringify({collection:'codebase_chunks_768',payload:{packet_key:'p1',symbol_version_id:'sv1',workspace_revision:'w1',source_revision:'s1',representation_id:'semantic_768'},readback:'observed'}));
fs.mkdirSync(path.join(tmp,'web-app/sveltekit-frontend/src/lib/server/atlas'),{recursive:true});
fs.writeFileSync(path.join(tmp,'web-app/sveltekit-frontend/src/lib/server/atlas/agent-adapters.ts'),"export const p=['acp','a2a'];");
fs.writeFileSync(path.join(tmp,'web-app/sveltekit-frontend/src/lib/server/atlas/transport.ts'),'export const x=1;');
fs.writeFileSync(path.join(tmp,'web-app/sveltekit-frontend/src/lib/server/atlas/context-manifest.ts'),'export const x=1;');
fs.writeFileSync(path.join(tmp,'web-app/sveltekit-frontend/src/lib/server/atlas/task-state.ts'),'export const x=1;');
fs.writeFileSync(path.join(tmp,'web-app/sveltekit-frontend/src/lib/server/atlas/workflow-store.ts'),'export const x=1;');
// A transport audit with a passing shape check is not runtime proof when its
// own proof-of-life has zero successful subjects.
fs.writeFileSync(path.join(reports,'acp-packet-transport-audit.json'),JSON.stringify({
  protocol:'acp',
  verdict:'PASS_WITH_WARNINGS',
  health:{status:'PASS'},
  proofOfLife:'0/5 subjects passed',
  errors:['503']
}));
execFileSync(node,[path.join(bundle,'scripts/atlas/audit-atlas-runtime-readiness-v1.mjs'),tmp,reports,path.join(reports,'atlas-runtime-readiness-v1.json')],{stdio:'pipe'});
const ready=JSON.parse(fs.readFileSync(path.join(reports,'atlas-runtime-readiness-v1.json'),'utf8'));
assert.equal(ready.gates.find(x=>x.key==='QDRANT_LINEAGE_TAGS_PROVEN').state,'PROVEN');
assert.equal(ready.gates.find(x=>x.key==='ACP_ADAPTER_PROVEN').state,'PARTIAL');
assert.equal(ready.gates.find(x=>x.key==='BITFROST_BUCKET_WARMING_PROVEN').state,'UNPROVEN');

fs.writeFileSync(path.join(reports,'openspec-next-actions-v2.json'),JSON.stringify({tasks:[{id:'T1',score:5},{id:'T2',score:4}]}));
fs.writeFileSync(path.join(reports,'low-rank-task-recommendation-v2.json'),JSON.stringify({tasks:[{id:'T2',lowRankScore:.9},{id:'T1',lowRankScore:.8}]}));
execFileSync(node,[path.join(bundle,'scripts/atlas/build-openspec-challenger-tournament-v1.mjs'),reports,path.join(reports,'openspec-challenger-tournament-v1.json')],{stdio:'pipe'});
const tour=JSON.parse(fs.readFileSync(path.join(reports,'openspec-challenger-tournament-v1.json'),'utf8'));
assert.equal(tour.comparisons.find(x=>x.taskId==='T1').deterministicRank,1);
assert.equal(tour.comparisons.find(x=>x.taskId==='T1').challengerRank,2);
assert.equal(tour.comparisons.find(x=>x.taskId==='T1').eligibleForAuthority,false);

execFileSync(node,[path.join(bundle,'scripts/atlas/audit-openspec-progress-v2.mjs'),reports,path.join(reports,'openspec-progress-audit-v2.json')],{stdio:'pipe'});
const prog=JSON.parse(fs.readFileSync(path.join(reports,'openspec-progress-audit-v2.json'),'utf8'));
assert.equal(prog.summary.total,10);
assert.equal(prog.reports.directoryGraph,true);
assert.equal(prog.reports.runtimeReadiness,true);

fs.writeFileSync(path.join(reports,'atlas-human-feedback-receipts-v1.json'),JSON.stringify({receipts:[{taskId:'T1',decision:'APPROVE',evidenceHash:'abc',actorRole:'operator',evidenceRefs:['r1']},{taskId:'bad',decision:'MAYBE'}]}));
execFileSync(node,[path.join(bundle,'scripts/atlas/build-human-agent-feedback-dataset-v1.mjs'),path.join(reports,'atlas-human-feedback-receipts-v1.json'),path.join(reports,'dataset.jsonl'),path.join(reports,'dataset-receipt.json')],{stdio:'pipe'});
const dr=JSON.parse(fs.readFileSync(path.join(reports,'dataset-receipt.json'),'utf8'));
assert.equal(dr.rows,1); assert.equal(dr.rejected,1);

console.log('awareness-v2: 12/12 PASS');
