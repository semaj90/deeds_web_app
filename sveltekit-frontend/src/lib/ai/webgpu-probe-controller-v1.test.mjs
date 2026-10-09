import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebGpuProbeControllerV1} from './webgpu-probe-controller-v1.mjs';
const valid={schema:'atlas.webgpu-real-kernel-probe.v1',status:'REAL_WEBGPU_CPU_PARITY',actualWebgpuExecution:true,canonicalAuthority:false,modelLoaded:false,storesWritten:false,observed:[19,22,43,50],maxAbsError:0,tolerance:1e-5,shaderSha256:'sha256:'+'a'.repeat(64)};
test('runs probe and validates diagnostic without admission',async()=>{
 const observed=[];
 const machine=createWebGpuProbeControllerV1({run:async()=>valid,onState:x=>observed.push(x.state)});
 const result=await machine.start();
 assert.equal(result.state,'complete');assert.equal(result.verdict.admitted,false);
 assert.deepEqual(observed,['probing','ready','executing','validating','complete']);
});
test('aborted probe rejects late receipt and remains failed',async()=>{
 let release;
 const machine=createWebGpuProbeControllerV1({run:()=>new Promise(resolve=>{release=resolve;})});
 const pending=machine.start();
 assert.equal(machine.cancel(),true);release(valid);
 const result=await pending;assert.equal(result.state,'failed');assert.equal(machine.state,'failed');
});
test('invalid receipt fails without cache or canonical authority',async()=>{
 const machine=createWebGpuProbeControllerV1({run:async()=>({...valid,observed:[19,22,43,51]})});
 const result=await machine.start();
 assert.equal(result.state,'failed');assert.equal(result.verdict.kernelDiagnosticValid,false);
});
