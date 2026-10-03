import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCandidateEligibilityV1,
  classifyQdrantCandidatePointV1,
  compareOrdinalSets,
  compileCandidateEligibilityBitmapV1,
  resolveQdrantCandidateOrdinalsV1,
  toPostgresCandidateRecordV1,
} from './audit-topology-pg-qdrant-eligibility-v1.mjs';

const candidates = Array.from({ length: 10 }, (_, candidateOrdinal) => ({ candidateOrdinal }));
const dispositions = candidates.map(({ candidateOrdinal }) => ({
  candidateOrdinal,
  status: [0, 3, 9].includes(candidateOrdinal) ? 'ELIGIBLE' : 'BLOCKED',
}));
const exactEligibilityEvidence = {
  candidateOrdinal: 0,
  packetKey: 'packet:fixture',
  sourceRef: 'src/fixture.ts',
  sourceRevision: 'sha256:source',
  workspaceRevision: 'sha256:workspace',
  contentDigest: 'a'.repeat(64),
  vectorRows: 1,
  eligibleVectorRows: 1,
  exactLineageRows: 1,
  exactWorkspaceBindings: 1,
};

test('eligibility bitmap is deterministic, ordinal-bound, and non-authoritative', () => {
  const first = compileCandidateEligibilityBitmapV1(candidates, dispositions);
  const second = compileCandidateEligibilityBitmapV1(candidates, dispositions);
  assert.deepEqual(first, second);
  assert.equal(first.bitmapBase64, 'CQI=');
  assert.deepEqual(first.eligibleOrdinals, [0, 3, 9]);
  assert.equal(first.canonicalAuthority, false);
});

test('eligibility bitmap rejects reordered candidate ordinals', () => {
  assert.throws(
    () => compileCandidateEligibilityBitmapV1([{ candidateOrdinal: 1 }, { candidateOrdinal: 0 }], [
      { candidateOrdinal: 0, status: 'ELIGIBLE' },
      { candidateOrdinal: 1, status: 'ELIGIBLE' },
    ]),
    /CANDIDATE_ELIGIBILITY_ORDINAL_ORDER_MISMATCH:0/,
  );
});

test('eligibility bitmap rejects dispositions bound to another ordinal', () => {
  assert.throws(
    () => compileCandidateEligibilityBitmapV1([{ candidateOrdinal: 0 }], [
      { candidateOrdinal: 1, status: 'ELIGIBLE' },
    ]),
    /CANDIDATE_ELIGIBILITY_DISPOSITION_ORDINAL_MISMATCH:0/,
  );
});

test('PostgreSQL eligibility requires exactly one current workspace-source binding', () => {
  const disposition = classifyCandidateEligibilityV1({
    ...exactEligibilityEvidence,
    exactWorkspaceBindings: 0,
  });
  assert.equal(disposition.status, 'BLOCKED');
  assert.deepEqual(disposition.blockers, ['EXACT_WORKSPACE_SOURCE_BINDING_MISSING']);
});

test('PostgreSQL eligibility rejects ambiguous canonical vector and lineage joins', () => {
  const disposition = classifyCandidateEligibilityV1({
    ...exactEligibilityEvidence,
    vectorRows: 2,
    exactLineageRows: 2,
  });
  assert.equal(disposition.status, 'BLOCKED');
  assert.deepEqual(disposition.blockers, ['VECTOR_ROW_AMBIGUOUS', 'EXACT_LINEAGE_AMBIGUOUS']);
});

test('Qdrant comparison is exact by ordinal set, independent of response ordering', () => {
  assert.deepEqual(compareOrdinalSets([4, 1, 3], [3, 4, 1]), {
    equal: true,
    expectedOnly: [],
    observedOnly: [],
  });
  assert.deepEqual(compareOrdinalSets([1, 3], [1, 4]), {
    equal: false,
    expectedOnly: [3],
    observedOnly: [4],
  });
});

