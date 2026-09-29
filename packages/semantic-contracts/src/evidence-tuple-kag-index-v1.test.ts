import { describe, expect, it } from 'vitest';
import { createEvidenceTupleFromRawSpanV1 } from './evidence-tuple-v1.js';
import { createEvidenceTupleKagIndexV1 } from './evidence-tuple-kag-index-v1.js';

const bytes = new TextEncoder().encode('prefix\nGPU backend selected\nsuffix');
const start = new TextEncoder().encode('prefix\n').byteLength;
const end = start + new TextEncoder().encode('GPU backend selected').byteLength;
const tuple = createEvidenceTupleFromRawSpanV1({
  sourceBytes: bytes,
  sourcePath: 'docs/reports/runtime.log',
  byteStart: start,
  byteEnd: end,
  sessionId: 'fixture-session',
  subject: 'native-addon',
  predicate: 'selected_backend',
  object: 'CUDA',
  severity: 'info',
});

describe('EvidenceTupleKagIndexV1', () => {
  it('returns exact-match tuples only after resolving and hashing their source span', async () => {
    const index = createEvidenceTupleKagIndexV1([tuple]);
    const result = await index.search({ subject: 'native-addon', predicate: 'selected_backend' }, async (path) => {
      expect(path).toBe('docs/reports/runtime.log');
      return bytes;
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.evidenceText).toBe('GPU backend selected');
    expect(result.hits[0]?.resolvedSpanSha256).toBe(tuple.raw_sha256);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('fails closed on a changed source span and never returns the compressed tuple alone as a hit', async () => {
    const index = createEvidenceTupleKagIndexV1([tuple]);
    const drifted = new TextEncoder().encode('prefix\nCPU backend selected\nsuffix');
    const result = await index.search({ object: 'CUDA' }, async () => drifted);

    expect(result.hits).toEqual([]);
    expect(result.rejected).toEqual([{ eventId: tuple.event_id, reason: 'RAW_HASH_MISMATCH' }]);
  });

  it('reports missing/unreadable evidence sources without admitting a tuple', async () => {
    const index = createEvidenceTupleKagIndexV1([tuple]);
    const missing = await index.search({ predicate: 'selected_backend' }, async () => null);
    const unreadable = await index.search({ predicate: 'selected_backend' }, async () => { throw new Error('fixture'); });

    expect(missing.hits).toHaveLength(0);
    expect(missing.rejected[0]?.reason).toBe('SOURCE_MISSING');
    expect(unreadable.hits).toHaveLength(0);
    expect(unreadable.rejected[0]?.reason).toBe('SOURCE_READ_FAILED');
  });

  it('is deterministic across insertion order and enforces bounded exact queries', async () => {
    const secondBytes = new TextEncoder().encode('other grounded span');
    const second = createEvidenceTupleFromRawSpanV1({
      sourceBytes: secondBytes,
      sourcePath: 'docs/reports/other.log',
      byteStart: 0,
      byteEnd: secondBytes.byteLength,
      sessionId: 'fixture-session',
      subject: 'native-addon',
      predicate: 'selected_backend',
      object: 'CPU',
      severity: 'info',
    });
    const firstIndex = createEvidenceTupleKagIndexV1([tuple, second]);
    const reversedIndex = createEvidenceTupleKagIndexV1([second, tuple]);
    const readSource = async (path: string) => path.endsWith('runtime.log') ? bytes : secondBytes;
    const first = await firstIndex.search({ subject: 'native-addon' }, readSource);
    const reversed = await reversedIndex.search({ subject: 'native-addon' }, readSource);

    expect(firstIndex.indexChecksum).toBe(reversedIndex.indexChecksum);
    expect(first.checksum).toBe(reversed.checksum);
    expect(first.hits.map((hit) => hit.tuple.event_id)).toEqual(reversed.hits.map((hit) => hit.tuple.event_id));
    const page = await firstIndex.search({ subject: 'native-addon', limit: 1, maxCandidates: 2 }, readSource);
    expect(page.candidateCount).toBe(2);
    expect(page.scannedCount).toBe(1);
    expect(page.truncated).toBe(true);
    await expect(firstIndex.search({}, readSource)).rejects.toThrow('EVIDENCE_TUPLE_KAG_QUERY_REQUIRED');
    await expect(firstIndex.search({ subject: 'native-addon', limit: 101 }, readSource)).rejects.toThrow('EVIDENCE_TUPLE_KAG_LIMIT_INVALID');
  });
});
