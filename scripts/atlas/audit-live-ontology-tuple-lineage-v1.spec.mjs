import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalogReport, sealReport, verifyReport, TABLES } from './audit-live-ontology-tuple-lineage-v1.mjs';

test('both tuple surfaces are classified without guessing ownership',()=>{
  const relations=[{table_name:'atlas_ontology_tuples'},{table_name:'atlas_ontology_linked_tuples'}];
  const report=buildCatalogReport([],relations,[]);
  assert.equal(report.verdict,'DUAL_TUPLE_SURFACES_REQUIRE_OWNER_REVIEW');
  assert.equal(report.storageOwnerProven,false);
  assert.equal(report.canonicalWrites,false);
  assert.equal(report.tupleSurfaces.length,2);
});
test('absent evidence relations remain visible as absent',()=>{
  const r=buildCatalogReport([],[{table_name:'atlas_ontology_linked_tuples'}],[]);
  assert.equal(r.relations.evidence_receipts.exists,false);
  assert.equal(r.evidenceAdmissionProven,false);
});
test('columns and constraints survive structured catalog reporting',()=>{
  const r=buildCatalogReport([{table_name:'atlas_ontology_linked_tuples',column_name:'provenance',data_type:'jsonb',is_nullable:'YES'}],
    [{table_name:'atlas_ontology_linked_tuples'}],
    [{table_name:'atlas_ontology_linked_tuples',constraint_name:'pk',constraint_type:'p',definition:'PRIMARY KEY (tuple_id)'}]);
  assert.equal(r.relations.atlas_ontology_linked_tuples.columns[0].type,'jsonb');
  assert.equal(r.relations.atlas_ontology_linked_tuples.constraints[0].kind,'p');
});
test('digest readback detects tampering',()=>{
  const r=sealReport(buildCatalogReport([],[],[]));
  assert.equal(verifyReport(r),true);
  r.verdict='ADMITTED';
  assert.throws(()=>verifyReport(r),/CATALOG_RECEIPT_READBACK_MISMATCH/);
});
test('all expected relations are reported, even when missing',()=>{
  const r=buildCatalogReport([],[],[]);
  assert.deepEqual(Object.keys(r.relations),TABLES);
});
