#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS, EMBEDDINGGEMMA_NATIVE_DIMENSION, EMBEDDINGGEMMA_PROMPT_REVISION, encodeClassificationQuery, encodeCodeRetrievalQuery, encodeRetrievalDocument, encodeRetrievalQuery } from '../../src/lib/server/embedding/embeddinggemma-prompt-contract.js';

const argv=process.argv.slice(2);
function arg(name:string,fallback:string|null=null){const inline=argv.find(v=>v.startsWith(`--${name}=`));if(inline)return inline.slice(name.length+3);const i=argv.indexOf(`--${name}`);return i>=0?(argv[i+1]??fallback):fallback;}
function flag(name:string){return argv.includes(`--${name}`);}
function positiveInt(name:string,fallback:number){const n=Number(arg(name,String(fallback)));if(!Number.isInteger(n)||n<=0)throw new Error(`INVALID_${name.toUpperCase()}:${n}`);return n;}
const launch=flag('launch'); const inspectOnly=flag('inspect-only');
const modelPath=path.resolve(arg('model',process.env.EMBED_MODEL_PATH??'')||'.');
const llamaPath=path.resolve(arg('llama',process.env.LLAMA_SERVER_PATH??'')||'.');
const port=positiveInt('port',launch?18081:8081); const serverUrl=(arg('server-url',`http://127.0.0.1:${port}`)??'').replace(/\/$/,'');
const ctx=EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS; const batch=positiveInt('batch',ctx); const ubatch=positiveInt('ubatch',ctx); const repeats=positiveInt('repeats',5);
const reportPath=path.resolve(arg('report','docs/reports/embeddinggemma-q8-executor-proof.json')!);
const expectedSha=(arg('expected-sha256',process.env.EMBED_EXPECTED_SHA256??null)??null)?.toLowerCase()??null;

function shaText(v:string){return createHash('sha256').update(v,'utf8').digest('hex');}
function shaFile(file:string){return new Promise<string>((resolve,reject)=>{const h=createHash('sha256');const s=createReadStream(file);s.on('error',reject);s.on('data',c=>h.update(c));s.on('end',()=>resolve(h.digest('hex')));});}
function digestF32(values:readonly number[]){const b=Buffer.allocUnsafe(values.length*4);values.forEach((v,i)=>b.writeFloatLE(Math.fround(v),i*4));return createHash('sha256').update(b).digest('hex');}
function l2(values:readonly number[]){let s=0;for(const v of values){if(!Number.isFinite(v))return NaN;s+=v*v;}return Math.sqrt(s);}
function cosine(a:readonly number[],b:readonly number[]){if(a.length!==b.length)return NaN;let d=0,aa=0,bb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return d/Math.sqrt(aa*bb);}
function mrl(native:readonly number[],dim:512|256|128){if(native.length!==768)throw new Error(`NATIVE_DIMENSION_MISMATCH:${native.length}`);const p=Array.from({length:dim},(_,i)=>Math.fround(native[i]));const n=l2(p);if(!Number.isFinite(n)||n<=0)throw new Error(`MRL_INVALID_NORM:${dim}`);return p.map(v=>Math.fround(v/n));}
function cmd(exe:string,args:string[]){const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true});return {ok:r.status===0,output:`${r.stdout??''}${r.stderr??''}`.trim()};}
async function request(pathname:string,body?:unknown,timeout=120000){const res=await fetch(`${serverUrl}${pathname}`,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});const text=await res.text();let json:any;try{json=text?JSON.parse(text):null;}catch{json={raw:text};}if(!res.ok)throw new Error(`HTTP_${res.status}:${pathname}:${text.slice(0,300)}`);return json;}
async function embed(input:string|string[]){const body=await request('/v1/embeddings',{input});const rows=Array.isArray(body?.data)?body.data:[];return rows.map((r:any)=>{if(!Array.isArray(r?.embedding))throw new Error('EMBEDDING_RESPONSE_VECTOR_MISSING');return r.embedding.map(Number);});}
async function waitHealth(child:ChildProcessWithoutNullStreams){for(let i=0;i<180;i++){if(child.exitCode!=null)throw new Error(`LLAMA_SERVER_EXITED:${child.exitCode}`);try{await request('/health',undefined,1000);return;}catch{await new Promise(r=>setTimeout(r,500));}}throw new Error('LLAMA_SERVER_HEALTH_TIMEOUT');}

const blockers:string[]=[]; let modelSha:string|null=null;let modelBytes:number|null=null;let executorRevision:string|null=null;let help='';let child:ChildProcessWithoutNullStreams|null=null;let launchLog='';
try{await access(modelPath);const s=await stat(modelPath);if(!s.isFile())throw new Error('MODEL_NOT_FILE');modelBytes=s.size;modelSha=await shaFile(modelPath);}catch(e){blockers.push(`MODEL_ARTIFACT_UNREADABLE:${e instanceof Error?e.message:String(e)}`);}
try{await access(llamaPath);executorRevision=cmd(llamaPath,['--version']).output||null;help=cmd(llamaPath,['--help']).output;if(!executorRevision)blockers.push('LLAMA_CPP_VERSION_UNAVAILABLE');}catch(e){blockers.push(`LLAMA_SERVER_UNREADABLE:${e instanceof Error?e.message:String(e)}`);}
if(expectedSha&&modelSha&&expectedSha!==modelSha)blockers.push('MODEL_SHA256_MISMATCH'); if(ubatch<ctx)blockers.push(`UBATCH_BELOW_CONTEXT:${ubatch}<${ctx}`); if(batch<ubatch)blockers.push(`BATCH_BELOW_UBATCH:${batch}<${ubatch}`);

