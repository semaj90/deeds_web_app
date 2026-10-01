import { describe, expect, it } from 'vitest';
import {
  assertNotecardCorpusBoundsV1,
  assertNotecardSearchInputV1,
  NOTECARD_CORPUS_MAX_BYTES,
  NOTECARD_CORPUS_MAX_CARDS,
  NOTECARD_LINE_MAX_BYTES,
  NOTECARD_QUERY_MAX_CHARS,
  NOTECARD_LIBRARY_MAX_RESULTS,
} from './search-logic.js';

describe('notecard search resource bounds', () => {
  it('admits a corpus exactly at each configured boundary', () => {
    expect(() => assertNotecardCorpusBoundsV1({
      byteLength: NOTECARD_CORPUS_MAX_BYTES,
      cardCount: NOTECARD_CORPUS_MAX_CARDS,
      lineBytes: NOTECARD_LINE_MAX_BYTES,
    })).not.toThrow();
  });

  it('rejects oversized corpus, card count, and individual JSONL rows', () => {
    expect(() => assertNotecardCorpusBoundsV1({
      byteLength: NOTECARD_CORPUS_MAX_BYTES + 1,
      cardCount: 1,
      lineBytes: 1,
    })).toThrow('NOTECARD_CORPUS_BYTE_LIMIT');
    expect(() => assertNotecardCorpusBoundsV1({
      byteLength: 1,
      cardCount: NOTECARD_CORPUS_MAX_CARDS + 1,
      lineBytes: 1,
    })).toThrow('NOTECARD_CORPUS_CARD_LIMIT');
    expect(() => assertNotecardCorpusBoundsV1({
      byteLength: 1,
      cardCount: 1,
      lineBytes: NOTECARD_LINE_MAX_BYTES + 1,
    })).toThrow('NOTECARD_LINE_BYTE_LIMIT');
  });

  it('rejects invalid lengths, query sizes, and unbounded result limits', () => {
    expect(() => assertNotecardCorpusBoundsV1({ byteLength: Number.NaN, cardCount: 0, lineBytes: 0 }))
      .toThrow('NOTECARD_CORPUS_INVALID_BYTE_LENGTH');
    expect(() => assertNotecardSearchInputV1('q'.repeat(NOTECARD_QUERY_MAX_CHARS + 1), 1))
      .toThrow('NOTECARD_QUERY_LENGTH_LIMIT');
    expect(() => assertNotecardSearchInputV1('query', NOTECARD_LIBRARY_MAX_RESULTS + 1))
      .toThrow('NOTECARD_RESULT_LIMIT');
    expect(() => assertNotecardSearchInputV1('', 1)).not.toThrow();
  });
});
