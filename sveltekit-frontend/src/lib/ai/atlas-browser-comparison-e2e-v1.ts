/** Fixture-only E2E orchestration for Parent Atlas browser backends.
 * No model/runtime imports, network, GPU allocation, IndexedDB or canonical writes.
 */
import { compareBrowserBackendsV1, type BackendObservationV1, type BrowserBackendV1 } from './gemma4-browser-backend-compare-v1.js';
import { inspectTensorDescriptorV1, type TensorCacheDescriptorV1 } from './atlas-tensor-cache-descriptor-v1.js';

export type FrozenFixtureV1 = {
  requestId:string;packetKey:string;sourceRevision:string;representationRevision:string;
  fixtureDigest:string;logicalPrompt:string;maxNewTokens:number;
};
export type ExecutorPortV1 = {
  backend:BrowserBackendV1;
  /** Must be a user-approved adapter in future; fixtures supply explicit inert mocks. */
  run(fixture:Readonly<FrozenFixtureV1>):Promise<BackendObservationV1>;
};
export type E2EReceiptV1 = {
  schema:'atlas.browser-comparison.e2e.v1';
  status:'FIXTURE_PASS'|'BLOCKED'|'FAIL';
  admissibleAsRuntimeEvidence:false;
  fixtureDigest:string;
  packetKey:string;
  checks:{fixture:boolean;tensor:boolean;sequential:boolean;backendReceipts:boolean};
  comparison:ReturnType<typeof compareBrowserBackendsV1>|null;
  errors:readonly string[];
  telemetry:readonly {event:string;backend?:BrowserBackendV1;reason?:string}[];
};
export async function runOfflineComparisonE2EV1(input:{
  fixture:FrozenFixtureV1;
  tensor:TensorCacheDescriptorV1;
  executors:readonly ExecutorPortV1[];
}):Promise<E2EReceiptV1>{
 const errors:string[]=[];
 const telemetry:Array<{event:string;backend?:BrowserBackendV1;reason?:string}>=[];
 const f=input.fixture;
 const validFixture=!!f.requestId&&!!f.packetKey&&!!f.sourceRevision&&!!f.representationRevision&&
  /^sha256:[0-9a-f]{64}$/.test(f.fixtureDigest)&&typeof f.logicalPrompt==='string'&&
  f.logicalPrompt.length>0&&Number.isSafeInteger(f.maxNewTokens)&&f.maxNewTokens>0&&f.maxNewTokens<=512;
 if(!validFixture)errors.push('INVALID_FROZEN_FIXTURE');
 const tensor=inspectTensorDescriptorV1(input.tensor,{sourceRevision:f.sourceRevision,representationRevision:f.representationRevision});
 if(tensor.status!=='DESCRIPTOR_VALID'||input.tensor.packetKey!==f.packetKey)errors.push('TENSOR_DESCRIPTOR_REJECTED');
 const names=input.executors.map(e=>e.backend);
 const expected=['transformersjs-webgpu','litertlm-js-webgpu'];
 if(input.executors.length!==2||expected.some(n=>!names.includes(n as BrowserBackendV1))||new Set(names).size!==2)
  errors.push('INVALID_EXECUTOR_SET');
 const observations:BackendObservationV1[]=[];
 if(errors.length===0){
  for(const port of input.executors){
   telemetry.push({event:'RUN_START',backend:port.backend});
   try{
    const obs=await port.run(Object.freeze({...f}));
    if(obs.backend!==port.backend||obs.fixtureDigest!==f.fixtureDigest){
     errors.push('EXECUTOR_IDENTITY_MISMATCH:'+port.backend);
     telemetry.push({event:'RUN_REJECTED',backend:port.backend,reason:'IDENTITY_MISMATCH'});
     break;
    }
    observations.push(obs);
    telemetry.push({event:'RUN_END',backend:port.backend});
    if(obs.status!=='PASS'){errors.push('EXECUTOR_NOT_PASSED:'+port.backend);break;}
   }catch(e){
    errors.push('EXECUTOR_ERROR:'+port.backend);
    telemetry.push({event:'RUN_REJECTED',backend:port.backend,reason:String(e)});
    break;
   }
  }
 }
 const comparison=observations.length===2?compareBrowserBackendsV1(observations[0],observations[1]):null;
 if(comparison?.status==='BLOCKED')errors.push(...comparison.reasons);
 const checks={fixture:validFixture,tensor:tensor.status==='DESCRIPTOR_VALID'&&input.tensor.packetKey===f.packetKey,
  sequential:observations.length===2&&comparison?.status==='COMPARABLE',
  backendReceipts:observations.length===2&&observations.every(o=>o.status==='PASS')};
 // Mock-executor PASS is proof of the harness ONLY, never of either WebGPU runtime.
 return {schema:'atlas.browser-comparison.e2e.v1',status:errors.length?'BLOCKED':'FIXTURE_PASS',
  admissibleAsRuntimeEvidence:false,fixtureDigest:f.fixtureDigest,packetKey:f.packetKey,
  checks,comparison,errors,telemetry};
}