let live:any=null;
try{
  if(!inspectOnly&&blockers.length===0){
    if(launch){
      const launchArgs=['-m',modelPath,'--host','127.0.0.1','--port',String(port),'--parallel','1','-ngl','99','--embedding','--pooling','mean','-c',String(ctx),'-b',String(batch),'-ub',String(ubatch),'-t',String(Math.max(1,os.cpus().length))];
      if(/--embd-normalize/.test(help))launchArgs.push('--embd-normalize','2');
      child=spawn(llamaPath,launchArgs,{cwd:path.dirname(llamaPath),windowsHide:true,stdio:'pipe'});child.stdout.on('data',c=>launchLog+=c.toString());child.stderr.on('data',c=>launchLog+=c.toString());await waitHealth(child);
    } else await request('/health',undefined,5000);
    const prompts=[encodeRetrievalQuery('How does Parent Atlas resolve canonical packet identity?'),encodeCodeRetrievalQuery('Find GraphifyStructuralMaterializer source revision logic'),encodeClassificationQuery('debug a stale Qdrant projection lineage failure'),encodeRetrievalDocument('Graphify structural evidence preserves source spans and revision lineage.','Parent Atlas structural evidence')];
    const observations=[];let projectionSource:number[]|null=null;
    for(const p of prompts){const [v]=await embed(p.formattedText);projectionSource??=v;const n=l2(v);observations.push({mode:p.mode,formattedTextSha256:p.formattedTextSha256,dimension:v.length,finite:v.every(Number.isFinite),l2Norm:n,float32Digest:digestF32(v)});if(v.length!==768)blockers.push(`NATIVE_DIMENSION_MISMATCH:${p.mode}:${v.length}`);if(!v.every(Number.isFinite))blockers.push(`NONFINITE:${p.mode}`);if(!Number.isFinite(n)||Math.abs(n-1)>0.01)blockers.push(`NORM:${p.mode}:${n}`);}
    const rp=encodeCodeRetrievalQuery('Find GraphifyStructuralMaterializer source revision logic').formattedText;const rv=[];for(let i=0;i<repeats;i++)rv.push((await embed(rp))[0]);const cos=rv.slice(1).map(v=>cosine(rv[0],v));const repeatStable=cos.every(v=>Number.isFinite(v)&&v>=0.999999);if(!repeatStable)blockers.push(`REPEAT_INSTABILITY:${Math.min(...cos)}`);
    const multi=await embed([encodeRetrievalQuery('first query').formattedText,encodeRetrievalQuery('second query').formattedText]);const multiPass=multi.length===2&&multi.every(v=>v.length===768&&v.every(Number.isFinite));if(!multiPass)blockers.push('MULTI_INPUT_FAILED');
    const projected=([512,256,128] as const).map(d=>{const v=mrl(projectionSource!,d);return{dimension:d,l2Norm:l2(v),float32Digest:digestF32(v)};});
    const lower=launchLog.toLowerCase();live={serverUrl,launchedByProof:launch,artifactBindingProven:launch,cudaObserved:launch?/(cuda|ggml_cuda|nvidia)/i.test(launchLog):null,q8Observed:launch?/q8_0/i.test(launchLog):null,promptObservations:observations,repeatedRequestStable:repeatStable,repeatedRequestExactDigestStable:new Set(rv.map(digestF32)).size===1,repeatedCosineMin:cos.length?Math.min(...cos):1,multiInputPass,projectedRepresentations:projected,launchLogSha256:launch?shaText(launchLog):null};
    if(launch&&!live.cudaObserved)blockers.push('CUDA_NOT_ATTESTED_IN_LAUNCH_LOG');if(launch&&!live.q8Observed)blockers.push('Q8_0_NOT_ATTESTED_IN_LAUNCH_LOG');void lower;
  }
} catch(e){blockers.push(`LIVE_PROOF_FAILED:${e instanceof Error?e.message:String(e)}`);} finally {if(child&&!child.killed){child.kill();await new Promise(r=>setTimeout(r,500));if(!child.killed)child.kill('SIGKILL');}}

const report={schema:'atlas.embeddinggemma-executor-receipt.v1',generatedAt:new Date().toISOString(),status:blockers.length===0?(inspectOnly?'ARTIFACT_INSPECTED':'PROVEN_EXECUTOR_READ_ONLY'):'BLOCKED',blockers,modelId:'google/embeddinggemma-300m',artifactPath:modelPath,artifactChecksum:modelSha,artifactSizeBytes:modelBytes,expectedArtifactChecksum:expectedSha,executor:'llama.cpp',executorPath:llamaPath,executorRevision,backend:launch?(live?.cudaObserved?'CUDA':'UNATTESTED'):'EXISTING_SERVER_UNATTESTED',quantization:launch?(live?.q8Observed?'Q8_0':'UNATTESTED'):'EXISTING_SERVER_UNATTESTED',nativeDimension:EMBEDDINGGEMMA_NATIVE_DIMENSION,promptRevision:EMBEDDINGGEMMA_PROMPT_REVISION,maxContextTokens:ctx,batch,ubatch,liveProof:live,projectedRepresentations:['semantic_512','semantic_mrl_256','semantic_mrl_128'],canonicalRepresentation:'semantic_512',canonicalDefaultChanged:false,downloadsPerformed:false,qdrantWrites:false,postgresWrites:false,valkeyWrites:false,canonicalWritesAllowed:false};
await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({status:report.status,blockers,reportPath},null,2));if(report.status==='BLOCKED')process.exitCode=2;
