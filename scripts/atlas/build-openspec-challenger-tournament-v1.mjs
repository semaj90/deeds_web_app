#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { semanticChecksum } from './lib/stable-json.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'openspec-challenger-tournament-v1.json'));
function read(name){ try{return JSON.parse(fs.readFileSync(path.join(reportsDir,name),'utf8'));}catch{return null;} }
function tasksOf(v){ return Array.isArray(v?.tasks)?v.tasks:Array.isArray(v?.ranked)?v.ranked:Array.isArray(v?.results)?v.results:[]; }
function idOf(t){ return String(t?.id ?? t?.taskId ?? t?.task_id ?? ''); }
function scoreOf(t){ for(const k of ['score','rankScore','lowRankScore','recommendationScore']){const n=Number(t?.[k]); if(Number.isFinite(n))return n;} return null; }

const deterministic=read('openspec-next-actions-v2.json') ?? read('actionable-workboard-v3.json');
const lowrank=read('low-rank-task-recommendation-v2.json');
const det=tasksOf(deterministic), lr=tasksOf(lowrank);
const detRank=new Map(det.map((t,i)=>[idOf(t),i+1]).filter(([id])=>id));
const lrRank=new Map(lr.map((t,i)=>[idOf(t),i+1]).filter(([id])=>id));
const ids=[...new Set([...detRank.keys(),...lrRank.keys()])];
const rows=ids.map((id)=>({
  taskId:id,
  deterministicRank:detRank.get(id)??null,
  challengerRank:lrRank.get(id)??null,
  rankDelta:detRank.has(id)&&lrRank.has(id)?(lrRank.get(id)-detRank.get(id)):null,
  eligibleForAuthority:false
})).sort((a,b)=>(a.deterministicRank??999999)-(b.deterministicRank??999999)||a.taskId.localeCompare(b.taskId));
const report={
  schema:'atlas.openspec-challenger-tournament.v1',
  generatedAt:new Date().toISOString(),
  participants:{deterministic:Boolean(deterministic),lowRank:Boolean(lowrank),humanFeedback:false},
  comparisonStatus: lowrank ? 'COMPARISON_AVAILABLE' : (deterministic ? 'LOW_RANK_CHALLENGER_REPORT_MISSING' : 'RANKING_INPUTS_MISSING'),
  deterministicSource: read('openspec-next-actions-v2.json') ? 'openspec-next-actions-v2.json' : (deterministic ? 'actionable-workboard-v3.json' : null),
  lowRankSource: lowrank ? 'low-rank-task-recommendation-v2.json' : null,
  comparisons:rows,
  rule:'Tournament compares advisory orderings only. Upstream execution state and deterministic critical-path rank remain authority.',
  writesPerformed:false
};
report.semanticChecksum=semanticChecksum(report);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({outputPath,comparisons:rows.length,semanticChecksum:report.semanticChecksum},null,2));
