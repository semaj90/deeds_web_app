import { describe, expect, it, vi } from 'vitest';
import { summarizeGroundedEvidenceClaimsV1 } from './evidence-claim-summary-v1.js';
import type { EvidenceClaimV1 } from './evidence-claim-v1.js';

const claim: EvidenceClaimV1 = {
  claimId: '11111111-1111-4111-8111-111111111111',
  sourceId: '22222222-2222-4222-8222-222222222222',
  sourceSha256: 'a'.repeat(64),
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: null,
  caseId: null,
  span: {
    startChar: 0,
    endChar: 17,
    startByte: 0,
    endByte: 17,
    exactText: 'Witness saw event',
    textSourceSha256: 'b'.repeat(64),
  },
  who: 'Witness',
  relationPredicate: 'observed',
  what: 'an event',
  why: '',
  how: '',
  assertion: 'Witness observed an event.',
  domainId: null,
  taxonomyId: null,
  observedAt: null,
  validAt: null,
  extraction: {
    provider: 'LangExtract',
    producerRevision: 'langextract-v1',
    modelId: null,
    outputSha256: 'c'.repeat(64),
    method: 'fixture',
    confidence: 0.9,
    productVersion: 'v1',
  },
  supportingClaimIds: [],
  contradictingClaimIds: [],
  verificationStatus: 'SOURCE_GROUNDED',
};

const target = async () => ({
  baseUrl: 'http://127.0.0.1:8090',
  model: 'ornith-1.5-9b',
  selectionReceiptChecksum: 'd'.repeat(64),
});

function completion(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('summarizeGroundedEvidenceClaimsV1', () => {
  it('summarizes only grounded claim inputs and records the resolved model receipt', async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = url;
      requestedInit = init;
      return completion({
        choices: [{ message: { content: JSON.stringify({
          summary: 'A witness observed an event.',
          supportingClaimIds: [claim.claimId],
        }) } }],
      });
    });
    const result = await summarizeGroundedEvidenceClaimsV1({ claims: [claim] }, target, fetcher as never);

    expect(result).toMatchObject({
      status: 'GENERATED',
      text: 'A witness observed an event.',
      supportingClaimIds: [claim.claimId],
      provider: 'llama-server',
      modelId: 'ornith-1.5-9b',
      modelSelectionChecksum: 'd'.repeat(64),
    });
    expect(requestedUrl).toBe('http://127.0.0.1:8090/v1/chat/completions');
    const request = JSON.parse(String(requestedInit?.body)) as { messages: Array<{ content: string }> };
    expect(request.messages[1]?.content).toContain(claim.claimId);
    expect(request.messages[1]?.content).toContain('Witness saw event');
  });

  it('rejects summaries that cite unknown claims and abstains for invalid inputs', async () => {
    const fetcher = vi.fn(async () => completion({
      choices: [{ message: { content: JSON.stringify({ summary: 'Unsupported.', supportingClaimIds: ['99999999-9999-4999-8999-999999999999'] }) } }],
    }));
    await expect(summarizeGroundedEvidenceClaimsV1({ claims: [claim] }, target, fetcher as never))
      .resolves.toMatchObject({ status: 'INVALID_OUTPUT', text: null });
    await expect(summarizeGroundedEvidenceClaimsV1({ claims: [] }, target, fetcher as never))
      .resolves.toMatchObject({ status: 'NOT_REQUESTED', text: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable inference without returning excerpt or fabricated text', async () => {
    await expect(summarizeGroundedEvidenceClaimsV1({ claims: [claim] }, async () => { throw new Error('offline'); }))
      .resolves.toMatchObject({ status: 'UNAVAILABLE', text: null, supportingClaimIds: [] });
  });
});
