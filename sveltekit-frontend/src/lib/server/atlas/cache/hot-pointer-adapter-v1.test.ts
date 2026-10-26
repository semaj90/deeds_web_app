import { describe, expect, it } from 'vitest';
import {
	buildHotPointerRecordV1,
	serializeHotPointerV1,
	parseHotPointerV1,
	canReuseHotPointerV1,
} from './hot-pointer-adapter-v1.js';

describe('HotPointerAdapterV1', () => {
	const sampleHash = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
	const baseNow = new Date('2026-10-24T00:00:00.000Z');

	it('builds a valid hot pointer record with calculated expiry', () => {
		const pointer = buildHotPointerRecordV1({
			cacheKey: 'atlas:computation:v1:abc',
			artifactId: 'art-123',
			artifactRef: 'docs/artifacts/pagerank-v1.arrow',
			artifactHash: sampleHash,
			producerRevision: 'prod-r1',
			workspaceRevision: 'work-r1',
			ttlSeconds: 3600,
			byteSize: 1048576,
			now: baseNow,
		});

		expect(pointer.schema).toBe('atlas.hot-pointer-record.v1');
		expect(pointer.residency).toBe('HOT_VALKEY');
		expect(pointer.createdAt).toBe('2026-10-24T00:00:00.000Z');
		expect(pointer.expiresAt).toBe('2026-10-24T01:00:00.000Z');
		expect(pointer.byteSize).toBe(1048576);
	});

	it('serializes and round-trips through JSON cleanly', () => {
		const pointer = buildHotPointerRecordV1({
			cacheKey: 'atlas:computation:v1:abc',
			artifactId: 'art-123',
			artifactRef: 'docs/artifacts/pagerank-v1.arrow',
			artifactHash: sampleHash,
			producerRevision: 'prod-r1',
			workspaceRevision: 'work-r1',
			byteSize: 2048,
			now: baseNow,
		});

		const raw = serializeHotPointerV1(pointer);
		const roundtrip = parseHotPointerV1(raw);
		expect(roundtrip).toEqual(pointer);
	});

	it('validates reuse against artifact hash, workspace revision, and TTL', () => {
		const pointer = buildHotPointerRecordV1({
			cacheKey: 'atlas:computation:v1:abc',
			artifactId: 'art-123',
			artifactRef: 'docs/artifacts/pagerank-v1.arrow',
			artifactHash: sampleHash,
			producerRevision: 'prod-r1',
			workspaceRevision: 'work-r1',
			ttlSeconds: 3600,
			byteSize: 2048,
			now: baseNow,
		});

		// 30 mins later: valid
		const duringTtl = new Date('2026-10-24T00:30:00.000Z');
		expect(canReuseHotPointerV1(pointer, {
			expectedArtifactHash: sampleHash,
			expectedWorkspaceRevision: 'work-r1',
			now: duringTtl,
		})).toBe(true);

		// Hash mismatch: cannot reuse
		expect(canReuseHotPointerV1(pointer, {
			expectedArtifactHash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
			expectedWorkspaceRevision: 'work-r1',
			now: duringTtl,
		})).toBe(false);

		// Workspace drift: cannot reuse
		expect(canReuseHotPointerV1(pointer, {
			expectedArtifactHash: sampleHash,
			expectedWorkspaceRevision: 'work-r2-drift',
			now: duringTtl,
		})).toBe(false);

		// Expired (2 hours later): cannot reuse
		const afterExpiry = new Date('2026-10-24T02:00:00.000Z');
		expect(canReuseHotPointerV1(pointer, {
			expectedArtifactHash: sampleHash,
			expectedWorkspaceRevision: 'work-r1',
			now: afterExpiry,
		})).toBe(false);
	});

	it('fails closed on invalid ttl or bad hash', () => {
		expect(() => buildHotPointerRecordV1({
			cacheKey: 'atlas:computation:v1:abc',
			artifactId: 'art-123',
			artifactRef: 'ref',
			artifactHash: 'not-a-sha',
			producerRevision: 'prod-r1',
			workspaceRevision: 'work-r1',
			byteSize: 100,
		})).toThrow();

		expect(() => buildHotPointerRecordV1({
			cacheKey: 'atlas:computation:v1:abc',
			artifactId: 'art-123',
			artifactRef: 'ref',
			artifactHash: sampleHash,
			producerRevision: 'prod-r1',
			workspaceRevision: 'work-r1',
			ttlSeconds: 10000000, // Exceeds 7 days max
			byteSize: 100,
		})).toThrow();
	});
});
