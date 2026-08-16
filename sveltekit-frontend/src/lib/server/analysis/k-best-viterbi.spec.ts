import { describe, expect, it } from 'vitest';

import { decodeKBestViterbi, type ViterbiFrame } from './k-best-viterbi';

interface SymbolCandidate {
  lineage: string;
  label: string;
}

const frames: ViterbiFrame<SymbolCandidate>[] = [
  {
    revision: 'r0',
    candidates: [
      { id: 'foo:processUser', value: { lineage: 'user-flow', label: 'processUser' }, emissionScore: 0.9 },
      { id: 'other:r0', value: { lineage: 'other', label: 'other' }, emissionScore: 0.8 },
    ],
  },
  {
    revision: 'r1',
    candidates: [
      { id: 'user:process', value: { lineage: 'user-flow', label: 'process' }, emissionScore: 0.7 },
      { id: 'local-best:r1', value: { lineage: 'other', label: 'localBest' }, emissionScore: 0.95 },
    ],
  },
  {
    revision: 'r2',
    candidates: [
      { id: 'account:resolveAccount', value: { lineage: 'user-flow', label: 'resolveAccount' }, emissionScore: 0.72 },
      { id: 'local-best:r2', value: { lineage: 'other', label: 'localBest2' }, emissionScore: 0.96 },
    ],
  },
];

describe('decodeKBestViterbi', () => {
  it('uses transitions to recover a globally coherent lineage instead of local top-1 picks', () => {
    const paths = decodeKBestViterbi(
      frames,
      ({ previous, current }) => previous.value.lineage === current.value.lineage ? 1.0 : -1.5,
      { k: 2 },
    );

    expect(paths).toHaveLength(2);
    expect(paths[0]?.candidateIds).toEqual([
      'foo:processUser',
      'user:process',
      'account:resolveAccount',
    ]);
    expect(paths[0]?.revisions).toEqual(['r0', 'r1', 'r2']);
    expect(paths[1]?.candidateIds).not.toEqual(paths[0]?.candidateIds);
  });

  it('keeps deterministic k-best alternatives for ambiguous temporal identity', () => {
    const ambiguous: ViterbiFrame<string>[] = [
      {
        revision: 'r0',
        candidates: [
          { id: 'a', value: 'a', emissionScore: 1 },
          { id: 'b', value: 'b', emissionScore: 1 },
        ],
      },
      {
        revision: 'r1',
        candidates: [
          { id: 'a2', value: 'a2', emissionScore: 1 },
          { id: 'b2', value: 'b2', emissionScore: 1 },
        ],
      },
    ];

    const transition = () => 0;
    const first = decodeKBestViterbi(ambiguous, transition, { k: 3 });
    const second = decodeKBestViterbi(ambiguous, transition, { k: 3 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.map((path) => path.candidateIds)).toEqual([
      ['a', 'a2'],
      ['a', 'b2'],
      ['b', 'a2'],
    ]);
  });

  it('rejects duplicate candidate identity inside one revision fiber', () => {
    expect(() => decodeKBestViterbi([
      {
        revision: 'r0',
        candidates: [
          { id: 'same', value: 1, emissionScore: 1 },
          { id: 'same', value: 2, emissionScore: 1 },
        ],
      },
    ], () => 0)).toThrow(/duplicate candidate id/);
  });
});
