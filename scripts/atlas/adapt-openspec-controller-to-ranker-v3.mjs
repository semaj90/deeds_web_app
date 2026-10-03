#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { classifyLaneV2 } from './lib/lane-taxonomy-v2.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'actionable-workboard-v3.json'));
const controllerPath = path.join(reportsDir, 'openspec-execution-controller-v1.json');
const fallbackPath = path.join(reportsDir, 'openspec-actionable-work-v1.json');
const authorityReviewPath = path.join(reportsDir, 'openspec-authority-text-review-v1.json');

function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:null}
function arr(v){return Array.isArray(v)?v:[]}
function str(v){return typeof v==='string'&&v.trim()?v.trim():null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function uniq(v){return [...new Set(arr(v).map(String).filter(Boolean))].sort()}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}
function collect(v,out=[],depth=0){if(depth>10||v==null)return out;if(Array.isArray(v)){for(const x of v)collect(x,out,depth+1);return out;}const o=obj(v);if(!o)return out;const key=str(o.taskKey??o.taskId??o.id);const text=str(o.text??o.title??o.task??o.description);if(key&&(text||str(o.change??o.changeId)))out.push(o);for(const[k,x]of Object.entries(o))if(/tasks|items|entries|members|actionable|results|work/i.test(k))collect(x,out,depth+1);return out;}
function evidenceOnly(text){return /\b(read[- ]?only|audit|verify|validate|test|fixture|replay|inspect|compare|receipt|report|census|prove|proof)\b/i.test(text)&&!/\b(write|update|insert|delete|deploy|promote|materialize|backfill|migrate|mutate|patch)\b/i.test(text)}
function goalRank(raw){const d=num(raw.goalRank)??num(raw.promotionRank);if(d!=null)return d;const p=String(raw.priority??raw.priorityClass??'');const m=/P?(\d+)/i.exec(p);return m?Number(m[1]):999}
const laneOrder=['IDENTITY_AUTHORITY','DIRECTORY_INDEXING','AST_SYMBOL','LEXICAL_SEARCH','SEMANTIC_ANN','GRAPH_TOPOLOGY','RETRIEVAL_FUSION','PREFILL_CONTEXT','ACE_BITFROST_CACHE','AGENT_PROTOCOLS','HITL_LEARNING','MIGRATION_DATABASE','ADMIN_OBSERVABILITY','RESEARCH_CHALLENGER','GOVERNANCE_PROOF','GENERAL'];
function laneRank(lane){const i=laneOrder.indexOf(lane);return i<0?laneOrder.length:i;}

