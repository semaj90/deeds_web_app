/** Browser WebGPU diagnostics: pure lifecycle and cache identity policies.
 * SIMDJSON/AVX native parsing is server-only; never imported into browser bundle.
 */
export const ALLOWED={idle:['probing'],probing:['ready','blocked','failed'],ready:['executing','blocked'],executing:['validating','failed'],validating:['complete','failed'],complete:['probing'],blocked:['probing'],failed:['probing']};
export function transitionWebGpuProbeV1(from,to,reason=null){
 if(!ALLOWED[from]?.includes(to))throw new Error('INVALID_PROBE_TRANSITION');
 if(['failed','blocked'].includes(to)&&(!reason||typeof reason!=='string'))throw new Error('PROBE_REASON_REQUIRED');
 return {state:to,reason};
}
export function inspectKernelDiagnosticV1(receipt){
 if(receipt?.schema!=='atlas.webgpu-real-kernel-probe.v1')return {status:'INVALID_SCHEMA',admitted:false};
 const ok=receipt.actualWebgpuExecution===true&&receipt.status==='REAL_WEBGPU_CPU_PARITY'
 &&receipt.canonicalAuthority===false&&receipt.modelLoaded===false&&receipt.storesWritten===false
 &&Array.isArray(receipt.observed)&&receipt.observed.length===4&&receipt.observed.every(Number.isFinite)
 &&Number.isFinite(receipt.maxAbsError)&&receipt.maxAbsError>=0
 &&Number.isFinite(receipt.tolerance)&&receipt.tolerance>0&&receipt.maxAbsError<=receipt.tolerance
 &&/^sha256:[a-f0-9]{64}$/.test(receipt.shaderSha256??'');
 return {status:ok?'BROWSER_DIAGNOSTIC_ACCEPTED':'BROWSER_DIAGNOSTIC_REJECTED',admitted:false,kernelDiagnosticValid:ok};
}
export function browserKernelCacheIdentityV1({shaderSha256,modelRevision='NONE',browserVersion,adapterLabel,sourceRevision='NONE'}){
 if(!/^sha256:[a-f0-9]{64}$/.test(shaderSha256??''))throw new Error('SHADER_HASH_REQUIRED');
 if(![modelRevision,browserVersion,adapterLabel,sourceRevision].every(s=>typeof s==='string'&&s.length>0&&s.length<=256))throw new Error('CACHE_IDENTITY_INCOMPLETE');
 return {schema:'atlas.webgpu-kernel-cache-key.v1',shaderSha256,modelRevision,browserVersion,adapterLabel,sourceRevision,authority:'DIAGNOSTIC_ONLY',maxTtlSeconds:86400};
}
