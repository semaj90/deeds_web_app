#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const reportsDir = process.argv[2] ?? path.resolve(process.cwd(), 'docs/reports');
const outputPath = process.argv[3] ?? path.join(reportsDir, 'actionable-workboard-v2.json');
const actionablePath = path.join(reportsDir, 'openspec-actionable-work-v1.json');

function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function str(v){ return typeof v === 'string' && v.trim() ? v.trim() : null; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function uniq(v){ return [...new Set(arr(v).map(String).filter(Boolean))].sort(); }
function hash(v){ return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }

function collect(value,out,depth=0){
  if(depth>8||value==null)return;
  if(Array.isArray(value)){
    for(const item of value){
      const o=obj(item);
      if(o && (str(o.taskId)||str(o.id)||str(o.title)||str(o.text)||str(o.changeId)||str(o.change_id))) out.push(o);
      else collect(item,out,depth+1);
    }
    return;
  }
  const o=obj(value); if(!o)return;
  for(const [k,v] of Object.entries(o)) if(/^(tasks|items|entries|members|work|actionable|results)$/i.test(k)) collect(v,out,depth+1);
}

function inferGoalRank(raw){
  const direct=num(raw.goalRank)??num(raw.promotionRank)??num(raw.rank);
  if(direct!=null) return Math.max(1,direct);
  const p=str(raw.priority)??str(raw.priorityClass)??'';
  const m=/P(\d+)/i.exec(p);
  return m ? Number(m[1]) : 999;
}

function textOf(raw){ return str(raw.title)??str(raw.text)??str(raw.task)??str(raw.description)??'Untitled task'; }
function evidenceOnly(text){ return /\b(read[- ]?only|audit|verify|validate|test|fixture|replay|inspect|compare|receipt|report|census|prove|proof)\b/i.test(text) && !/\b(write|update|insert|delete|deploy|promote|materialize|backfill|migrate|mutate|patch)\b/i.test(text); }
function cluster(text){
  const topics=[
    ['identity-lineage',/\b(identity|lineage|workspace[_ -]?revision|source[_ -]?revision|packet|registry|canonical|provenance)\b/i],
    ['chunk-ast-symbol',/\b(chunk|ast|cst|symbol|tree[- ]?sitter|span)\b/i],
    ['semantic-ann',/\b(semantic|qdrant|cuvs|cagra|embedding|vector|ann|knn|rerank)\b/i],
    ['graph-topology',/\b(graphify|graph|pagerank|ppr|topology|neo4j|cugraph|hypergraph)\b/i],
    ['clustering-taxonomy',/\b(kmeans|som|centroid|cluster|domain[- ]?class|topic|concept|taxonomy|classifier)\b/i],
    ['fusion-context-prefill',/\b(rrf|fusion|contextmanifest|prefill|candidate|cohort|prompt)\b/i],
    ['residency-cache',/\b(ace|bitfrost|valkey|redis|cache|residency|warm|llama)\b/i],
    ['agent-protocols',/\b(acp|acpx|a2a|mcp|grpc|rabbitmq|transport|protocol)\b/i],
    ['human-feedback-rl',/\b(human[- ]?feedback|approval|preference|reinforcement|rlhf|pytorch|reward)\b/i],
    ['agent-workflow',/\b(agent|workflow|scheduler|ranker|retry|blocker|receipt|repair|controller)\b/i]
  ];
  return topics.find(([,re])=>re.test(text))?.[0]??'other';
}

const input=JSON.parse(fs.readFileSync(actionablePath,'utf8'));
const rawTasks=[]; collect(input,rawTasks);
const seen=new Set();
const tasks=[];
for(let i=0;i<rawTasks.length;i++){
  const raw=rawTasks[i];
  const title=textOf(raw);
  const changeId=str(raw.changeId)??str(raw.change_id)??str(raw.change)??'unknown-change';
  const id=str(raw.taskId)??str(raw.task_id)??str(raw.id)??`derived:${hash({changeId,title}).slice(0,20)}`;
  if(seen.has(id)) continue; seen.add(id);
  const readOnly = typeof raw.readOnly === 'boolean' ? raw.readOnly : evidenceOnly(title);
  const topic=cluster(`${title} ${changeId}`);
  tasks.push({
    id, changeId, title, executionState:'ACTIONABLE', goalId:str(raw.goalId)??changeId,
    goalRank:inferGoalRank(raw), goalClosure:num(raw.goalClosure)??0,
    remainingRequiredGates:num(raw.remainingRequiredGates)??999,
    requiredForCurrentGoal:raw.requiredForCurrentGoal!==false,
    dependsOnTaskIds:uniq(raw.dependsOnTaskIds??raw.dependsOn),
    requiresReceipts:uniq(raw.requiresReceipts),
    unblocksGateCount:num(raw.unblocksGateCount)??0,
    evidenceReuse:num(raw.evidenceReuse)??0,
    evidenceFreshness:num(raw.evidenceFreshness)??1,
    estimatedMinutes:num(raw.estimatedMinutes)??15,
    risk:num(raw.risk)??0,
    createsNewOwner:Boolean(raw.createsNewOwner), createsNewDependency:Boolean(raw.createsNewDependency),
    speculative:Boolean(raw.speculative), externalServiceDependency:Boolean(raw.externalServiceDependency),
    failureFingerprint:str(raw.failureFingerprint), retryEvidenceChanged:raw.retryEvidenceChanged===true,
    lowRankScore:num(raw.lowRankScore)??0.5, cacheAffinity:num(raw.cacheAffinity)??0,
    readOnly,
    readSet:uniq(raw.readSet),
    writeSet:readOnly?[]:uniq(raw.writeSet),
    resources:{cpu:1,gpu:0,llamaSlots:/\b(llama|ornith|synthesis|prompt)\b/i.test(title)?1:0,dbWriters:readOnly?0:1},
    warmHints:{
      bucketKeys:[topic,changeId],
      evidenceRefs:uniq(raw.evidenceRefs),
      promptPrefixKey:`PARENT_ATLAS:${changeId}`
    },
    topic
  });
}
const output={
  schema:'atlas.actionable-workboard.v2',
  source:'openspec-actionable-work-v1.json',
  policy:{defaultMutationScope:'GLOBAL_SERIALIZATION_WHEN_UNSCOPED',authority:'UPSTREAM_EXECUTION_CONTROLLER'},
  config:{maxWorkers:4,cpuCapacity:4,gpuCapacity:1,llamaSlotCapacity:2,dbWriterCapacity:1,warmAheadWaves:1,warmTopK:4},
  currentReceipts:[],
  tasks
};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({outputPath,tasks:tasks.length,readOnly:tasks.filter(t=>t.readOnly).length,serializedMutations:tasks.filter(t=>!t.readOnly&&!t.writeSet.length).length},null,2));
