import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeCandidateOrdinalMap } from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { qualifyChunkSourceSpanV1 } from './chunk-source-span-v1.mjs';
import { SOURCE_BINDING_READONLY_SQL_V1 } from './source-binding-readonly-fetch-v1.mjs';
import { resolveSymbolTocChunkOrdinalsV1, verifySymbolTocOwnerReadbackFromPostgresV1, verifySymbolTocOwnerReadbackV1 } from './symbol-toc-owner-readback-v1.mts';

const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const workspaceRevision = `sha256:${'a'.repeat(64)}`;

async function fixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-symbol-toc-owner-'));
  const sourceRef = 'src/runner.ts';
  const sourceBytes = Buffer.from('function run() {}\n', 'utf8');
  const sourceRevision = digest(sourceBytes);
  await mkdir(path.join(repoRoot, 'src'));
  await writeFile(path.join(repoRoot, sourceRef), sourceBytes);
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `sha256:${'b'.repeat(64)}`,
    workspaceRevision,
    producerRevision: 'fixture:symbol-toc-owner-v1',
    candidates: [{
      canonicalId: 'candidate:runner',
      packetKey: 'packet:runner',
      sourceRef,
      treeNodeId: null,
      symbolVersionId: 'symbol-version:runner',
      workspaceRevision,
      sourceRevision,
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [],
      representationBindings: [],
    }],
  });
  const symbol = {
    symbol_version_id: 'symbol-version:runner',
    stable_symbol_id: 'symbol:runner',
    packet_key: 'packet:runner',
    source_ref: sourceRef,
    source_revision: sourceRevision,
    workspace_revision: workspaceRevision,
    symbol_kind: 'function',
    qualified_name: 'run',
    byte_start: 0,
    byte_end: Buffer.byteLength('function run() {}', 'utf8'),
  };
  const sourceBinding = {
    sourceRef,
    workspaceRevision,
    sourceRevision,
    contentDigest: sourceRevision,
    bindingChecksum: `sha256:${'c'.repeat(64)}`,
    producerRevision: 'fixture:symbol-toc-owner-v1',
    byteLength: sourceBytes.length,
    canonicalAuthority: false as const,
  };
  return { repoRoot, ordinalMap, symbol, sourceBinding };
}

