#!/usr/bin/env node
/** Deterministic JSON.parse baseline for a future native simdjson comparison.
 * No hardware ISA inference: AVX2 availability does not prove dispatch.
 * External native parser must be supplied independently and its backend logged.
 */
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import os from 'node:os';
export function compareJsonParsersV1({payload,parseNative=null,nativeBackend=null,iterations=100}){
 if(typeof payload!=='string'||Buffer.byteLength(payload,'utf8')>65536||!Number.isInteger(iterations)||iterations<1||iterations>1000)throw new Error('BOUNDED_JSON_INPUT_REQUIRED');
 const baseline=JSON.parse(payload);
 const run=fn=>{const t0=performance.now();let value;for(let i=0;i<iterations;i++)value=fn(payload);return {value,elapsedMs:performance.now()-t0};};
 const node=run(JSON.parse);
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 let native=null;
 if(parseNative!==null) {
  if(typeof parseNative!=='function'||typeof nativeBackend!=='string'||!nativeBackend.trim())throw new Error('NATIVE_BACKEND_ID_REQUIRED');
  const result=run(parseNative);
  native={backend:nativeBackend,elapsedMs:result.elapsedMs,equivalent:hash(baseline)===hash(result.value)};
 }
 return {schema:'atlas.simdjson-node-parity.v1',fixtureSha256:'sha256:'+createHash('sha256').update(payload).digest('hex'),
  bytes:Buffer.byteLength(payload,'utf8'),iterations,node:{backend:'node-v8-json-parse',elapsedMs:node.elapsedMs},
  native:native??{status:'NOT_EXECUTED'},cpu:{architecture:process.arch,model:os.cpus()?.[0]?.model??'unknown',nativeAvx2Dispatch:'UNVERIFIED'},
  status:native===null?'NODE_BASELINE_ONLY':native.equivalent?'EQUIVALENT_FOR_FIXTURE':'PARSER_MISMATCH',
  canonicalAuthority:false,dbWrites:false};
}
if(process.argv[1]?.endsWith('prove-simdjson-node-fixture-v1.mjs')) {
 const fixture=JSON.stringify({schema:'atlas.telemetry-fixture.v1',packetKey:'packet:fixture',sourceRevision:'sha256:'+'a'.repeat(64),status:'DIAGNOSTIC_ONLY',unicode:'函式',values:[19,22,43,50]});
 console.log(JSON.stringify(compareJsonParsersV1({payload:fixture}),null,2));
}
