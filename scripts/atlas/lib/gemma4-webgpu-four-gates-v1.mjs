/** Four-gate offline/browser Gemma4 kernel-evaluation contract.
 * No weights, fetches, GPU sessions, or persistent Atlas writes.
 * Browser WGSL execution is an explicitly later step, never simulated as proven.
 */
import { createHash } from 'node:crypto';

const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = v => typeof v === 'number' && Number.isFinite(v);
export function cpuMatmulV1(a,b,m,k,n) {
  if (![m,k,n].every(x=>Number.isInteger(x)&&x>0&&x<=128) || a.length!==m*k || b.length!==k*n || ![...a,...b].every(finite)) throw new Error('BOUNDED_FINITE_MATRIX_REQUIRED');
  const out=Array(m*n).fill(0);
  for(let i=0;i<m;i++)for(let j=0;j<n;j++)for(let t=0;t<k;t++)out[i*n+j]+=a[i*k+t]*b[t*n+j];
  return out;
}
export function compareKernelV1(input) {
  const expected=cpuMatmulV1(input.a,input.b,input.m,input.k,input.n);
  if (!Array.isArray(input.observed) || input.observed.length!==expected.length || !input.observed.every(finite))
    return { status:'KERNEL_OUTPUT_INVALID', kernelVerified:false };
  const maxAbsError=Math.max(...expected.map((x,i)=>Math.abs(x-input.observed[i])));
  const tolerance=input.tolerance ?? 1e-4;
  if (!finite(tolerance)||tolerance<0||tolerance>0.1) throw new Error('TOLERANCE_INVALID');
  return {status:maxAbsError<=tolerance?'NUMERICAL_PARITY_ONLY':'KERNEL_NUMERICAL_MISMATCH',maxAbsError,
    kernelVerified:false, executionProviderVerified:false, tolerance};
}
export function inspectBrowserPreflightV1(input) {
  const reasons=[];
  if(input.userConsented!==true)reasons.push('CONSENT_MISSING');
  if(input.secureContext!==true)reasons.push('SECURE_CONTEXT_UNVERIFIED');
  if(input.adapterAvailable!==true)reasons.push('WEBGPU_ADAPTER_UNAVAILABLE');
  if(input.modelArtifactComplete!==true)reasons.push('EXTERNAL_WEIGHTS_UNVERIFIED');
  if(input.modelRevisionPinned!==true)reasons.push('MODEL_REVISION_UNPINNED');
  if(input.globalGpuHeadroomVerified!==true)reasons.push('GLOBAL_VRAM_NOT_VERIFIED');
  return {status:reasons.length?'MODEL_LOAD_BLOCKED':'PREFLIGHT_COMPLETE_REVIEW_REQUIRED',
   reasons, modelLoaded:false, runtimeEligible:false};
}
export function compareRuntimeReceiptsV1(left,right) {
  const reasons=[];
  for(const [key,reason] of [['fixtureChecksum','FIXTURE_MISMATCH'],['promptRevision','PROMPT_REVISION_MISMATCH'],['generationSettingsChecksum','GENERATION_SETTINGS_MISMATCH']]){
    if(!left?.[key] || left[key]!==right?.[key])reasons.push(reason);
  }
  for(const receipt of [left,right]) {
    if(!/^sha256:[0-9a-f]{64}$/.test(receipt?.modelChecksum??'')) reasons.push('MODEL_DIGEST_MISSING');
    if(!/^sha256:[0-9a-f]{64}$/.test(receipt?.tokenizerChecksum??'')) reasons.push('TOKENIZER_DIGEST_MISSING');
    if(receipt?.realBrowserExecution!==true || receipt?.gpuExecutionVerified!==true) reasons.push('BROWSER_EXECUTION_UNVERIFIED');
    if(!finite(receipt?.firstTokenMs)||receipt.firstTokenMs<0)reasons.push('TTFT_INVALID');
    if(!finite(receipt?.totalMs)||receipt.totalMs<receipt.firstTokenMs)reasons.push('LATENCY_INVALID');
  }
  return {status:reasons.length?'PARITY_NOT_PROVEN':'COMPARABLE_RECEIPTS_AWAIT_QUALITY_REVIEW',
    reasons:[...new Set(reasons)].sort(), modelParityProven:false};
}
export function buildDiagnosticTelemetryV1({runId,events}) {
  if(typeof runId!=='string'||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(runId)) throw new Error('RUN_ID_INVALID');
  if(!Array.isArray(events)||events.length>64)throw new Error('EVENT_LIMIT');
  const validTypes=new Set(['CPU_ORACLE','BROWSER_PREFLIGHT','RUNTIME_COMPARISON','RECEIPT_CHECK']);
  const items=events.map((event,index)=>{
    if(!validTypes.has(event?.type)||typeof event?.status!=='string'||event.status.length>80 ||
      !finite(event.durationMs)||event.durationMs<0)throw new Error('TELEMETRY_EVENT_INVALID');
    // Never retain prompts, model weights, secrets, GPU pointers or user content.
    return {index,type:event.type,status:event.status,durationMs:event.durationMs};
  });
  const report={schema:'atlas.gemma4-browser-kernel-telemetry.v1',runId,events:items,
    canonicalAuthority:false,admissionPerformed:false,networkRequests:false,modelLoaded:false,
    persistentStoreWrites:false,producer:'offline-preflight'};
  return {...report,checksum:digest(report)};
}
export function verifyDiagnosticTelemetryV1(report){
  const {checksum,...payload}=report??{};
  return /^sha256:[0-9a-f]{64}$/.test(checksum??'')&&digest(payload)===checksum&&payload?.canonicalAuthority===false;
}
