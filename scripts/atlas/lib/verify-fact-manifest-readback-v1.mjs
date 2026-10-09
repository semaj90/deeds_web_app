/** Diagnostic only: compare independently supplied datastore readbacks and manifest.
 * TODO: obtain factRow and manifest from owning read-only adapters, not caller payloads.
 * TODO: authenticate receipt digest/producer through authoritative verifier.
 * TODO: validate ContextManifestV2 identityChecksum using existing canonical hash owner.
 */
const str=x=>typeof x==='string'&&x.trim().length>0;
export function verifyFactManifestReadbackV1({relation,factRow,factReceipt,manifest,manifestReceipt}={}) {
 const failures=[];
 const require=(condition,reason)=>{if(!condition)failures.push(reason)};
 require(str(relation?.evidenceRef)&&str(relation?.sourceRevision)&&relation?.kind==='RELATION','TYPED_RELATION_REQUIRED');
 require(str(factRow?.factId)&&factRow?.relationEvidenceRef===relation?.evidenceRef&&factRow?.sourceRevision===relation?.sourceRevision,'FACT_IDENTITY_OR_REVISION_MISMATCH');
 require(factReceipt?.factId===factRow?.factId&&factReceipt?.readbackChecksum===factRow?.checksum&&str(factRow?.checksum),'FACT_READBACK_UNBOUND');
 const ids=manifest?.admittedFactIds;
 require(Array.isArray(ids)&&ids.includes(factRow?.factId),'MANIFEST_FACT_NOT_INCLUDED');
 require(str(manifest?.identityChecksum)&&manifestReceipt?.manifestChecksum===manifest?.identityChecksum,'MANIFEST_CHECKSUM_UNBOUND');
 require(manifestReceipt?.factId===factRow?.factId&&manifestReceipt?.sourceRevision===relation?.sourceRevision,'MANIFEST_EVIDENCE_REVISION_MISMATCH');
 return {schema:'atlas.fact-manifest-readback-diagnostic.v1',status:failures.length?'BLOCKED':'CONSISTENT_RECORD_CLAIMS',failures,admissionAuthorized:false,writesPerformed:false};
}
