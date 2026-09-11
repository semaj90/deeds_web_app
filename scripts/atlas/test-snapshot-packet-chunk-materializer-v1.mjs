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
  repository_id: 'repo:root',
  repository_relative_path: 'src/a.ts',
  source_ref: 'src/a.ts',
  code_source_revision: `sha256:${sourceHash}`,
  content_hash: sourceHash,
  workspace_revision: 'sha256:' + 'a'.repeat(64),
};

test('language detection covers code sources and rejects unsupported', () => {
  assert.equal(languageForSourceRef('src/a.ts'), 'typescript');
  assert.equal(languageForSourceRef('src/a.mjs'), 'javascript');
  assert.equal(languageForSourceRef('src/a.rs'), 'rust');
  assert.equal(languageForSourceRef('README.md'), null);
});

test('source bytes must match both membership content hash and source revision', () => {
  const result = sourceDigestMatches(source, membership);
  assert.equal(result.contentHashMatches, true);
  assert.equal(result.sourceRevisionMatches, true);
  const bad = sourceDigestMatches(Buffer.from('changed', 'utf8'), membership);
  assert.equal(bad.contentHashMatches, false);
  assert.equal(bad.sourceRevisionMatches, false);
});

test('sidecar observation maps only to an existing exact chunk row', () => {
  const text = 'function a() {\n  return 1;\n}';
  const start = source.indexOf(Buffer.from(text));
  const end = start + Buffer.byteLength(text);
  const result = matchObservationToCanonicalChunkRows(
    source,
    { start_byte: start, end_byte: end, start_line: 0, end_line: 2, upstream_chunk_id: 'chunk-a' },
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
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].canonicalChunkId, 'chunk-a');
  assert.equal(result.candidates[0].matchBasis, 'UPSTREAM_ID_PLUS_EXACT_CONTENT');
});

test('missing canonical chunk does not mint a sidecar-derived chunk id', () => {
  const text = 'function a() {\n  return 1;\n}';
  const start = source.indexOf(Buffer.from(text));
  const end = start + Buffer.byteLength(text);
  const result = matchObservationToCanonicalChunkRows(
    source,
    { start_byte: start, end_byte: end, upstream_chunk_id: 'sidecar-only-id' },
    [],
  );
  assert.equal(result.classification, 'CHUNK_MATERIALIZATION_REQUIRED');
  assert.deepEqual(result.candidates, []);
});

test('duplicate exact chunk rows fail closed as ambiguous', () => {
  const text = 'function a() {\n  return 1;\n}';
  const start = source.indexOf(Buffer.from(text));
  const end = start + Buffer.byteLength(text);
  const rows = [1, 2].map((n) => ({
    id: `${n}`.repeat(8) + '-1111-1111-1111-111111111111',
    chunk_id: `chunk-${n}`,
    content: text,
    content_hash: hash(Buffer.from(text)),
    line_start: 1,
    line_end: 3,
  }));
  const result = matchObservationToCanonicalChunkRows(source, { start_byte: start, end_byte: end }, rows);
  assert.equal(result.classification, 'AMBIGUOUS_EXISTING_CHUNK');
  assert.equal(result.candidates.length, 2);
});

test('packet must match the current source content hash', () => {
  const current = classifyPacketRows(membership, [{ packet_key: 'packet:current', content_hash: sourceHash }]);
  assert.equal(current.classification, 'EXACT_CURRENT_PACKET');
  assert.equal(current.exact[0].packetKey, 'packet:current');

  const stale = classifyPacketRows(membership, [{ packet_key: 'packet:stale', content_hash: hash(Buffer.from('old')) }]);
  assert.equal(stale.classification, 'CURRENT_PACKET_MATERIALIZATION_REQUIRED');
});

test('complete existing packet/chunk pair plans only missing lineage', () => {
  const observationMatches = [{
    classification: 'EXACT_EXISTING_CHUNK',
    candidates: [{ canonicalChunkId: 'chunk-a', chunkRowId: '11111111-1111-1111-1111-111111111111', matchBasis: 'EXACT_CHUNK_CONTENT_HASH' }],
  }];
  const packetResult = { classification: 'EXACT_CURRENT_PACKET', exact: [{ packetKey: 'packet:current' }] };
  const plan = classifySourceMaterializerPlan({ membership, packetResult, observationMatches, existingLineageRows: [] });
  assert.equal(plan.classification, 'READY_LINEAGE_FILL_EXISTING_PACKET_EXISTING_CHUNKS');
  assert.equal(plan.missingLineageCount, 1);
  assert.equal(plan.proposedMemberships[0].canonicalChunkId, 'chunk-a');
});

test('missing chunk is classified as a materializer need, never a lineage-fill candidate', () => {
  const observationMatches = [{ classification: 'CHUNK_MATERIALIZATION_REQUIRED', candidates: [] }];
  const packetResult = { classification: 'EXACT_CURRENT_PACKET', exact: [{ packetKey: 'packet:current' }] };
  const plan = classifySourceMaterializerPlan({ membership, packetResult, observationMatches, existingLineageRows: [] });
  assert.equal(plan.classification, 'NEEDS_CURRENT_CHUNK_MATERIALIZER');
  assert.equal(plan.proposedMembershipCount, 0);
});
