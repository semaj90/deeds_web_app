import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {buildWorkspaceRevisionV2} from './workspace-source-binding-v2.js';
const e=(ref:string,bytes:string)=>{const d=createHash('sha256').update(bytes).digest('hex');
 return {sourceRef:ref,sourceRevision:'sha256:'+d,contentDigest:d,byteLength:Buffer.byteLength(bytes)};};
const input=()=>({repositoryId:'repo:root',sources:[e('src/a.ts','abc'),e('src/b.ts','xyz')],
 skippedSources:[],sourceExtensionSet:['.ts','.md'],excludedPrefixes:['docs/reports/'],
 discoveryPolicyRevision:'policy:v2'});
describe('workspace revision v2 opt-in',()=>{
 it('sorts independent of enumeration order',()=>{const a=input();const b=input();b.sources.reverse();b.sourceExtensionSet.reverse();
 expect(buildWorkspaceRevisionV2(a).workspaceRevision).toBe(buildWorkspaceRevisionV2(b).workspaceRevision);});
 it('changes for same-length byte edits',()=>{const a=input();const b=input();b.sources[0]=e('src/a.ts','abd');
 expect(buildWorkspaceRevisionV2(a).workspaceRevision).not.toBe(buildWorkspaceRevisionV2(b).workspaceRevision);});
 it('changes on rename and policy edits',()=>{const a=input();const b=input();b.sources[0]=e('src/c.ts','abc');
 expect(buildWorkspaceRevisionV2(a).workspaceRevision).not.toBe(buildWorkspaceRevisionV2(b).workspaceRevision);
 const c=input();c.excludedPrefixes.push('.tmp/');
 expect(buildWorkspaceRevisionV2(a).workspaceRevision).not.toBe(buildWorkspaceRevisionV2(c).workspaceRevision);});
 it('changes when an oversized skipped source digest changes',()=>{const a=input();a.skippedSources=[{sourceRef:'src/large.ts',reason:'OVER_SIZE',contentDigest:e('x','aaa').contentDigest,byteLength:6000000}];
 const b=structuredClone(a);b.skippedSources[0].contentDigest=e('x','bbb').contentDigest;
 expect(buildWorkspaceRevisionV2(a).workspaceRevision).not.toBe(buildWorkspaceRevisionV2(b).workspaceRevision);});
 it('blocks unreadable skipped sources',()=>{const a=input();a.skippedSources=[{sourceRef:'src/secret.ts',reason:'UNREADABLE',contentDigest:null,byteLength:null}];
 expect(()=>buildWorkspaceRevisionV2(a)).toThrow('WORKSPACE_V2_UNHASHABLE_ELIGIBLE_SOURCE');});
 it('rejects duplicate source refs',()=>{const a=input();a.sources.push(a.sources[0]);
 expect(()=>buildWorkspaceRevisionV2(a)).toThrow('WORKSPACE_V2_DUPLICATE_SOURCE_REF');});
 it('rejects tampered source digest',()=>{const a=input();a.sources[0].sourceRevision=e('x','def').sourceRevision;
 expect(()=>buildWorkspaceRevisionV2(a)).toThrow();});
 it('remains nonauthoritative and schema-separated',()=>{const r=buildWorkspaceRevisionV2(input());
 expect(r.schema).toBe('atlas.workspace-revision-record.v2');
 expect(r.payload.schema).toBe('atlas.workspace-revision.v2');
 expect(r.canonicalAuthority).toBe(false);expect(r.admissionStatus).toBe('NOT_ADMITTED');});
});
