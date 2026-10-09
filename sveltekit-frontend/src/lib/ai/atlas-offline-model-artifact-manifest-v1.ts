/** Pure artifact manifest check; caller must independently hash actual bytes. */
export type OfflineArtifactV1={path:string;sha256:string;byteLength:number;kind:'model'|'tokenizer'|'config'|'generation'};
export type OfflineArtifactManifestV1={modelRevision:string;root:string;artifacts:readonly OfflineArtifactV1[]};
export function inspectOfflineArtifactManifestV1(m:OfflineArtifactManifestV1){
 const reasons:string[]=[];
 if(!m.modelRevision?.trim()||!m.root?.startsWith('/')||m.root.includes('..'))reasons.push('INVALID_ROOT_OR_REVISION');
 if(!m.artifacts?.length)reasons.push('EMPTY_MANIFEST');
 const seen=new Set<string>();
 for(const a of m.artifacts??[]){
  if(!a.path||a.path.startsWith('/')||a.path.startsWith('\\')||a.path.includes('\\')||
     a.path.split('/').some(p=>!p||p==='.'||p==='..')||a.path.includes('?')||a.path.includes('#')||
     /^[a-z]+:/i.test(a.path))reasons.push('UNSAFE_ARTIFACT_PATH');
  if(seen.has(a.path))reasons.push('DUPLICATE_ASSET');seen.add(a.path);
  if(!/^sha256:[0-9a-f]{64}$/.test(a.sha256))reasons.push('INVALID_DIGEST');
  if(!Number.isSafeInteger(a.byteLength)||a.byteLength<=0)reasons.push('INVALID_SIZE');
 }
 if(!m.artifacts?.some(a=>a.kind==='model'))reasons.push('MISSING_MODEL');
 if(!m.artifacts?.some(a=>a.kind==='tokenizer'))reasons.push('MISSING_TOKENIZER');
 return {status:reasons.length?'BLOCKED' as const:'MANIFEST_SHAPE_VALID' as const,reasons,
  bytesVerified:false as const,allowModelLoad:false as const};
}
