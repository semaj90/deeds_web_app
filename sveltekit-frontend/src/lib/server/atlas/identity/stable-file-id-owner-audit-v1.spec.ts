import { describe, expect, it } from 'vitest';
import { evaluateCandidateV1, evaluateStableFileIdOwnerV1, type CandidateObservationV1 } from './stable-file-id-owner-audit-v1';

const good = (name: string): CandidateObservationV1 => ({
  name, opaque: true, derivedFrom: null,
  revisionSurvival: { observedLogicalFiles: 3, idPreserved: 3 },
  moveSurvival: { mechanismAvailable: true, observedVerifiedMoves: 2, idPreserved: 2 },
});

describe('StableFileIdOwnerAuditV1 — requirement evaluation', () => {
  it('FIXTURE two-revision same file: an id that stays the same across revisions passes, one that changes fails', () => {
    const keeps = evaluateCandidateV1({ ...good('keeps'), revisionSurvival: { observedLogicalFiles: 1, idPreserved: 1 } });
    const changes = evaluateCandidateV1({ ...good('changes'), revisionSurvival: { observedLogicalFiles: 1, idPreserved: 0 } });
    expect(keeps.requirements.survivesContentRevisions).toBe('PASS');
    expect(changes.requirements.survivesContentRevisions).toBe('FAIL');
    expect(changes.passes).toBe(false);
  });

  it('FIXTURE verified move/alias: an id preserved across a verified move passes, one that changes fails, and no mechanism is UNPROVEN (never a pass)', () => {
    expect(evaluateCandidateV1(good('ok')).requirements.survivesVerifiedMoveOrAlias).toBe('PASS');
    expect(evaluateCandidateV1({ ...good('lost'), moveSurvival: { mechanismAvailable: true, observedVerifiedMoves: 1, idPreserved: 0 } }).requirements.survivesVerifiedMoveOrAlias).toBe('FAIL');
    const none = evaluateCandidateV1({ ...good('none'), moveSurvival: { mechanismAvailable: false, observedVerifiedMoves: 0, idPreserved: 0 } });
    expect(none.requirements.survivesVerifiedMoveOrAlias).toBe('UNPROVEN');
    expect(none.passes).toBe(false);
  });

  it('an id derived from a path, content hash, tree node, packet key or vector/graph id is rejected even if it is stable', () => {
    for (const derivedFrom of ['PATH', 'CONTENT_HASH', 'TREE_NODE', 'PACKET_KEY', 'VECTOR_OR_GRAPH_ID'] as const) {
      const e = evaluateCandidateV1({ ...good(derivedFrom), opaque: false, derivedFrom });
      expect(e.requirements.opaque).toBe('FAIL');
      expect(e.requirements.notDerivedFromForbiddenCoordinate).toBe('FAIL');
      expect(e.passes).toBe(false);
    }
  });

  it('missing evidence is UNPROVEN, never PASS (fail closed)', () => {
    const e = evaluateCandidateV1({ name: 'x', opaque: null, revisionSurvival: null, moveSurvival: null });
    expect(Object.values(e.requirements).every((s) => s === 'UNPROVEN')).toBe(true);
    expect(e.passes).toBe(false);
    // zero observed multi-revision files is not evidence of survival
    expect(evaluateCandidateV1({ ...good('y'), revisionSurvival: { observedLogicalFiles: 0, idPreserved: 0 } }).requirements.survivesContentRevisions).toBe('UNPROVEN');
  });
});

describe('StableFileIdOwnerAuditV1 — verdict', () => {
  it('MISSING when no candidate passes, and it never adds a namespace or id generator', () => {
    const r = evaluateStableFileIdOwnerV1([{ ...good('a'), revisionSurvival: { observedLogicalFiles: 2, idPreserved: 0 } }, { ...good('b'), opaque: false, derivedFrom: 'PATH' }]);
    expect(r.verdict).toBe('STABLE_FILE_ID_OWNER_MISSING');
    expect(r.owner).toBeNull();
    expect(r.newNamespaceCreated).toBe(false);
    expect(r.idGeneratorAdded).toBe(false);
  });
  it('PROVEN only when exactly one candidate passes', () => {
    const r = evaluateStableFileIdOwnerV1([good('only'), { ...good('bad'), opaque: false, derivedFrom: 'PATH' }]);
    expect(r.verdict).toBe('STABLE_FILE_ID_OWNER_PROVEN');
    expect(r.owner).toBe('only');
  });
  it('AMBIGUOUS when two candidates pass', () => {
    const r = evaluateStableFileIdOwnerV1([good('one'), good('two')]);
    expect(r.verdict).toBe('STABLE_FILE_ID_OWNER_AMBIGUOUS');
    expect(r.passingCandidates).toEqual(['one', 'two']);
  });
});

import { classifyCensusCandidateV1, type CensusFactsV1 } from './stable-file-id-owner-audit-v1';

describe('S01-08A census classification (predicate-based, precedence PATH > REVISION > PROJECTION > PACKET_LOCAL > EPHEMERAL > QUALIFIED)', () => {
  const base = (over: Partial<CensusFactsV1> = {}): CensusFactsV1 => ({
    name: 'c', opaque: true, derivedFrom: null,
    revisionSurvival: { observedLogicalFiles: 2, idPreserved: 2 }, moveSurvival: { mechanismAvailable: true, observedVerifiedMoves: 1, idPreserved: 1 },
    pathDerived: false, ephemeralRandom: false, packetLocal: false, projectionId: false, ...over,
  });
  it('a path-derived id is DISQUALIFIED_PATH_IDENTITY even if it is stable and unique', () => {
    expect(classifyCensusCandidateV1(base({ pathDerived: true, opaque: false })).cls).toBe('DISQUALIFIED_PATH_IDENTITY');
  });
  it('an id that changes across revisions is DISQUALIFIED_REVISION_IDENTITY', () => {
    const r = classifyCensusCandidateV1(base({ revisionSurvival: { observedLogicalFiles: 357, idPreserved: 0 } }));
    expect(r.cls).toBe('DISQUALIFIED_REVISION_IDENTITY');
    expect(r.reasons[0]).toContain('357/357');
  });
  it('a random id assigned per packet is packet-local; a regenerable random id is ephemeral', () => {
    expect(classifyCensusCandidateV1(base({ packetLocal: true, revisionSurvival: null })).cls).toBe('DISQUALIFIED_PACKET_LOCAL');
    expect(classifyCensusCandidateV1(base({ ephemeralRandom: true, revisionSurvival: null })).cls).toBe('DISQUALIFIED_EPHEMERAL_UUID');
  });
  it('projection/derived coordinates are DISQUALIFIED_PROJECTION_ID', () => {
    expect(classifyCensusCandidateV1(base({ projectionId: true })).cls).toBe('DISQUALIFIED_PROJECTION_ID');
    expect(classifyCensusCandidateV1(base({ derivedFrom: 'CONTENT_HASH', opaque: false })).cls).toBe('DISQUALIFIED_PROJECTION_ID');
  });
  it('only a candidate passing every requirement is QUALIFIED_CANDIDATE; missing evidence is UNKNOWN, never qualified', () => {
    expect(classifyCensusCandidateV1(base()).cls).toBe('QUALIFIED_CANDIDATE');
    expect(classifyCensusCandidateV1(base({ moveSurvival: { mechanismAvailable: false, observedVerifiedMoves: 0, idPreserved: 0 } })).cls).toBe('UNKNOWN');
    expect(classifyCensusCandidateV1(base({ ambiguousOwners: true })).cls).toBe('AMBIGUOUS');
  });
});
