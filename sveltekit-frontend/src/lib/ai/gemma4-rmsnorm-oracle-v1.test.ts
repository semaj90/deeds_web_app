import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {RMSNORM_WGSL_V1_ASSET_V1,RMSNORM_FIXTURE_V1,rmsNormCpuF32V1,compareRmsNormV1} from './gemma4-rmsnorm-oracle-v1.ts';
function telemetry(id:string,pass:boolean,reason:string){console.log(JSON.stringify({schema:'atlas.rmsnorm.fixture.v1',id,status:pass?'PASS':'FAIL',reason,modelLoaded:false,weightsDownloaded:false}));}
test('RMS-01 f32 CPU reference symmetric rows',()=>{
 const f=RMSNORM_FIXTURE_V1;
 const result=rmsNormCpuF32V1(f.values,f.weights,f.rows,f.width,f.epsilon);
 assert.equal(result.length,8);
 assert.ok(Math.abs(result[0]+result[7]/1.25)<1e-6);
 assert.equal(compareRmsNormV1(result,result,f.atol,f.rtol).pass,true);
 telemetry('RMS-01',true,'CPU_ONLY');
});
test('RMS-02 negative cases fail closed',()=>{
 const f=RMSNORM_FIXTURE_V1;
 assert.throws(()=>rmsNormCpuF32V1(f.values,f.weights,3,4,f.epsilon),/SHAPE/);
 assert.throws(()=>rmsNormCpuF32V1([NaN,0], [1,1],1,2,f.epsilon),/INPUT/);
 assert.throws(()=>rmsNormCpuF32V1([1,2],[1,1],1,2,0),/INPUT/);
 assert.equal(compareRmsNormV1([1],[NaN],1,1).pass,false);
 assert.equal(compareRmsNormV1([1],[2],1e-6,1e-6).pass,false);
 telemetry('RMS-02',true,'NEGATIVE_CONTROLS');
});
const shaderSource = readFileSync(new URL('../../../static/atlas-kernels/rmsnorm-f32-v1.wgsl',import.meta.url),'utf8');
test('RMS-03 WGSL operation and bounds contract',()=>{
 assert.match(shaderSource,/inverseSqrt/);
 assert.match(shaderSource,/row >= cfg.rows/);
 assert.match(shaderSource,/weight\[j\]/);
 telemetry('RMS-03',true,'SOURCE_CONTRACT_ONLY');
});
