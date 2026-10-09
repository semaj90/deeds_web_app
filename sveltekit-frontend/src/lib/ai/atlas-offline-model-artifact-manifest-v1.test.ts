import test from 'node:test';import assert from 'node:assert/strict';
import {inspectOfflineArtifactManifestV1,type OfflineArtifactManifestV1} from './atlas-offline-model-artifact-manifest-v1.ts';
const sha='sha256:'+'a'.repeat(64);
const base:OfflineArtifactManifestV1={root:'/models/gemma4-e2b/',modelRevision:'fixture-1',artifacts:[
 {path:'model.litertlm',sha256:sha,byteLength:2048,kind:'model'},
 {path:'tokenizer.json',sha256:sha,byteLength:1024,kind:'tokenizer'}]};
test('ART-01 valid declared artifacts do not prove byte integrity',()=>{const r=inspectOfflineArtifactManifestV1(base);assert.equal(r.status,'MANIFEST_SHAPE_VALID');assert.equal(r.allowModelLoad,false)});
test('ART-02 path escape and absolute file path blocked',()=>{for(const path of ['../secret','https://example.com/a','/absolute','folder/../weights','folder\\weights'])assert.equal(inspectOfflineArtifactManifestV1({...base,artifacts:[{...base.artifacts[0],path},base.artifacts[1]]}).status,'BLOCKED')});
test('ART-03 stale/missing metadata blocked',()=>{assert.equal(inspectOfflineArtifactManifestV1({...base,artifacts:[]}).status,'BLOCKED');assert.equal(inspectOfflineArtifactManifestV1({...base,artifacts:[{...base.artifacts[0],sha256:'wrong'},base.artifacts[1]]}).status,'BLOCKED')});
