/** Pure, conservative evidence classification for workstation goal.
 * Never authorizes registry promotion, KAG writes, sidecar deployment or synthesis.
 */
export function assessWorkstationGoalGatesV1(x={}) {
 const registryReviewed=x.registry?.reviewState==='APPROVED' &&
   x.registry?.trustedVerifierResult==='VERIFIED' &&
   x.registry?.artifactChecksum===x.registry?.reviewedChecksum &&
   typeof x.registry?.artifactChecksum==='string' && /^[a-f0-9]{64}$/.test(x.registry.artifactChecksum);
 const sidecarMatched=x.sidecar?.sourceDigest && x.sidecar?.loadedDigest &&
   x.sidecar.sourceDigest===x.sidecar.loadedDigest;
 const relationGrounded=sidecarMatched && x.relation?.kind==='RELATION' &&
   x.relation?.spanVerified===true && x.relation?.participantRolesVerified===true &&
   x.relation?.sourceRevisionVerified===true;
 const factReadback=relationGrounded && x.fact?.admissionReceiptVerified===true &&
   x.fact?.canonicalReadbackVerified===true;
 const contextVerified=factReadback && x.context?.manifestChecksumVerified===true &&
   x.context?.evidenceRevisionBindingsVerified===true;
 return {
  schema:'atlas.workstation-goal-gates.v1',writesPerformed:false,
  gates:{
   ORF_REGISTRY_REVIEW:registryReviewed?'REVIEW_BINDING_PRESENT_NOT_RUNTIME_PROMOTED':'BLOCKED',
   LIVE_SIDECAR_REVISION:sidecarMatched?'MATCHED':'BLOCKED',
   TYPED_RELATION_GROUNDING:relationGrounded?'GROUNDING_CLAIM_PRESENT':'BLOCKED',
   KAG_FACT_READBACK:factReadback?'READBACK_CLAIM_PRESENT':'BLOCKED',
   CONTEXT_MANIFEST:contextVerified?'MANIFEST_CLAIM_PRESENT':'BLOCKED',
   CONTEXT_BACKED_SUMMARY:'BLOCKED_PENDING_AUTHORIZED_RUNTIME_VERIFICATION'
  },
  diagnosticSummaryNotAdmission:x.summary?.sourceSpanVerified===true,
  runtimePromotionAuthorized:false
 };
 // TODO: Source actual verifications only from independent trusted review / source-span /
 // persistence / ContextManifest owners; caller-provided booleans are not authority.
}
