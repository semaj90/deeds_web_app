import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { buildOfflineProgramEvalSnapshotV1, rankOfflineProgramChallengersV1 } from './offline-program-eval-v1.js';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('offline program evaluation v1', () => {
  it('builds a deterministic source-revision-qualified train/held-out snapshot', () => {
    const snapshot = buildOfflineProgramEvalSnapshotV1({
      programId: 'domain-classifier',
      programRevision: 'program:v1',
      featureRevision: 'features:v1',
      examples: [
        { exampleId: 'b', split: 'HELD_OUT', sourceRevision: 'source:2', inputChecksum: hash('b'), outputChecksum: hash('c'), score: 0.8, evidenceRefs: ['e:b'] },
        { exampleId: 'a', split: 'TRAIN', sourceRevision: 'source:1', inputChecksum: hash('a'), outputChecksum: hash('b'), score: 0.6, evidenceRefs: ['e:a'] },
      ],
    });
    expect(snapshot.trainCount).toBe(1);
    expect(snapshot.heldOutCount).toBe(1);
    expect(snapshot.meanHeldOutScore).toBe(0.8);
    expect(snapshot.examples.map((example) => example.exampleId)).toEqual(['a', 'b']);
    expect(snapshot.executionMode).toBe('OFFLINE_ONLY');
    expect(snapshot.canonicalAuthority).toBe(false);
  });

  it('ranks challengers deterministically and never authorizes promotion', () => {
    const tournament = rankOfflineProgramChallengersV1({
      baselineCandidateId: 'baseline', snapshotChecksum: hash('snapshot'),
      candidates: [
        { candidateId: 'challenger', candidateRevision: 'v2', meanHeldOutScore: 0.9 },
        { candidateId: 'baseline', candidateRevision: 'v1', meanHeldOutScore: 0.8 },
      ],
    });
    expect(tournament.candidates.map((candidate) => candidate.candidateId)).toEqual(['challenger', 'baseline']);
    expect(tournament.candidates[0].deltaFromBaseline).toBeCloseTo(0.1);
    expect(tournament.promotionAuthorized).toBe(false);
    expect(tournament.writesPerformed).toBe(false);
  });

  it('rejects duplicate example identity', () => {
    const example = { exampleId: 'same', split: 'TRAIN' as const, sourceRevision: 'source:1', inputChecksum: hash('a'), outputChecksum: hash('b'), score: 0.5, evidenceRefs: [] };
    expect(() => buildOfflineProgramEvalSnapshotV1({ programId: 'p', programRevision: 'v1', featureRevision: 'f1', examples: [example, example] })).toThrow('OFFLINE_PROGRAM_DUPLICATE_EXAMPLE');
  });
});
