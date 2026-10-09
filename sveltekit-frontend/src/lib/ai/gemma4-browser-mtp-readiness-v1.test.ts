import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGemma4BrowserMtpReadinessV1 } from './gemma4-browser-mtp-readiness-v1.ts';
const digest = 'sha256:' + 'a'.repeat(64);
const full = {
 targetModelChecksum:digest, assistantModelChecksum:digest, tokenizerChecksum:digest,
 browserRuntime:'transformersjs-webgpu' as const, speculativeApiVerified:true,
 sharedTokenizerVerified:true, targetVerificationVerified:true, kvRewindVerified:true,
 draftAcceptanceParityVerified:true, outputParityVerified:true, gpuMemoryHeadroomVerified:true,
};
test('an empty compatibility receipt fails closed',()=>{
 const result=inspectGemma4BrowserMtpReadinessV1({
 ...full, targetModelChecksum:null, assistantModelChecksum:null, tokenizerChecksum:null,
 speculativeApiVerified:false, targetVerificationVerified:false, kvRewindVerified:false,
 draftAcceptanceParityVerified:false, outputParityVerified:false, gpuMemoryHeadroomVerified:false,
 });
 assert.equal(result.status,'MTP_NOT_ADMITTED');
 assert.equal(result.runtimeEligible,false);
 assert.ok(result.reasons.includes('TARGET_DIGEST_UNVERIFIED'));
});
test('complete self-reported claims still require independent runtime review',()=>{
 const result=inspectGemma4BrowserMtpReadinessV1(full);
 assert.equal(result.status,'EVIDENCE_COMPLETE_REVIEW_REQUIRED');
 assert.equal(result.runtimeEligible,false);
 assert.equal(result.standaloneAssistantAllowed,false);
});
test('missing KV rewind fails closed',()=>{
 const result=inspectGemma4BrowserMtpReadinessV1({...full,kvRewindVerified:false});
 assert.ok(result.reasons.includes('KV_REWIND_UNVERIFIED'));
});
test('unsupported browser runtime is rejected',()=>{
 const result=inspectGemma4BrowserMtpReadinessV1({...full,browserRuntime:'cuda-server' as any});
 assert.ok(result.reasons.includes('BROWSER_RUNTIME_UNSUPPORTED'));
});
