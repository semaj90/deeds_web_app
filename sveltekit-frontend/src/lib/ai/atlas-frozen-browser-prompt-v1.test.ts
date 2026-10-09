import test from 'node:test';import assert from 'node:assert/strict';
import {inspectFrozenPromptV1,type FrozenPromptContractV1} from './atlas-frozen-browser-prompt-v1.ts';
const sha='sha256:'+'a'.repeat(64);
const base:FrozenPromptContractV1={packetKey:'P',sourceRevision:'S',representationRevision:'R',logicalPrompt:'Extract a value',logicalPromptSha256:sha,maxNewTokens:16,backends:[
{id:'transformersjs-webgpu',tokenizerSha256:sha,templateSha256:sha,tokenIds:[1,2],attentionMask:[1,1],stopTokenIds:[2]},
{id:'litertlm-js-webgpu',tokenizerSha256:sha,templateSha256:sha,tokenIds:[101,102],attentionMask:[1,1],stopTokenIds:[102]}]};
test('PROMPT-01 valid shape does not prove tokenization',()=>{const r=inspectFrozenPromptV1(base);assert.equal(r.status,'FIXTURE_SHAPE_VALID');assert.equal(r.tokenizationIndependentlyVerified,false)});
test('PROMPT-02 backend-specific token IDs need not match',()=>assert.equal(inspectFrozenPromptV1(base).reasons.length,0));
test('PROMPT-03 mismatched attention mask rejected',()=>assert.equal(inspectFrozenPromptV1({...base,backends:[{...base.backends[0],attentionMask:[1]},base.backends[1]]}).status,'BLOCKED'));
test('PROMPT-04 missing backend rejected',()=>assert.equal(inspectFrozenPromptV1({...base,backends:base.backends.slice(0,1)}).status,'BLOCKED'));
