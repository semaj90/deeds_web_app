/** Logical prompt freeze != tokenization parity. Pure fixture checks only. */
export type FrozenPromptContractV1={
 packetKey:string;sourceRevision:string;representationRevision:string;
 logicalPrompt:string;logicalPromptSha256:string;maxNewTokens:number;
 backends:readonly {id:'transformersjs-webgpu'|'litertlm-js-webgpu';tokenizerSha256:string;templateSha256:string;tokenIds:readonly number[];attentionMask:readonly number[];stopTokenIds:readonly number[]}[];
};
export function inspectFrozenPromptV1(f:FrozenPromptContractV1){
 const reasons:string[]=[],sha=(s:string)=>/^sha256:[0-9a-f]{64}$/.test(s);
 if(!f.packetKey?.trim()||!f.sourceRevision?.trim()||!f.representationRevision?.trim()||!f.logicalPrompt?.length||!sha(f.logicalPromptSha256))reasons.push('INVALID_PROMPT_IDENTITY');
 if(!Number.isSafeInteger(f.maxNewTokens)||f.maxNewTokens<1||f.maxNewTokens>512)reasons.push('INVALID_GENERATION_BUDGET');
 if(f.backends.length!==2||new Set(f.backends.map(b=>b.id)).size!==2||
 !['transformersjs-webgpu','litertlm-js-webgpu'].every(n=>f.backends.some(b=>b.id===n)))reasons.push('MISSING_BACKEND_TOKENIZATION');
 for(const b of f.backends){
  if(!sha(b.tokenizerSha256)||!sha(b.templateSha256))reasons.push(b.id+':UNVERIFIED_TOKENIZER');
  if(!b.tokenIds.length||b.tokenIds.length!==b.attentionMask.length||!b.tokenIds.every(n=>Number.isSafeInteger(n)&&n>=0)||
     !b.attentionMask.every(n=>n===0||n===1)||!b.stopTokenIds.every(n=>Number.isSafeInteger(n)&&n>=0))reasons.push(b.id+':INVALID_TOKEN_ARRAYS');
 }
 return {status:reasons.length?'BLOCKED' as const:'FIXTURE_SHAPE_VALID' as const,reasons,
  tokenizationIndependentlyVerified:false as const};
}
