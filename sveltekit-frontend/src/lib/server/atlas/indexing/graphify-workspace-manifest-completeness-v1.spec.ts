import { describe, expect, it } from 'vitest';
import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import { buildWorkspaceRevisionRecordV1, buildWorkspaceSourceBindingsV1 } from '../identity/workspace-source-binding-v1.js';
import { evaluateGraphifyWorkspaceManifestCompletenessV1 } from './graphify-workspace-manifest-completeness-v1.js';

const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);
function src(sourceRef: string, text: string, gitBlobOid: string) {
  const r = deriveCodeSourceRevisionV1(text);
  return { sourceRef, sourceRevision: r.sourceRevision, contentDigest: r.contentDigest, byteLength: r.byteLength, gitBlobOid };
}
function fixture() {
  const entries = [src('src/a.ts','export const a=1;\n','3'.repeat(40)), src('src/b.ts','export const b=2;\n','4'.repeat(40))];
  const built = buildWorkspaceRevisionRecordV1({ repositoryId:'semaj90/deeds_web_app', gitObjectFormat:'sha1', baseCommitOid:COMMIT, baseTreeOid:TREE, gitHeadRef:'refs/heads/main', dirty:false, entries, generatedAt:'2026-08-22T00:00:00.000Z', producerRevision:'test' });
  const bindings = buildWorkspaceSourceBindingsV1({ record:built.record, entries:built.entries, trackedAtBaseCommit:new Map([['src/a.ts',true],['src/b.ts',true]]), dirtyRelativeToBaseCommit:new Map([['src/a.ts',false],['src/b.ts',false]]), producerRevision:'test' });
  const runId='11111111-1111-4111-8111-111111111111';
  const persistedRun={runId,workspaceRevision:built.record.workspaceRevision,sourceManifestDigest:built.record.sourceManifestDigest,sourceManifestSourceCount:built.record.sourceCount};
  const persistedSources=bindings.map(b=>({sourceRef:b.sourceRef,codeSourceRevision:b.sourceRevision,contentHash:b.contentDigest,byteLength:b.byteLength,lastSeenRunId:runId}));
  return {record:built.record,bindings,persistedRun,persistedSources};
}

describe('GraphifyWorkspaceManifestCompletenessV1',()=>{
  it('proves only a complete exact persisted manifest',()=>{
    const f=fixture(); const r=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:f.record,sourceBindings:f.bindings,persistedRun:f.persistedRun,persistedSources:f.persistedSources,producerRevision:'test'});
    expect(r.status).toBe('COMPLETE'); expect(r.complete).toBe(true); expect(r.graphMayConsumeWorkspaceRevision).toBe(true); expect(r.matchedSourceCount).toBe(2);
  });
  it('rejects a one-row canary as a workspace proof',()=>{
    const f=fixture(); const r=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:f.record,sourceBindings:f.bindings,persistedRun:f.persistedRun,persistedSources:f.persistedSources.slice(0,1),producerRevision:'test'});
    expect(r.complete).toBe(false); expect(r.status).toBe('SOURCE_COUNT_MISMATCH'); expect(r.graphMayConsumeWorkspaceRevision).toBe(false);
  });
  it('rejects a substituted source revision even when counts match',()=>{
    const f=fixture(); const rows=[...f.persistedSources]; rows[1]={...rows[1]!,codeSourceRevision:`sha256:${'e'.repeat(64)}`,contentHash:'e'.repeat(64)};
    const r=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:f.record,sourceBindings:f.bindings,persistedRun:f.persistedRun,persistedSources:rows,producerRevision:'test'});
    expect(r.complete).toBe(false); expect(r.status).toBe('SOURCE_BINDING_MISMATCH');
  });
  it('rejects a run manifest digest mismatch',()=>{
    const f=fixture(); const run={...f.persistedRun,sourceManifestDigest:'f'.repeat(64)};
    const r=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:f.record,sourceBindings:f.bindings,persistedRun:run,persistedSources:f.persistedSources,producerRevision:'test'});
    expect(r.complete).toBe(false); expect(r.status).toBe('RUN_LINEAGE_MISMATCH');
  });
  it('rejects source rows bound to another run',()=>{
    const f=fixture(); const rows=[...f.persistedSources]; rows[0]={...rows[0]!,lastSeenRunId:'22222222-2222-4222-8222-222222222222'};
    const r=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:f.record,sourceBindings:f.bindings,persistedRun:f.persistedRun,persistedSources:rows,producerRevision:'test'});
    expect(r.complete).toBe(false); expect(r.blockers.some(x=>x.startsWith('SOURCE_NOT_BOUND_TO_RUN:'))).toBe(true);
  });
  it('is checksum deterministic for identical evidence',()=>{
    const f=fixture(); const input={workspaceRecord:f.record,sourceBindings:f.bindings,persistedRun:f.persistedRun,persistedSources:f.persistedSources,producerRevision:'test'};
    expect(evaluateGraphifyWorkspaceManifestCompletenessV1(input).receiptChecksum).toBe(evaluateGraphifyWorkspaceManifestCompletenessV1(input).receiptChecksum);
  });
});
