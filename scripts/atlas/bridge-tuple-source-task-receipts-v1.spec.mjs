import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcile,seal,verify} from './bridge-tuple-source-task-receipts-v1.mjs';
const fixture=()=>({tupleId:'t',taskRef:'task:1',
 crosswalk:{schema:'atlas.tuple-evidence-crosswalk.v1',tupleId:'t',result:{verdict:'LEDGER_CROSSWALK_MATCHED'}},
 sourceAuthority:{status:'CURRENT_SOURCE_AUTHORITY_PROVEN'},
 taskEvidence:{schema:'atlas.current-task-evidence-card-join-report.v1',
 taskEvidenceAdmissions:[{taskRef:'task:1',admitted:true}]}});
test('positive domain reports remain blocked without exact fact-task binding',()=>{
 const r=reconcile(fixture());assert.equal(r.status,'BLOCKED');
 assert.equal(r.taskClaimAdmissionObserved,true);
 assert.ok(r.reasons.includes('FACT_TASK_TUPLE_BINDING_NOT_PROVEN'));
 assert.equal(r.canInvokeOak,false);assert.equal(r.canExecuteDag,false);
});
test('stale source authority is not promoted',()=>{
 const v=fixture();v.sourceAuthority.status='CURRENT_SOURCE_AUTHORITY_BLOCKED';
 assert.ok(reconcile(v).reasons.includes('SOURCE_AUTHORITY_UNPROVEN'));
});
test('missing task card binding blocks',()=>{
 const v=fixture();v.taskEvidence.taskEvidenceAdmissions=[];
 assert.ok(reconcile(v).reasons.includes('TASK_REF_NOT_UNIQUE_OR_MISSING'));
});
test('ambiguous task admission blocks',()=>{
 const v=fixture();v.taskEvidence.taskEvidenceAdmissions.push({taskRef:'task:1',admitted:true});
 assert.ok(reconcile(v).reasons.includes('TASK_REF_NOT_UNIQUE_OR_MISSING'));
});
test('not admitted task claim is reported',()=>{
 const v=fixture();v.taskEvidence.taskEvidenceAdmissions[0].admitted=false;
 assert.ok(reconcile(v).reasons.includes('TASK_CLAIM_NOT_ADMITTED'));
});
test('receipt checksum tamper detected',()=>{
 const r=seal(reconcile(fixture()));assert.equal(verify(r),true);r.canExecuteDag=true;
 assert.throws(()=>verify(r),/BRIDGE_RECEIPT_CHECKSUM_MISMATCH/);
});
