#!/usr/bin/env node
/** Offline diagnostic report. All four test categories are preflight-only; does not run WGSL. */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDiagnosticTelemetryV1,verifyDiagnosticTelemetryV1,compareKernelV1,inspectBrowserPreflightV1,compareRuntimeReceiptsV1 } from './lib/gemma4-webgpu-four-gates-v1.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const arg=process.argv.find(x=>x.startsWith('--output='));
const output=resolve(root,arg?.slice('--output='.length)??'.tmp/atlas/gemma4-webgpu-four-gates-offline-v1.json');
const scratch=join(root,'.tmp','atlas');
if(output===scratch || !output.startsWith(scratch + (process.platform==='win32'?'\\':'/')))throw new Error('OUTPUT_OUTSIDE_ATLAS_SCRATCH');
const now=Date.now();
const cpu=compareKernelV1({a:[1,2,3,4],b:[5,6,7,8],m:2,k:2,n:2,observed:[19,22,43,50]});
const browser=inspectBrowserPreflightV1({userConsented:false,secureContext:false,adapterAvailable:false,modelArtifactComplete:false,modelRevisionPinned:false,globalGpuHeadroomVerified:false});
const paired=compareRuntimeReceiptsV1(null,null);
const events=[{type:'CPU_ORACLE',status:cpu.status,durationMs:Date.now()-now},
 {type:'BROWSER_PREFLIGHT',status:browser.status,durationMs:0},
 {type:'RUNTIME_COMPARISON',status:paired.status,durationMs:0},
 {type:'RECEIPT_CHECK',status:'OFFLINE_NON_PROMOTABLE',durationMs:0}];
const report=buildDiagnosticTelemetryV1({runId:'win10-four-gates-offline-v1',events});
if(!verifyDiagnosticTelemetryV1(report))throw new Error('REPORT_INTEGRITY_FAILED');
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const loaded=JSON.parse(readFileSync(output,'utf8'));
if(!verifyDiagnosticTelemetryV1(loaded))throw new Error('INDEPENDENT_REPORT_READBACK_FAILED');
process.stdout.write(JSON.stringify({status:'OFFLINE_TEST_SCAFFOLD_NOT_GPU_PROOF',path:output,checksum:report.checksum,events:events.length,readback:'MATCH'},null,2)+'\n');
