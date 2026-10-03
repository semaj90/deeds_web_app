#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { semanticChecksum } from './lib/stable-json.mjs';

const inputPath=path.resolve(process.argv[2]??'docs/reports/ace-packet-input-v1.json');
const outputPath=path.resolve(process.argv[3]??'docs/reports/ace-packet-draft-v1.json');
let input={}; try{input=JSON.parse(fs.readFileSync(inputPath,'utf8'));}catch{}
const revisions=input.revisions&&typeof input.revisions==='object'?input.revisions:{};
const canonicalIds=Array.isArray(input.canonicalIds)?input.canonicalIds.map(String).filter(Boolean):[];
const evidenceRefs=Array.isArray(input.evidenceRefs)?input.evidenceRefs.map(String).filter(Boolean):[];
const blockers=[];
for(const key of ['workspace','source','graph','feature']) if(typeof revisions[key]!=='string'||!revisions[key]) blockers.push(`MISSING_${key.toUpperCase()}_REVISION`);
if(typeof input.requestId!=='string'||!input.requestId) blockers.push('MISSING_REQUEST_ID');
if(!canonicalIds.length) blockers.push('MISSING_CANONICAL_IDS');
if(typeof input.packetKey!=='string'||!input.packetKey) blockers.push('MISSING_PACKET_KEY');
if(!evidenceRefs.length) blockers.push('MISSING_EVIDENCE_REFS');
if(input.contextManifestRequestId && input.contextManifestRequestId!==input.requestId) blockers.push('CONTEXT_MANIFEST_REQUEST_ID_MISMATCH');
const budget=input.budget&&typeof input.budget==='object'?input.budget:null;
if(!budget) blockers.push('MISSING_RESOURCE_BUDGET');
const draft={
  schema:'atlas.ace-packet-draft.v1',
  state:blockers.length?'NOT_READY':'READY_FOR_PROOF',
  blockers,
  packet:blockers.length?null:{
    schema:'atlas.ace-packet-draft.v1',
    control:{requestId:input.requestId,revisions,budget,expectedChecksum:input.expectedChecksum??undefined,tensorHandles:Array.isArray(input.tensorHandles)?input.tensorHandles:undefined},
    packetKey:input.packetKey,
    symbolVersionId:input.symbolVersionId??null,
    canonicalIds,
    contextManifestRequestId:input.contextManifestRequestId??undefined,
    warmHints:{bucketKeys:Array.isArray(input.bucketKeys)?input.bucketKeys.map(String):[],promptPrefixKey:input.promptPrefixKey??null,evidenceRefs},
    authority:'DRAFT_ONLY'
  },
  rule:'READY_FOR_PROOF means a draft can enter proof; it does not authorize cache warming, prefill, synthesis, or promotion.',
  writesPerformed:false
};
draft.semanticChecksum=semanticChecksum(draft);
fs.mkdirSync(path.dirname(outputPath),{recursive:true}); fs.writeFileSync(outputPath,JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({outputPath,state:draft.state,blockers,semanticChecksum:draft.semanticChecksum},null,2));
