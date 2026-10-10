import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFeatureRuntimeWiringV1 } from './audit-feature-runtime-wiring-v1.mjs';

test('empty repo reports blocked, never live proven',()=>{
 const result=auditFeatureRuntimeWiringV1({});
 assert.equal(result.allLiveProven,false);
 assert.equal(result.checks.find(x=>x.id==='CANONICAL_SEARCH_ROUTE').status,'BLOCKED');
 assert.equal(result.checks.find(x=>x.id==='MANIFEST_READBACK').status,'NOT_ESTABLISHED');
});
test('source calls cannot imply live admission',()=>{
 const result=auditFeatureRuntimeWiringV1({route:'runSemanticSearchWorkflow(',workflow:'runSearchRuntimeContextManifestShadowV1(',shadow:'resolveFeatureSources',adapter:'searchWithAceManifest(',provider:'export const provider={}',featureDictionary:'export const features=[]'});
 assert.equal(result.checks.find(x=>x.id==='CANONICAL_SEARCH_ROUTE').status,'SOURCE_CALL_PRESENT');
 assert.equal(result.checks.find(x=>x.id==='SEARCH_ACE_METHOD_OWNER').status,'BLOCKED');
 assert.equal(result.checks.find(x=>x.id==='SEARCH_ACE_CALLER').status,'BLOCKED');
 assert.equal(result.checks.find(x=>x.id==='SHADOW_CONFIGURED_AT_CALLSITE').status,'NOT_ESTABLISHED');
 assert.equal(result.checks.find(x=>x.id==='ONTOLOGY_ADMISSION').status,'NOT_ESTABLISHED');
 assert.equal(result.allLiveProven,false);
});
test('ACE method presence does not imply the workflow calls it',()=>{
 const result=auditFeatureRuntimeWiringV1({workflow:'const result = await adapter.search({ query });',adapter:'async searchWithAceManifest('});
 assert.equal(result.checks.find(x=>x.id==='SEARCH_ACE_METHOD_OWNER').status,'OWNER_PRESENT');
 assert.equal(result.checks.find(x=>x.id==='SEARCH_ACE_CALLER').status,'BLOCKED');
});
test('ORF reader owner presence does not imply a production caller',()=>{
 const result=auditFeatureRuntimeWiringV1({orfRowReader:'export function readOrfRowsForCandidateMapV1() {}',provider:'export const provider = {}'});
 assert.equal(result.checks.find(x=>x.id==='ORF_ROW_READER_OWNER').status,'OWNER_PRESENT');
 assert.equal(result.checks.find(x=>x.id==='ORF_ROW_READER_PRODUCTION_CALLER').status,'BLOCKED');
});
test('centroid crosswalk remains diagnostic',()=>{
 const result=auditFeatureRuntimeWiringV1({centroidCrosswalk:'centroid source'});
 assert.equal(result.checks.find(x=>x.id==='CENTROID_CROSSWALK').status,'FILE_PRESENT_DIAGNOSTIC_ONLY');
});
test('Valkey text in ACE candidate evidence is not a cache-to-ACE read path',()=>{
 const result=auditFeatureRuntimeWiringV1({
  agentOrchestrator:"ace.addCandidate('run','Startup cache layer (Valkey) verified',0.9,['Valkey verified'])",
  aceAssembler:'export class ACEAssemblerRecommendations { addCandidate() {} }',
 });
 assert.equal(result.checks.find(x=>x.id==='ACE_ASSEMBLER_CACHE_READ').status,'NO_CACHE_READ_PATH_IN_ASSEMBLER');
 assert.equal(result.checks.find(x=>x.id==='ORCHESTRATOR_VALKEY_TO_ACE').status,'STATIC_MENTION_ONLY');
 assert.equal(result.allLiveProven,false);
});
test('a cache API reference remains unproven until result-to-ACE dataflow is reviewed',()=>{
 const result=auditFeatureRuntimeWiringV1({
  agentOrchestrator:'const value = await redis.get(key); ace.addCandidate(key,title,score,[value]);',
  aceAssembler:'export class ACEAssemblerRecommendations { addCandidate() {} }',
 });
 assert.equal(result.checks.find(x=>x.id==='ORCHESTRATOR_VALKEY_TO_ACE').status,'CACHE_READ_REFERENCE_REQUIRES_DATAFLOW_REVIEW');
 assert.equal(result.allLiveProven,false);
});
