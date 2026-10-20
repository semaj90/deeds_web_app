import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildPacketClassLutV1, lutDecode } from './residency/packet-class-lut-v1.js';
import { KeywordCorpusSearchResultV1Schema, searchKeywordCorpusV1 } from './keyword-corpus-search-v1.js';

const root = path.resolve(process.cwd(), '..');
const corpusPath = path.join(root, '.okf', 'corpora', 'keyword-corpus.yaml');
const schemaPath = path.join(root, '.okf', 'corpora', 'keyword-corpus.schema.json');

describe('Parent Atlas .okf keyword corpus search', () => {
  it('schema-validates the reference corpus and returns stable Top-K with revisioned LUT codes', () => {
    const result = searchKeywordCorpusV1({ query: 'MCP tool selection', corpusPath, schemaPath, limit: 5 });
    expect(KeywordCorpusSearchResultV1Schema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('OK');
    expect(result.corpusStatus).toBe('reference_only');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.items[0]?.entryId).toBe('viterbi-mcp-tool-routing');
    const corpus = parse(readFileSync(corpusPath, 'utf8')) as { entries: Array<{ id: string }> };
    const lut = buildPacketClassLutV1(corpus.entries.map((entry) => entry.id));
    expect(result.lutEncodingRevision).toBe(lut.encodingRevision);
    expect(lutDecode(lut, result.items[0]!.lutCode)).toBe('viterbi-mcp-tool-routing');
  });

  it('finds the HTTP QUERY and QUIC reference without promoting it to authority', () => {
    const result = searchKeywordCorpusV1({ query: 'RFC 10008 HTTP QUERY', corpusPath, schemaPath, limit: 5 });
    expect(result.status).toBe('OK');
    expect(result.items[0]?.entryId).toBe('http-query-quic-context');
    expect(result.items[0]?.sourceRefs).toContain('docs/.okf/rfc-http-query/README.md');
    expect(result.items[0]?.retrievalPolicy).toContain('reference_only');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('finds 4D manifold mapping and future K-means analytics as advisory vocabulary', () => {
    const result = searchKeywordCorpusV1({ query: '4D manifold mapping K-means clustering data analytics', corpusPath, schemaPath, limit: 5 });
    expect(result.status).toBe('OK');
    expect(result.items[0]?.entryId).toBe('topology-som-kmeans-advisory-features');
    expect(result.items[0]?.retrievalPolicy).toContain('advisory_only');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('paginates against a frozen corpus checksum and rejects a cursor reused for another query', () => {
    const first = searchKeywordCorpusV1({ query: 'atlas', corpusPath, schemaPath, limit: 1 });
    expect(first.status).toBe('OK');
    expect(first.nextCursor).not.toBeNull();
    const second = searchKeywordCorpusV1({ query: 'atlas', corpusPath, schemaPath, limit: 1, cursor: first.nextCursor });
    expect(second.status).toBe('OK');
    expect(second.corpusSnapshotChecksum).toBe(first.corpusSnapshotChecksum);
    expect(second.items[0]?.entryId).not.toBe(first.items[0]?.entryId);
    expect(searchKeywordCorpusV1({ query: 'other', corpusPath, schemaPath, limit: 1, cursor: first.nextCursor }).status).toBe('STALE_CURSOR');
  });

  it('returns a stable empty shape for an invalid cursor', () => {
    const result = searchKeywordCorpusV1({ query: 'atlas', corpusPath, schemaPath, cursor: 'not-a-cursor' });
    expect(KeywordCorpusSearchResultV1Schema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ status: 'INVALID_CURSOR', items: [], totalMatches: 0, writesPerformed: false });
  });
});
