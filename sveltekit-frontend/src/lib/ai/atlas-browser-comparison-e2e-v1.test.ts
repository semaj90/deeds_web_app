import test from 'node:test';import assert from 'node:assert/strict';
import {runOfflineComparisonE2EV1,type ExecutorPortV1,type FrozenFixtureV1} from './atlas-browser-comparison-e2e-v1.ts';
import type {BackendObservationV1} from './gemma4-browser-backend-compare-v1.ts';
import type {TensorCacheDescriptorV1} from './atlas-tensor-cache-descriptor-v1.ts';
const digest='sha256:'+'a'.repeat(64);
const fixture:FrozenFixtureV1={requestId:'fixture-1',packetKey:'packet-1',sourceRevision:'s1',representationRevision:'r1',fixtureDigest:digest,logicalPrompt:'Extract a key-value pair.',maxNewTokens:16};
const tensor:TensorCacheDescriptorV1={packetKey:'packet-1',sourceRevision:'s1',representationRevision:'r1',encodingVersion:'f32-v1',contentDigest:digest,dtype:'f32',shape:[2,2],strides:[2,1],byteLength:16,ownerId:'fixture',deviceGeneration:0,leaseGeneration:0,residency:'CPU_BUFFER'};
function ports(events:string[],mutate?:(o:BackendObservationV1)=>BackendObservationV1):ExecutorPortV1[]{
 const make=(backend:ExecutorPortV1['backend'],start:number):ExecutorPortV1=>({backend,async run(f){
  events.push(backend);
  const result:BackendObservationV1={backend,modelDigest:digest,tokenizerDigest:digest,templateDigest:digest,quantization:'fixture-only',runtimeVersion:'mock',fixtureDigest:f.fixtureDigest,startedAtEpochMs:start,finishedAtEpochMs:start+10,promptTokenIds:[1,2],outputTokenIds:[3],firstTokenMs:1,prefillTokensPerSecond:2,decodeTokensPerSecond:3,gpuExecutionObserved:true,memoryPeakBytes:null,status:'PASS'};
  return mutate?mutate(result):result;
 }});
 return [make('transformersjs-webgpu',10),make('litertlm-js-webgpu',20)];
}
test('E2E-01 mock stages run sequentially; only fixture proof admitted',async()=>{
 const calls:string[]=[];const r=await runOfflineComparisonE2EV1({fixture,tensor,executors:ports(calls)});
 assert.deepEqual(calls,['transformersjs-webgpu','litertlm-js-webgpu']);
 assert.equal(r.status,'FIXTURE_PASS');assert.equal(r.admissibleAsRuntimeEvidence,false);
 console.log(JSON.stringify({test:'E2E-01',status:r.status,steps:r.telemetry.length}));
});
test('E2E-02 stale tensor blocks before invoking executors',async()=>{
 const calls:string[]=[];const r=await runOfflineComparisonE2EV1({fixture,tensor:{...tensor,sourceRevision:'stale'},executors:ports(calls)});
 assert.equal(r.status,'BLOCKED');assert.deepEqual(calls,[]);
});
test('E2E-03 wrong executor fixture digest blocks promotion',async()=>{
 const r=await runOfflineComparisonE2EV1({fixture,tensor,executors:ports([],o=>o.backend==='litertlm-js-webgpu'?{...o,fixtureDigest:'sha256:'+'b'.repeat(64)}:o)});
 assert.equal(r.status,'BLOCKED');assert.ok(r.errors.some(e=>e.startsWith('EXECUTOR_IDENTITY_MISMATCH')));
});
test('E2E-04 missing backend blocks before execution',async()=>{
 const calls:string[]=[];const r=await runOfflineComparisonE2EV1({fixture,tensor,executors:ports(calls).slice(0,1)});
 assert.equal(r.status,'BLOCKED');assert.deepEqual(calls,[]);
});
test('E2E-05 non-overlapping and GPU receipt assertion still never provide runtime admission',async()=>{
 const r=await runOfflineComparisonE2EV1({fixture,tensor,executors:ports([],o=>o.backend==='litertlm-js-webgpu'?{...o,gpuExecutionObserved:false}:o)});
 assert.equal(r.status,'BLOCKED');assert.equal(r.admissibleAsRuntimeEvidence,false);
});
