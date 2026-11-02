import { describe, expect, it } from 'vitest';
import type { EvidenceClaimV1 } from './evidence-claim-v1.js';
import { proposeEvidenceTimelineV1 } from './evidence-timeline-proposal-v1.js';

const sourceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceRevision = `sha256:${'a'.repeat(64)}`;

function claim(id: string, observedAt: string | null, validAt: string | null = null): EvidenceClaimV1 {
  return {
    claimId: id,
    sourceId,
    sourceSha256: 'a'.repeat(64),
    sourceRevision,
    workspaceRevision: null,
    caseId: null,
    span: {
      startChar: 0,
      endChar: 5,
      startByte: 0,
      endByte: 5,
      exactText: 'event',
      textSourceSha256: 'b'.repeat(64),
    },
    who: 'Witness',
    relationPredicate: 'observed',
    what: 'event',
    why: '',
    how: '',
    assertion: 'Witness observed event.',
    domainId: null,
    taxonomyId: null,
    observedAt,
    validAt,
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
}

describe('proposeEvidenceTimelineV1', () => {
  it('derives stable previous/next links while preserving concurrent timestamps', () => {
    const first = claim('11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00.000Z');
    const concurrentOne = claim('22222222-2222-4222-8222-222222222222', '2026-01-02T00:00:00.000Z');
    const concurrentTwo = claim('33333333-3333-4333-8333-333333333333', null, '2026-01-02T00:00:00.000Z');
    const last = claim('44444444-4444-4444-8444-444444444444', '2026-01-03T00:00:00.000Z');
    const undated = claim('55555555-5555-4555-8555-555555555555', null);

    const result = proposeEvidenceTimelineV1({ claims: [last, concurrentTwo, undated, first, concurrentOne] });
    const rows = new Map(result.events.map((event) => [event.claimId, event]));

    expect(result).toMatchObject({ canonicalAuthority: false, orderSemantics: 'DISPLAY_ORDER_ONLY_NOT_CAUSAL' });
    expect(result.events[0]?.claimId).toBe(first.claimId);
    expect(result.events.slice(1, 3).map((event) => event.claimId).sort()).toEqual([concurrentOne.claimId, concurrentTwo.claimId].sort());
    expect(result.events[3]?.claimId).toBe(last.claimId);
    expect(result.events[4]?.claimId).toBe(undated.claimId);
    expect(rows.get(first.claimId)?.nextEventIds).toEqual(expect.arrayContaining([
      rows.get(concurrentOne.claimId)?.eventId,
      rows.get(concurrentTwo.claimId)?.eventId,
    ]));
    expect(rows.get(concurrentOne.claimId)?.previousEventIds).toEqual([rows.get(first.claimId)?.eventId]);
    expect(rows.get(concurrentTwo.claimId)?.nextEventIds).toEqual([rows.get(last.claimId)?.eventId]);
    expect(rows.get(undated.claimId)).toMatchObject({ temporalStatus: 'UNDATED', previousEventIds: [], nextEventIds: [] });
    expect(proposeEvidenceTimelineV1({ claims: [first] }).events[0]?.eventId).toBe(rows.get(first.claimId)?.eventId);
  });

  it('distinguishes invalid input from a valid empty timeline', () => {
    expect(proposeEvidenceTimelineV1({ claims: [{ claimId: 'fake' }] })).toMatchObject({
      status: 'BLOCKED', reason: 'INVALID_INPUT', events: [], canonicalAuthority: false,
    });
    expect(proposeEvidenceTimelineV1({ claims: [] })).toMatchObject({
      status: 'EMPTY', reason: 'NO_SOURCE_GROUNDED_EVENTS', events: [], canonicalAuthority: false,
    });
  });

  it('blocks duplicate claim identities rather than emitting duplicate timeline nodes', () => {
    const duplicate = claim('11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00.000Z');
    expect(proposeEvidenceTimelineV1({ claims: [duplicate, duplicate] })).toMatchObject({
      status: 'BLOCKED', reason: 'INVALID_INPUT', events: [], canonicalAuthority: false,
    });
  });

  it('preserves claim-grounded support and contradiction references without asserting truth', () => {
    const subjectClaim = claim('11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00.000Z');
    const supportingClaimId = '22222222-2222-4222-8222-222222222222';
    const contradictingClaimId = '33333333-3333-4333-8333-333333333333';
    subjectClaim.supportingClaimIds = [supportingClaimId];
    subjectClaim.contradictingClaimIds = [contradictingClaimId];

    const result = proposeEvidenceTimelineV1({ claims: [subjectClaim] });

    expect(result).toMatchObject({
      status: 'PROPOSED',
      canonicalAuthority: false,
      orderSemantics: 'DISPLAY_ORDER_ONLY_NOT_CAUSAL',
      events: [{ supportingClaimIds: [supportingClaimId], contradictingClaimIds: [contradictingClaimId] }],
    });
  });
});
