import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classifyCrosswalk,receipt,verifyReceipt} from './audit-one-tuple-evidence-crosswalk-v1.mjs';
const tuple=()=>({tuple_id:'t',source_ref:'file.py',evidence_refs:['e1'],provenance:{
 sourceRevision:'r1',workspaceRevision:'w1',evidenceCardChecksum:'card',
 taskRevision:'task',evidenceSpanChecksum:'sha256:span'}});
const rows=()=>[{evidence_id:'e1',source_ref:'file.py',source_revision:'r1'}];
test('exact ledger match is never admission',()=>{
 const result=classifyCrosswalk(tuple(),rows(),true);
 assert.equal(result.verdict,'LEDGER_CROSSWALK_MATCHED');
 assert.equal(result.admitted,false);
 assert.equal(result.taskCardAdmission,'NOT_PROVEN');
});
test('evidence owner missing blocks',()=>assert.equal(classifyCrosswalk(tuple(),[],false).reason,'ATLAS_EVIDENCE_NOT_DEPLOYED'));
test('provenance required',()=>{const t=tuple();delete t.provenance.taskRevision;
 assert.equal(classifyCrosswalk(t,rows(),true).reason,'TUPLE_LINEAGE_MISSING');});
test('missing matching id blocks',()=>assert.equal(classifyCrosswalk(tuple(),[],true).reason,'EVIDENCE_IDS_NOT_UNIQUE_OR_MISSING'));
test('source mismatch blocks',()=>assert.equal(classifyCrosswalk(tuple(),[{...rows()[0],source_revision:'stale'}],true).reason,'SOURCE_REF_OR_REVISION_MISMATCH'));
test('duplicate references block',()=>{const t=tuple();t.evidence_refs=['e1','e1'];
 assert.equal(classifyCrosswalk(t,rows(),true).reason,'DUPLICATE_EVIDENCE_REFS');});
test('tampering receipt detected',()=>{const r=receipt('t',classifyCrosswalk(tuple(),rows(),true));
 assert.equal(verifyReceipt(r),true);r.result.admitted=true;
 assert.throws(()=>verifyReceipt(r),/CROSSWALK_RECEIPT_MISMATCH/);});