test('joins the verified candidate ordinal to the safe source reader without admitting evidence', async () => {
  const input = await fixture();
  try {
    const result = await verifySymbolTocOwnerReadbackV1(input);
    assert.equal(result.status, 'SOURCE_READBACK_MATCH_NOT_ADMITTED');
    if (result.status !== 'SOURCE_READBACK_MATCH_NOT_ADMITTED') return;
    assert.equal(result.row.candidateOrdinal, 0);
    assert.equal(result.canonicalAuthority, false);
    assert.equal(result.evidenceAdmitted, false);
    assert.equal(result.sourceBindingProducerRevision, 'fixture:symbol-toc-owner-v1');
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});

test('rejects tampered maps and stale source bindings', async () => {
  const input = await fixture();
  try {
    const tampered = await verifySymbolTocOwnerReadbackV1({ ...input, ordinalMap: { ...input.ordinalMap, ordinalMapChecksum: '0'.repeat(64) } });
    assert.equal(tampered.reason, 'CANDIDATE_ORDINAL_MAP_INVALID');
    const stale = await verifySymbolTocOwnerReadbackV1({ ...input, sourceBinding: { ...input.sourceBinding, sourceRevision: `sha256:${'d'.repeat(64)}` } });
    assert.equal(stale.reason, 'SOURCE_BINDING_CONTEXT_MISMATCH');
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});

test('rejects an exact source revision mismatch and a path outside the workspace', async () => {
  const input = await fixture();
  try {
    const staleSymbol = { ...input.symbol, source_revision: `sha256:${'e'.repeat(64)}` };
    const stale = await verifySymbolTocOwnerReadbackV1({ ...input, symbol: staleSymbol });
    assert.equal(stale.reason, 'SOURCE_BINDING_CONTEXT_MISMATCH');
    const escapedSourceRef = '../outside.ts';
    const { schema: candidateSchema, candidateOrdinal, candidateSnapshotRevision, ...candidateInput } = input.ordinalMap.candidates[0];
    const escapedMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: input.ordinalMap.candidateSnapshotRevision,
      workspaceRevision,
      producerRevision: 'fixture:symbol-toc-owner-v1',
      candidates: [{ ...candidateInput, sourceRef: escapedSourceRef }],
    });
    const escapedBinding = { ...input.sourceBinding, sourceRef: escapedSourceRef };
    const escaped = await verifySymbolTocOwnerReadbackV1({ ...input, ordinalMap: escapedMap, sourceBinding: escapedBinding, symbol: { ...input.symbol, source_ref: escapedSourceRef } });
    assert.equal(escaped.reason, 'EXACT_SOURCE_READER_READBACK_UNAVAILABLE');
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});

test('fetches the exact binding through the existing read-only PostgreSQL owner', async () => {
  const input = await fixture();
  try {
    const statements: string[] = [];
    const bindingRow = {
      repo_id: 'repo:root',
      workspace_revision: workspaceRevision,
      canonical_source_ref: input.symbol.source_ref,
      source_revision: input.symbol.source_revision,
      content_digest: input.symbol.source_revision.slice('sha256:'.length),
      binding_checksum: input.sourceBinding.bindingChecksum,
      byte_length: String(input.sourceBinding.byteLength),
      producer_revision: 'fixture:symbol-toc-owner-v1',
    };
    const result = await verifySymbolTocOwnerReadbackFromPostgresV1({
      ordinalMap: input.ordinalMap,
      symbol: input.symbol,
      repoRoot: input.repoRoot,
      connect: async () => ({
        query: async (sql) => {
          statements.push(sql);
          if (sql.includes('FROM public.atlas_packets')) return { rows: [{ packet_key: input.symbol.packet_key, source_ref: input.symbol.source_ref, source_revision: input.symbol.source_revision }] };
          if (sql === SOURCE_BINDING_READONLY_SQL_V1) return { rows: [bindingRow] };
          return { rows: [] };
        },
        release: () => statements.push('RELEASE'),
      }),
    });

    assert.equal(result.status, 'SOURCE_READBACK_MATCH_NOT_ADMITTED');
    assert.equal(statements.filter((sql) => sql.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')).length, 1);
    assert.ok(statements.some((sql) => sql.includes('FROM public.atlas_packets')));
    assert.ok(statements.includes(SOURCE_BINDING_READONLY_SQL_V1));
    assert.ok(statements.includes('ROLLBACK'));
    assert.ok(statements.includes('RELEASE'));
    assert.equal(statements.some((sql) => /\b(INSERT|UPDATE|DELETE|COMMIT)\b/i.test(sql)), false);
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});

test('blocks absent or ambiguous database bindings', async () => {
  const input = await fixture();
  try {
    const missingBinding = async () => ({
      query: async (sql: string) => sql.includes('FROM public.atlas_packets')
        ? { rows: [{ packet_key: input.symbol.packet_key, source_ref: input.symbol.source_ref, source_revision: input.symbol.source_revision }] }
        : sql === SOURCE_BINDING_READONLY_SQL_V1 ? { rows: [] } : { rows: [] },
      release: () => undefined,
    });
    assert.equal((await verifySymbolTocOwnerReadbackFromPostgresV1({ ...input, connect: missingBinding })).reason, 'SOURCE_BINDING_NOT_FOUND');
    const duplicateRow = {
      repo_id: 'repo:root', workspace_revision: workspaceRevision,
      canonical_source_ref: input.symbol.source_ref, source_revision: input.symbol.source_revision,
      content_digest: input.symbol.source_revision.slice('sha256:'.length),
      binding_checksum: input.sourceBinding.bindingChecksum, byte_length: String(input.sourceBinding.byteLength),
    };
    const ambiguousBinding = async () => ({
      query: async (sql: string) => sql.includes('FROM public.atlas_packets')
        ? { rows: [{ packet_key: input.symbol.packet_key, source_ref: input.symbol.source_ref, source_revision: input.symbol.source_revision }] }
        : sql === SOURCE_BINDING_READONLY_SQL_V1 ? { rows: [duplicateRow, duplicateRow] } : { rows: [] },
      release: () => undefined,
    });
    assert.equal((await verifySymbolTocOwnerReadbackFromPostgresV1({ ...input, connect: ambiguousBinding })).reason, 'SOURCE_BINDING_AMBIGUOUS');
    const missingPacket = async () => ({
      query: async (sql: string) => sql.includes('FROM public.atlas_packets') ? { rows: [] } : { rows: [duplicateRow] },
      release: () => undefined,
    });
    assert.equal((await verifySymbolTocOwnerReadbackFromPostgresV1({ ...input, connect: missingPacket })).reason, 'BLOCKED_PACKET_NOT_FOUND');
    const wrongPacketSource = async () => ({
      query: async (sql: string) => sql.includes('FROM public.atlas_packets')
        ? { rows: [{ packet_key: input.symbol.packet_key, source_ref: 'src/other.ts', source_revision: input.symbol.source_revision }] }
        : { rows: [duplicateRow] },
      release: () => undefined,
    });
    assert.equal((await verifySymbolTocOwnerReadbackFromPostgresV1({ ...input, connect: wrongPacketSource })).reason, 'BLOCKED_PACKET_SOURCE_REF_MISMATCH');
    const stalePacketRevision = async () => ({
      query: async (sql: string) => sql.includes('FROM public.atlas_packets')
        ? { rows: [{ packet_key: input.symbol.packet_key, source_ref: input.symbol.source_ref, source_revision: `sha256:${'f'.repeat(64)}` }] }
        : { rows: [duplicateRow] },
      release: () => undefined,
    });
    assert.equal((await verifySymbolTocOwnerReadbackFromPostgresV1({ ...input, connect: stalePacketRevision })).reason, 'BLOCKED_PACKET_SOURCE_REVISION_MISMATCH');
    const duplicatePacket = async () => ({
      query: async (sql: string) => sql.includes('FROM public.atlas_packets')
        ? { rows: [{ packet_key: input.symbol.packet_key, source_ref: input.symbol.source_ref, source_revision: input.symbol.source_revision }, { packet_key: input.symbol.packet_key, source_ref: input.symbol.source_ref, source_revision: input.symbol.source_revision }] }
        : { rows: [duplicateRow] },
      release: () => undefined,
    });
    assert.equal((await verifySymbolTocOwnerReadbackFromPostgresV1({ ...input, connect: duplicatePacket })).reason, 'BLOCKED_PACKET_KEY_AMBIGUOUS');
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});

test('crosswalks a symbol to multiple exact source-matched chunk ordinals without admission', async () => {
  const sourceBytes = Buffer.from('BEFORE\nclass Sample { alpha beta gamma }\nAFTER\n', 'utf8');
  const symbolText = Buffer.from('class Sample { alpha beta gamma }', 'utf8');
  const byteStart = sourceBytes.indexOf(symbolText);
  const byteEnd = byteStart + symbolText.length;
  const sourceRevision = digest(sourceBytes);
  const symbolVersionId = 'symbol-version:sample';
  const canonicalIds = ['chunk:alpha', 'chunk:beta', 'chunk:after', 'chunk:missing'];
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `sha256:${'f'.repeat(64)}`,
    workspaceRevision,
    producerRevision: 'fixture:symbol-chunk-crosswalk-v1',
    candidates: canonicalIds.map((canonicalId, index) => ({
      canonicalId,
      packetKey: 'packet:sample',
      sourceRef: 'src/sample.ts',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision,
      sourceRevision,
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [`chunk:${index}`],
      representationBindings: [],
    })),
  });
  const symbol = {
    symbol_version_id: symbolVersionId,
    stable_symbol_id: 'stable-symbol:sample',
    packet_key: 'packet:sample',
    source_ref: 'src/sample.ts',
    source_revision: sourceRevision,
    workspace_revision: workspaceRevision,
    symbol_kind: 'class',
    qualified_name: 'Sample',
    byte_start: byteStart,
    byte_end: byteEnd,
  };
  const chunks = [
    { canonicalChunkId: 'chunk:alpha', contentBytes: Buffer.from('class Sample { alpha', 'utf8') },
    { canonicalChunkId: 'chunk:beta', contentBytes: Buffer.from('alpha beta gamma }', 'utf8') },
    { canonicalChunkId: 'chunk:after', contentBytes: Buffer.from('AFTER', 'utf8') },
    { canonicalChunkId: 'chunk:missing', contentBytes: Buffer.from('not present in the source', 'utf8') },
  ];

  const result = resolveSymbolTocChunkOrdinalsV1({ ordinalMap, symbol, sourceBytes, chunks });
  assert.equal(result.status, 'SYMBOL_CHUNK_CROSSWALK_NOT_ADMITTED');
  if (result.status !== 'SYMBOL_CHUNK_CROSSWALK_NOT_ADMITTED') return;
  assert.deepEqual(result.matches.map((match) => match.candidateOrdinal), [1, 2]);
  assert.deepEqual(result.unresolvedChunks.map((item) => item.reason), ['CHUNK_BYTES_NOT_FOUND_IN_SOURCE']);
  assert.deepEqual(result.unresolvedChunks.map(({ chunkByteLength, chunkChecksum, sourceSpanPresent }) => ({
    chunkByteLength,
    chunkChecksum,
    sourceSpanPresent,
  })), [{
    chunkByteLength: Buffer.byteLength('not present in the source'),
    chunkChecksum: digest(Buffer.from('not present in the source')).slice('sha256:'.length),
    sourceSpanPresent: false,
  }]);
  assert.deepEqual(result.nonOverlappingChunks.map((item) => item.canonicalChunkId), ['chunk:after']);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.evidenceAdmitted, false);
});

test('blocks stale source bytes, an incomplete chunk cohort, and repeated chunk text', async () => {
  const sourceBytes = Buffer.from('class Repeated { body }\nclass Repeated { body }\n', 'utf8');
  const start = sourceBytes.indexOf(Buffer.from('class Repeated', 'utf8'));
  const end = sourceBytes.indexOf(Buffer.from('}\n', 'utf8')) + 1;
  const sourceRevision = digest(sourceBytes);
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `sha256:${'e'.repeat(64)}`,
    workspaceRevision,
    producerRevision: 'fixture:symbol-chunk-crosswalk-v1',
    candidates: [{
      canonicalId: 'chunk:repeat', packetKey: 'packet:repeat', sourceRef: 'src/repeated.ts',
      treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision,
      graphRevision: null, semanticRevision: null, degradedIdentity: false,
      evidenceRefs: ['chunk:repeat'], representationBindings: [],
    }],
  });
  const symbol = {
    symbol_version_id: 'symbol-version:repeat', stable_symbol_id: 'stable-symbol:repeat',
    packet_key: 'packet:repeat', source_ref: 'src/repeated.ts', source_revision: sourceRevision,
    workspace_revision: workspaceRevision, symbol_kind: 'class', qualified_name: 'Repeated',
    byte_start: start, byte_end: end,
  };
  const stale = resolveSymbolTocChunkOrdinalsV1({ ordinalMap, symbol, sourceBytes: Buffer.from('stale'), chunks: [{ canonicalChunkId: 'chunk:repeat', contentBytes: Buffer.from('Repeated') }] });
  assert.equal(stale.reason, 'SOURCE_BYTES_REVISION_MISMATCH');
  const missing = resolveSymbolTocChunkOrdinalsV1({ ordinalMap, symbol, sourceBytes, chunks: [] });
  assert.equal(missing.reason, 'CANDIDATE_CHUNK_SET_MISMATCH');
  const repeated = resolveSymbolTocChunkOrdinalsV1({ ordinalMap, symbol, sourceBytes, chunks: [{ canonicalChunkId: 'chunk:repeat', contentBytes: Buffer.from('class Repeated') }] });
  assert.equal(repeated.status, 'BLOCKED');
  assert.equal(repeated.reason, 'SYMBOL_HAS_NO_EXACTLY_BOUND_CANDIDATE_CHUNK');
  assert.equal(repeated.unresolvedChunks[0].reason, 'CHUNK_BYTES_AMBIGUOUS_IN_SOURCE');
});

