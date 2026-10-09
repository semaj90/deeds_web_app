import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTensorDescriptorV1,inspectShaderPipelineDescriptorV1} from './atlas-tensor-shader-cache-contract-v1.ts';
const digest='sha256:'+'a'.repeat(64),digestB='sha256:'+'b'.repeat(64);
const tensor={packetKey:'P-1',sourceRevision:'s1',representationRevision:'r1',encodingVersion:'v1',contentDigest:digest,
 dtype:'f32' as const,shape:[2,4],strides:[4,1],byteLength:32,ownerId:'browser',deviceGeneration:1,leaseGeneration:1,residency:'WEBGPU' as const};
const shader={shaderDigest:digest,entryPoint:'main',deviceId:'adapter0',deviceGeneration:1,layoutDigest:digestB,constants:{B:2,A:1},features:['shader-f16']};
function emit(id:string){console.log(JSON.stringify({schema:'atlas.cache.fixture.test.v1',id,status:'PASS',runtime:'node',gpuAllocated:false,modelLoaded:false}));}
test('CACHE-02 pipeline keys sort constants and fence device generations',()=>{
 const a=inspectShaderPipelineDescriptorV1(shader);
 assert.equal(a.ok,true);
 assert.equal(a.key,inspectShaderPipelineDescriptorV1({...shader,constants:{A:1,B:2}}).key);
 assert.notEqual(a.key,inspectShaderPipelineDescriptorV1({...shader,deviceGeneration:2}).key);
 assert.equal(inspectShaderPipelineDescriptorV1({...shader,layoutDigest:'bad'}).ok,false);
 emit('CACHE-02');
});
test('CACHE-03 dense tensor verifies lengths, strides and independent residency',()=>{
 const a=inspectTensorDescriptorV1(tensor);assert.equal(a.ok,true);
 assert.equal(a.contentKey,inspectTensorDescriptorV1({...tensor,ownerId:'other',residency:'OPFS',deviceGeneration:4,leaseGeneration:7}).contentKey);
 assert.notEqual(a.residencyKey,inspectTensorDescriptorV1({...tensor,deviceGeneration:2}).residencyKey);
 emit('CACHE-03');
});
test('CACHE-09 invalid revisions/digests/sizes/strides and generations reject',()=>{
 assert.equal(inspectTensorDescriptorV1({...tensor,sourceRevision:''}).ok,false);
 assert.equal(inspectTensorDescriptorV1({...tensor,contentDigest:'sha256:bad'}).ok,false);
 assert.equal(inspectTensorDescriptorV1({...tensor,byteLength:31}).ok,false);
 assert.equal(inspectTensorDescriptorV1({...tensor,strides:[1,2]}).ok,false);
 assert.equal(inspectTensorDescriptorV1({...tensor,leaseGeneration:0}).ok,false);
 assert.equal(inspectTensorDescriptorV1({...tensor,shape:[Number.MAX_SAFE_INTEGER,4]}).ok,false);
 emit('CACHE-09');
});
test('CACHE-10 descriptor is not proof of allocation, freshness or authorization',()=>{
 assert.equal(inspectTensorDescriptorV1(tensor).reason,'DESCRIPTOR_VALID_ONLY');
 assert.equal(inspectShaderPipelineDescriptorV1(shader).reason,'PIPELINE_KEY_ONLY');
 emit('CACHE-10');
});
