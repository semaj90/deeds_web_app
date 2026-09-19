#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { semanticChecksum } from './lib/stable-json.mjs';

const inputPath = path.resolve(process.argv[2] ?? 'docs/reports/atlas-human-feedback-receipts-v1.json');
const outputPath = path.resolve(process.argv[3] ?? 'docs/reports/atlas-agent-feedback-dataset-v1.jsonl');
const receiptPath = path.resolve(process.argv[4] ?? 'docs/reports/atlas-agent-feedback-dataset-receipt-v1.json');

function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function str(v){ return typeof v === 'string' && v.trim() ? v.trim() : null; }
function finite(v){ const n=Number(v); return Number.isFinite(n) ? n : null; }

let source = null;
try { source = JSON.parse(fs.readFileSync(inputPath, 'utf8')); } catch {}
const receipts = arr(source?.receipts ?? source?.items ?? source);
const rows = [];
const rejected = [];
for (let i=0;i<receipts.length;i++) {
  const r=obj(receipts[i]);
  if (!r) { rejected.push({ index:i, reason:'NOT_OBJECT' }); continue; }
  const decision=str(r.decision)?.toUpperCase();
  const taskId=str(r.taskId ?? r.task_id);
  const evidenceHash=str(r.evidenceHash ?? r.evidence_hash);
  if (!taskId || !evidenceHash || !['APPROVE','REJECT','PREFER_A','PREFER_B','CORRECT'].includes(decision ?? '')) {
    rejected.push({ index:i, reason:'MISSING_STABLE_DECISION_IDENTITY' }); continue;
  }
  rows.push({
    schema:'atlas.agent-feedback-example.v1',
    taskId,
    decision,
    evidenceHash,
    actorRole:str(r.actorRole ?? r.actor_role) ?? 'human',
    candidateA:str(r.candidateA ?? r.candidate_a),
    candidateB:str(r.candidateB ?? r.candidate_b),
    selectedCandidate:str(r.selectedCandidate ?? r.selected_candidate),
    reward:finite(r.reward),
    reasonCode:str(r.reasonCode ?? r.reason_code),
    revision:{
      workspace:str(r.workspaceRevision ?? r.workspace_revision),
      source:str(r.sourceRevision ?? r.source_revision),
      graph:str(r.graphRevision ?? r.graph_revision),
      model:str(r.modelRevision ?? r.model_revision)
    },
    evidenceRefs:arr(r.evidenceRefs ?? r.evidence_refs).map(String).sort()
  });
}
rows.sort((a,b) => a.taskId.localeCompare(b.taskId) || a.evidenceHash.localeCompare(b.evidenceHash));
fs.mkdirSync(path.dirname(outputPath), { recursive:true });
fs.writeFileSync(outputPath, rows.map((x) => JSON.stringify(x)).join('\n') + (rows.length ? '\n' : ''));
const receipt={schema:'atlas.agent-feedback-dataset-receipt.v1',generatedAt:new Date().toISOString(),source:inputPath,output:outputPath,rows:rows.length,rejected:rejected.length,rejections:rejected,authority:'SHADOW_TRAINING_DATA_ONLY',writesPerformed:false};
receipt.semanticChecksum=semanticChecksum(receipt);
fs.writeFileSync(receiptPath, JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,rejected:rejected.length,outputPath,receiptPath},null,2));
