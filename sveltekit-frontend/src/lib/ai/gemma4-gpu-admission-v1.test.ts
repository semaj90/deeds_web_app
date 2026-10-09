import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectE2BGpuAdmissionV1 } from './gemma4-gpu-admission-v1.ts';
const base = { browser:true, webgpu:true, adapterPresent:true,
 requiredMemoryMB:4096, maxBufferSize:16*1024**3,
 maxStorageBufferBindingSize:16*1024**3 };
test('adapter buffer limits never imply free VRAM',()=>{
 const result=inspectE2BGpuAdmissionV1(base);
 assert.equal(result.eligible,false);
 assert.equal(result.reason,'GPU_MEMORY_UNVERIFIED');
 assert.equal(result.availableMemoryMB,null);
});
test('verified but insufficient free memory is blocked',()=>{
 const result=inspectE2BGpuAdmissionV1({...base,independentlyVerifiedMemoryReceipt:true,operatorFreeMemoryMB:512});
 assert.equal(result.reason,'GPU_MEMORY_INSUFFICIENT');
});
test('no WebGPU and SSR do not admit',()=>{
 assert.equal(inspectE2BGpuAdmissionV1({...base,webgpu:false}).reason,'NO_WEBGPU');
 assert.equal(inspectE2BGpuAdmissionV1({...base,browser:false}).reason,'SSR');
});
test('trusted budget alone is insufficient without local artifacts and user approval',()=>{
 const good={...base,independentlyVerifiedMemoryReceipt:true,operatorFreeMemoryMB:6144};
 assert.equal(inspectE2BGpuAdmissionV1(good).reason,'ASSETS_UNVERIFIED');
 assert.equal(inspectE2BGpuAdmissionV1({...good,offlineAssetManifestVerified:true}).reason,'USER_APPROVAL_REQUIRED');
 assert.equal(inspectE2BGpuAdmissionV1({...good,offlineAssetManifestVerified:true,userApprovedLoad:true}).reason,'PREFLIGHT_READY');
});
test('invalid budget fails closed',()=>{
 assert.equal(inspectE2BGpuAdmissionV1({...base,requiredMemoryMB:NaN}).reason,'INVALID_BUDGET');
});
