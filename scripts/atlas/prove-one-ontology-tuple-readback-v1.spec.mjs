import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessTuple,sealReceipt,verifyReceipt,REQUIRED,TABLE} from './prove-one-ontology-tuple-readback-v1.mjs';

const sample=()=>({
  tuple_id:'tuple-1',source_ref:'src/a.py',evidence_span:{startByte:0,endByte:5},
  evidence_state:'ACTIVE_VERIFIED',packet_key:'pk',evidence_refs:['card-1'],
  provenance:{sourceRevision:'src-r',workspaceRevision:'ws-r',taskRevision:'task-r',
    evidenceCardChecksum:'sha256:card',evidenceSpanChecksum:'sha256:span'}
});
test('all expected storage fields enumerated',()=>{
  assert.equal(TABLE,'atlas_ontology_linked_tuples');
  assert.ok(REQUIRED.includes('evidence_span'));
});
test('provenance matching does not establish admission',()=>{
  const x=assessTuple(sample());
  assert.equal(x.verdict,'PERSISTED_TUPLE_VERIFIED');
  assert.equal(x.admitted,false);
  assert.equal(x.sourceSpan,'NOT_INDEPENDENTLY_VERIFIED');
});
test('missing task revision is explicitly blocked',()=>{
  const row=sample();delete row.provenance.taskRevision;
  assert.equal(assessTuple(row).reason,'PROVENANCE_INCOMPLETE');
});
test('unexpected expectation is rejected',()=>{
  assert.throws(()=>assessTuple(sample(),{fake:'x'}),/UNKNOWN_EXPECTED_FIELD/);
});
test('expected digest mismatch blocks',()=>{
  const result=assessTuple(sample(),{evidenceCardChecksum:'sha256:other'});
  assert.equal(result.reason,'EXPECTED_PROVENANCE_MISMATCH');
});
test('receipt checksum is tamper evident',()=>{
  const receipt=sealReceipt('tuple-1',assessTuple(sample()),{table:TABLE});
  assert.equal(verifyReceipt(receipt),true);
  receipt.assessment.admitted=true;
  assert.throws(()=>verifyReceipt(receipt),/TUPLE_RECEIPT_READBACK_MISMATCH/);
});
test('tuple not found is not admitted',()=>{
  assert.deepEqual(assessTuple(null),{verdict:'BLOCKED',reason:'TUPLE_NOT_FOUND',admitted:false});
});
