/** Explicit opt-in storage adapter reusing existing deeds-ai-cache gpuResults store.
 * Cache readback is not canonical evidence. No duplicate IndexedDB database.
 */
import {clientCache} from './client-cache.js';
import {inspectKernelDiagnosticV1,browserKernelCacheIdentityV1} from './webgpu-probe-lifecycle-v1.mjs';
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export async function cacheWebGpuProbeDiagnosticV1({receipt,identity,consent}){
 if(consent!==true)return {status:'CACHE_CONSENT_REQUIRED'};
 if(typeof window==='undefined'||!globalThis.crypto?.subtle)return {status:'BROWSER_CRYPTO_UNAVAILABLE'};
 const verdict=inspectKernelDiagnosticV1(receipt);
 if(!verdict.kernelDiagnosticValid)return {status:'INVALID_DIAGNOSTIC'};
 const keyData=browserKernelCacheIdentityV1(identity);
 const key=JSON.stringify(keyData);
 const checksum='sha256:'+hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(receipt))));
 // Existing cache owner uses its existing short-lived GPU TTL.
 await clientCache.putGPUResult(key,{receipt,checksum,identity:keyData},'webgpu-diagnostic');
 const back=await clientCache.getGPUResult(key);
 if(back?.backend!=='webgpu-diagnostic'||back?.result?.checksum!==checksum)
   return {status:'CACHE_READBACK_UNAVAILABLE'};
 const backReceipt=back.result.receipt;
 const backHash='sha256:'+hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(backReceipt))));
 if(backHash!==checksum)return {status:'CACHE_CHECKSUM_MISMATCH'};
 return {status:'DIAGNOSTIC_CACHED_READBACK_MATCH',checksum,canonicalAuthority:false,admitted:false};
}
