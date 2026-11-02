import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { LangExtractDocumentationFactsResponse } from '../../atlas/ai/langextract-transport.js';
import { synthesizeEvidenceClaimsV1 } from './evidence-synthesis-v1.js';

const originalBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
const originalRevision = `sha256:${createHash('sha256').update(originalBytes).digest('hex')}`;
const extractedText = 'Witness statement: café occurred on Monday.';
const extractedBytes = Buffer.from(extractedText, 'utf8');
const extractedRevision = `sha256:${createHash('sha256').update(extractedBytes).digest('hex')}`;
const evidenceId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const evidenceText = 'café occurred';
const startChar = Array.from(extractedText.slice(0, extractedText.indexOf('café'))).length;
const endChar = startChar + Array.from(evidenceText).length;
const startByte = Buffer.byteLength(Array.from(extractedText).slice(0, startChar).join(''), 'utf8');
const endByte = startByte + Buffer.byteLength(evidenceText, 'utf8');
const response: LangExtractDocumentationFactsResponse = {
  facts: [{
    schema: 'atlas.documentation-fact.v1',
    subject: 'Witness',
    predicate: 'states',
    object: 'event occurred Monday',
    statement: 'Witness states the event occurred Monday.',
    evidenceText,
    sourceUrl: `evidence://${evidenceId}`,
    sourceRevision: extractedRevision,
    startChar,
    endChar,
    startByte,
    endByte,
    alignmentStatus: 'MATCH_EXACT',
    productVersion: 'fixture-model-v1',
    confidence: 0.9,
    extractionMethod: 'langextract',
    customAttributesVersion: 'atlas.langextract-custom-attributes.v1',
    customAttributes: {},
    canonicalAuthority: false,
  }],
  apiRules: [],
  provider: 'fixture-provider',
  producerRevision: 'fixture-producer-v1',
  inputHash: extractedRevision.slice('sha256:'.length),
  outputHash: 'f'.repeat(64),
  generationControls: {},
  alignmentSummary: {},
  canonicalAuthority: false,
};

