import test from 'node:test';import assert from 'node:assert/strict';
import {inspectTensorDescriptorV1,type TensorCacheDescriptorV1} from './atlas-tensor-cache-descriptor-v1.ts';
const base:TensorCacheDescriptorV1={packetKey:'P1',sourceRevision:'s1',representationRevision:'r1',encodingVersion:'e1',contentDigest:'sha256:'+'a'.repeat(64),dtype:'f32',shape:[2,4],strides:[4,1],byteLength:32,ownerId:'fixture',deviceGeneration:1,leaseGeneration:2,residency:'CPU_BUFFER'};
test('valid contiguous descriptor is metadata only',()=>assert.equal(inspectTensorDescriptorV1(base).status,'DESCRIPTOR_VALID'));
test('byte/shape mismatch rejected',()=>assert.ok(inspectTensorDescriptorV1({...base,byteLength:12}).reasons.includes('BYTE_LENGTH_MISMATCH')));
test('stale revisions and generations rejected',()=>assert.ok(inspectTensorDescriptorV1(base,{sourceRevision:'s2',leaseGeneration:3}).reasons.includes('STALE_LEASE_GENERATION')));
test('bad digest and noncontiguous view blocked',()=>{assert.ok(inspectTensorDescriptorV1({...base,contentDigest:'fake'}).reasons.includes('INVALID_CONTENT_DIGEST'));assert.ok(inspectTensorDescriptorV1({...base,strides:[1,2]}).reasons.includes('NONCONTIGUOUS_LAYOUT'))});
