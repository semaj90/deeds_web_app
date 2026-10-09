import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha256=b=>createHash('sha256').update(b).digest('hex');
const under=(root,file)=>file===root||file.startsWith(root+path.sep);
/** Read-only file receipt: byte integrity, not independent authentication. */
export function readReceiptFromWorkspaceV1({workspaceRoot,relativePath,expectedSha256,maxBytes=2000000}){
 if(typeof workspaceRoot!=='string'||typeof relativePath!=='string'||!relativePath||path.isAbsolute(relativePath))throw Error('INVALID_RELATIVE_PATH');
 if(!/^[a-f0-9]{64}$/.test(expectedSha256??''))throw Error('EXPECTED_DIGEST_REQUIRED');
 const root=fs.realpathSync(workspaceRoot),file=path.resolve(root,relativePath);
 if(!under(root,file))throw Error('PATH_OUTSIDE_WORKSPACE');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)throw Error('UNSAFE_RECEIPT_FILE');
 const real=fs.realpathSync(file);if(!under(root,real))throw Error('SYMLINK_ESCAPE');
 const bytes=fs.readFileSync(real);if(bytes.length>maxBytes)throw Error('RECEIPT_TOO_LARGE');
 const actualSha256=sha256(bytes);
 if(actualSha256!==expectedSha256)throw Error('RECEIPT_DIGEST_MISMATCH');
 return {schema:'atlas.readonly-file-receipt.v1',record:JSON.parse(bytes.toString('utf8')),actualSha256,relativePath,origin:'WORKSPACE_FILE_HASH_MATCH',authenticated:false,admissionAuthorized:false};
}
/** Missing-owner census; do not treat user supplied observations as trusted facts. */
export function planEvidenceOwnerReadsV1({migrationStatus,task,receipt}={}){
 const checks=[];
 const add=(gate,status,missing)=>checks.push({gate,status,missing});
 add('EVIDENCE_LIVE_01',migrationStatus==='APPLIED_READBACK_VERIFIED'?'READ_OWNER_REQUIRED':'BLOCKED',['deployed relation census','read-only DB schema fingerprint']);
 add('EVIDENCE_TRUST_02','BLOCKED',['authenticated verifier identity','trusted key/revocation','receipt byte checksum']);
 add('EVIDENCE_TASK_03',task?.currentRevision&&receipt?.taskRevision===task.currentRevision?'IDENTITY_CLAIM_ONLY':'BLOCKED',['task authority revision','predicate checksum','task_evidence join']);
 add('KAG_READBACK_01','BLOCKED',['canonical tuple owner readback','participant roles','relation evidence identity','tuple checksum']);
 add('CM_READBACK_01','BLOCKED',['ContextManifestV2 canonical hash recomputation','selected evidence readback','revision input parity']);
 add('SYNTH_RECEIPT_01','BLOCKED',['prompt digest','model artifact/revision','manifest checksum','generation receipt']);
 return {schema:'atlas.evidence-owner-read-plan.v1',checks,runtimeAdmissionAuthorized:false,performedReads:false,writesPerformed:false};
}
// TODO: wire to the existing audited file receipt owner and canonical task resolver.
// TODO: query deployed DB catalog before attempting evidence_receipts/task_evidence reads.
// TODO: bind grounded relation and tuple through the existing ontology persistence owner.
// TODO: use actual buildContextManifestV2; never hash arbitrary JSON as a substitute.
// TODO: independent model prompt/manifest readback and receipt authentication.
