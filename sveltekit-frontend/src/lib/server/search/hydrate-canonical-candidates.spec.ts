// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapQdrantProjectionCandidate } from './projection-candidate-v1.js';

const mocks = vi.hoisted(() => ({ select: vi.fn(), from: vi.fn(), where: vi.fn(), inArray: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ db: { select: mocks.select } }));
vi.mock('drizzle-orm', () => ({ inArray: mocks.inArray }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ codebaseChunkIndex: {
  id: 'id', chunkId: 'chunk_id', relativePath: 'relative_path', content: 'content', contentHash: 'content_hash',
} }));

import { hydrateCanonicalCandidates } from './hydrate-canonical-candidates.js';

const postgresId = '11111111-1111-4111-8111-111111111111';
const point = () => mapQdrantProjectionCandidate({
  id: 'projection-only-id', score: 0.9,
  payload: { postgres_id: postgresId, chunk_id: 'chunk:one', source_ref: 'src/one.ts', content_hash: 'hash:one', content: 'UNTRUSTED PAYLOAD' },
});
const row = () => ({ id: postgresId, chunkId: 'chunk:one', relativePath: 'src/one.ts', content: 'POSTGRES CONTENT', contentHash: 'hash:one' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockResolvedValue([row()]);
});

describe('PostgreSQL content authority after Qdrant selection', () => {
  it('reads authoritative content in one batch without promoting a point ID to packet identity', async () => {
    const result = await hydrateCanonicalCandidates([point()]);
    expect(result.failures).toEqual([]);
    expect(result.hydrated[0]).toMatchObject({ content: 'POSTGRES CONTENT', canonicalId: postgresId, packetKey: null });
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.inArray).toHaveBeenCalledWith('id', [postgresId]);
  });

  it.each([
    ['CONTENT_HASH_MISSING', { contentHash: null }, {}],
    ['CONTENT_HASH_MISSING', {}, { contentHash: null }],
    ['CONTENT_HASH_MISSING', { contentHash: ' ' }, {}],
    ['CONTENT_HASH_MISMATCH', { contentHash: 'old' }, {}],
    ['SOURCE_REF_MISSING', { sourceRef: null }, {}],
    ['SOURCE_REF_MISMATCH', { sourceRef: 'other.ts' }, {}],
    ['CHUNK_ID_MISMATCH', { chunkId: 'chunk:other' }, {}],
    ['CHUNK_ID_MISMATCH', {}, { chunkId: null }],
    ['CONTENT_MISSING', {}, { content: null }],
  ] as const)('rejects %s rather than returning projection content', async (reason, candidatePatch, rowPatch) => {
    mocks.where.mockResolvedValue([{ ...row(), ...rowPatch }]);
    const result = await hydrateCanonicalCandidates([{ ...point(), ...candidatePatch }]);
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe(reason);
  });

  it('rejects missing and ambiguous canonical rows', async () => {
    for (const rows of [[], [row(), row()]]) {
      mocks.where.mockResolvedValue(rows);
      const result = await hydrateCanonicalCandidates([point()]);
      expect(result.hydrated).toEqual([]);
      expect(result.failures[0]?.reason).toBe(rows.length ? 'CANONICAL_ROW_AMBIGUOUS' : 'CANONICAL_ROW_NOT_FOUND');
    }
  });

  it('does not query PostgreSQL for missing identity, invalid scores, or an empty batch', async () => {
    for (const candidate of [{ ...point(), postgresId: null, identityMissing: true }, { ...point(), score: NaN }]) {
      const result = await hydrateCanonicalCandidates([candidate]);
      expect(result.hydrated).toEqual([]);
      expect(result.failures).toHaveLength(1);
    }
    expect(await hydrateCanonicalCandidates([])).toEqual({ hydrated: [], failures: [] });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('preserves input rank and deduplicates batch IDs, including repeated physical point IDs', async () => {
    const secondId = '22222222-2222-4222-8222-222222222222';
    mocks.where.mockResolvedValue([{ ...row(), id: secondId }, row()]);
    const candidates = [point(), { ...point(), postgresId: secondId, physicalPointId: 'second' }, { ...point(), score: 0.1 }];
    const result = await hydrateCanonicalCandidates(candidates);
    expect(result.hydrated.map((entry) => entry.projectionCandidate.score)).toEqual([0.9, 0.9, 0.1]);
    expect(mocks.inArray).toHaveBeenCalledWith('id', [postgresId, secondId]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
