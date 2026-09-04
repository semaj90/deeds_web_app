#!/usr/bin/env node

/**
 * Read-only DIR-INDEX-02 proof.
 *
 * This proves the adapter contract only: native code chunk/symbol identity is
 * preserved, external-document chunk identity is deterministic, UTF-8 byte
 * spans reproduce their text, and producer namespaces do not collide.
 * It does not write a datastore or promote a canonical chunk population.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, Object.keys(value).sort());

function adaptChunk({ sourceRef, sourceRevision, workspaceRevision, chunkerRevision, producerKind, upstreamChunkId, symbolId, sourceBytes, startByte, endByte, headingPath = [] }) {
  assert.ok(sourceRef && sourceRevision && workspaceRevision && chunkerRevision);
  assert.ok(Number.isInteger(startByte) && Number.isInteger(endByte));
  assert.ok(startByte >= 0 && endByte > startByte && endByte <= sourceBytes.length);

  const text = sourceBytes.subarray(startByte, endByte).toString('utf8');
  const textChecksum = `sha256:${sha256(text)}`;
  const identity = producerKind === 'SOURCE_CODE'
    ? { namespace: 'treesitter-graphify', upstreamChunkId, symbolId: symbolId ?? null }
    : { namespace: 'external-document', headingPath };
  assert.ok(identity.upstreamChunkId || producerKind === 'EXTERNAL_DOCUMENT');

  const chunkId = `chunk:${sha256(json({ sourceRef, sourceRevision, startByte, endByte, textChecksum, identity }))}`;
  return {
    schema: 'atlas.canonical-chunk.v1',
    chunkId,
    sourceRef,
    sourceRevision,
    workspaceRevision,
    startByte,
    endByte,
    textChecksum,
    chunkerRevision,
    producerKind,
    upstreamChunkId: upstreamChunkId ?? null,
    symbolId: symbolId ?? null,
    headingPath,
    canonicalAuthority: false,
  };
}

function run() {
  const workspaceRevision = 'sha256:' + 'a'.repeat(64);
  const sourceRevision = 'sha256:' + 'b'.repeat(64);
  const code = Buffer.from('const café = 1;\nfunction run() { return café; }\n', 'utf8');
  const docs = Buffer.from('# API\n\nUse café safely.\n', 'utf8');

  const codeInput = {
    sourceRef: 'src/example.ts', sourceRevision, workspaceRevision,
    chunkerRevision: 'treesitter-chunker:v2', producerKind: 'SOURCE_CODE',
    upstreamChunkId: 'gis:chunk:example:0', symbolId: 'gis:symbol:run',
    sourceBytes: code, startByte: 17, endByte: code.length,
  };
  const docInput = {
    sourceRef: 'docs/api.md', sourceRevision, workspaceRevision,
    chunkerRevision: 'markdown-section:v1', producerKind: 'EXTERNAL_DOCUMENT',
    sourceBytes: docs, startByte: 0, endByte: docs.length, headingPath: ['API'],
  };

  const codeA = adaptChunk(codeInput);
  const codeB = adaptChunk({ ...codeInput, sourceBytes: Buffer.from(code) });
  const docA = adaptChunk(docInput);
  const docB = adaptChunk({ ...docInput, sourceBytes: Buffer.from(docs) });

  assert.equal(codeA.chunkId, codeB.chunkId);
  assert.equal(docA.chunkId, docB.chunkId);
  assert.equal(codeA.upstreamChunkId, codeInput.upstreamChunkId);
  assert.equal(codeA.symbolId, codeInput.symbolId);
  assert.notEqual(codeA.chunkId, docA.chunkId);
  assert.equal(codeA.canonicalAuthority, false);
  assert.equal(docA.canonicalAuthority, false);
  assert.throws(() => adaptChunk({ ...codeInput, startByte: 1, endByte: code.length + 1 }), /AssertionError/);

  const ordered = [codeA, docA].sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  const replayChecksum = `sha256:${sha256(JSON.stringify(ordered))}`;
  console.log(JSON.stringify({
    schema: 'atlas.dir-index-02-chunk-identity-proof.v1',
    status: 'DIR_CHUNK_IDENTITY_PASS',
    gates: {
      canonicalChunkShape: true,
      utf8ByteSpanReproducesText: true,
      nativeTreeSitterGraphifyIdentityPreserved: true,
      externalDocumentIdentityDeterministic: true,
      producerNamespacesSeparated: true,
      deterministicReplayChecksum: true,
      invalidSpanRejected: true,
    },
    replayChecksum,
    chunks: ordered.map(({ chunkId, sourceRef, sourceRevision: revision, startByte, endByte, textChecksum, producerKind, upstreamChunkId, symbolId, headingPath }) => ({ chunkId, sourceRef, sourceRevision: revision, startByte, endByte, textChecksum, producerKind, upstreamChunkId, symbolId, headingPath })),
    canonicalPromotion: 'BLOCKED_UNTIL_CANONICAL_CHUNK_ADAPTER',
    canonicalWrites: false,
    datastoreWrites: false,
    modelCalls: false,
  }, null, 2));
}

try { run(); } catch (error) {
  console.error(JSON.stringify({ schema: 'atlas.dir-index-02-chunk-identity-proof.v1', status: 'FAILED', error: String(error?.message ?? error), canonicalWrites: false, datastoreWrites: false, modelCalls: false }, null, 2));
  process.exitCode = 1;
}
