#!/usr/bin/env node
/** Bounded diagnostic verifier for a browser-produced WebGPU receipt.
 * Not an authenticated GPU attestation: a caller can forge browser JSON.
 * Usage: node scripts/atlas/verify-webgpu-kernel-readback-v1.mjs .tmp/atlas/receipt.json
 */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname??path.dirname(new URL(import.meta.url).pathname),'../..');
export function verifyWebGpuReceiptV1(r){
 const error=[];
 if(r?.schema!=='atlas.webgpu-real-kernel-probe.v1')error.push('SCHEMA_MISMATCH');
 if(r?.status!=='REAL_WEBGPU_CPU_PARITY'||r?.actualWebgpuExecution!==true)error.push('EXECUTION_CLAIM_MISSING');
 if(!/^sha256:[a-f0-9]{64}$/.test(r?.shaderSha256??''))error.push('SHADER_DIGEST_INVALID');
 if(r?.modelLoaded!==false||r?.canonicalAuthority!==false||r?.storesWritten!==false)error.push('AUTHORITY_CONTRACT_INVALID');
 const expected=[19,22,43,50],observed=r?.observed;
 if(!Array.isArray(observed)||observed.length!==4||!observed.every(x=>typeof x==='number'&&Number.isFinite(x)))error.push('RESULT_INVALID');
 else if(Math.max(...expected.map((x,i)=>Math.abs(x-observed[i])))>1e-5)error.push('NUMERICAL_MISMATCH');
 const payload={schema:'atlas.webgpu-kernel-independent-readback.v1',status:error.length?'REJECTED':'CONSISTENT_BROWSER_CLAIMS_ONLY',
  errors:error,authenticatedGpuExecution:false,admitted:false,canonicalAuthority:false,
  sourceReceiptChecksum:'sha256:'+createHash('sha256').update(JSON.stringify(r)).digest('hex')};
 return {...payload,checksum:'sha256:'+createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 const name=process.argv[2];if(!name)throw new Error('RECEIPT_PATH_REQUIRED');
 const input=path.resolve(root,name);const prefix=path.join(root,'.tmp','atlas')+path.sep;
 if(!input.startsWith(prefix))throw new Error('SCRATCH_PATH_REQUIRED');
 if(fs.statSync(input).size>65536)throw new Error('RECEIPT_TOO_LARGE');
 process.stdout.write(JSON.stringify(verifyWebGpuReceiptV1(JSON.parse(fs.readFileSync(input,'utf8'))),null,2)+'\n');
}
