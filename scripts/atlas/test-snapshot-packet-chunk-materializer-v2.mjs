#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {
  classifyPacketRows,
  classifySourceMaterializerPlan,
  languageForSourceRef,
  matchObservationToCanonicalChunkRows,
  sourceDigestMatches,
} from './lib/snapshot-packet-chunk-materializer-v1.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const source = Buffer.from('function a() {\n  return 1;\n}\nfunction b() {\n  return a();\n}\n', 'utf8');
const sourceHash = hash(source);
const membership = {
  repository_id: 'deeds-web-app',
  repository_relative_path: 'src/a.ts',
  source_ref: 'src/a.ts',
  code_source_revision: `sha256:${sourceHash}`,
  content_hash: sourceHash,
  workspace_revision: 'sha256:' + 'a'.repeat(64),
  workspace_id: '11111111-1111-1111-1111-111111111111',
};

function exactChunkMatch() {
  return [{
    classification: 'EXACT_EXISTING_CHUNK',
    candidates: [{
      canonicalChunkId: 'chunk-a',
      chunkRowId: '11111111-1111-1111-1111-111111111111',
      matchBasis: 'EXACT_CHUNK_CONTENT_HASH',
    }],
  }];
}

test('language detection covers supported code sources', () => {
  assert.equal(languageForSourceRef('src/a.ts'), 'typescript');
  assert.equal(languageForSourceRef('src/a.mjs'), 'javascript');
  assert.equal(languageForSourceRef('src/a.py'), 'python');
  assert.equal(languageForSourceRef('README.md'), null);
});

test('sealed source bytes match whole-source membership digest', () => {
  const result = sourceDigestMatches(source, membership);
  assert.equal(result.contentHashMatches, true);
  assert.equal(result.sourceRevisionMatches, true);
});

test('sidecar chunk maps only to existing canonical chunk identity', () => {
  const text = 'function a() {\n  return 1;\n}';
  const start = source.indexOf(Buffer.from(text));
  const result = matchObservationToCanonicalChunkRows(
    source,
    { start_byte: start, end_byte: start + Buffer.byteLength(text), start_line: 0, end_line: 2, upstream_chunk_id: 'chunk-a' },
    [{
      id: '11111111-1111-1111-1111-111111111111',
      chunk_id: 'chunk-a',
      content: text,
      content_hash: hash(Buffer.from(text)),
      line_start: 1,
      line_end: 3,
    }],
  );
  assert.equal(result.classification, 'EXACT_EXISTING_CHUNK');
  assert.equal(result.candidates[0].canonicalChunkId, 'chunk-a');
});

test('sidecar-only chunk identity is never promoted', () => {
  const text = 'function a() {\n  return 1;\n}';
  const start = source.indexOf(Buffer.from(text));
  const result = matchObservationToCanonicalChunkRows(
    source,
    { start_byte: start, end_byte: start + Buffer.byteLength(text), upstream_chunk_id: 'sidecar-only-id' },
    [],
  );
  assert.equal(result.classification, 'CHUNK_MATERIALIZATION_REQUIRED');
  assert.deepEqual(result.candidates, []);
});

test('packet selection is file-granularity and does not compare packet content_hash to whole-source digest', () => {
  const result = classifyPacketRows(membership, [{
    packet_key: 'packet:file',
    source_revision: null,
    content_hash: 'not-the-source-digest',
  }]);
  assert.equal(result.classification, 'UNIQUE_FILE_PACKET_REVISION_UNPROVEN');
  assert.equal(result.exact[0].packetKey, 'packet:file');
});

test('exact packet source revision is preferred and proven', () => {
  const result = classifyPacketRows(membership, [{
    packet_key: 'packet:file',
    source_revision: sourceHash,
  }]);
  assert.equal(result.classification, 'EXACT_CURRENT_FILE_PACKET');
});

test('explicit packet revision conflict fails closed', () => {
  const result = classifyPacketRows(membership, [{
    packet_key: 'packet:file',
    source_revision: hash(Buffer.from('old source')),
  }]);
  assert.equal(result.classification, 'CONFLICTING_PACKET_SOURCE_REVISION');
  assert.equal(result.exact.length, 0);
});

test('multiple packet keys for one source fail closed', () => {
  const result = classifyPacketRows(membership, [
    { packet_key: 'packet:a', source_revision: null },
    { packet_key: 'packet:b', source_revision: null },
  ]);
  assert.equal(result.classification, 'AMBIGUOUS_FILE_PACKET_IDENTITY');
});

test('ready lineage fill uses workspace identity, not repository id, as source namespace', () => {
  const packetResult = classifyPacketRows(membership, [{ packet_key: 'packet:file', source_revision: null }]);
  const plan = classifySourceMaterializerPlan({
    membership,
    packetResult,
    observationMatches: exactChunkMatch(),
    existingLineageRows: [],
  });
  assert.equal(plan.classification, 'READY_LINEAGE_FILL_EXISTING_PACKET_EXISTING_CHUNKS');
  assert.equal(plan.sourceNamespace, `workspace:${membership.workspace_id}`);
  assert.equal(plan.proposedMemberships[0].revisionStatus, 'PROVEN');
  assert.equal(plan.proposedMemberships[0].sourceRevision, membership.code_source_revision);
});

test('matching existing lineage is already complete', () => {
  const packetResult = classifyPacketRows(membership, [{ packet_key: 'packet:file', source_revision: sourceHash }]);
  const plan = classifySourceMaterializerPlan({
    membership,
    packetResult,
    observationMatches: exactChunkMatch(),
    existingLineageRows: [{
      packet_key: 'packet:file',
      canonical_chunk_id: 'chunk-a',
      chunk_row_id: '11111111-1111-1111-1111-111111111111',
      source_ref: membership.source_ref,
      source_namespace: `workspace:${membership.workspace_id}`,
      source_revision: membership.code_source_revision,
      revision_status: 'PROVEN',
    }],
  });
  assert.equal(plan.classification, 'ALREADY_COMPLETE_FOR_OBSERVED_CHUNKS');
  assert.equal(plan.alreadyPresentCount, 1);
});

test('existing lineage with stale revision blocks instead of being treated as present', () => {
  const packetResult = classifyPacketRows(membership, [{ packet_key: 'packet:file', source_revision: sourceHash }]);
  const plan = classifySourceMaterializerPlan({
    membership,
    packetResult,
    observationMatches: exactChunkMatch(),
    existingLineageRows: [{
      packet_key: 'packet:file',
      canonical_chunk_id: 'chunk-a',
      chunk_row_id: '11111111-1111-1111-1111-111111111111',
      source_ref: membership.source_ref,
      source_namespace: `workspace:${membership.workspace_id}`,
      source_revision: 'sha256:' + 'b'.repeat(64),
      revision_status: 'PROVEN',
    }],
  });
  assert.equal(plan.classification, 'BLOCKED_AMBIGUOUS_OR_UNPROVEN');
  assert.ok(plan.blockers.includes('EXISTING_LINEAGE_CONFLICT'));
});

test('missing workspace namespace fails closed', () => {
  const packetResult = classifyPacketRows(membership, [{ packet_key: 'packet:file', source_revision: null }]);
  const plan = classifySourceMaterializerPlan({
    membership: { ...membership, workspace_id: null },
    packetResult,
    observationMatches: exactChunkMatch(),
    existingLineageRows: [],
  });
  assert.ok(plan.blockers.includes('SOURCE_NAMESPACE_UNPROVEN'));
  assert.equal(plan.classification, 'BLOCKED_AMBIGUOUS_OR_UNPROVEN');
});
