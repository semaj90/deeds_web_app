/**
 * Read-only evidence-fabric join validator.
 * The Drizzle evidence schema is DESIGN-ONLY until migrations/readback are proven.
 * Fetch all rows independently from an authenticated receipt owner; never use
 * untrusted caller JSON to authorize admission. This function is diagnostic only.
 */
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
export function verifyEvidenceFabricJoinV1({receipt,binding,predicate,assertions=[],task}={}) {
 const errors=[];
 const check=(condition,code)=>{if(!condition)errors.push(code)};
 check(!!receipt&&!!binding&&!!predicate&&!!task,'MISSING_OWNER_RECORD');
 if(errors.length)return {status:'BLOCKED',errors,admissionAuthorized:false};
 check(nonempty(receipt.evidenceId)&&receipt.evidenceId===binding.evidenceId,'EVIDENCE_ID_MISMATCH');
 check(nonempty(task.changeId)&&task.changeId===binding.changeId&&task.changeId===predicate.changeId&&task.changeId===receipt.changeId,'CHANGE_ID_MISMATCH');
 check(nonempty(task.taskId)&&task.taskId===binding.taskId&&task.taskId===predicate.taskId&&task.taskId===receipt.taskId,'TASK_ID_MISMATCH');
 check(nonempty(binding.predicate)&&binding.predicate===predicate.predicateId,'PREDICATE_ID_MISMATCH');
 check(nonempty(task.workspaceRevision)&&task.workspaceRevision===receipt.workspaceRevision&&task.workspaceRevision===predicate.workspaceRevision,'WORKSPACE_REVISION_MISMATCH');
 check(nonempty(predicate.sourceRevision)&&predicate.sourceRevision===receipt.sourceRevision,'SOURCE_REVISION_MISMATCH');
 check(nonempty(predicate.checksum)&&nonempty(receipt.checksum),'MISSING_CHECKSUM');
 check(receipt.verdict==='PASS'&&receipt.exitCode===0,'RECEIPT_VERDICT_NOT_PASS');
 check(nonempty(receipt.verifier)&&receipt.readback&&typeof receipt.readback==='object'&&Object.keys(receipt.readback).length>0,'VERIFIER_OR_READBACK_MISSING');
 check(Array.isArray(assertions)&&assertions.length>0&&assertions.every(a=>a.evidenceId===receipt.evidenceId&&a.passed===true),'ASSERTION_FAILURE');
 check(task.currentRevision!=null&&receipt.taskRevision!=null&&String(task.currentRevision)===String(receipt.taskRevision),'TASK_REVISION_MISMATCH');
 return {schema:'atlas.evidence-fabric-join-diagnostic.v1',
  status:errors.length?'BLOCKED':'CONSISTENT_RECORD_CLAIMS',errors,
  admissionAuthorized:false,readsPerformed:false,writesPerformed:false};
 // TODO EVIDENCE-LIVE-01: verify deployed migration fingerprints and read-only connection.
 // TODO EVIDENCE-TRUST-02: independently authenticate verifier identity and receipt checksum.
 // TODO EVIDENCE-TASK-03: load current task identity/history and validate predicate state.
}