test('PostgreSQL bulk records use exact JSON field names expected by jsonb_to_recordset', () => {
  assert.deepEqual(toPostgresCandidateRecordV1({
    candidateOrdinal: 5,
    canonicalChunkId: 'chunk:fixture',
    chunkRowId: '00000000-0000-4000-8000-000000000001',
    packetKey: 'packet:fixture',
    sourceRef: 'src/fixture.ts',
    sourceRevision: 'sha256:source',
  }), {
    candidate_ordinal: 5,
    canonical_chunk_id: 'chunk:fixture',
    chunk_row_id: '00000000-0000-4000-8000-000000000001',
    packet_key: 'packet:fixture',
    source_ref: 'src/fixture.ts',
    source_revision: 'sha256:source',
  });
});

test('Qdrant point resolves only through exact canonical, packet, source, and revision identity', () => {
  const workspaceRevision = 'sha256:workspace';
  const key = ['chunk:fixture', 'packet:fixture', 'src/fixture.ts', 'sha256:source', workspaceRevision].join('\u0000');
  const identities = new Map([[key, [7]]]);
  const point = {
    payload: {
      canonical_id: 'chunk:fixture',
      packet_key: 'packet:fixture',
      source_ref: 'src/fixture.ts',
      source_revision: 'sha256:source',
      workspace_revision: workspaceRevision,
    },
  };
  assert.deepEqual(resolveQdrantCandidateOrdinalsV1(point, identities, workspaceRevision), [7]);
  assert.deepEqual(resolveQdrantCandidateOrdinalsV1(point, identities, 'sha256:other'), []);
  assert.deepEqual(resolveQdrantCandidateOrdinalsV1({ payload: { ...point.payload, source_ref: 'src/other.ts' } }, identities, workspaceRevision), []);
});

test('Qdrant projection identity reports candidate collisions rather than choosing an ordinal', () => {
  const workspaceRevision = 'sha256:workspace';
  const key = ['chunk:fixture', 'packet:fixture', 'src/fixture.ts', 'sha256:source', workspaceRevision].join('\u0000');
  const point = {
    payload: {
      canonical_id: 'chunk:fixture',
      packet_key: 'packet:fixture',
      source_ref: 'src/fixture.ts',
      source_revision: 'sha256:source',
      workspace_revision: workspaceRevision,
    },
  };
  assert.deepEqual(resolveQdrantCandidateOrdinalsV1(point, new Map([[key, [3, 8]]]), workspaceRevision), [3, 8]);
});

test('Qdrant identity diagnostics distinguish absent lineage from stale revisions', () => {
  const workspaceRevision = 'sha256:workspace';
  const key = ['chunk:fixture', 'packet:fixture', 'src/fixture.ts', 'sha256:source', workspaceRevision].join('\u0000');
  const identities = new Map([[key, [7]]]);
  const payload = {
    canonical_id: 'chunk:fixture',
    packet_key: 'packet:fixture',
    source_ref: 'src/fixture.ts',
    source_revision: 'sha256:source',
    workspace_revision: workspaceRevision,
  };

  assert.deepEqual(classifyQdrantCandidatePointV1(null, identities, workspaceRevision), {
    disposition: 'PAYLOAD_NOT_OBJECT',
    ordinals: [],
  });
  assert.equal(classifyQdrantCandidatePointV1({ payload: { ...payload, canonical_id: null } }, identities, workspaceRevision).disposition, 'MISSING_CANONICAL_ID');
  assert.equal(classifyQdrantCandidatePointV1({ payload: { ...payload, packet_key: '' } }, identities, workspaceRevision).disposition, 'MISSING_PACKET_KEY');
  assert.equal(classifyQdrantCandidatePointV1({ payload: { ...payload, workspace_revision: 'sha256:old' } }, identities, workspaceRevision).disposition, 'WORKSPACE_REVISION_MISMATCH');
  assert.equal(classifyQdrantCandidatePointV1({ payload: { ...payload, source_ref: 'src/other.ts' } }, identities, workspaceRevision).disposition, 'EXACT_IDENTITY_NOT_IN_CANDIDATE_MAP');
  assert.deepEqual(classifyQdrantCandidatePointV1({ payload }, identities, workspaceRevision), {
    disposition: 'EXACT_IDENTITY_MATCH',
    ordinals: [7],
  });
});
