import { describe, expect, it } from 'vitest';
import {
  sliceNdjsonByByteBoundary,
  executeSimdFanoutIngestionV1,
} from './simd-fanout-engine-v1.js';

describe('Multicore SIMD Fanout Engine (FANOUT-01, SORT-01, PARSE-02, BATCH-01)', () => {
  // Build a multi-line, multi-domain NDJSON test fixture with mixed LF and CRLF line endings
  const lines = [
    '{"domain":"retrieval","packetKey":"pkt_0001","sourceRevision":"sha256:1111","content":"clause 1"}\n',
    '{"domain":"ast","packetKey":"pkt_0002","sourceRevision":"sha256:2222","symbol":"ClassDef"}\r\n',
    '{"domain":"graph","packetKey":"pkt_0003","sourceRevision":"sha256:3333","edge":"INVOKES"}\n',
    '{INVALID_JSON_LINE_HERE}\n', // Intentional malformed record
    '{"domain":"ast","packetKey":"pkt_0004","sourceRevision":"sha256:2222","symbol":"MethodDef"}\r\n',
    '{"domain":"retrieval","packetKey":"pkt_0005","sourceRevision":"sha256:1111","content":"clause 2"}\n',
    '{"domain":"graph","packetKey":"pkt_0006","sourceRevision":"sha256:3333","edge":"EXTENDS"}\n',
  ];

  const fixtureBuffer = new TextEncoder().encode(lines.join(''));

  it('slices NDJSON strictly along newline boundaries without splitting records', () => {
    // Force small slice target (e.g. 50 bytes) to create multiple slices
    const slices = sliceNdjsonByByteBoundary(fixtureBuffer, 50);

    expect(slices.length).toBeGreaterThan(1);

    // Reconstruct buffer from slices and verify byte-for-byte identity
    const reconstructed = new Uint8Array(fixtureBuffer.byteLength);
    let offset = 0;
    for (const slice of slices) {
      expect(slice.sliceOffset).toBe(BigInt(offset));
      reconstructed.set(slice.bytes, offset);
      offset += slice.bytes.byteLength;
    }

    expect(Buffer.from(reconstructed).equals(Buffer.from(fixtureBuffer))).toBe(true);
  });

  it('SORT-01: proves deterministic ordering and identical batch checksums across 1, 2, 4, and 8 workers', async () => {
    // Run with 1 worker (baseline oracle)
    const run1 = await executeSimdFanoutIngestionV1({
      buffer: fixtureBuffer,
      options: { workers: 1, sliceBytes: 64 },
    });

    // Run with 2 workers
    const run2 = await executeSimdFanoutIngestionV1({
      buffer: fixtureBuffer,
      options: { workers: 2, sliceBytes: 64 },
    });

    // Run with 4 workers
    const run4 = await executeSimdFanoutIngestionV1({
      buffer: fixtureBuffer,
      options: { workers: 4, sliceBytes: 64 },
    });

    // Run with 8 workers
    const run8 = await executeSimdFanoutIngestionV1({
      buffer: fixtureBuffer,
      options: { workers: 8, sliceBytes: 64 },
    });

    // 1. Verify batchChecksums match exactly across all worker configurations
    expect(run1.receipt.batchChecksums).toEqual(run2.receipt.batchChecksums);
    expect(run2.receipt.batchChecksums).toEqual(run4.receipt.batchChecksums);
    expect(run4.receipt.batchChecksums).toEqual(run8.receipt.batchChecksums);

    // 2. Verify record counts match exactly
    expect(run1.receipt.validRecordCount).toBe(6);
    expect(run2.receipt.validRecordCount).toBe(6);
    expect(run4.receipt.validRecordCount).toBe(6);
    expect(run8.receipt.validRecordCount).toBe(6);

    // 3. Verify exact domain batch sizes: ast: 2, graph: 2, retrieval: 2
    expect(run1.receipt.domainBatchCounts).toEqual({
      ast: 2,
      graph: 2,
      retrieval: 2,
    });
  });

  it('PARSE-02: captures malformed records and preserves exact UTF-8 byte offsets for valid records', async () => {
    const res = await executeSimdFanoutIngestionV1({
      buffer: fixtureBuffer,
      options: { workers: 2, sliceBytes: 64 },
    });

    // Verify malformed record rejection
    expect(res.receipt.rejectedRecordCount).toBe(1);
    expect(res.receipt.rejectedRecords[0].rawText).toContain('INVALID_JSON_LINE_HERE');

    // Verify exact byte offset for the malformed record
    const expectedMalformedOffset = BigInt(
      new TextEncoder().encode(lines.slice(0, 3).join('')).byteLength
    );
    expect(res.receipt.rejectedRecords[0].byteOffset).toBe(expectedMalformedOffset);

    // Verify AST batch offsets
    const astBatch = res.batches.ast;
    expect(astBatch.recordCount).toBe(2);
    expect(astBatch.sourceOffsets[0]).toBeGreaterThanOrEqual(0n);
    expect(astBatch.sourceOffsets[1]).toBeGreaterThan(astBatch.sourceOffsets[0]);

    // Verify canonical invariants
    expect(res.receipt.canonicalAuthority).toBe(false);
    expect(res.receipt.writesPerformed).toBe(false);
  });

  it('BATCH-01: emits compact typed columnar buffers and cryptographic digests', async () => {
    const res = await executeSimdFanoutIngestionV1({
      buffer: fixtureBuffer,
      options: { workers: 4, sliceBytes: 128 },
    });

    for (const domain of ['ast', 'graph', 'retrieval'] as const) {
      const batch = res.batches[domain];
      expect(batch.schema).toBe('atlas.simd-fanout-batch.v1');
      expect(batch.batchChecksum).toMatch(/^[a-f0-9]{64}$/);
      expect(batch.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(batch.sourceOffsets).toBeInstanceOf(BigUint64Array);
      expect(batch.payload).toBeInstanceOf(Uint8Array);
      expect(batch.canonicalAuthority).toBe(false);
      expect(batch.writesPerformed).toBe(false);
    }
  });
});