// WFU-09: WorkboardFeatureVectorV1. Every feature carries a presence mask and a basis; a feature with no
// real observation is { present:false, value:0 } and is NEVER filled with a default. The legacy scalar
// fields on each task (which still carry adapter defaults such as estimatedMinutes=15) are unchanged for
// existing consumers, but must not be read as observations by a tournament — read featureVector instead.
// basis: OBSERVED (a source field read as-is) | DERIVED (deterministic function of observed fields) |
//        PROXY (indirect stand-in, e.g. file mtime for task freshness) | HEURISTIC (text-derived guess).
// A feature is "qualified" for a tournament only when basis is OBSERVED or DERIVED.
const FEATURE_VECTOR_SCHEMA = 'atlas.workboard-feature-vector.v1';
const ABSENT = { present: false, value: 0, basis: 'ABSENT' };
function present(value, basis, extra) { return { present: true, value, basis, ...(extra ?? {}) }; }
function observedNumber(v) { const n = num(v); return n == null ? ABSENT : present(n, 'OBSERVED'); }
function derivedNumber(v, from) { const n = num(v); return n == null ? ABSENT : present(n, 'DERIVED', { from }); }
function observedCount(v) { return Array.isArray(v) ? present(v.length, 'OBSERVED') : ABSENT; }
function observedGoalRank(raw) {
  const direct = num(raw.goalRank) ?? num(raw.promotionRank);
  if (direct != null) return present(direct, 'OBSERVED', { usedByDeterministicRank: true });
  const m = /P?(\d+)/i.exec(String(raw.priority ?? raw.priorityClass ?? ''));
  return m ? present(Number(m[1]), 'DERIVED', { from: 'priority', usedByDeterministicRank: true }) : ABSENT;
}
function sourceAgeSeconds(raw, generatedAt) {
  const updated = Date.parse(raw.lastUpdatedAt ?? '');
  const generated = Date.parse(generatedAt ?? '');
  if (!Number.isFinite(updated) || !Number.isFinite(generated)) return ABSENT;
  // Deterministic: age is relative to the controller's own generatedAt, never wall-clock now().
  const basis = raw.timestampMethod === 'FILESYSTEM_MTIME' ? 'PROXY' : 'OBSERVED';
  return present(Math.max(0, Math.round((generated - updated) / 1000)), basis, { from: 'lastUpdatedAt', timestampMethod: raw.timestampMethod ?? null });
}
function buildFeatureVector(raw, ctx) {
  const mutation = typeof raw.readOnly === 'boolean'
    ? present(raw.readOnly ? 0 : 1, 'OBSERVED')
    : Array.isArray(raw.writeSet)
      ? present(raw.writeSet.length > 0 ? 1 : 0, 'DERIVED', { from: 'declared-writes' })
      : present(ctx.readOnly ? 0 : 1, 'HEURISTIC', { from: 'title-text' });
  return {
    schema: FEATURE_VECTOR_SCHEMA,
    features: {
      goalRank: observedGoalRank(raw),
      selectionEligible: ctx.hasAuthorityReview ? present(ctx.selectionEligible ? 1 : 0, 'DERIVED', { from: 'authority-text-review' }) : ABSENT,
      sourceAgeSeconds: sourceAgeSeconds(raw, ctx.generatedAt),
      mutationRisk: mutation,
      prerequisiteCount: observedCount(raw.dependsOnTaskIds ?? raw.depends_on_task_ids ?? raw.dependsOn),
      evidenceReceiptCount: observedCount(raw.requiresReceipts ?? raw.requires_receipts),
      affectedFileCount: (Array.isArray(raw.readSet) || Array.isArray(raw.writeSet)) ? present(arr(raw.readSet).length + arr(raw.writeSet).length, 'OBSERVED') : ABSENT,
      // remainingRequiredGates / unblocksGateCount are computed by the ledger from declared depends= edges (DERIVED);
      // estimatedMinutes is the declared est= value (OBSERVED as declared, an author estimate — not measured throughput).
      remainingRequiredGates: derivedNumber(raw.remainingRequiredGates, 'declared-dependencies'),
      unblocksGateCount: derivedNumber(raw.unblocksGateCount, 'declared-dependencies'),
      estimatedMinutes: observedNumber(raw.estimatedMinutes),
      risk: observedNumber(raw.risk),
      evidenceReuse: observedNumber(raw.evidenceReuse),
      goalClosure: observedNumber(raw.goalClosure),
      cacheAffinity: observedNumber(raw.cacheAffinity)
    }
  };
}
function featureCoverage(tasks) {
  const out = {};
  for (const t of tasks) {
    for (const [name, f] of Object.entries(t.featureVector?.features ?? {})) {
      const c = out[name] ??= { present: 0, absent: 0, basis: {}, distinctValues: new Set() };
      if (f.present) { c.present++; c.basis[f.basis] = (c.basis[f.basis] ?? 0) + 1; c.distinctValues.add(f.value); }
      else c.absent++;
    }
  }
  return Object.fromEntries(Object.entries(out).map(([name, c]) => [name, {
    present: c.present, absent: c.absent, basis: c.basis, distinctValues: c.distinctValues.size,
    qualifiedVarying: c.distinctValues.size > 1 && Object.keys(c.basis).some((b) => b === 'OBSERVED' || b === 'DERIVED')
  }]));
}


