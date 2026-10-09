import test from 'node:test';import assert from 'node:assert/strict';
import {verifyWebGpuReceiptV1} from './verify-webgpu-kernel-readback-v1.mjs';
const valid={schema:'atlas.webgpu-real-kernel-probe.v1',status:'REAL_WEBGPU_CPU_PARITY',actualWebgpuExecution:true,modelLoaded:false,canonicalAuthority:false,storesWritten:false,shaderSha256:'sha256:'+'a'.repeat(64),observed:[19,22,43,50]};
test('valid browser claim remains unauthenticated and not admitted',()=>{
 const v=verifyWebGpuReceiptV1(valid);assert.equal(v.status,'CONSISTENT_BROWSER_CLAIMS_ONLY');
 assert.equal(v.authenticatedGpuExecution,false);assert.equal(v.admitted,false);
});
test('altered and nonfinite outputs fail',()=>{
 assert.equal(verifyWebGpuReceiptV1({...valid,observed:[19,22,43,52]}).status,'REJECTED');
 assert.equal(verifyWebGpuReceiptV1({...valid,observed:[19,NaN,43,50]}).status,'REJECTED');
});
test('missing source shader digest fails',()=>assert.ok(verifyWebGpuReceiptV1({...valid,shaderSha256:null}).errors.includes('SHADER_DIGEST_INVALID')));
