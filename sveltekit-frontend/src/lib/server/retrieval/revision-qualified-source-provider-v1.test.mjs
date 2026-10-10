import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectRevisionQualifiedSourcesV1 as inspect} from './revision-qualified-source-provider-v1.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=Buffer.from('const x = "café";\n','utf8');
const span=Buffer.from('café','utf8');
const start=source.indexOf(span);
const row={canonicalCandidateId:'candidate1',packetKey:'packet1',sourceRef:'src/example.ts',
 sourceRevision:'src1',contentSha256:sha(source),startByte:start,endByte:start+span.length,
 spanSha256:sha(span)};
const providers={
 requestId:'req1',workspaceRevision:'workspace1',candidateSnapshotRevision:'snap1',
 loadCandidateSnapshot:async()=>({workspaceRevision:'workspace1',candidateSnapshotRevision:'snap1',
  integrityVerified:true,ordinalMapChecksum:'map1',candidates:[row]}),
 readSourceBytes:async()=>source,
 loadFeatureRows:async()=>({workspaceRevision:'workspace1',sourceRevision:'src1',producerRevision:'producer1'})
};
test('valid UTF8 source passes but is never admitted',async()=>{
 const x=await inspect(providers);assert.equal(x.status,'SOURCE_VERIFIED_NOT_ADMITTED');
 assert.equal(x.rows[0].featureRevision,null);assert.equal(x.rows[0].ontologyRevision,null);
 assert.equal(x.admission,'NOT_PERFORMED');
});
test('unconfigured owner blocks',async()=>assert.equal((await inspect({...providers,readSourceBytes:null})).reason,'CANONICAL_PROVIDER_NOT_CONFIGURED'));
test('wrong workspace blocks',async()=>assert.equal((await inspect({...providers,workspaceRevision:'other'})).reason,'CANDIDATE_SNAPSHOT_UNQUALIFIED'));
test('wrong bytes block',async()=>assert.equal((await inspect({...providers,readSourceBytes:async()=>Buffer.from('different')})).reason,'SOURCE_REVISION_CONTENT_MISMATCH'));
test('UTF8 multibyte cut blocks',async()=>{
 const bad={...row,startByte:start+4,endByte:start+span.length};
 const x=await inspect({...providers,loadCandidateSnapshot:async()=>({workspaceRevision:'workspace1',candidateSnapshotRevision:'snap1',integrityVerified:true,ordinalMapChecksum:'map1',candidates:[bad]})});
 assert.equal(x.reason,'UTF8_BOUNDARY_INVALID');
});
test('feature lineage mismatch blocks',async()=>assert.equal((await inspect({...providers,loadFeatureRows:async()=>({sourceRevision:'stale',workspaceRevision:'workspace1'})})).reason,'FEATURE_SOURCE_REVISION_MISMATCH'));