let authorityReview = new Map();
const authorityReviewByStable = new Map();
const authorityReviewByLogical = new Map();
let authorityReviewLoaded = false;
try {
  const review = JSON.parse(fs.readFileSync(authorityReviewPath, 'utf8'));
  authorityReviewLoaded = review?.schema === 'atlas.openspec-authority-text-review.v1';
  // NS-8a: join by stableKey (survives line drift). A `change:line` key is only trusted for legacy review rows
  // that carry no stableKey, because a drifted line key can point at a different task.
  for (const task of arr(review.tasks)) {
    if (task.logicalTaskKey) authorityReviewByLogical.set(String(task.logicalTaskKey), task);
    if (task.stableKey) authorityReviewByStable.set(String(task.stableKey), task);
    else authorityReview.set(String(task.taskKey), task);
  }
} catch {
  // Selection fails closed until the advisory review is refreshed.
}

let source='openspec-execution-controller-v1.json';
let input;
try{input=JSON.parse(fs.readFileSync(controllerPath,'utf8'))}catch{source='openspec-actionable-work-v1.json';input=JSON.parse(fs.readFileSync(fallbackPath,'utf8'))}
const raw=Array.isArray(input?.allTasks)?input.allTasks:collect(input);
const tasks=[];const seen=new Set();
for(const r of raw){
  const executionState=str(r.controller?.state)
    ?? str(r.executionState??r.execution_state??r.controllerState??r.controller_state)
    ?? (source.includes('actionable-work')?'ACTIONABLE':null);
  if(executionState!=='ACTIONABLE')continue;
  const title=str(r.text??r.title??r.task??r.description)??'Untitled task';
  const changeId=str(r.change??r.changeId??r.change_id)??'unknown-change';
  const id=str(r.taskKey??r.taskId??r.task_id??r.id)??`derived:${hash({changeId,title}).slice(0,20)}`;
  if(seen.has(id))continue;seen.add(id);
  const lanes=classifyLaneV2({...r,change:changeId,taskKey:id,text:title});
  // NS-8B: logical key -> migration key -> legacy line key. A review applies only while the task revision it reviewed
  // (blockHash) is still current; otherwise it is REVIEW_STALE and selection fails closed (never fail-open).
  const advisoryReviewRaw = authorityReviewByLogical.get(str(r.logicalTaskKey) ?? '') ?? authorityReviewByStable.get(str(r.stableKey) ?? '') ?? authorityReview.get(id);
  const reviewStale = Boolean(advisoryReviewRaw?.reviewedTaskRevision && r.blockHash && advisoryReviewRaw.reviewedTaskRevision !== r.blockHash);
  const advisoryReview = reviewStale ? undefined : advisoryReviewRaw;
  const selectionEligible = authorityReviewLoaded && !reviewStale && advisoryReview?.recommendedDisposition !== 'REVIEW_BEFORE_SELECTION';
  const readOnly=typeof r.readOnly==='boolean'?r.readOnly:evidenceOnly(title);
  const writeSet=readOnly?[]:uniq(r.writeSet);
  tasks.push({
    id,changeId,title,
    ledgerState:str(r.ledgerState??r.state??r.status)??'OPEN',
    executionState:'ACTIONABLE',selectionEligible,
    selectionDisposition: !authorityReviewLoaded
      ? 'AUTHORITY_REVIEW_MISSING'
      : (selectionEligible ? 'CONTROLLER_ACTIONABLE' : 'REVIEW_BEFORE_SELECTION'),
    advisoryBlockers: uniq(advisoryReview?.recommendedBlockers),
    lane:lanes.primary,secondaryLanes:lanes.secondary,
    goalId:str(r.goalId)??changeId,goalRank:goalRank(r),goalClosure:num(r.goalClosure)??0,
    remainingRequiredGates:num(r.remainingRequiredGates)??999,
    requiredForCurrentGoal:r.requiredForCurrentGoal!==false,
    dependsOnTaskIds:uniq(r.dependsOnTaskIds??r.depends_on_task_ids??r.dependsOn),
    requiresReceipts:uniq(r.requiresReceipts??r.requires_receipts),
    blockerKey:str(r.blockerKey??r.blocker_key),releaseEvent:str(r.releaseEvent??r.release_event??r.retryWhen??r.retry_when),
    unblocksGateCount:num(r.unblocksGateCount)??0,evidenceReuse:num(r.evidenceReuse)??0,evidenceFreshness:num(r.evidenceFreshness)??1,
    estimatedMinutes:num(r.estimatedMinutes)??15,risk:num(r.risk)??0,
    createsNewOwner:Boolean(r.createsNewOwner),createsNewDependency:Boolean(r.createsNewDependency),speculative:Boolean(r.speculative),externalServiceDependency:Boolean(r.externalServiceDependency),
    failureFingerprint:str(r.failureFingerprint),retryEvidenceChanged:r.retryEvidenceChanged===true,
    lowRankScore:num(r.lowRankScore)??0.5,cacheAffinity:num(r.cacheAffinity)??0,
    readOnly,readSet:uniq(r.readSet),writeSet,
    reviewState: reviewStale ? 'REVIEW_STALE' : (advisoryReview ? 'REVIEWED_CURRENT' : 'NO_REVIEW_ROW'),
    taskIdentity: r.taskIdentity ?? null,
    featureVector:buildFeatureVector(r,{readOnly,selectionEligible,hasAuthorityReview:authorityReviewLoaded&&Boolean(advisoryReview),generatedAt:input?.generatedAt}),
    resources:{cpu:num(r.resources?.cpu)??1,gpu:num(r.resources?.gpu)??0,llamaSlots:num(r.resources?.llamaSlots)??(/\b(llama|ornith|synthesis|prompt)\b/i.test(title)?1:0),dbWriters:num(r.resources?.dbWriters)??(readOnly?0:1)},
    warmHints:{bucketKeys:uniq([lanes.primary,changeId,...arr(r.warmHints?.bucketKeys)]),evidenceRefs:uniq(r.evidenceRefs??r.warmHints?.evidenceRefs),promptPrefixKey:str(r.warmHints?.promptPrefixKey)??`PARENT_ATLAS:${lanes.primary}:${changeId}`}
  });
}
tasks.sort((a,b) =>
  (a.goalRank-b.goalRank) ||
  (Number(b.requiredForCurrentGoal)-Number(a.requiredForCurrentGoal)) ||
  (Number(b.readOnly)-Number(a.readOnly)) ||
  (laneRank(a.lane)-laneRank(b.lane)) ||
  (a.remainingRequiredGates-b.remainingRequiredGates) ||
  (b.unblocksGateCount-a.unblocksGateCount) ||
  (b.evidenceFreshness-a.evidenceFreshness) ||
  (b.evidenceReuse-a.evidenceReuse) ||
  (a.risk-b.risk) ||
  (a.estimatedMinutes-b.estimatedMinutes) ||
  a.changeId.localeCompare(b.changeId) ||
  a.id.localeCompare(b.id)
);
for (let i=0;i<tasks.length;i++) tasks[i].rank=i+1;
const output={schema:'atlas.actionable-workboard.v3',source,featureVectorSchema:FEATURE_VECTOR_SCHEMA,featureCoverage:featureCoverage(tasks),policy:{authority:'UPSTREAM_EXECUTION_CONTROLLER',laneAuthority:false,advisoryAuthorityTextReview:true,authorityReviewLoaded,selectionRequiresReviewClearance:true,defaultMutationScope:'GLOBAL_SERIALIZATION_WHEN_UNSCOPED'},config:{maxWorkers:4,cpuCapacity:4,gpuCapacity:1,llamaSlotCapacity:2,dbWriterCapacity:1,warmAheadWaves:1,warmTopK:4},currentReceipts:[],tasks};
output.semanticChecksum=hash({...output});
const temporaryPath=`${outputPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temporaryPath,JSON.stringify(output,null,2)+'\n');
fs.renameSync(temporaryPath,outputPath);
console.log(JSON.stringify({outputPath,source,tasks:tasks.length,laneCounts:tasks.reduce((a,t)=>(a[t.lane]=(a[t.lane]??0)+1,a),{}),semanticChecksum:output.semanticChecksum},null,2));
