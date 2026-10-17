import { describe, expect, it } from 'vitest';
import {
  createParsedBatchV1,
  sortParsedRecordsDeterministicV1,
  type ParsedRecordEntryV1,
  PARENT_ATLAS_SIMD_PROOF_SEQUENCE,
} from './simd-fanout-contract-v1.js';

describe('SIMD Fanout & Ingestion Contract (PARSE-01..02, FANOUT-01, SORT-01, BATCH-01)', () => {
  const sampleRecords: ParsedRecordEntryV1[] = [
    {
      domain: 'retrieval',
      packetKey: 'pkt_00000000000000000000000000000002',
      sourceRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      sourceOffset: 1024n,
      rawBytes: new TextEncoder().encode('{"retrieval_candidate":"c2"}\n'),
    },
    {
      domain: 'ast',
      packetKey: 'pkt_00000000000000000000000000000001',
      sourceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sourceOffset: 512n,
      rawBytes: new TextEncoder().encode('{"symbol":"validatePacket","span":[512,600]}\n'),
    },
    {
      domain: 'ast',
      packetKey: 'pkt_00000000000000000000000000000001',
      sourceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sourceOffset: 128n,
      rawBytes: new TextEncoder().encode('{"symbol":"PacketReader","span":[128,400]}\n'),
    },
    {
      domain: 'graph',
      packetKey: 'pkt_00000000000000000000000000000003',
      sourceRevision: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      sourceOffset: 2048n,
      rawBytes: new TextEncoder().encode('{"edge":"CALLS","from":"p1","to":"p2"}\n'),
    },
  ];

  it('enforces deterministic composite sort key (domain_id, packet_key, source_revision, source_offset)', () => {
    const sorted = sortParsedRecordsDeterministicV1(sampleRecords);

    // Domains ordered: ast (0) -> graph (1) -> retrieval (2)
    expect(sorted[0].domain).toBe('ast');
    expect(sorted[0].sourceOffset).toBe(128n);
    expect(sorted[1].domain).toBe('ast');
    expect(sorted[1].sourceOffset).toBe(512n);
    expect(sorted[2].domain).toBe('graph');
    expect(sorted[3].domain).toBe('retrieval');
  });

  it('guarantees identical batches from differently shuffled worker arrival streams (SORT-01)', () => {
    const astRecords = sampleRecords.filter((r) => r.domain === 'ast');
    const shuffled1 = [astRecords[0], astRecords[1]];
    const shuffled2 = [astRecords[1], astRecords[0]];

    const batch1 = createParsedBatchV1({ domain: 'ast', records: shuffled1 });
    const batch2 = createParsedBatchV1({ domain: 'ast', records: shuffled2 });

    expect(batch1.batchChecksum).toBe(batch2.batchChecksum);
    expect(batch1.payloadDigest).toBe(batch2.payloadDigest);
    expect(batch1.recordCount).toBe(2);
    expect(batch1.sourceOffsets[0]).toBe(128n);
    expect(batch1.sourceOffsets[1]).toBe(512n);
  });

  it('preserves exact 64-bit UTF-8 byte offsets without truncation (PARSE-02)', () => {
    const largeOffset = 4294967296n + 1000n; // > 4 GiB offset
    const record: ParsedRecordEntryV1 = {
      domain: 'ast',
      packetKey: 'pkt_large_file_00000000000000001',
      sourceRevision: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      sourceOffset: largeOffset,
      rawBytes: new TextEncoder().encode('{"symbol":"LargeFileMethod"}\n'),
    };

    const batch = createParsedBatchV1({ domain: 'ast', records: [record] });
    expect(batch.sourceOffsets[0]).toBe(largeOffset);
    expect(batch.canonicalAuthority).toBe(false);
    expect(batch.writesPerformed).toBe(false);
  });

  it('declares the 6 Parent Atlas SIMD proof stages', () => {
    expect(PARENT_ATLAS_SIMD_PROOF_SEQUENCE.length).toBe(6);
    expect(PARENT_ATLAS_SIMD_PROOF_SEQUENCE.map((s) => s.stage)).toEqual([
      'PARSE-01',
      'PARSE-02',
      'FANOUT-01',
      'SORT-01',
      'BATCH-01',
      'PERF-01',
    ]);
  });
});