describe('synthesizeEvidenceClaimsV1', () => {
  it('grounds LangExtract spans to extracted text and binds them to original binary bytes', async () => {
    const request = vi.fn(async () => response);
    const summarize = vi.fn(async ({ claims }: { claims: Array<{ claimId: string }> }) => ({
      status: 'GENERATED' as const,
      text: 'The witness statement places the event on Monday.',
      supportingClaimIds: [claims[0]!.claimId],
      provider: 'llama-server' as const,
      modelId: 'ornith-1.5-9b',
      modelSelectionChecksum: 'a'.repeat(64),
    }));
    const searchOaklib = vi.fn(async () => ({
      schema: 'atlas.oaklib-label-search-response.v1' as const,
      status: 'PROPOSAL_ONLY' as const,
      ontologyRevision: `sha256:${'a'.repeat(64)}`,
      producerRevision: 'oaklib-fixture-v1',
      matches: [],
      candidateBundle: {
        schema: 'atlas.oaklib-candidate-bundle.v1',
        sourceSelector: 'atlas-local-ontology',
        ontologyRevision: `sha256:${'a'.repeat(64)}`,
        producerRevision: 'oaklib-fixture-v1',
        concepts: [],
        relations: [],
        canonicalAuthority: false,
      },
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    }));

    const result = await synthesizeEvidenceClaimsV1({
      evidenceId,
      sourceRevision: originalRevision,
      extractedText,
      caseId,
      enabled: true,
    }, originalBytes, request, summarize as never, searchOaklib as never);

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: `evidence://${evidenceId}`,
      sourceRevision: extractedRevision,
    }), { timeoutMs: 30_000 });
    expect(result).toMatchObject({
      status: 'SOURCE_GROUNDED',
      verificationOutcome: 'PROPOSED',
      reasonCodes: [],
      canonicalAuthority: false,
      summaryStatus: 'GENERATED',
      summary: { modelId: 'ornith-1.5-9b', supportingClaimIds: [result.claims[0]?.claimId] },
    });
    expect(summarize).toHaveBeenCalledWith({ claims: expect.arrayContaining([expect.objectContaining({ verificationStatus: 'SOURCE_GROUNDED' })]) });
    expect(result.claims).toHaveLength(1);
    expect(result.nextSteps.length).toBeGreaterThan(0);
    expect(result.nextSteps.every((step) => step.admission === 'PROPOSAL_ONLY')).toBe(true);
    expect(result.nextSteps.every((step) => step.extractionStatus === 'FACTS_RETURNED')).toBe(true);
    expect(result.taxonomyProposal).toMatchObject({
      schema: 'atlas.evidence-taxonomy-proposal.v1',
      canonicalAuthority: false,
      mappings: [{ claimId: result.claims[0]?.claimId, sourceRevision: originalRevision }],
    });
    expect(searchOaklib).toHaveBeenCalledWith({ terms: expect.any(Array) }, { timeoutMs: 3_000 });
    expect(result.claims[0]).toMatchObject({
      sourceSha256: originalRevision.slice('sha256:'.length),
      sourceRevision: originalRevision,
      span: { exactText: evidenceText, textSourceSha256: extractedRevision.slice('sha256:'.length), startByte, endByte },
      verificationStatus: 'SOURCE_GROUNDED',
    });
  });

  it('does not call LangExtract when disabled and reports missing source bytes explicitly', async () => {
    const request = vi.fn();
    const base = { evidenceId, sourceRevision: originalRevision, extractedText, caseId, enabled: false };

    await expect(synthesizeEvidenceClaimsV1(base, originalBytes, request as never)).resolves.toMatchObject({
      status: 'DISABLED', verificationOutcome: 'BLOCKED', reasonCodes: ['SYNTHESIS_DISABLED'], claims: [], nextSteps: [],
    });
    await expect(synthesizeEvidenceClaimsV1({ ...base, enabled: true }, undefined, request as never))
      .resolves.toMatchObject({ status: 'BLOCKED_SOURCE_BYTES_MISSING', verificationOutcome: 'BLOCKED', reasonCodes: ['SOURCE_BYTES_MISSING'], claims: [] });
    await expect(synthesizeEvidenceClaimsV1({ ...base, enabled: true, extractedText: '   ' }, originalBytes, request as never))
      .resolves.toMatchObject({ status: 'BLOCKED_EMPTY_TEXT', verificationOutcome: 'BLOCKED', reasonCodes: ['EXTRACTED_TEXT_EMPTY'] });
    await expect(synthesizeEvidenceClaimsV1({ invalid: true }, originalBytes, request as never))
      .resolves.toMatchObject({ status: 'INVALID_INPUT', verificationOutcome: 'BLOCKED', reasonCodes: ['SYNTHESIS_INPUT_INVALID'] });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a source revision mismatch and preserves explicit sidecar failure', async () => {
    const request = vi.fn(async () => response);
    const mismatch = await synthesizeEvidenceClaimsV1({
      evidenceId, sourceRevision: `sha256:${'0'.repeat(64)}`, extractedText, caseId, enabled: true,
    }, originalBytes, request);
    expect(mismatch.status).toBe('BLOCKED_SOURCE_REVISION_MISMATCH');
    expect(request).not.toHaveBeenCalled();

    const unavailable = await synthesizeEvidenceClaimsV1({
      evidenceId, sourceRevision: originalRevision, extractedText, caseId, enabled: true,
    }, originalBytes, vi.fn(async () => { throw new Error('sidecar unavailable'); }));
    expect(unavailable).toMatchObject({
      status: 'UNAVAILABLE', verificationOutcome: 'UNVERIFIED', reasonCodes: ['LANGEXTRACT_UNAVAILABLE'],
      errorCode: 'LANGEXTRACT_REQUEST_FAILED', claims: [],
    });
  });

  it('keeps empty extraction explicitly unverified and skips all downstream synthesis', async () => {
    const emptyFacts = { ...response, facts: [] };
    const summarize = vi.fn();
    const searchOaklib = vi.fn();
    const result = await synthesizeEvidenceClaimsV1({
      evidenceId, sourceRevision: originalRevision, extractedText, caseId, enabled: true,
    }, originalBytes, vi.fn(async () => emptyFacts), summarize as never, searchOaklib as never);

    expect(result).toMatchObject({
      status: 'EMPTY',
      verificationOutcome: 'UNVERIFIED',
      reasonCodes: ['LANGEXTRACT_RETURNED_NO_FACTS'],
      claims: [],
      summary: { status: 'NOT_REQUESTED', text: null },
      nextSteps: expect.any(Array),
      canonicalAuthority: false,
    });
    expect(summarize).not.toHaveBeenCalled();
    expect(searchOaklib).not.toHaveBeenCalled();
  });

  it('marks malformed extraction spans and unavailable summaries unverified', async () => {
    const malformedFacts = { ...response, facts: [{ ...response.facts[0]!, startChar: -1 }] };
    const malformed = await synthesizeEvidenceClaimsV1({
      evidenceId, sourceRevision: originalRevision, extractedText, caseId, enabled: true,
    }, originalBytes, vi.fn(async () => malformedFacts));
    expect(malformed).toMatchObject({
      status: 'PARTIAL', verificationOutcome: 'UNVERIFIED', reasonCodes: ['LANGEXTRACT_FACT_SPAN_REJECTED', 'LANGEXTRACT_RETURNED_NO_FACTS'],
      claims: [], rejectedFactCount: 1,
    });

    const summaryUnavailable = await synthesizeEvidenceClaimsV1({
      evidenceId, sourceRevision: originalRevision, extractedText, caseId, enabled: true,
    }, originalBytes, vi.fn(async () => response), vi.fn(async () => ({
      status: 'UNAVAILABLE' as const,
      text: null,
      supportingClaimIds: [],
      provider: null,
      modelId: null,
      modelSelectionChecksum: null,
    })));
    expect(summaryUnavailable).toMatchObject({
      status: 'SOURCE_GROUNDED', verificationOutcome: 'UNVERIFIED', reasonCodes: ['SUMMARY_MODEL_UNAVAILABLE'],
      summary: { status: 'UNAVAILABLE', text: null },
    });

    const summaryInvalid = await synthesizeEvidenceClaimsV1({
      evidenceId, sourceRevision: originalRevision, extractedText, caseId, enabled: true,
    }, originalBytes, vi.fn(async () => response), vi.fn(async () => ({
      status: 'INVALID_OUTPUT' as const,
      text: null,
      supportingClaimIds: [],
      provider: null,
      modelId: null,
      modelSelectionChecksum: null,
    })));
    expect(summaryInvalid).toMatchObject({
      status: 'SOURCE_GROUNDED',
      verificationOutcome: 'UNVERIFIED',
      reasonCodes: ['SUMMARY_OUTPUT_INVALID'],
      summary: { status: 'INVALID_OUTPUT', text: null },
    });
  });
});
