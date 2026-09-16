import { describe, expect, it } from 'vitest';

import { validateToolSchema, type NormalizedToolCapabilities } from './tool-schema-validator';

function caps(overrides: Partial<NormalizedToolCapabilities> = {}): NormalizedToolCapabilities {
  return {
    supportedPacketTypes: [],
    supportedLanguages: [],
    supportedExtensions: [],
    domainTags: [],
    deprecated: false,
    ...overrides,
  };
}

describe('validateToolSchema', () => {
  it('matches when the tool has no restriction (empty arrays = wildcard)', () => {
    expect(validateToolSchema({ packetType: 'code' }, caps())).toBe(true);
  });

  it('matches when the query specifies a dimension the tool explicitly supports', () => {
    expect(
      validateToolSchema({ packetType: 'code' }, caps({ supportedPacketTypes: ['code', 'test'] }))
    ).toBe(true);
  });

  it('rejects when the query specifies a dimension the tool explicitly does not support', () => {
    expect(
      validateToolSchema({ packetType: 'doc' }, caps({ supportedPacketTypes: ['code', 'test'] }))
    ).toBe(false);
  });

  it('does not filter on a dimension the query left unspecified', () => {
    expect(validateToolSchema({}, caps({ supportedPacketTypes: ['code'] }))).toBe(true);
  });

  it('is permissive when tool_capabilities is missing/null (no ontology data yet)', () => {
    expect(validateToolSchema({ packetType: 'code' }, null)).toBe(true);
    expect(validateToolSchema({ packetType: 'code' }, undefined)).toBe(true);
  });

  it('is permissive when tool_capabilities is malformed (not an object)', () => {
    expect(validateToolSchema({ packetType: 'code' }, 'not-an-object')).toBe(true);
    expect(validateToolSchema({ packetType: 'code' }, 42)).toBe(true);
  });

  it('excludes a deprecated tool by default', () => {
    expect(validateToolSchema({ packetType: 'code' }, caps({ deprecated: true }))).toBe(false);
  });

  it('includes a deprecated tool when the query explicitly opts in', () => {
    expect(
      validateToolSchema({ packetType: 'code', includeDeprecated: true }, caps({ deprecated: true }))
    ).toBe(true);
  });

  it('requires ALL specified dimensions to match (AND, not OR)', () => {
    const capabilities = caps({ supportedPacketTypes: ['code'], domainTags: ['vector-search'] });
    expect(validateToolSchema({ packetType: 'code', domain: 'vector-search' }, capabilities)).toBe(true);
    expect(validateToolSchema({ packetType: 'code', domain: 'lexical-search' }, capabilities)).toBe(false);
  });

  // Real category shapes from the live normalization migration
  // (scripts/atlas/phase10-normalize-tool-capabilities.mjs) — not synthetic examples.
  it('matches the real api:* shape (supportedPacketTypes: ["api"], extra httpMethods field ignored)', () => {
    const apiCaps = caps({
      supportedPacketTypes: ['api'],
      httpMethods: ['GET', 'POST'],
    } as Partial<NormalizedToolCapabilities>);
    expect(validateToolSchema({ packetType: 'api' }, apiCaps)).toBe(true);
    expect(validateToolSchema({ packetType: 'code' }, apiCaps)).toBe(false);
  });

  it('matches the real canonical-tool shape (ornith.explain_code: code-only)', () => {
    const explainCaps = caps({ supportedPacketTypes: ['code'], domainTags: ['llm-explain'] });
    expect(validateToolSchema({ packetType: 'code' }, explainCaps)).toBe(true);
    expect(validateToolSchema({ packetType: 'doc' }, explainCaps)).toBe(false);
  });

  it('matches the real wildcard canonical-tool shape (qdrant.dense_search: any packet type)', () => {
    const denseCaps = caps({ supportedPacketTypes: [], domainTags: ['vector-search'] });
    expect(validateToolSchema({ packetType: 'code' }, denseCaps)).toBe(true);
    expect(validateToolSchema({ packetType: 'doc' }, denseCaps)).toBe(true);
  });
});
