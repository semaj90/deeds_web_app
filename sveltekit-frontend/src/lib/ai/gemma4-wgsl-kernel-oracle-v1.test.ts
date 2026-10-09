import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { WGSL_ADD_V1_ASSET_V1, KERNEL_ORACLE_FIXTURE_V1, cpuAddOracleV1, verifyKernelOutputV1, makeKernelTelemetryV1 } from './gemma4-wgsl-kernel-oracle-v1.ts';
const emit=(args: Parameters<typeof makeKernelTelemetryV1>[0])=>console.log(JSON.stringify(makeKernelTelemetryV1(args)));
test('WGSL-01 CPU float32 oracle and deterministic numeric fixture',()=>{
 const now=performance.now();
 const {lhs,rhs,atol}=KERNEL_ORACLE_FIXTURE_V1;
 const expected=cpuAddOracleV1(lhs,rhs);
 assert.deepEqual(expected,[1,0,0,4,0,0,-1,3]);
 assert.ok(verifyKernelOutputV1(expected,expected,atol));
 emit({testId:'WGSL-01',backend:'node-cpu-f32',status:'PASS',durationMs:performance.now()-now,maxAbsError:0});
});
const shaderSource = readFileSync(new URL('../../../static/atlas-kernels/add-f32-v1.wgsl',import.meta.url),'utf8');
test('WGSL-02 shader source contract and bounds guard',()=>{
 const now=performance.now();
 assert.match(shaderSource,/@compute @workgroup_size\(64\)/);
 assert.match(shaderSource,/i >= params\.length/);
 assert.match(shaderSource,/output\[i\] = lhs\[i\] \+ rhs\[i\]/);
 emit({testId:'WGSL-02',backend:'wgsl-source-only',status:'PASS',durationMs:performance.now()-now,maxAbsError:null});
});
test('WGSL-03 reject shape, nonfinite and numerical mismatch',()=>{
 const now=performance.now();
 assert.throws(()=>cpuAddOracleV1([1],[1,2]),/INVALID_VECTOR_SHAPE/);
 assert.throws(()=>cpuAddOracleV1([NaN],[1]),/NONFINITE_INPUT/);
 assert.equal(verifyKernelOutputV1([1,2],[1.1,2],1e-6),false);
 assert.equal(verifyKernelOutputV1([1],[NaN],1),false);
 emit({testId:'WGSL-03',backend:'node-cpu-negative',status:'PASS',durationMs:performance.now()-now,maxAbsError:null});
});
test('WGSL-04 no-model telemetry is non-admissible as inference proof',()=>{
 const now=performance.now();
 const receipt=makeKernelTelemetryV1({testId:'WGSL-04',backend:'fixture',status:'BLOCKED',durationMs:0,maxAbsError:null,reason:'BROWSER_INFERENCE_NOT_EXECUTED'});
 assert.equal(receipt.modelLoaded,false);
 assert.equal(receipt.weightsDownloaded,false);
 assert.equal(receipt.admission,'FIXTURE_ONLY');
 emit({testId:'WGSL-04',backend:'receipt-policy',status:'PASS',durationMs:performance.now()-now,maxAbsError:null});
});
