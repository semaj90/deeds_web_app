import test from 'node:test';
import assert from 'node:assert/strict';
import { admitCanonicalChunkSummaryV1 } from './canonical-chunk-summary-admission-v1.mjs';
import { buildSummaryProposalV1 } from './summary-proposal-candidate-v1.mjs';

const row = {
  sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
  workspaceId: 'deeds-web-app', chunkId: 'chunk-a', canonicalChunkId: 'canonical-a',
  chunkRowId: 'row-a', chunkContentHash: 'sha256:chunk', bindingChecksum: 'sha256:binding',
  revisionStatus: 'PROVEN', content: 'export const answer = 42;', inputTextSha256: 'sha256:input', inputByteLength: 24,
};
const proposal = () => buildSummaryProposalV1({
  row, sourceIdentityKey: 'deeds-web-app:src/a.ts', summary: 'Defines the answer constant as the integer forty-two.',
  model: { id: 'ornith-1.5-9b', revision: null }, promptRevision: 'sha256:prompt',
  schemaRevision: 'atlas.chunk-summary-proposal.v1', generationParameters: null,
  runtimeBuildRevision: 'sha256:runtime', latencyMs: null, usage: null,
});
const evidence = {
  sourceIdentityKey: 'deeds-web-app:src/a.ts',
  chunkRowId: 'row-a', chunkId: 'chunk-a', canonicalChunkId: 'canonical-a', sourceRef: 'src/a.ts',
  sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', revisionStatus: 'PROVEN', bindingStatus: 'PROVEN',
  inputTextSha256: 'sha256:input', inputByteLength: 24, bindingChecksum: 'sha256:binding', packetKey: null,
};

function repositoryFor({ current = evidence, target = { summaryText: null, summaryProvenance: null }, writeRowCount = 1 } = {}) {
  const events = [];
  return {
    events,
    async transaction(run) {
      events.push('BEGIN');
      try { const result = await run({
        async getAdmissionEvidence() { events.push('READ_EVIDENCE'); return current; },
        async readCurrentTarget() { events.push('READ_TARGET'); return target; },
        async setSummaryIfEmpty(input) { events.push(['CONDITIONAL_WRITE', input]); return { rowCount: writeRowCount }; },
      }); events.push('COMMIT'); return result;
      } catch (error) { events.push('ROLLBACK'); throw error; }
    },
  };
}

test('admits an exact-lineage clean proposal through one transaction and writes provenance envelope', async () => {
  const repository = repositoryFor();
  const result = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository, admittedAt: '2026-09-25T00:00:00.000Z' });
  assert.equal(result.status, 'ADMITTED');
  assert.deepEqual(repository.events.map((event) => Array.isArray(event) ? event[0] : event), ['BEGIN', 'READ_EVIDENCE', 'READ_TARGET', 'CONDITIONAL_WRITE', 'COMMIT']);
  const write = repository.events.find(Array.isArray)[1];
  assert.equal(write.summaryProvenance.schema, 'atlas.summary-provenance.v1');
  assert.equal(write.summaryProvenance.admission.status, 'ADMITTED');
  assert.equal(write.summaryProvenance.modelRevision, null);
  assert.equal(write.summaryProvenance.producerRevision, 'sha256:runtime');
});

test('fails closed on changed revision, stale input digest, contamination, and occupied slot', async () => {
  const changed = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: repositoryFor({ current: { ...evidence, sourceRevision: 'sha256:other' } }) });
  assert.equal(changed.status, 'BLOCKED_IDENTITY_CHANGED');
  const wrongSourceNamespace = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: repositoryFor({ current: { ...evidence, sourceIdentityKey: 'another-repo:src/a.ts' } }) });
  assert.equal(wrongSourceNamespace.status, 'BLOCKED_IDENTITY_CHANGED');
  const missingBindingChecksum = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: repositoryFor({ current: { ...evidence, bindingChecksum: 'sha256:other' } }) });
  assert.equal(missingBindingChecksum.status, 'BLOCKED_LINEAGE_MISSING');
  const stale = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: repositoryFor({ current: { ...evidence, inputTextSha256: 'sha256:other' } }) });
  assert.equal(stale.status, 'BLOCKED_STALE_DIGEST');
  const contaminatedProposal = buildSummaryProposalV1({ row, sourceIdentityKey: 'deeds-web-app:src/a.ts', summary: 'Example of a good summary: this is only a prompt scaffold that should be rejected.', model: { id: 'ornith-1.5-9b' }, promptRevision: 'sha256:prompt', schemaRevision: 'atlas.chunk-summary-proposal.v1', generationParameters: null, runtimeBuildRevision: null, latencyMs: null, usage: null });
  const contaminated = await admitCanonicalChunkSummaryV1({ proposal: contaminatedProposal, repository: repositoryFor() });
  assert.equal(contaminated.status, 'BLOCKED_CONTAMINATION');
  const occupied = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: repositoryFor({ target: { summaryText: 'existing', summaryProvenance: null } }) });
  assert.equal(occupied.status, 'ALREADY_PRESENT');
});

test('rejects a write race and malformed proposals without allowing a non-transactional repository', async () => {
  const raced = await admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: repositoryFor({ writeRowCount: 0 }) });
  assert.equal(raced.status, 'WRITE_RACE_OR_STALE_TARGET');
  assert.equal((await admitCanonicalChunkSummaryV1({ proposal: { ...proposal(), proposalChecksum: 'sha256:bad' }, repository: repositoryFor() })).status, 'BLOCKED_STALE_DIGEST');
  await assert.rejects(() => admitCanonicalChunkSummaryV1({ proposal: proposal(), repository: {} }), /TRANSACTIONAL_REPOSITORY_REQUIRED/);
});
