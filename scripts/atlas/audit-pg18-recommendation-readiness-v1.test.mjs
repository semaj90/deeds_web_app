import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPg18ReadinessV1, INSPECTED_TABLES } from './audit-pg18-recommendation-readiness-v1.mjs';
const CORE=['codebase_chunk_index','atlas_representations','atlas_domain_ontology','atlas_feature_map','kanban_tasks'];
const fake = (opts={})=>{
  const log=[];
  const obj={log,async query(sql,params){
    log.push({sql,params});
    if (opts.failOn && sql.includes(opts.failOn)) throw new Error('fixture failure');
    if (/^BEGIN|^ROLLBACK/.test(sql))return {rows:[]};
    if(sql.includes('current_setting'))return{rows:[{postgres_version:'18.4',database_name:'fixture_db'}]};
    if(sql.includes('pg_settings'))return{rows:[{name:'io_method',setting:'worker',unit:null,source:'default'}]};
    if(sql.includes('pg_extension'))return{rows:opts.noVector?[]:[{extname:'vector',extversion:'0.8.3'}]};
    if(sql.includes('information_schema.columns'))return{rows:(opts.missingTable?CORE.filter(x=>x!==opts.missingTable):CORE).map(table_name=>({table_name,column_name:table_name==='codebase_chunk_index'?'content_embedding_768':'id',udt_name:table_name==='codebase_chunk_index'?(opts.wrongType?'bytea':'vector'):'text'}))};
    if(sql.includes('pg_index ix'))return{rows:opts.noIndex?[]:[{tablename:'codebase_chunk_index',indexname:'idx_fixture',access_method:'hnsw',is_valid:opts.invalidIndex?false:true,is_ready:true,indexdef:'CREATE INDEX idx_fixture ON codebase_chunk_index USING hnsw (content_embedding_768 vector_cosine_ops)'}]};
    throw new Error('UNEXPECTED_QUERY: '+sql);
  }};
  return obj;
};
test('read-only transaction, rollback, no persistent DDL or DML',async()=>{
  const client=fake();const result=await inspectPg18ReadinessV1(client,{projectionEvidence:{overall_verdict:'NOT_SAFE_TO_PROJECT',sha256:'sha256:fixture'}});
  assert.equal(result.postgresSchemaStatus,'SCHEMA_READY_FOR_READ_ONLY_BENCHMARK');
  assert.equal(result.projectionAdmission,'NOT_SAFE_TO_PROJECT');
  assert.equal(result.canonicalProjectionSafe,false);
  assert.equal(result.writesPerformed,false);
  assert.match(client.log[0].sql,/READ ONLY/);
  assert.equal(client.log.at(-1).sql,'ROLLBACK');
  assert.equal(client.log.filter(x=>x.sql.startsWith('SELECT')).length,5);
  assert.ok(client.log.every(x=>/^BEGIN|^ROLLBACK|^\s*SELECT/i.test(x.sql)));
});
test('does not claim production-safe projection when evidence says PASS',async()=>{
  const result=await inspectPg18ReadinessV1(fake(),{projectionEvidence:{overall_verdict:'PASS',sha256:'sha256:a'}});
  assert.equal(result.projectionAdmission,'PASS');assert.equal(result.canonicalProjectionSafe,false);
});
test('missing vector extension is blocked',async()=>{const r=await inspectPg18ReadinessV1(fake({noVector:true}));assert.equal(r.predicates.vectorExtensionPresent,false);assert.equal(r.postgresSchemaStatus,'SCHEMA_INCOMPLETE')});
test('invalid HNSW index is not counted',async()=>{const r=await inspectPg18ReadinessV1(fake({invalidIndex:true}));assert.equal(r.predicates.validCanonicalHnswPresent,false)});
test('missing table identified without DDL',async()=>{const r=await inspectPg18ReadinessV1(fake({missingTable:'atlas_feature_map'}));assert.deepEqual(r.missingCoreTables,['atlas_feature_map'])});
test('wrong vector column type cannot pass',async()=>{const r=await inspectPg18ReadinessV1(fake({wrongType:true}));assert.equal(r.predicates.canonical768VectorColumnPresent,false)});
test('rollback on failed SELECT',async()=>{const client=fake({failOn:'pg_extension'});await assert.rejects(inspectPg18ReadinessV1(client),/fixture failure/);assert.equal(client.log.at(-1).sql,'ROLLBACK')});
test('no connection at import and queryable required',async()=>{await assert.rejects(inspectPg18ReadinessV1(null),/QUERYABLE_REQUIRED/);assert.ok(INSPECTED_TABLES.includes('feature_registry_vectors'))});
