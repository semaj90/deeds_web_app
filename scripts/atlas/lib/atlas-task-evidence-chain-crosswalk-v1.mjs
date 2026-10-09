/** Read-only task-evidence chain crosswalk. All claims remain diagnostic.
 * TODO: bind each reference to the *existing* evidence_receipts/task_evidence/
 * openspec_task_predicate owners; no invented review authority or tuple writes.
 */
const valid=(v)=>typeof v==='string'&&v.length>0;
const equal=(a,b)=>valid(a)&&a===b;
export function inspectTaskEvidenceChainV1(input={}) {
 const checks=[];
 const add=(gate,ok,reason)=>checks.push({gate,status:ok?'MATCHED_CLAIM':'BLOCKED',reason:ok?null:reason});
 const registry=input.registry??{},approval=input.approval??{},sidecar=input.sidecar??{},
       relation=input.relation??{},fact=input.fact??{},context=input.context??{},summary=input.summary??{};
 const review=equal(registry.registry_checksum,approval.registry_checksum)&&
  equal(registry.proposal_checksum,approval.proposal_checksum)&&
  approval.decision==='APPROVED'&&approval.trustReceiptVerified===true;
 add('ORF_REVIEW_BINDING',review,'REVIEW_RECEIPT_NOT_INDEPENDENTLY_BOUND');
 const sidecarOK=equal(sidecar.sourceDigest,sidecar.loadedDigest)&&sidecar.runtimeReadbackVerified===true;
 add('SIDECAR_REVISION',sidecarOK,'LOADED_DIGEST_MISMATCH_OR_UNVERIFIED');
 const grounded=sidecarOK&&relation.kind==='RELATION'&&relation.exactSpanVerified===true&&
  relation.participantRolesVerified===true&&valid(relation.sourceRevision)&&
  valid(relation.relationEvidenceRef);
 add('TYPED_RELATION',grounded,'RELATION_SPAN_ROLES_OR_RUNTIME_UNVERIFIED');
 const admitted=grounded&&fact.admissionReceiptVerified===true&&fact.canonicalReadbackVerified===true&&
  equal(fact.relationEvidenceRef,relation.relationEvidenceRef)&&valid(fact.canonicalFactId);
 add('KAG_ADMISSION_READBACK',admitted,'CANONICAL_FACT_READBACK_NOT_BOUND');
 const manifested=admitted&&context.manifestReadbackVerified===true&&
  context.containsAdmittedFact===true&&
  equal(context.canonicalFactId,fact.canonicalFactId)&&
  valid(context.manifestChecksum);
 add('CONTEXT_MANIFEST',manifested,'MANIFEST_NOT_BOUND_TO_ADMITTED_FACT');
 const synthesized=manifested&&summary.contextManifestChecksumVerified===true&&
  equal(summary.contextManifestChecksum,context.manifestChecksum)&&
  summary.modelReceiptVerified===true;
 add('MANIFEST_BOUND_SYNTHESIS',synthesized,'SUMMARY_NOT_MANIFEST_BOUND');
 return {schema:'atlas.task-evidence-chain-crosswalk.v1',checks,
  allClaimsMatched:checks.every(x=>x.status==='MATCHED_CLAIM'),
  authority:'DIAGNOSTIC_ONLY',runtimeAdmissionAuthorized:false,writesPerformed:false,
  // TODO: consume authenticated receipt-verifier outputs, not client booleans.
  // TODO: require task id, predicate revision, source rev, execution rev and receipt digest joins.
  // TODO: independent datastore readback of KAG and compiled ContextManifest.
 };
}
