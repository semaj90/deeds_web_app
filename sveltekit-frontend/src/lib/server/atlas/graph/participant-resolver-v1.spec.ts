import { describe, expect, it } from 'vitest';
import {
  resolveParticipantObservationV1,
  resolveParticipantObservationsV1,
} from './participant-resolver-v1.js';

const owner = {
  canonicalId: 'symbol:handler',
  entityType: 'SYMBOL',
  entityRevision: 'source:rev-1',
  sourceRef: 'src/routes.ts',
};

describe('ParticipantResolverV1', () => {
  it('resolves only an explicitly registered canonical owner', () => {
    const result = resolveParticipantObservationV1({
      field: 'handler',
      role: 'handler',
      entityType: 'SYMBOL',
      canonicalId: owner.canonicalId,
      entityRevision: owner.entityRevision,
      sourceRef: owner.sourceRef,
      evidenceRefs: ['z', 'a', 'a'],
    }, [owner]);

    expect(result.status).toBe('RESOLVED');
    expect(result.canonicalId).toBe(owner.canonicalId);
    expect(result.evidenceRefs).toEqual(['a', 'z']);
  });

  it('does not turn a literal route or method into a canonical participant', () => {
    const result = resolveParticipantObservationV1({
      field: 'method',
      role: 'method',
      entityType: 'HTTP_METHOD',
      canonicalId: null,
      evidenceRefs: ['request:1'],
      literalValue: 'POST',
    }, []);

    expect(result.status).toBe('UNRESOLVED');
    expect(result.canonicalId).toBeUndefined();
    expect(result.literalValue).toBe('POST');
    expect(result.reasonCode).toBe('CANONICAL_ID_NOT_SUPPLIED');
  });

  it('rejects an unknown owner and mismatched owner attributes', () => {
    expect(resolveParticipantObservationV1({
      field: 'handler', role: 'handler', entityType: 'SYMBOL',
      canonicalId: 'symbol:missing', evidenceRefs: ['e'],
    }, [owner]).reasonCode).toBe('CANONICAL_OWNER_NOT_FOUND');

    expect(resolveParticipantObservationV1({
      field: 'handler', role: 'handler', entityType: 'SYMBOL',
      canonicalId: owner.canonicalId, entityRevision: 'source:other', evidenceRefs: ['e'],
    }, [owner]).status).toBe('REJECTED');
  });

  it('marks duplicate registry ownership ambiguous', () => {
    const result = resolveParticipantObservationV1({
      field: 'handler', role: 'handler', entityType: 'SYMBOL',
      canonicalId: owner.canonicalId, evidenceRefs: ['e'],
    }, [owner, owner]);

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.reasonCode).toBe('CANONICAL_OWNER_MULTIPLE');
  });

  it('fails the complete batch closed when one participant is unresolved', () => {
    const result = resolveParticipantObservationsV1([
      {
        field: 'handler', role: 'handler', entityType: 'SYMBOL',
        canonicalId: owner.canonicalId, evidenceRefs: ['handler:e'],
      },
      {
        field: 'route', role: 'route', entityType: 'HTTP_ROUTE',
        canonicalId: null, evidenceRefs: ['route:e'], literalValue: '/search',
      },
    ], [owner]);

    expect(result.status).toBe('UNRESOLVED');
    expect(result.participants).toEqual([]);
    expect(result.unresolvedFields).toEqual(['route']);
    expect(result.evidenceRefs).toEqual(['handler:e', 'route:e']);
  });
});
