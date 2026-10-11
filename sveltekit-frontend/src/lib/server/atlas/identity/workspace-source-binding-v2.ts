/** Opt-in, non-promotional workspace revision v2. V1 stays byte-for-byte unchanged.
 * This owner hashes qualified manifest content plus discovery policy. It does not
 * enumerate files or issue canonical authority. A v1 revision cannot satisfy v2.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { workspaceSourceRefV1Schema } from './workspace-source-binding-v1.js';
const digestSchema=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonempty=z.string().min(1);
const entry=z.object({
 sourceRef:workspaceSourceRefV1Schema,sourceRevision:digestSchema,
 contentDigest:z.string().regex(/^[a-f0-9]{64}$/),byteLength:z.number().int().nonnegative()
}).strict().refine(x=>x.sourceRevision===`sha256:${x.contentDigest}`,{message:'SOURCE_DIGEST_MISMATCH'});
const skip=z.object({sourceRef:workspaceSourceRefV1Schema,reason:nonempty,
 contentDigest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 byteLength:z.number().int().nonnegative().nullable()}).strict();
export const workspaceRevisionV2InputSchema=z.object({
 repositoryId:nonempty, sources:z.array(entry),skippedSources:z.array(skip),
 sourceExtensionSet:z.array(nonempty), excludedPrefixes:z.array(nonempty),
 discoveryPolicyRevision:nonempty,
}).strict();
export type WorkspaceRevisionV2Input=z.infer<typeof workspaceRevisionV2InputSchema>;
const stable=(x:unknown):string=>Array.isArray(x)?`[${x.map(stable).join(',')}]`:
 x&&typeof x==='object'?`{${Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`:JSON.stringify(x)??'null';
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
function unique(values:string[],label:string){
 if(new Set(values).size!==values.length)throw new Error(`WORKSPACE_V2_DUPLICATE_${label}`);
}
export function buildWorkspaceRevisionV2(input:WorkspaceRevisionV2Input){
 const value=workspaceRevisionV2InputSchema.parse(input);
 unique(value.sources.map(s=>s.sourceRef),'SOURCE_REF');
 unique(value.skippedSources.map(s=>s.sourceRef),'SKIPPED_REF');
 unique([...value.sources,...value.skippedSources].map(s=>s.sourceRef),'CROSS_SET_REF');
 unique(value.sourceExtensionSet,'EXTENSION');unique(value.excludedPrefixes,'PREFIX');
 if(value.skippedSources.some(s=>s.contentDigest===null||s.byteLength===null))
  throw new Error('WORKSPACE_V2_UNHASHABLE_ELIGIBLE_SOURCE');
 const policy={extensions:[...value.sourceExtensionSet].sort(),excludedPrefixes:[...value.excludedPrefixes].sort(),
  discoveryPolicyRevision:value.discoveryPolicyRevision};
 const payload={schema:'atlas.workspace-revision.v2',repositoryId:value.repositoryId,
  policy,sources:[...value.sources].sort((a,b)=>a.sourceRef.localeCompare(b.sourceRef)),
  skippedSources:[...value.skippedSources].sort((a,b)=>a.sourceRef.localeCompare(b.sourceRef))};
 const workspaceRevision=`sha256:${sha('atlas.workspace-revision.v2\\0'+stable(payload))}`;
 return {schema:'atlas.workspace-revision-record.v2' as const,workspaceRevision,
  sourceCount:payload.sources.length,skippedCount:payload.skippedSources.length,
  policyDigest:`sha256:${sha(stable(policy))}`,
  manifestDigest:`sha256:${sha(stable(payload))}`,
  readOnlyObservation:true as const,canonicalAuthority:false as const,
  admissionStatus:'NOT_ADMITTED' as const,payload};
}
