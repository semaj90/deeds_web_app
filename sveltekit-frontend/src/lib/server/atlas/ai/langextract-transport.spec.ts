import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestLangExtractAnalyze,
  requestLangExtractDocumentationFacts,
  requestLangExtractHealth,
  requestOaklibLabelSearch,
} from './langextract-transport.js';

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const response = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

const VALID_ANALYZE_RESPONSE = {
  document_id: 'doc-1',
  source_type: 'codebase',
  extraction_mode: 'full',
  entities: [{ text: 'foo', label: 'CODE_SYMBOL' }],
  relationships: [],
  concepts: ['foo'],
  chunks: [{ kind: 'function_declaration', text: 'foo', start: 0, end: 10, symbol: 'foo' }],
  metadata: { source_ref: 'x.ts' },
  capabilities: { treesitter_chunker: true },
  processing_time_ms: 5,
  // Real sidecar fields the TS interface doesn't declare — must not fail validation.
  pass_results: [],
  control5: null,
};

const FACT_TEXT = 'Creates a GIN (Generalized Inverted Index)-based index.';
const FACT_INPUT_HASH = createHash('sha256').update(FACT_TEXT, 'utf8').digest('hex');
const FACT_END_CHAR = Array.from(FACT_TEXT).length;
const FACT_END_BYTE = Buffer.byteLength(FACT_TEXT, 'utf8');

const VALID_DOCUMENTATION_FACTS_RESPONSE = {
  facts: [{
    schema: 'atlas.documentation-fact.v1',
    subject: 'GIN',
    predicate: 'creates',
    object: 'an index',
    statement: 'Creates a GIN-based index.',
    evidenceText: 'Creates a GIN (Generalized Inverted Index)-based index.',
    sourceUrl: 'https://www.postgresql.org/docs/18/textsearch-indexes.html',
    sourceRevision: `sha256:${FACT_INPUT_HASH}`,
    startChar: 0,
    endChar: FACT_END_CHAR,
    startByte: 0,
    endByte: FACT_END_BYTE,
    alignmentStatus: 'MATCH_EXACT',
    productVersion: 'PostgreSQL 18',
    confidence: 0.9,
    extractionMethod: 'LANGEXTRACT_ORNITH',
    customAttributesVersion: 'atlas.langextract-custom-attributes.v1',
    customAttributes: { category: 'indexing', confidenceBand: 2, reviewed: false, optional: null },
    canonicalAuthority: false,
  }],
  apiRules: [],
  modelId: 'ornith-1.5-9b',
  provider: 'openai-compatible',
  producerRevision: 'sidecar-r1',
  inputHash: FACT_INPUT_HASH,
  outputHash: 'output-hash',
  generationControls: {},
  alignmentSummary: { MATCH_EXACT: 1 },
  canonicalAuthority: false,
  error: null,
};

const OAK_ONTOLOGY_REVISION = `sha256:${'a'.repeat(64)}`;
const VALID_OAKLIB_SEARCH_RESPONSE = {
  schema: 'atlas.oaklib-label-search-response.v1',
  status: 'PROPOSAL_ONLY',
  ontologyRevision: OAK_ONTOLOGY_REVISION,
  producerRevision: 'sidecar:oak-r1',
  matches: [{ searchText: 'continuant', externalIds: ['EX:1'] }],
  candidateBundle: {
    schema: 'atlas.oaklib-candidate-bundle.v1',
    sourceSelector: 'atlas-local-ontology',
    ontologyRevision: OAK_ONTOLOGY_REVISION,
    producerRevision: 'sidecar:oak-r1',
    concepts: [{
      schema: 'atlas.oaklib-concept-candidate.v1',
      candidateId: 'candidate-1',
      externalId: 'EX:1',
      label: 'continuant',
      description: null,
      namespace: 'external-oaklib',
      ontologyRevision: OAK_ONTOLOGY_REVISION,
      producerRevision: 'sidecar:oak-r1',
      evidenceRefs: ['oaklib:atlas-local-ontology:entity:EX:1'],
      status: 'PROPOSED',
      canonicalAuthority: false,
    }],
    relations: [],
    canonicalAuthority: false,
  },
  canonicalAuthority: false,
  writesPerformed: false,
};

