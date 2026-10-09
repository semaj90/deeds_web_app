/** Pure comparison admission. No LiteRT or Transformers imports, network or GPU allocation. */
export type BrowserBackendV1='transformersjs-webgpu'|'litertlm-js-webgpu';
export type BackendObservationV1={
 backend:BrowserBackendV1; modelDigest:string; tokenizerDigest:string;
 templateDigest:string; quantization:string; runtimeVersion:string;
 fixtureDigest:string; startedAtEpochMs:number; finishedAtEpochMs:number;
 promptTokenIds:readonly number[]; outputTokenIds:readonly number[];
 firstTokenMs:number|null; prefillTokensPerSecond:number|null;
 decodeTokensPerSecond:number|null; gpuExecutionObserved:boolean;
 memoryPeakBytes:number|null; status:'PASS'|'BLOCKED'|'FAIL';
};
export type CompareResultV1={status:'COMPARABLE'|'BLOCKED';reasons:string[];
 classification:'SAME_ARTIFACT_BACKEND_COMPARISON'|'CROSS_ARTIFACT_QUALITY_COMPARISON'|'UNDETERMINED'};
const digest=(s:string)=>/^sha256:[0-9a-f]{64}$/.test(s);
export function compareBrowserBackendsV1(a:BackendObservationV1|null,b:BackendObservationV1|null):CompareResultV1{
 const reasons:string[]=[];
 if(!a||!b)return {status:'BLOCKED',reasons:['MISSING_BACKEND_RECEIPT'],classification:'UNDETERMINED'};
 if(a.backend===b.backend)reasons.push('BACKENDS_NOT_DISTINCT');
 for(const x of [a,b]){
  if(![x.modelDigest,x.tokenizerDigest,x.templateDigest,x.fixtureDigest].every(digest)) reasons.push(x.backend+':INVALID_DIGEST');
  if(x.status!=='PASS'||!x.gpuExecutionObserved)reasons.push(x.backend+':EXECUTION_UNPROVEN');
  if(!Number.isFinite(x.startedAtEpochMs)||!Number.isFinite(x.finishedAtEpochMs)||x.finishedAtEpochMs<x.startedAtEpochMs)reasons.push(x.backend+':INVALID_TIMING');
  if(!Number.isFinite(x.firstTokenMs)||x.firstTokenMs!<0)reasons.push(x.backend+':FIRST_TOKEN_UNVERIFIED');
  if(!Number.isFinite(x.prefillTokensPerSecond)||x.prefillTokensPerSecond!<0||
     !Number.isFinite(x.decodeTokensPerSecond)||x.decodeTokensPerSecond!<0)reasons.push(x.backend+':THROUGHPUT_UNVERIFIED');
  if(!Array.isArray(x.promptTokenIds)||!Array.isArray(x.outputTokenIds)||
     ![...x.promptTokenIds,...x.outputTokenIds].every(v=>Number.isSafeInteger(v)&&v>=0))reasons.push(x.backend+':INVALID_TOKENS');
  if(!x.quantization||!x.runtimeVersion)reasons.push(x.backend+':UNVERSIONED_RUNTIME');
 }
 if(a.fixtureDigest!==b.fixtureDigest)reasons.push('FIXTURE_MISMATCH');
 if(!(a.finishedAtEpochMs<=b.startedAtEpochMs||b.finishedAtEpochMs<=a.startedAtEpochMs))reasons.push('RUNS_OVERLAP');
 const classification=a.modelDigest===b.modelDigest&&a.tokenizerDigest===b.tokenizerDigest&&a.templateDigest===b.templateDigest&&a.quantization===b.quantization?
  'SAME_ARTIFACT_BACKEND_COMPARISON':'CROSS_ARTIFACT_QUALITY_COMPARISON';
 return {status:reasons.length?'BLOCKED':'COMPARABLE',reasons,classification};
}
