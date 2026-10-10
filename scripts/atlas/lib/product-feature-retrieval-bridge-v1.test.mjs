import test from 'node:test';
import assert from 'node:assert/strict';
import {decomposeProductRequestV1} from './product-feature-decomposition-v1.mjs';
import {retrieveFeatureFilesV1,proposeFeatureTasksV1} from './product-feature-retrieval-bridge-v1.mjs';
const decomposition=decomposeProductRequestV1({requestId:'req1',query:'search products and checkout',surface:'webapp'});
const c={canonicalCandidateId:'c1',packetKey:'p1',sourceRef:'src/search.ts',sourceRevision:'sha256:abc'};
const ordinalMap={schema:'fixture.candidate-ordinal-map.v1',ordinalMapChecksum:'map1',entries:[c]};
const search=async()=>({requestId:'req1',workspaceRevision:'w1',candidateSnapshotRevision:'s1',ordinalMapChecksum:'map1',ordinalMap,candidates:[c]});
const verifyOrdinalMap=async({requestId,workspaceRevision,candidateSnapshotRevision,ordinalMapChecksum,ordinalMap:map})=>({status:map?.ordinalMapChecksum===ordinalMapChecksum?'MATCH':'MISMATCH',requestId,workspaceRevision,candidateSnapshotRevision,ordinalMapChecksum});
const verifySource=async()=>({status:'SOURCE_VERIFIED_NOT_ADMITTED',packetKey:'p1',sourceRef:'src/search.ts',sourceRevision:'sha256:abc',receiptId:'r1'});
const run=(over={})=>retrieveFeatureFilesV1({decomposition,search,verifyOrdinalMap,verifySource,...over});
test('no search owner blocks',async()=>assert.equal((await run({search:null})).reason,'CANONICAL_SEARCH_OWNER_NOT_CONFIGURED'));
test('no independent ordinal map verifier blocks',async()=>assert.equal((await run({verifyOrdinalMap:null})).reason,'ORDINAL_MAP_VERIFIER_NOT_CONFIGURED'));
test('no source reader blocks',async()=>assert.equal((await run({verifySource:null})).reason,'CANONICAL_SOURCE_READBACK_NOT_CONFIGURED'));
test('ordinal map verification must bind its checksum and snapshot',async()=>{
 const result=await run({verifyOrdinalMap:async()=>({status:'MATCH',requestId:'req1',workspaceRevision:'stale',candidateSnapshotRevision:'s1',ordinalMapChecksum:'map1'})});
 assert.equal(result.reason,'ORDINAL_MAP_VERIFICATION_FAILED');
});
test('duplicate source candidate blocks',async()=>assert.equal((await run({search:async()=>({...await search(),candidates:[c,c]})})).reason,'DUPLICATE_CANDIDATE'));
test('source revision mismatch blocks',async()=>assert.equal((await run({verifySource:async()=>({...await verifySource(),sourceRevision:'stale'})})).reason,'SOURCE_RECEIPT_MISSING_OR_MISMATCHED'));
test('topK owner overflow blocks',async()=>assert.equal((await run({maxFiles:1,search:async()=>({...await search(),candidates:[c,c]})})).reason,'SEARCH_RETURNED_OVER_LIMIT'));
test('qualified source yields proposal-only task plan',async()=>{const x=await run();assert.equal(x.status,'SOURCE_VERIFIED_NOT_ADMITTED');assert.equal(x.admission,false);const task=proposeFeatureTasksV1(x);assert.equal(task.status,'PROPOSAL_ONLY');assert.equal(task.contextManifest,null);assert.equal(task.mutationAuthorized,false)});
test('blocked bridge cannot produce tasks',()=>assert.equal(proposeFeatureTasksV1({status:'BLOCKED'}).tasks.length,0));
test('preserves canonical SearchRuntime candidate order without secondary ranking',async()=>{
 const second={...c,canonicalCandidateId:'c2',packetKey:'p2',sourceRef:'src/checkout.ts'};
 const result=await retrieveFeatureFilesV1({decomposition,search:async()=>({...await search(),ordinalMap:{...ordinalMap,entries:[second,c]},candidates:[second,c]}),verifyOrdinalMap,verifySource:async({candidate})=>({status:'SOURCE_VERIFIED_NOT_ADMITTED',packetKey:candidate.packetKey,sourceRef:candidate.sourceRef,sourceRevision:candidate.sourceRevision})});
 assert.deepEqual(result.files.map(file=>file.canonicalCandidateId),['c2','c1']);
 assert.deepEqual(result.files.map(file=>file.rank),[1,2]);
});
test('task proposals are INSPECT-only and never create executable plans',async()=>{
 const task=proposeFeatureTasksV1(await run());
 assert.ok(task.tasks.length>0);
 assert.ok(task.tasks.every(item=>item.kind==='INSPECT'&&item.mutationAuthorized===false));
 assert.equal(task.promptPlan,null);
 assert.equal(task.contextManifest,null);
 assert.equal(task.writesPerformed,false);
});
