import { describe, expect, it } from 'vitest';
import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import { buildWorkspaceRevisionRecordV1, buildWorkspaceSourceBindingsV1 } from '../identity/workspace-source-binding-v1.js';
import { bindGraphSnapshotNodeSourceRevisionsV1 } from './graph-snapshot-source-revision-binding-v1.js';

function fixture(){
  const ra=deriveCodeSourceRevisionV1('export const a=1;\n'); const rb=deriveCodeSourceRevisionV1('export const b=2;\n');
  const entries=[{sourceRef:'src/a.ts',sourceRevision:ra.sourceRevision,contentDigest:ra.contentDigest,byteLength:ra.byteLength,gitBlobOid:'3'.repeat(40)},{sourceRef:'src/b.ts',sourceRevision:rb.sourceRevision,contentDigest:rb.contentDigest,byteLength:rb.byteLength,gitBlobOid:'4'.repeat(40)}];
  const built=buildWorkspaceRevisionRecordV1({repositoryId:'semaj90/deeds_web_app',gitObjectFormat:'sha1',baseCommitOid:'1'.repeat(40),baseTreeOid:'2'.repeat(40),gitHeadRef:'refs/heads/main',dirty:false,entries,generatedAt:'2026-08-22T00:00:00.000Z',producerRevision:'test'});
  const bindings=buildWorkspaceSourceBindingsV1({record:built.record,entries:built.entries,trackedAtBaseCommit:new Map([['src/a.ts',true],['src/b.ts',true]]),dirtyRelativeToBaseCommit:new Map([['src/a.ts',false],['src/b.ts',false]]),producerRevision:'test'});
  return {record:built.record,bindings};
}
describe('GraphSnapshotSourceRevisionBindingV1',()=>{
  it('binds exact normalized source refs',()=>{const f=fixture();const r=bindGraphSnapshotNodeSourceRevisionsV1({workspaceRecord:f.record,bindings:f.bindings,nodes:[{nodeKey:'a',sourceRef:'src/a.ts'},{nodeKey:'b',sourceRef:'src\\b.ts'},{nodeKey:'repo',sourceRef:null}],producerRevision:'test'});expect(r.nodes[0]?.sourceRevision).toBe(f.bindings[0]?.sourceRevision);expect(r.nodes[1]?.sourceRevision).toBe(f.bindings[1]?.sourceRevision);expect(r.nodes[2]?.sourceRevision).toBeNull();expect(r.receipt.completeCoverage).toBe(true);});
  it('fails coverage for a source-backed node absent from the workspace manifest',()=>{const f=fixture();const r=bindGraphSnapshotNodeSourceRevisionsV1({workspaceRecord:f.record,bindings:f.bindings,nodes:[{nodeKey:'missing',sourceRef:'src/missing.ts'}],producerRevision:'test'});expect(r.receipt.applyAllowed).toBe(false);expect(r.receipt.missingSourceRefs).toEqual(['src/missing.ts']);});
  it('rejects conflicting duplicate source bindings',()=>{const f=fixture();const bad={...f.bindings[0]!,sourceRevision:`sha256:${'e'.repeat(64)}`,contentDigest:'e'.repeat(64)};expect(()=>bindGraphSnapshotNodeSourceRevisionsV1({workspaceRecord:f.record,bindings:[f.bindings[0]!,bad],nodes:[],producerRevision:'test'})).toThrow();});
  it('is deterministic',()=>{const f=fixture();const input={workspaceRecord:f.record,bindings:f.bindings,nodes:[{nodeKey:'a',sourceRef:'src/a.ts'}],producerRevision:'test'};expect(bindGraphSnapshotNodeSourceRevisionsV1(input).receipt.bindingChecksum).toBe(bindGraphSnapshotNodeSourceRevisionsV1(input).receipt.bindingChecksum);});
});
