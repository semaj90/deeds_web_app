import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bindDocumentationFactSpanV1 } from './documentation-fact-span-v1.js';
import type { VerifiedExternalDocCitationV1 } from './external-doc-citation-readback-v1.js';

const text = 'Use `検索API` for lookup.';
const citation: VerifiedExternalDocCitationV1 = {
  schema: 'atlas.external-doc-verified-citation.v1', chunkId: 'chunk-1', pageId: 'page-1',
  url: 'https://docs.example.test/api', provider: 'example', product: 'example', productVersion: '1.0',
  sourceRevision: `sha256:${'a'.repeat(64)}`, chunkEvidenceRevision: `sha256:${'b'.repeat(64)}`,
  startByte: 100, endByte: 100 + Buffer.byteLength(text),
  chunkChecksum: createHash('sha256').update(text).digest('hex'), verifiedText: text,
  sourceAuthority: 'OFFICIAL', canonicalAuthority: false,
};

describe('DocumentationFactV1 exact UTF-8 span binding', () => {
  it('binds an exact multibyte quote to the read-back citation byte range', () => {
    const quote = '検索API';
    const startByte = Buffer.from(text).indexOf(Buffer.from(quote));
    const fact = bindDocumentationFactSpanV1({ citation, proposal: {
      kind: 'API_SIGNATURE', text: quote, startByte, endByte: startByte + Buffer.byteLength(quote),
      extractorRevision: 'fixture-extractor-v1',
    } });
    expect(fact).toMatchObject({
      schema: 'atlas.documentation-fact.v1', text: quote, canonicalAuthority: false, writesPerformed: false,
      source: { chunkId: 'chunk-1', startByte: 100 + startByte, endByte: 100 + startByte + Buffer.byteLength(quote) },
    });
    expect(fact?.source.quoteSha256).toBe(createHash('sha256').update(quote).digest('hex'));
  });

  it('rejects substituted text, split UTF-8 bytes, and non-official citations', () => {
    const startByte = Buffer.from(text).indexOf(Buffer.from('検索API'));
    const base = { kind: 'API_SIGNATURE' as const, text: '検索API', startByte, endByte: startByte + Buffer.byteLength('検索API'), extractorRevision: 'fixture-v1' };
    expect(bindDocumentationFactSpanV1({ citation, proposal: { ...base, text: 'other API' } })).toBeNull();
    expect(bindDocumentationFactSpanV1({ citation, proposal: { ...base, startByte: startByte + 1, endByte: startByte + 5, text: '検索' } })).toBeNull();
    expect(bindDocumentationFactSpanV1({ citation: { ...citation, sourceAuthority: 'COMMUNITY' } as unknown as VerifiedExternalDocCitationV1, proposal: base })).toBeNull();
  });
});
