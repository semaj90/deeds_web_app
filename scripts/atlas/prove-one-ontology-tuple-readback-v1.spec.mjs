import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessTuple,sealReceipt,verifyReceipt,REQUIRED,REQUIRED_PACKET,TABLE,PACKET_TABLE} from './prove-one-ontology-tuple-readback-v1.mjs';

const sample=()=>({
  tuple_id:'tuple-1',source_ref:'src/a.py',evidence_span:{startByte:0,endByte:5},
  evidence_state:'ACTIVE_VERIFIED',packet_key:'pk',evidence_refs:['card-1'],
  canonical_packet_key:'pk',packet_source_ref:'src/a.py',packet_source_revision:'src-r',
  packet_workspace_revision:'ws-r',
  provenance:{sourceRevision:'src-r',workspaceRevision:'ws-r',taskRevision:'task-r',
    evidenceCardChecksum:'sha256:card',evidenceSpanChecksum:'sha256:span'}
});
test('all expected storage fields enumerated',()=>{
  assert.equal(TABLE,'atlas_ontology_linked_tuples');
  assert.equal(PACKET_TABLE,'atlas_packets');
  assert.ok(REQUIRED.includes('evidence_span'));
  assert.deepEqual(REQUIRED_PACKET,['packet_key','source_ref','source_revision','workspace_revision_key']);
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
test('packet rows must independently match tuple packet identity',()=>{
  const row=sample();row.canonical_packet_key='other-packet';
  assert.equal(assessTuple(row).reason,'CANONICAL_PACKET_BINDING_MISSING');
});
test('packet source and source revision mismatches are blocked',()=>{
  const wrongSource=sample();wrongSource.packet_source_ref='src/other.py';
  assert.equal(assessTuple(wrongSource).reason,'CANONICAL_PACKET_SOURCE_MISMATCH');
  const wrongRevision=sample();wrongRevision.packet_source_revision='other-revision';
  assert.equal(assessTuple(wrongRevision).reason,'CANONICAL_PACKET_SOURCE_REVISION_MISMATCH');
});
test('packet workspace revision must match tuple provenance',()=>{
  const row=sample();row.packet_workspace_revision='other-workspace';
  assert.equal(assessTuple(row).reason,'CANONICAL_PACKET_WORKSPACE_REVISION_MISMATCH');
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