test('uses a persisted byte span only after independent source and chunk readback', () => {
  const sourceBytes = Buffer.from('class Repeated { body }\nclass Repeated { body }\n', 'utf8');
  const contentBytes = Buffer.from('class Repeated', 'utf8');
  const sourceRevision = digest(sourceBytes);
  const start = sourceBytes.indexOf(contentBytes);
  const descriptor = qualifyChunkSourceSpanV1({
    sourceBytes,
    chunkContent: contentBytes.toString('utf8'),
    sourceRef: 'src/repeated.ts',
    startByte: start,
    endByte: start + contentBytes.length,
  });
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `sha256:${'c'.repeat(64)}`,
    workspaceRevision,
    producerRevision: 'fixture:symbol-chunk-span-readback-v1',
    candidates: [{
      canonicalId: 'chunk:repeated', packetKey: 'packet:repeat', sourceRef: 'src/repeated.ts',
      treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision,
      graphRevision: null, semanticRevision: null, degradedIdentity: false,
      evidenceRefs: ['chunk:repeated'], representationBindings: [],
    }],
  });
  const symbol = {
    symbol_version_id: 'symbol-version:repeat', stable_symbol_id: 'stable-symbol:repeat',
    packet_key: 'packet:repeat', source_ref: 'src/repeated.ts', source_revision: sourceRevision,
    workspace_revision: workspaceRevision, symbol_kind: 'class', qualified_name: 'Repeated',
    byte_start: start, byte_end: start + Buffer.byteLength('class Repeated { body }', 'utf8'),
  };
  const chunks = [{ canonicalChunkId: 'chunk:repeated', contentBytes, sourceSpan: descriptor }];
  const resolved = resolveSymbolTocChunkOrdinalsV1({ ordinalMap, symbol, sourceBytes, chunks });
  assert.equal(resolved.status, 'SYMBOL_CHUNK_CROSSWALK_NOT_ADMITTED');
  if (resolved.status !== 'SYMBOL_CHUNK_CROSSWALK_NOT_ADMITTED') return;
  assert.equal(resolved.matches.length, 1);
  assert.equal(resolved.matches[0].sourceByteStart, start);
  assert.equal(resolved.unresolvedChunks.length, 0);
  assert.equal(resolved.evidenceAdmitted, false);

  const tampered = resolveSymbolTocChunkOrdinalsV1({
    ordinalMap,
    symbol,
    sourceBytes,
    chunks: [{ ...chunks[0], sourceSpan: { ...descriptor, sourceSpanDigest: digest(Buffer.from('wrong')) } }],
  });
  assert.equal(tampered.status, 'BLOCKED');
  assert.equal(tampered.reason, 'SYMBOL_HAS_NO_EXACTLY_BOUND_CANDIDATE_CHUNK');
  assert.equal(tampered.unresolvedChunks[0].reason, 'SPAN_READBACK_DIGEST_MISMATCH');
});
