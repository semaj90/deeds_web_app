import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuMatmulV1, compareKernelV1, inspectBrowserPreflightV1, compareRuntimeReceiptsV1,
 buildDiagnosticTelemetryV1, verifyDiagnosticTelemetryV1 } from './gemma4-webgpu-four-gates-v1.mjs';

const d='sha256:'+'a'.repeat(64);

test('GEMMA-WGSL-01: bounded CPU matmul oracle detects wrong/nonfinite shader output',()=>{
  const input={a:[1,2,3,4],b:[5,6,7,8],m:2,k:2,n:2,tolerance:1e-5};
  assert.deepEqual(cpuMatmulV1(input.a,input.b,2,2,2),[19,22,43,50]);
  assert.equal(compareKernelV1({...input,observed:[19,22,43,50]}).status,'NUMERICAL_PARITY_ONLY');
  assert.equal(compareKernelV1({...input,observed:[19,21,43,50]}).status,'KERNEL_NUMERICAL_MISMATCH');
  assert.equal(compareKernelV1({...input,observed:[NaN,22,43,50]}).status,'KERNEL_OUTPUT_INVALID');
  assert.throws(()=>cpuMatmulV1([Infinity],[1],1,1,1),/BOUNDED_FINITE_MATRIX_REQUIRED/);
});

test('GEMMA-WGSL-02: Win10 browser admission requires consent, complete weights and headroom',()=>{
  const ready={userConsented:true,secureContext:true,adapterAvailable:true,modelArtifactComplete:true,
    modelRevisionPinned:true,globalGpuHeadroomVerified:true};
  const missing=inspectBrowserPreflightV1({...ready,userConsented:false,modelArtifactComplete:false,globalGpuHeadroomVerified:false});
  assert.equal(missing.status,'MODEL_LOAD_BLOCKED');
  assert.deepEqual(missing.reasons,['CONSENT_MISSING','EXTERNAL_WEIGHTS_UNVERIFIED','GLOBAL_VRAM_NOT_VERIFIED']);
  const complete=inspectBrowserPreflightV1(ready);
  assert.equal(complete.status,'PREFLIGHT_COMPLETE_REVIEW_REQUIRED');
  assert.equal(complete.runtimeEligible,false);
});

test('GEMMA-LITERT-03: reject model-pair receipts with changed prompts or missing browser execution',()=>{
  const receipt={fixtureChecksum:d,promptRevision:'prompt:r1',generationSettingsChecksum:d,
    modelChecksum:d,tokenizerChecksum:d,realBrowserExecution:true,gpuExecutionVerified:true,
    firstTokenMs:100,totalMs:400};
  assert.equal(compareRuntimeReceiptsV1(receipt,receipt).status,'COMPARABLE_RECEIPTS_AWAIT_QUALITY_REVIEW');
  const invalid=compareRuntimeReceiptsV1(receipt,{...receipt,promptRevision:'prompt:r2',gpuExecutionVerified:false});
  assert.equal(invalid.status,'PARITY_NOT_PROVEN');
  assert.ok(invalid.reasons.includes('PROMPT_REVISION_MISMATCH'));
  assert.ok(invalid.reasons.includes('BROWSER_EXECUTION_UNVERIFIED'));
});

test('GEMMA-TELEM-04: minimal telemetry is immutable by checksum and never retains prompts',()=>{
  const report=buildDiagnosticTelemetryV1({runId:'win10-fixture-1',
    events:[{type:'CPU_ORACLE',status:'NUMERICAL_PARITY_ONLY',durationMs:0,prompt:'DO_NOT_LOG',gpuPointer:'0xdeadbeef'}]});
  assert.equal(verifyDiagnosticTelemetryV1(report),true);
  assert.equal(JSON.stringify(report).includes('DO_NOT_LOG'),false);
  assert.equal(JSON.stringify(report).includes('0xdeadbeef'),false);
  assert.equal(verifyDiagnosticTelemetryV1({...report,runId:'altered'}),false);
  assert.throws(()=>buildDiagnosticTelemetryV1({runId:'bad id',events:[]}),/RUN_ID_INVALID/);
});
