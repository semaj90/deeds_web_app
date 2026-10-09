import test from 'node:test';import assert from 'node:assert/strict';
import {runSequentialLifecycleV1,type LifecyclePortV1} from './atlas-browser-lifecycle-v1.ts';
import type {BackendObservationV1,BrowserBackendV1} from './gemma4-browser-backend-compare-v1.ts';
function ports(log:string[],opts:{release?:boolean;throwRun?:boolean;wrongGeneration?:boolean}={}):LifecyclePortV1[]{
 const port=(backend:BrowserBackendV1):LifecyclePortV1=>({backend,
 async prepare(){log.push(backend+':prepare')},
 async run(){log.push(backend+':run');if(opts.throwRun&&backend==='transformersjs-webgpu')throw Error('SIMULATED_FAILURE');
 return {backend,status:'PASS'} as BackendObservationV1},
 async dispose(){log.push(backend+':dispose')},
 async confirmReleased(){log.push(backend+':release');return {released:opts.release!==false,leaseGeneration:opts.wrongGeneration?2:1}}
 });
 return [port('transformersjs-webgpu'),port('litertlm-js-webgpu')];
}
test('LIFE-01 sequential stages separated by dispose and release',async()=>{
 const log:string[]=[];const r=await runSequentialLifecycleV1(ports(log),1);
 assert.equal(r.status,'FIXTURE_COMPLETE');assert.equal(r.runtimeEvidenceAdmissible,false);
 assert.deepEqual(log.slice(0,5),['transformersjs-webgpu:prepare','transformersjs-webgpu:run','transformersjs-webgpu:dispose','transformersjs-webgpu:release','litertlm-js-webgpu:prepare']);
});
test('LIFE-02 unverified release blocks second backend',async()=>{
 const log:string[]=[];const r=await runSequentialLifecycleV1(ports(log,{release:false}),1);
 assert.equal(r.status,'BLOCKED');assert.equal(log.includes('litertlm-js-webgpu:prepare'),false);
});
test('LIFE-03 failure still disposes and blocks second backend',async()=>{
 const log:string[]=[];const r=await runSequentialLifecycleV1(ports(log,{throwRun:true}),1);
 assert.equal(r.status,'BLOCKED');assert.ok(log.includes('transformersjs-webgpu:dispose'));assert.equal(log.includes('litertlm-js-webgpu:prepare'),false);
});
test('LIFE-04 stale lease generation is rejected',async()=>{
 const r=await runSequentialLifecycleV1(ports([],{wrongGeneration:true}),1);
 assert.ok(r.errors.includes('transformersjs-webgpu:RELEASE_UNVERIFIED'));
});
