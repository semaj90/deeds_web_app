#!/usr/bin/env node
/**
 * Read-only three-receipt reconciliation. Does not execute producer audits.
 *
 * Source authority and TaskCard/EvidenceCard reports represent different
 * proof domains. Neither is silently promoted into ontology fact admission.
 * TODO: connect exact fact/tuple/task binding from authoritative producer.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SCRATCH=path.join(ROOT,'.tmp');
const digest=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
function string(v){return typeof v==='string'&&v.length>0;}
export function reconcile({crosswalk,sourceAuthority,taskEvidence,tupleId,taskRef}){
  const reasons=[];
  if(crosswalk?.schema!=='atlas.tuple-evidence-crosswalk.v1'||crosswalk.tupleId!==tupleId||
     crosswalk.result?.verdict!=='LEDGER_CROSSWALK_MATCHED') reasons.push('LEDGER_CROSSWALK_UNPROVEN');
  if(!sourceAuthority||sourceAuthority.status!=='CURRENT_SOURCE_AUTHORITY_PROVEN')
    reasons.push('SOURCE_AUTHORITY_UNPROVEN');
  if(!taskEvidence||taskEvidence.schema!=='atlas.current-task-evidence-card-join-report.v1')
    reasons.push('TASK_EVIDENCE_REPORT_UNPROVEN');
  const admissions=Array.isArray(taskEvidence?.taskEvidenceAdmissions)?taskEvidence.taskEvidenceAdmissions:[];
  const matched=admissions.filter(a=>a.taskRef===taskRef);
  if(!string(taskRef)||matched.length!==1) reasons.push('TASK_REF_NOT_UNIQUE_OR_MISSING');
  else if(matched[0].admitted!==true) reasons.push('TASK_CLAIM_NOT_ADMITTED');
  // A joined task claim alone does NOT identify the grounded NLP fact. Require
  // an authoritative tuple<->fact<->task/evidence-card identity proof.
  reasons.push('FACT_TASK_TUPLE_BINDING_NOT_PROVEN');
  return {schema:'atlas.tuple-source-task-bridge.v1',
    tupleId,taskRef:taskRef??null,
    status:'BLOCKED',reasons:[...new Set(reasons)],
    sourceAuthorityObserved:sourceAuthority?.status??'NOT_PROVIDED',
    taskClaimAdmissionObserved:matched.length===1?matched[0].admitted===true:false,
    evidenceAdmissionProven:false,canInvokeOak:false,canBuildContextManifest:false,
    canExecuteDag:false,writesPerformed:false,
    todo:[
      'TODO: verify source execution membership for tuple packet_key + source_ref + exact workspace/source revision using the current-source-authority owner',
      'TODO: identify exact admitted grounded-fact producer binding tuple_id, taskRef, evidenceCardChecksum and evidenceSpanChecksum',
      'TODO: validate producer receipts and authoritative source byte-span digest independently',
      'TODO: run OaK only after admitted fact proof, then SearchRuntime ordinal-map and ContextManifest readback',
      'TODO: require deployed durable-journal transaction + CAS + explicit approval before any mutation'
    ]};
}
export function seal(value){return {...value,checksum:digest(value)};}
export function verify(value){
  const {checksum,...body}=value;
  if(checksum!==digest(body)) throw new Error('BRIDGE_RECEIPT_CHECKSUM_MISMATCH');
  return true;
}
async function load(rel) {
  const abs=path.resolve(ROOT,rel);
  const r=path.relative(ROOT,abs);
  if(r.startsWith('..')||path.isAbsolute(r)||!r) throw new Error('INPUT_OUTSIDE_REPO');
  const stat=await import('node:fs/promises').then(m=>m.stat(abs));
  if(stat.size>8*1024*1024) throw new Error('OVERSIZED_PROOF_INPUT');
  return JSON.parse(await readFile(abs,'utf8'));
}
async function main(){
  const [crosswalkPath,sourcePath,taskPath,tupleId,taskRef,outRel]=process.argv.slice(2);
  if(![crosswalkPath,sourcePath,taskPath,tupleId,taskRef,outRel].every(string))
    throw new Error('USAGE: node bridge-tuple-source-task-receipts-v1.mjs CROSSWALK_JSON SOURCE_AUTHORITY_JSON TASK_JOIN_JSON TUPLE_ID TASK_REF OUTPUT_SCRATCH_JSON');
  const out=path.resolve(ROOT,outRel);
  const r=path.relative(SCRATCH,out);
  if(!r||r.startsWith('..')||path.isAbsolute(r)||!out.endsWith('.json'))throw new Error('SCRATCH_OUTPUT_REQUIRED');
  const body=reconcile({crosswalk:await load(crosswalkPath),sourceAuthority:await load(sourcePath),
    taskEvidence:await load(taskPath),tupleId,taskRef});
  const report=seal(body);
  await mkdir(path.dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  verify(JSON.parse(await readFile(out,'utf8')));
  console.log(JSON.stringify({status:report.status,reasons:report.reasons,report:out,checksum:report.checksum}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('BRIDGE_FAILED',e.message);process.exitCode=1;});
