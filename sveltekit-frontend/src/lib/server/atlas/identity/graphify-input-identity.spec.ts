import { describe, it, expect } from 'vitest';
import { canonicalGraphifyInputIdentityPayloadV1, graphifyInputIdentityV1, sourceSelectionChecksumV1 } from './graphify-input-identity';

const entries = [
  { sourceIdentityKey: 'repo:root:z.ts', sourceRevision: `sha256:${'b'.repeat(64)}`, byteLength: 2 },
  { sourceIdentityKey: 'repo:root:é.ts', sourceRevision: `sha256:${'c'.repeat(64)}`, byteLength: 3 },
  { sourceIdentityKey: 'repo:root:a.ts', sourceRevision: `sha256:${'a'.repeat(64)}`, byteLength: 1 },
];
const input = (sourceSelectionChecksum: string) => ({
  workspaceId: 'w', workspaceRevision: `sha256:${'d'.repeat(64)}`, sourceSelectionChecksum,
  parserContractVersion: 'p1', extractionContractVersion: 'x1', graphAlgorithmRevision: 'g1',
});

describe('GraphifyInputIdentityV1', () => {
  // Pinned from the first implementation run: any refactor that reorders properties or changes sorting/serialization changes these and must fail.
  const PINNED_CHECKSUM = 'sha256:67c9d9fe8ebe1b3787b237edb2dcab18d087c5dcd213731eddbf65c78c657eba';
  const PINNED_IDENTITY = 'sha256:87f32de66efacbf7ed65c9ea5a8d6fcc23644e2ae1a6be50db655e52b3c7de43';

  it('selection checksum is pinned and independent of input order', () => {
    expect(sourceSelectionChecksumV1(entries)).toBe(PINNED_CHECKSUM);
    expect(sourceSelectionChecksumV1([...entries].reverse())).toBe(PINNED_CHECKSUM);
  });

  it('is content-bearing: a changed sourceRevision or byteLength changes the checksum', () => {
    expect(sourceSelectionChecksumV1([{ ...entries[0], sourceRevision: `sha256:${'e'.repeat(64)}` }, entries[1], entries[2]])).not.toBe(PINNED_CHECKSUM);
    expect(sourceSelectionChecksumV1([{ ...entries[0], byteLength: 99 }, entries[1], entries[2]])).not.toBe(PINNED_CHECKSUM);
  });

  it('identity is pinned and the payload property order is contractual', () => {
    expect(graphifyInputIdentityV1(input(PINNED_CHECKSUM))).toBe(PINNED_IDENTITY);
    const q = JSON.stringify;
    const manual = `{"schema":"atlas.graphify-input-identity.v1","workspaceId":${q('w')},"workspaceRevision":${q(`sha256:${'d'.repeat(64)}`)},"sourceSelectionChecksum":${q(PINNED_CHECKSUM)},"parserContractVersion":"p1","extractionContractVersion":"x1","graphAlgorithmRevision":"g1"}`;
    expect(canonicalGraphifyInputIdentityPayloadV1(input(PINNED_CHECKSUM))).toBe(manual);
  });

  it('every recipe field affects the identity', () => {
    const base = input(PINNED_CHECKSUM);
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      expect(graphifyInputIdentityV1({ ...base, [key]: `${base[key]}x` })).not.toBe(PINNED_IDENTITY);
    }
  });
});
