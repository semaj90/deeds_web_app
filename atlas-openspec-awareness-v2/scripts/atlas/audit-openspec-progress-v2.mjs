#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { semanticChecksum, object, array, string } from './lib/stable-json.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'openspec-progress-audit-v2.json'));
function read(name){ try{return JSON.parse(fs.readFileSync(path.join(reportsDir,name),'utf8'));}catch{return null;} }
function has(name){ return fs.existsSync(path.join(reportsDir,name)); }
function findSummary(v,depth=0){ if(depth>5)return null; const o=object(v); if(!o)return null; if('total'in o&&('actionable'in o||'proven'in o||'waiting'in o))return o; for(const k of ['summary','counts','result','controller']){const x=findSummary(o[k],depth+1);if(x)return x;} return null; }
function collect(v,out=[],depth=0){ if(depth>8||v==null)return out; if(Array.isArray(v)){for(const x of v)collect(x,out,depth+1);return out;} const o=object(v); if(!o)return out; if(string(o.taskId??o.task_id??o.id) && (string(o.changeId??o.change_id) || string(o.title??o.text??o.task))) out.push(o); for(const [k,x] of Object.entries(o)) if(/tasks|items|entries|members|actionable|waiting|deferred|results|ranked/i.test(k)) collect(x,out,depth+1); return out; }

const controller=read('openspec-execution-controller-v1.json');
const blockers=read('openspec-blocker-audit-v1.json');
const directory=read('openspec-directory-graph-v1.json');
const kmeans=read('openspec-file-kmeans-v1.json');
const readiness=read('atlas-runtime-readiness-v1.json');
const tournament=read('openspec-challenger-tournament-v1.json');
const ranker=read('openspec-next-actions-v2.json');
const summary=findSummary(controller)??{};

const controllerTasks=collect(controller);
const taskNodes=[]; const taskEdges=[]; const changeCounts=new Map(); const fileLinks=[];
for(const raw of controllerTasks){
  const id=string(raw.taskId??raw.task_id??raw.id); if(!id)continue;
  const changeId=string(raw.changeId??raw.change_id??raw.change)??'unknown-change';
  changeCounts.set(changeId,(changeCounts.get(changeId)??0)+1);
  taskNodes.push({id,changeId,state:string(raw.executionState??raw.state??raw.status)??'UNKNOWN',blockerKey:string(raw.blockerKey??raw.blocker_key)});
  for(const dep of array(raw.dependsOnTaskIds??raw.dependsOn??raw.dependencies).map(String)) taskEdges.push({from:dep,to:id,relation:'depends_on'});
  const txt=JSON.stringify(raw);
  for(const m of txt.matchAll(/[\w.@+()\-\[\]/\\]+\.(?:ts|mts|js|mjs|svelte|json|md|sql|py)\b/g)) fileLinks.push({taskId:id,file:m[0].replaceAll('\\','/'),relation:'references'});
}
const changeNodes=[...changeCounts.entries()].map(([changeId,count])=>({changeId,count})).sort((a,b)=>b.count-a.count||a.changeId.localeCompare(b.changeId));
const nextWave=array(ranker?.waves)?.[0]??array(ranker?.executionWaves)?.[0]??null;

const report={
  schema:'atlas.openspec-progress-audit.v2',
  generatedAt:new Date().toISOString(),
  summary:{
    total:Number(summary.total??0), proven:Number(summary.proven??summary.done??0), actionable:Number(summary.actionable??0), waiting:Number(summary.waiting??0), deferred:Number(summary.deferred??0),
    taskNodes:taskNodes.length, taskDependencyEdges:taskEdges.length, taskFileLinks:fileLinks.length, changes:changeNodes.length,
    directoryFiles:Number(directory?.summary?.files??0), directoryEdges:Number(directory?.summary?.importEdges??0), kmeansClusters:array(kmeans?.clusters).length,
    readinessProven:Number(readiness?.summary?.PROVEN??0), readinessWaiting:Number(readiness?.summary?.WAITING??0)
  },
  reports:{
    controller:has('openspec-execution-controller-v1.json'), blockerAudit:has('openspec-blocker-audit-v1.json'), directoryGraph:Boolean(directory), structuralKMeans:Boolean(kmeans), runtimeReadiness:Boolean(readiness), challengerTournament:Boolean(tournament), nextActions:Boolean(ranker)
  },
  dag:{taskNodes:taskNodes.slice(0,20000),taskEdges:taskEdges.slice(0,40000),taskFileLinks:fileLinks.slice(0,40000)},
  topChanges:changeNodes.slice(0,100),
  nextExecutionWave:nextWave,
  progression:[
    'tasks.md census','implementation-order audit','execution controller + completion envelopes','blocker/retry audit','fixture/read-only proofs','directory/file graph + deterministic taxonomy','structural KMeans challenger','runtime readiness audit','actionable ranker + challenger tournament','SSR OpenSpec board','agent dispatch + cache warming','proof receipt reconciliation','live readback','promotion'
  ],
  invariants:[
    'DAG/file/cluster relationships are navigation evidence only.',
    'Only the execution controller may make a task ACTIONABLE.',
    'Only qualifying proof/authorization receipts may close promotion gates.',
    'Human feedback and learned rankings remain shadow signals until separately evaluated and promoted.'
  ],
  writesPerformed:false
};
report.semanticChecksum=semanticChecksum(report);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({outputPath,summary:report.summary,semanticChecksum:report.semanticChecksum},null,2));