describe('CHUNK0: langextract-transport response validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a valid /analyze response and returns typed data through', async () => {
    mockFetchOnce(VALID_ANALYZE_RESPONSE);
    const result = await requestLangExtractAnalyze({ text: 'x', source_type: 'codebase' });
    expect(result.document_id).toBe('doc-1');
    expect(result.chunks?.[0].kind).toBe('function_declaration');
  });

  it('rejects an /analyze response with the wrong shape instead of trusting it', async () => {
    mockFetchOnce({ document_id: 123, entities: 'not-an-array' });
    await expect(requestLangExtractAnalyze({ text: 'x' })).rejects.toThrow(/schema validation/);
  });

  it('rejects an /analyze response missing required fields', async () => {
    mockFetchOnce({ document_id: 'doc-1' });
    await expect(requestLangExtractAnalyze({ text: 'x' })).rejects.toThrow(/schema validation/);
  });

  it('still throws the original HTTP error for a non-ok response, before schema validation runs', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(requestLangExtractAnalyze({ text: 'x' })).rejects.toThrow(/failed: 500/);
  });

  it('accepts a valid /health response', async () => {
    mockFetchOnce({ status: 'ok', capabilities: { treesitter_chunker: true } });
    const result = await requestLangExtractHealth();
    expect(result.status).toBe('ok');
  });

  it('rejects a malformed /health response', async () => {
    mockFetchOnce({ capabilities: 'not-an-object' });
    await expect(requestLangExtractHealth()).rejects.toThrow(/schema validation/);
  });

  it('sends documentation facts with source revision and preserves proposal-only output', async () => {
    mockFetchOnce(VALID_DOCUMENTATION_FACTS_RESPONSE);
    const result = await requestLangExtractDocumentationFacts({
      text: FACT_TEXT,
      sourceUrl: 'https://www.postgresql.org/docs/18/textsearch-indexes.html',
      sourceRevision: `sha256:${FACT_INPUT_HASH}`,
      productVersion: 'PostgreSQL 18',
      model_id: 'ornith-1.5-9b',
    }, { baseUrl: 'http://sidecar.test' });

    expect(result.facts[0].evidenceText).toBe('Creates a GIN (Generalized Inverted Index)-based index.');
    expect(result.facts[0].customAttributes).toEqual({ category: 'indexing', confidenceBand: 2, reviewed: false, optional: null });
    expect(result.canonicalAuthority).toBe(false);
    expect(fetch).toHaveBeenCalledWith('http://sidecar.test/extract/documentation-facts', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('sourceRevision'),
    }));
  });

  it('rejects documentation facts that claim canonical authority', async () => {
    mockFetchOnce({ ...VALID_DOCUMENTATION_FACTS_RESPONSE, canonicalAuthority: true });
    await expect(requestLangExtractDocumentationFacts({
      text: 'x',
      sourceUrl: 'https://example.test/doc',
      sourceRevision: 'revision-1',
    }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/schema validation/);
  });

  it('rejects a fact whose claimed evidence text does not match the source span', async () => {
    mockFetchOnce({
      ...VALID_DOCUMENTATION_FACTS_RESPONSE,
      facts: [{ ...VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0], evidenceText: 'different text' }],
    });
    await expect(requestLangExtractDocumentationFacts({
      text: FACT_TEXT,
      sourceUrl: VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0].sourceUrl,
      sourceRevision: `sha256:${FACT_INPUT_HASH}`,
    }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/evidence text does not match/);
  });

  it('rejects a fact bound to a different source URL or revision', async () => {
    mockFetchOnce({
      ...VALID_DOCUMENTATION_FACTS_RESPONSE,
      facts: [{ ...VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0], sourceUrl: 'https://other.test/doc' }],
    });
    await expect(requestLangExtractDocumentationFacts({
      text: FACT_TEXT,
      sourceUrl: VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0].sourceUrl,
      sourceRevision: `sha256:${FACT_INPUT_HASH}`,
    }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/source binding mismatch/);
  });

  it('rejects unversioned, oversized, or non-scalar custom attributes', async () => {
    const fact = VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0];
    mockFetchOnce({ ...VALID_DOCUMENTATION_FACTS_RESPONSE, facts: [{ ...fact, customAttributesVersion: 'v0' }] });
    await expect(requestLangExtractDocumentationFacts({ text: FACT_TEXT, sourceUrl: fact.sourceUrl, sourceRevision: fact.sourceRevision }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/schema validation/);
    mockFetchOnce({ ...VALID_DOCUMENTATION_FACTS_RESPONSE, facts: [{ ...fact, customAttributes: { tooMuch: 'x'.repeat(2049) } }] });
    await expect(requestLangExtractDocumentationFacts({ text: FACT_TEXT, sourceUrl: fact.sourceUrl, sourceRevision: fact.sourceRevision }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/schema validation/);
    mockFetchOnce({ ...VALID_DOCUMENTATION_FACTS_RESPONSE, facts: [{ ...fact, customAttributes: { nested: { lost: true } } }] });
    await expect(requestLangExtractDocumentationFacts({ text: FACT_TEXT, sourceUrl: fact.sourceUrl, sourceRevision: fact.sourceRevision }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/schema validation/);
  });

  it('rejects byte offsets that do not point to the exact UTF-8 evidence bytes', async () => {
    mockFetchOnce({
      ...VALID_DOCUMENTATION_FACTS_RESPONSE,
      facts: [{ ...VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0], endByte: FACT_END_BYTE - 1 }],
    });
    await expect(requestLangExtractDocumentationFacts({
      text: FACT_TEXT,
      sourceUrl: VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0].sourceUrl,
      sourceRevision: `sha256:${FACT_INPUT_HASH}`,
    }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/byte span does not match/);
  });

  it('verifies UTF-8 byte offsets using Unicode code-point character positions', async () => {
    const text = 'A 🧠 fact.';
    const inputHash = createHash('sha256').update(text, 'utf8').digest('hex');
    const evidenceText = '🧠';
    const startByte = Buffer.byteLength('A ', 'utf8');
    mockFetchOnce({
      ...VALID_DOCUMENTATION_FACTS_RESPONSE,
      inputHash,
      facts: [{
        ...VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0],
        sourceRevision: `sha256:${inputHash}`,
        startChar: 2,
        endChar: 3,
        startByte,
        endByte: startByte + Buffer.byteLength(evidenceText, 'utf8'),
        evidenceText,
      }],
    });
    const result = await requestLangExtractDocumentationFacts({
      text,
      sourceUrl: VALID_DOCUMENTATION_FACTS_RESPONSE.facts[0].sourceUrl,
      sourceRevision: `sha256:${inputHash}`,
    }, { baseUrl: 'http://sidecar.test' });
    expect(result.facts[0].evidenceText).toBe(evidenceText);
  });

  it('surfaces sidecar extraction failures instead of returning empty facts as success', async () => {
    mockFetchOnce({ ...VALID_DOCUMENTATION_FACTS_RESPONSE, facts: [], inputHash: createHash('sha256').update('x', 'utf8').digest('hex'), alignmentSummary: {}, error: 'InferenceRuntimeError: timeout' });
    await expect(requestLangExtractDocumentationFacts({
      text: 'x',
      sourceUrl: 'https://example.test/doc',
      sourceRevision: 'revision-1',
    }, { baseUrl: 'http://sidecar.test' })).rejects.toThrow(/execution failed: InferenceRuntimeError/);
  });

  it('calls bounded OAKLIB label search and validates proposal-only candidate binding', async () => {
    mockFetchOnce(VALID_OAKLIB_SEARCH_RESPONSE);
    const result = await requestOaklibLabelSearch({ terms: ['continuant'] }, { baseUrl: 'http://sidecar.test' });
    expect(result.candidateBundle).toEqual(VALID_OAKLIB_SEARCH_RESPONSE.candidateBundle);
    expect(fetch).toHaveBeenCalledWith('http://sidecar.test/ontology/oaklib/search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ terms: ['continuant'] }),
    }));
  });

  it('rejects OAKLIB match IDs without a candidate and authority claims', async () => {
    mockFetchOnce({
      ...VALID_OAKLIB_SEARCH_RESPONSE,
      matches: [{ searchText: 'continuant', externalIds: ['EX:missing'] }],
    });
    await expect(requestOaklibLabelSearch({ terms: ['continuant'] }, { baseUrl: 'http://sidecar.test' }))
      .rejects.toThrow(/match references missing concept candidate/);

    mockFetchOnce({ ...VALID_OAKLIB_SEARCH_RESPONSE, canonicalAuthority: true });
    await expect(requestOaklibLabelSearch({ terms: ['continuant'] }, { baseUrl: 'http://sidecar.test' }))
      .rejects.toThrow(/schema validation/);
  });

  it('rejects unbounded or malformed OAKLIB terms before network access', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(requestOaklibLabelSearch({ terms: [] }, { baseUrl: 'http://sidecar.test' }))
      .rejects.toThrow();
    await expect(requestOaklibLabelSearch({ terms: ['unsafe\nterm'] }, { baseUrl: 'http://sidecar.test' }))
      .rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
