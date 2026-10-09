import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionWebGpuProbeV1,inspectKernelDiagnosticV1,browserKernelCacheIdentityV1} from './webgpu-probe-lifecycle-v1.mjs';
const d='sha256:'+'a'.repeat(64);
test('XState-compatible transitions fail closed and require failures to carry reasons',()=>{
 assert.equal(transitionWebGpuProbeV1('idle','probing').state,'probing');
 assert.throws(()=>transitionWebGpuProbeV1('idle','complete'),/INVALID_PROBE_TRANSITION/);
 assert.throws(()=>transitionWebGpuProbeV1('probing','blocked'),/PROBE_REASON_REQUIRED/);
});
test('browser receipt is diagnostic only even when numeric gate passes',()=>{
 const r={schema:'atlas.webgpu-real-kernel-probe.v1',status:'REAL_WEBGPU_CPU_PARITY',actualWebgpuExecution:true,canonicalAuthority:false,modelLoaded:false,storesWritten:false,observed:[19,22,43,50],maxAbsError:0,tolerance:1e-5,shaderSha256:d};
 const verdict=inspectKernelDiagnosticV1(r);
 assert.equal(verdict.status,'BROWSER_DIAGNOSTIC_ACCEPTED');
 assert.equal(verdict.admitted,false);
 assert.equal(inspectKernelDiagnosticV1({...r,observed:[Infinity,22,43,50]}).status,'BROWSER_DIAGNOSTIC_REJECTED');
});
test('versioned IndexedDB identity rejects malformed shader and retains non-authority',()=>{
 assert.throws(()=>browserKernelCacheIdentityV1({shaderSha256:'bad',browserVersion:'Chrome',adapterLabel:'RTX'}),/SHADER_HASH_REQUIRED/);
 const key=browserKernelCacheIdentityV1({shaderSha256:d,browserVersion:'Chrome',adapterLabel:'RTX'});
 assert.equal(key.authority,'DIAGNOSTIC_ONLY');
 assert.equal(key.maxTtlSeconds,86400);
});
